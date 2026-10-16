import { existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLCHAIN, assertToolVersion } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

export const iosEnvironment = (env = process.env) => ({
  ...env,
  // Cold hosted simulators can finish launching XCTest after Maestro's
  // two-minute default. This bounds driver startup, not app assertions.
  MAESTRO_DRIVER_STARTUP_TIMEOUT: TOOLCHAIN.IOS_DRIVER_STARTUP_TIMEOUT_MS,
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

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  prepareIos()
    .then((env) => {
      if (process.env.GITHUB_ENV)
        appendFileSync(
          process.env.GITHUB_ENV,
          `DEVELOPER_DIR=${env.DEVELOPER_DIR}\n`,
        );
      console.log(
        `Selected Xcode ${TOOLCHAIN.XCODE_VERSION} (${TOOLCHAIN.XCODE_BUILD}) and ${TOOLCHAIN.IOS_RUNTIME}.`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
