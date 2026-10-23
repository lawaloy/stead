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
import { ROOT, TOOLCHAIN } from './toolchain.mjs';
import { phoneDisplay } from './native-config.mjs';
import { runCommand } from './process-utils.mjs';
import {
  acquireIosSimulator,
  bootIosSimulator,
  cleanupIosSimulator,
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
});

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
  { app, directory, env, signal, phone, beforeTest = async () => {} },
  {
    execute = runCommand,
    checkRunner = checkDetoxRunner,
    detoxVersion = JSON.parse(
      readFileSync(join(MOBILE, 'node_modules/detox/package.json'), 'utf8'),
    ).version,
    prepareTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_PREPARE_TIMEOUT_MS),
    bootTimeoutMs = Number(TOOLCHAIN.IOS_SIMULATOR_BOOT_TIMEOUT_MS),
    testTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_TIMEOUT_MS),
    cleanupTimeoutMs = 15000,
  } = {},
) => {
  mkdirSync(directory, { recursive: true });
  env = detoxEnvironment({ env, app, directory, phone });
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
      timing.status = 'passed';
      console.log(`[iOS pilot] PASS ${name} (${Date.now() - started} ms)`);
      return result;
    } catch (error) {
      const failure =
        deadline.signal.aborted && !signal?.aborted
          ? new Error(`iOS ${name} exceeded ${timeoutMs} ms.`, {
              cause: error,
            })
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
    await phase('preparation', prepareTimeoutMs, async (run) => {
      await checkRunner({ env, execute: run });
      await run('bash', [
        join(ROOT, '.github/scripts/install-applesimutils.sh'),
      ]);
      await run(process.execPath, [CLI, 'build-framework-cache', '--detox']);
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
    await phase('execution', testTimeoutMs, async (run) => {
      appTests = 'failed';
      const output = await run(process.execPath, [
        ...TEST_ARGS,
        '--json',
        '--outputFile',
        join(directory, 'summary.json'),
      ]);
      writeFileSync(join(directory, 'detox.log'), output);
      assertDetoxResult(
        JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')),
      );
      appTests = 'passed';
    });
  } catch (error) {
    failure = error;
    writeFileSync(join(directory, 'failure.log'), error.stack || String(error));
  } finally {
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
