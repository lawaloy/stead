import { createHash, randomUUID } from 'node:crypto';
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

const MOBILE = join(ROOT, 'mobile');
const CLI = join(MOBILE, 'node_modules/detox/local-cli/cli.js');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  { app, directory, env, signal, phone },
  {
    execute = runCommand,
    detoxVersion = JSON.parse(
      readFileSync(join(MOBILE, 'node_modules/detox/package.json'), 'utf8'),
    ).version,
    prepareTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_PREPARE_TIMEOUT_MS),
    testTimeoutMs = Number(TOOLCHAIN.IOS_DETOX_TIMEOUT_MS),
    cleanupTimeoutMs = 15000,
  } = {},
) => {
  mkdirSync(directory, { recursive: true });
  const tools = join(
    ROOT,
    '.tmp/tools/applesimutils',
    TOOLCHAIN.APPLESIMUTILS_VERSION,
  );
  env = {
    ...env,
    PATH: `${tools}${delimiter}${env.PATH || ''}`,
    STEAD_DETOX_APP: app,
    STEAD_DETOX_ARTIFACTS: join(directory, 'detox'),
    STEAD_DETOX_PHONE: phone,
    STEAD_DETOX_PHONE_DISPLAY: phoneDisplay(phone),
  };
  const version = detoxVersion;
  const expected = JSON.parse(
    readFileSync(join(MOBILE, 'package.json'), 'utf8'),
  ).devDependencies.detox;
  if (version !== expected)
    throw new Error(`Install locked Detox ${expected}; found ${version}.`);
  let device, failure;
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
    console.log(`[iOS pilot] START ${name} (deadline ${timeoutMs} ms)`);
    try {
      return await operation((command, args, options = {}) =>
        execute(command, args, {
          cwd: MOBILE,
          ...options,
          env,
          signal: phaseSignal,
        }),
      );
    } catch (error) {
      if (deadline.signal.aborted && !signal?.aborted)
        throw new Error(`iOS ${name} exceeded ${timeoutMs} ms.`, {
          cause: error,
        });
      throw error;
    } finally {
      clearTimeout(timer);
      timings.push({ phase: name, elapsedMs: Date.now() - started, timeoutMs });
    }
  };
  try {
    await phase('preparation', prepareTimeoutMs, async (run) => {
      await run('bash', [
        join(ROOT, '.github/scripts/install-applesimutils.sh'),
      ]);
      await run(process.execPath, [CLI, 'build-framework-cache', '--detox']);
      device = (
        await run(
          'xcrun',
          [
            'simctl',
            'create',
            `Stead Native Detox ${randomUUID()}`,
            'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
            TOOLCHAIN.IOS_RUNTIME,
          ],
          { quiet: true, stdoutOnly: true },
        )
      ).trim();
      if (!UUID.test(device))
        throw new Error('simctl did not return an owned simulator UUID.');
      env.STEAD_DETOX_DEVICE = device;
      await run('xcrun', ['simctl', 'boot', device]);
      await run('xcrun', ['simctl', 'bootstatus', device, '-b']);
    });
    await phase('execution', testTimeoutMs, async (run) => {
      const output = await run(process.execPath, [
        CLI,
        'test',
        '--config-path',
        'e2e/detox.config.cjs',
        '--configuration',
        'ios.pilot',
        '--workers',
        '1',
        '--retries',
        '0',
        '--json',
        '--outputFile',
        join(directory, 'summary.json'),
      ]);
      writeFileSync(join(directory, 'detox.log'), output);
      assertDetoxResult(
        JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8')),
      );
    });
  } catch (error) {
    failure = error;
    writeFileSync(join(directory, 'failure.log'), error.stack || String(error));
  } finally {
    // Evidence/cleanup get their own budget; never relabel an assertion as a test timeout.
    if (UUID.test(device || '')) {
      for (const action of ['shutdown', 'delete']) {
        try {
          await execute('xcrun', ['simctl', action, device], {
            env,
            signal: AbortSignal.timeout(cleanupTimeoutMs),
            quiet: true,
          });
        } catch (error) {
          failure = failure
            ? new AggregateError(
                [failure, error],
                `${failure.message}; simulator ${action} failed: ${error.message}`,
              )
            : error;
        }
      }
    }
    writeFileSync(
      join(directory, 'timing.json'),
      JSON.stringify(
        { framework: 'detox', version, device, timings, passed: !failure },
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
    timings,
    coverage: 'compatibility-pilot',
  };
};
