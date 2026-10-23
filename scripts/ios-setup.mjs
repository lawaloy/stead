import { existsSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN, assertToolVersion } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const iosEnvironment = (env = process.env) => ({
  ...env,
  DEVELOPER_DIR:
    env.DEVELOPER_DIR ||
    `/Applications/Xcode_${TOOLCHAIN.XCODE_VERSION}.app/Contents/Developer`,
});

export const checkXcodeVersion = (output) => {
  assertToolVersion(
    'Xcode',
    output.match(/^Xcode ([\d.]+)/)?.[1],
    TOOLCHAIN.XCODE_VERSION,
  );
  assertToolVersion(
    'Xcode build',
    output.match(/Build version (\S+)/)?.[1],
    TOOLCHAIN.XCODE_BUILD,
  );
};

export const prepareIos = async ({
  execute = runCommand,
  env = process.env,
  host = process.platform,
  exists = existsSync,
} = {}) => {
  if (host !== 'darwin')
    throw new Error(
      'iOS setup requires a Mac. No simulator execution is claimed on this host.',
    );
  const selected = iosEnvironment(env);
  const developer = selected.DEVELOPER_DIR;
  if (!exists(developer))
    throw new Error(
      `Install Xcode ${TOOLCHAIN.XCODE_VERSION} (${TOOLCHAIN.XCODE_BUILD}), or set DEVELOPER_DIR to that installation.`,
    );
  checkXcodeVersion(
    await execute('xcodebuild', ['-version'], { env: selected, quiet: true }),
  );
  const { runtimes } = JSON.parse(
    await execute('xcrun', ['simctl', 'list', 'runtimes', '--json'], {
      env: selected,
      quiet: true,
      stdoutOnly: true,
    }),
  );
  if (
    !runtimes.some(
      (runtime) =>
        runtime.identifier === TOOLCHAIN.IOS_RUNTIME && runtime.isAvailable,
    )
  )
    throw new Error(
      `Install simulator runtime ${TOOLCHAIN.IOS_RUNTIME}. Xcode and simulator versions are separate pins.`,
    );
  const { devices } = JSON.parse(
    await execute(
      'xcrun',
      ['simctl', 'list', 'devices', 'available', '--json'],
      { env: selected, quiet: true, stdoutOnly: true },
    ),
  );
  if (
    !(devices[TOOLCHAIN.IOS_RUNTIME] || []).some(
      (device) =>
        device.isAvailable && device.name === 'Stead Native iPhone 17',
    )
  )
    await execute(
      'xcrun',
      [
        'simctl',
        'create',
        'Stead Native iPhone 17',
        'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
        TOOLCHAIN.IOS_RUNTIME,
      ],
      { env: selected },
    );
  return selected;
};

export const IOS_SIMULATOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const disposableHost = (env) =>
  env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted';

export const createIosSimulator = async (execute) => {
  const device = (
    await execute(
      'xcrun',
      [
        'simctl',
        'create',
        `Stead Native Probe ${randomUUID()}`,
        'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
        TOOLCHAIN.IOS_RUNTIME,
      ],
      { quiet: true, stdoutOnly: true },
    )
  ).trim();
  if (!IOS_SIMULATOR_UUID.test(device))
    throw new Error('simctl did not return an owned simulator UUID.');
  return device;
};

export const acquireIosSimulator = async (execute, env) => {
  if (disposableHost(env)) {
    const { devices } = JSON.parse(
      await execute(
        'xcrun',
        ['simctl', 'list', 'devices', 'available', '--json'],
        { quiet: true, stdoutOnly: true },
      ),
    );
    const provisioned = (devices[TOOLCHAIN.IOS_RUNTIME] || []).find(
      (device) =>
        device.isAvailable &&
        IOS_SIMULATOR_UUID.test(device.udid) &&
        device.name === 'iPhone 17' &&
        (device.deviceTypeIdentifier ===
          'com.apple.CoreSimulator.SimDeviceType.iPhone-17' ||
          (!device.deviceTypeIdentifier && device.name === 'iPhone 17')),
    );
    if (provisioned) return { ...provisioned, origin: 'hosted-image' };
  }
  return {
    udid: await createIosSimulator(execute),
    state: 'Shutdown',
    origin: 'created',
  };
};

