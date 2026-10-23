import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, delimiter } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT, TOOLCHAIN } from './toolchain.mjs';
import { phoneDisplay } from './native-config.mjs';
import { runCommand } from './process-utils.mjs';
import {
  acquireIosSimulator,
  bootIosSimulator,
  cleanupIosSimulator,
  IOS_SIMULATOR_UUID,
} from './ios-setup.mjs';

const MOBILE = join(ROOT, 'mobile');
const CLI = join(MOBILE, 'node_modules/detox/local-cli/cli.js');
const TEST_ARGS = [
  CLI,
  'test',
  '--config-path',
  join(MOBILE, 'e2e/detox.config.cjs'),
  '--configuration',
  'ios.pilot',
  '--retries',
  '0',
];

export const detoxEnvironment = ({ env, app, directory, phone }) => ({
  ...env,
  PATH: [
    join(ROOT, '.tmp/tools/applesimutils', TOOLCHAIN.APPLESIMUTILS_VERSION),
    join(MOBILE, 'node_modules/.bin'),
    env.PATH || env.Path || '',
  ].join(delimiter),
  STEAD_DETOX_APP: app,
  STEAD_DETOX_ARTIFACTS: join(directory, 'detox'),
  STEAD_DETOX_PHONE: phone,
  STEAD_DETOX_PHONE_DISPLAY: phoneDisplay(phone),
  STEAD_DETOX_LIFECYCLE: join(directory, 'lifecycle.ndjson'),
  STEAD_DETOX_TEST_TIMEOUT_MS: TOOLCHAIN.IOS_DETOX_TIMEOUT_MS,
});

// Written by the test body and afterAll, independently of Detox's log format.
const lifecycleStages = (path) => {
  const lines = readFileSync(path, 'utf8').split('\n');
  lines.pop(); // A concurrent append may not have written its trailing newline yet.
  const stages = lines.map((line) => JSON.parse(line).phase);
  if (
    stages.length > 2 ||
    stages.some((stage, i) => stage !== ['execution', 'reporting'][i])
  )
    throw new Error('Invalid Detox lifecycle evidence.');
  return stages;
};

const runDetoxSession = async ({
  directory,
  env,
  signal,
  execute,
  phase,
  startupTimeoutMs,
  testTimeoutMs,
  reportTimeoutMs,
  onTestStart,
}) => {
  const owner = new AbortController();
  let completion, outcome;
  const waitFor = async (stage, phaseSignal) => {
    for (;;) {
      phaseSignal.throwIfAborted();
      if (stage && lifecycleStages(env.STEAD_DETOX_LIFECYCLE).includes(stage))
        return;
      if (outcome) {
        if (outcome.error) throw outcome.error;
        if (!stage) return outcome.output;
        throw new Error(`Detox exited before the ${stage} lifecycle event.`);
      }
      await delay(50, undefined, { signal: phaseSignal });
    }
  };
  try {
    await phase(
      'framework-startup',
      startupTimeoutMs,
      async (_run, phaseSignal) => {
        // Refuse stale evidence rather than reusing an earlier attempt's markers.
        writeFileSync(env.STEAD_DETOX_LIFECYCLE, '', { flag: 'wx' });
        completion = Promise.resolve()
          .then(() =>
            execute(
              process.execPath,
              [
                ...TEST_ARGS,
                '--json',
                '--outputFile',
                join(directory, 'summary.json'),
              ],
              {
                cwd: MOBILE,
                env,
                signal: signal
                  ? AbortSignal.any([signal, owner.signal])
                  : owner.signal,
              },
            ),
          )
          .then(
            (output) => (outcome = { output }),
            (error) => (outcome = { error }),
          );
        await waitFor('execution', phaseSignal);
      },
    );
    await phase('execution', testTimeoutMs, async (_run, phaseSignal) => {
      onTestStart();
      await waitFor('reporting', phaseSignal);
    });
    return await phase(
      'reporting',
      reportTimeoutMs,
      async (_run, phaseSignal) => {
        const output = await waitFor(undefined, phaseSignal);
        writeFileSync(join(directory, 'detox.log'), output);
        assertDetoxResult(
          JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')),
        );
      },
    );
  } catch (error) {
    owner.abort();
    await completion;
    if (outcome?.error && outcome.error !== error)
      throw new Error(`${error.message}\n${outcome.error.message}`, {
        cause: error,
      });
    throw error;
  }
};