export const bootIosSimulator = async (device, execute, state = 'Shutdown') => {
  if (!['Booted', 'Booting'].includes(state))
    await execute('xcrun', ['simctl', 'boot', device]);
  await execute('xcrun', ['simctl', 'bootstatus', device, '-b']);
};

// Only GitHub-hosted jobs have a disposable VM. CI=true alone must never
// disable cleanup on a developer Mac or a persistent self-hosted runner.
export const cleanupIosSimulator = async (
  device,
  { env, execute = runCommand, timeoutMs = 15000 },
) => {
  if (!IOS_SIMULATOR_UUID.test(device || ''))
    return { status: 'not-needed', errors: [] };
  if (disposableHost(env))
    return {
      status: 'deferred',
      owner: 'github-hosted-vm',
      reason:
        'GitHub decommissions this job VM, including its owned simulator.',
      errors: [],
    };
  const errors = [];
  for (const action of ['shutdown', 'delete']) {
    try {
      await execute('xcrun', ['simctl', action, device], {
        env,
        quiet: true,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      errors.push(`${action}: ${error.message}`);
    }
  }
  return {
    status: errors.length ? 'failed' : 'passed',
    owner: 'runner',
    errors,
  };
};

export const probeIosBoot = async ({
  env = iosEnvironment(),
  execute = runCommand,
  timeoutMs = Number(TOOLCHAIN.IOS_SIMULATOR_BOOT_TIMEOUT_MS),
  cleanupTimeoutMs = 15000,
  directory = join(ROOT, '.tmp/native-validation', `ios-boot-${randomUUID()}`),
} = {}) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error('Simulator boot timeout must be a positive integer.');
  mkdirSync(directory, { recursive: true });
  const diagnostics = {};
  const snapshot = async (label) => {
    diagnostics[label] = {};
    for (const [command, args] of [
      ['sysctl', ['hw.memsize', 'hw.ncpu', 'vm.loadavg']],
      ['vm_stat', []],
      ['memory_pressure', ['-Q']],
    ]) {
      try {
        diagnostics[label][command] = await execute(command, args, {
          env,
          quiet: true,
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        diagnostics[label][command] = error.message;
      }
    }
  };
  let device, failure, allocation;
  await snapshot('beforeBoot');
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const started = Date.now();
  const run = (command, args, options = {}) =>
    execute(command, args, { ...options, env, signal: deadline.signal });
  try {
    allocation = await acquireIosSimulator(run, env);
    device = allocation.udid;
    await bootIosSimulator(device, run, allocation.state);
  } catch (error) {
    failure = deadline.signal.aborted
      ? new Error(`Simulator boot exceeded ${timeoutMs} ms: ${error.message}`)
      : error;
  } finally {
    clearTimeout(timer);
  }
  const bootElapsedMs = Date.now() - started;
  await snapshot('afterBoot');
  const readiness = {
    status: failure ? 'failed' : 'passed',
    error: failure?.message,
  };
  const cleanup = await cleanupIosSimulator(device, {
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
  const result = {
    device,
    simulatorOrigin: allocation?.origin,
    runtime: TOOLCHAIN.IOS_RUNTIME,
    timeoutMs,
    bootElapsedMs,
    readiness,
    cleanup,
    passed: !failure,
    failure: failure?.message,
    diagnostics,
  };
  writeFileSync(join(directory, 'boot.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (failure) throw failure;
  return result;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  prepareIos()
    .then(async (env) => {
      if (process.env.GITHUB_ENV)
        appendFileSync(
          process.env.GITHUB_ENV,
          `DEVELOPER_DIR=${env.DEVELOPER_DIR}\n`,
        );
      if (process.argv.includes('--probe')) await probeIosBoot({ env });
      console.log(
        `Selected Xcode ${TOOLCHAIN.XCODE_VERSION} (${TOOLCHAIN.XCODE_BUILD}) and ${TOOLCHAIN.IOS_RUNTIME}.`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