// Jest discovery loads the real runner/config but never initializes a simulator.
export const checkDetoxRunner = async ({
  env,
  execute = runCommand,
  signal,
}) => {
  const output = await execute(
    process.execPath,
    [...TEST_ARGS, '--listTests'],
    {
      cwd: MOBILE,
      env: {
        ...env,
        STEAD_DETOX_DEVICE: '00000000-0000-4000-8000-000000000001',
      },
      signal,
    },
  );
  const expected = join(MOBILE, 'e2e/compatibility.test.cjs').replaceAll(
    '\\',
    '/',
  );
  if (
    !output
      .split(/\r?\n/)
      .some((line) => line.trim().replaceAll('\\', '/') === expected)
  )
    throw new Error('Detox/Jest did not discover the compatibility pilot.');
};

// Include JavaScript, dylibs, resources, and symlinks, not only the small launcher.
export const hashIosApp = (app) => {
  const hash = createHash('sha256');
  const visit = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const relative = `${prefix}${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, `${relative}/`);
      else {
        const data = entry.isSymbolicLink()
          ? Buffer.from(readlinkSync(path))
          : readFileSync(path);
        hash
          .update(
            `${relative}\0${entry.isSymbolicLink() ? 'link' : 'file'}\0${data.length}\0`,
          )
          .update(data);
      }
    }
  };
  visit(app);
  return hash.digest('hex');
};

export const assertIosBuild = (app, apiUrl) => {
  const metadata = JSON.parse(
    readFileSync(join(app, 'stead-e2e-build.json'), 'utf8'),
  );
  if (
    metadata.configuration !== 'Release' ||
    metadata.apiUrl !== apiUrl ||
    !metadata.bundledJavaScript ||
    metadata.phoneSeeded !== false ||
    !existsSync(join(app, 'main.jsbundle'))
  )
    throw new Error(
      'Rebuild the bundled iOS pilot app for this API port with an empty phone seed.',
    );
  return metadata;
};

export const assertDetoxResult = (summary) => {
  const assertions =
    summary.testResults?.flatMap((suite) => suite.assertionResults) ?? [];
  if (
    summary.success !== true ||
    summary.numTotalTests !== 1 ||
    summary.numPassedTests !== 1 ||
    summary.numFailedTests !== 0 ||
    summary.numPendingTests !== 0 ||
    summary.numTodoTests !== 0 ||
    assertions.length !== 1 ||
    assertions[0].status !== 'passed'
  )
    throw new Error(
      'Detox pilot requires exactly one executed, passing test and no skipped tests.',
    );
};

export const runIosDetox = async (
  {
    app,
    directory,
    env,
    signal,
    phone,
    beforeBoot = async () => {},
    beforeTest = async () => {},
  },
  {
    execute = runCommand,
    checkRunner = checkDetoxRunner,
    detoxVersion = JSON.parse(
      readFileSync(join(MOBILE, 'node_modules/detox/package.json'), 'utf8'),
    ).version,
    prepareTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_PREPARE_TIMEOUT_MS),
    bootTimeoutMs = Number(TOOLCHAIN.IOS_SIMULATOR_BOOT_TIMEOUT_MS),
    startupTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_STARTUP_TIMEOUT_MS),
    testTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_TIMEOUT_MS),
    reportTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_REPORT_TIMEOUT_MS),
    cleanupTimeoutMs = 15000,
  } = {},
) => {
  mkdirSync(directory, { recursive: true });
  env = detoxEnvironment({ env, app, directory, phone });
  env.STEAD_DETOX_TEST_TIMEOUT_MS = String(testTimeoutMs);
  const version = detoxVersion;
  const expected = JSON.parse(
    readFileSync(join(MOBILE, 'package.json'), 'utf8'),
  ).devDependencies.detox;
  if (version !== expected)
    throw new Error(`Install locked Detox ${expected}; found ${version}.`);
  let device, failure, cleanup, allocation;
  let appTests = 'not-run';
  const timings = [];
  const phase = async (name, timeoutMs, operation) => {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      throw new Error('iOS phase timeout must be a positive integer.');
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    const phaseSignal = signal
      ? AbortSignal.any([signal, deadline.signal])
      : deadline.signal;
    const started = Date.now();
    const timing = { phase: name, timeoutMs, status: 'failed' };
    console.log(`[iOS pilot] START ${name} (deadline ${timeoutMs} ms)`);
    try {
      phaseSignal.throwIfAborted();
      const result = await operation(
        (command, args, options = {}) =>
          execute(command, args, {
            cwd: MOBILE,
            ...options,
            env: options.env || env,
            signal: phaseSignal,
          }),
        phaseSignal,
      );
      // afterAll means execution finished, not that its assertions passed.
      timing.status = name === 'execution' ? 'completed' : 'passed';
      console.log(
        `[iOS pilot] ${name === 'execution' ? 'COMPLETE' : 'PASS'} ${name} (${Date.now() - started} ms)${name === 'execution' ? '; awaiting Jest result' : ''}`,
      );
      return result;
    } catch (error) {
      const failure =
        deadline.signal.aborted && !signal?.aborted
          ? new Error(
              `iOS ${name} exceeded ${timeoutMs} ms.\n${error.message}`,
              {
                cause: error,
              },
            )
          : error;
      timing.error = failure.message;
      console.error(`[iOS pilot] FAIL ${name}: ${failure.message}`);
      throw failure;
    } finally {
      clearTimeout(timer);
      timings.push({ ...timing, elapsedMs: Date.now() - started });
    }
  };
  try {
    await phase('preparation', prepareTimeoutMs, async (run, signal) => {
      await checkRunner({ env, execute: run });
      await run('bash', [
        join(ROOT, '.github/scripts/install-applesimutils.sh'),
      ]);
      await run(process.execPath, [CLI, 'build-framework-cache', '--detox']);
      await beforeBoot({ execute: run, signal });
    });
    await phase('readiness', bootTimeoutMs, async (run) => {
      allocation = await acquireIosSimulator(run, env);
      device = allocation.udid;
      console.log(`[iOS pilot] Simulator ${device} (${allocation.origin})`);
      env.STEAD_DETOX_DEVICE = device;
      await bootIosSimulator(device, run, allocation.state);
    });
    await phase('backend', 90000, (execute, signal) =>
      beforeTest({ execute, signal }),
    );
    await runDetoxSession({
      directory,
      env,
      signal,
      execute,
      phase,
      startupTimeoutMs,
      testTimeoutMs,
      reportTimeoutMs,
      onTestStart: () => {
        appTests = 'failed';
      },
    });
    appTests = 'passed';
  } catch (error) {
    failure = error;
    writeFileSync(join(directory, 'failure.log'), error.stack || String(error));
  } finally {
    const execution = timings.find(({ phase }) => phase === 'execution');
    if (execution?.status === 'completed') {
      let summary;
      try {
        summary = JSON.parse(
          readFileSync(join(directory, 'summary.json'), 'utf8'),
        );
      } catch {
        // A killed runner may never produce a verdict. Keep it unverified.
      }
      if (summary) {
        try {
          assertDetoxResult(summary);
          execution.status = 'passed';
          appTests = 'passed';
          console.log('[iOS pilot] PASS execution: Jest result verified');
        } catch {
          execution.status = 'failed';
          console.error(
            '[iOS pilot] FAIL execution: Jest reported failed or missing assertions',
          );
        }
      }
    }
    if (failure && IOS_SIMULATOR_UUID.test(device || '')) {
      try {
        const output = await execute(
          'xcrun',
          [
            'simctl',
            'spawn',
            device,
            'log',
            'show',
            '--last',
            '3m',
            '--style',
            'compact',
            '--predicate',
            'process == "SpringBoard" OR process == "runningboardd" OR process == "amfid" OR eventMessage CONTAINS "com.lawaloy.stead"',
          ],
          { env, quiet: true, signal: AbortSignal.timeout(15000) },
        );
        writeFileSync(join(directory, 'launch-diagnostics.log'), output);
      } catch (error) {
        writeFileSync(
          join(directory, 'launch-diagnostics.log'),
          `Diagnostic collection failed: ${error.message}`,
        );
      }
    }
    cleanup = await cleanupIosSimulator(device, {
      env,
      execute,
      timeoutMs: cleanupTimeoutMs,
    });
    if (cleanup.status === 'failed')
      failure = new Error(
        [
          failure?.message,
          `Simulator cleanup failed: ${cleanup.errors.join('; ')}`,
        ]
          .filter(Boolean)
          .join('; '),
      );
    console.log(
      `[iOS pilot] Cleanup ${cleanup.status}: ${cleanup.reason || cleanup.errors.join('; ') || cleanup.owner || 'no device allocated'}`,
    );
    writeFileSync(
      join(directory, 'timing.json'),
      JSON.stringify(
        {
          framework: 'detox',
          version,
          device,
          simulatorOrigin: allocation?.origin,
          timings,
          appTests,
          cleanup,
          passed: !failure,
          failure: failure?.message,
        },
        null,
        2,
      ),
    );
  }
  if (failure) throw failure;
  return {
    framework: 'detox',
    version,
    device,
    simulatorOrigin: allocation?.origin,
    timings,
    appTests,
    cleanup,
    coverage: 'compatibility-pilot',
  };
};
