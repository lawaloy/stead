import {
  existsSync,
  mkdirSync,
  createWriteStream,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT, TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';
import { repositorySdk, sdkReceipt } from './android-sdk.mjs';
import {
  runCommand,
  spawnOwned,
  stopOwned,
  assertPortAvailable,
  withCleanup,
} from './process-utils.mjs';

export const assertAndroidUiHealthy = (windows) => {
  const focus = windows.match(/mCurrentFocus=([^\r\n]+)/)?.[1]?.trim();
  if (focus && /Application (Error|Not Responding)|ANR/i.test(focus))
    throw new Error(
      `Android system dialog blocks the journey: ${focus}. Restore emulator health; dialogs are not dismissed automatically.`,
    );
  return !!focus && focus !== 'null';
};

export const androidSdkEnvironment = () => {
  const sdk = repositorySdk();
  sdkReceipt(sdk);
  const home = join(
    ROOT,
    '.tmp/android-avds',
    sdkReceipt(sdk).digest.slice(0, 16),
  );
  return {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    ANDROID_AVD_HOME: home,
    PATH: [
      join(sdk, 'platform-tools'),
      join(sdk, 'emulator'),
      join(
        sdk,
        'cmdline-tools',
        TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION,
        'bin',
      ),
      process.env.PATH || process.env.Path || '',
    ].join(delimiter),
  };
};

export const withAndroidEmulator = async (operation) => {
  await checkJsToolchain();
  const env = androidSdkEnvironment();
  const sdk = env.ANDROID_HOME;
  mkdirSync(env.ANDROID_AVD_HOME, { recursive: true });
  const home = mkdtempSync(join(env.ANDROID_AVD_HOME, 'run-'));
  env.ANDROID_AVD_HOME = home;
  const name = 'stead-native-api34';
  mkdirSync(home, { recursive: true });
  const adb = join(
    sdk,
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb',
  );
  const manager = join(
    sdk,
    'cmdline-tools',
    TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION,
    'bin',
    process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager',
  );
  if (!existsSync(join(home, `${name}.avd/config.ini`)))
    await runCommand(
      manager,
      [
        'create',
        'avd',
        '--name',
        name,
        '--package',
        `system-images;android-${TOOLCHAIN.ANDROID_API_LEVEL};${TOOLCHAIN.ANDROID_IMAGE_TARGET};${TOOLCHAIN.ANDROID_ARCH}`,
        '--device',
        TOOLCHAIN.ANDROID_PROFILE,
      ],
      { env, input: 'no\n' },
    );
  let port;
  for (let candidate = 5554; candidate <= 5582; candidate += 2) {
    try {
      await assertPortAvailable(candidate);
      await assertPortAvailable(candidate + 1);
      port = candidate;
      break;
    } catch {
      /* Leave existing emulators alone. */
    }
  }
  if (!port)
    throw new Error(
      'No free emulator console/ADB ports. Existing emulators will not be stopped.',
    );
  const device = `emulator-${port}`;
  const directory = join(ROOT, '.tmp/emulator-validation', String(Date.now()));
  mkdirSync(directory, { recursive: true });
  const log = createWriteStream(join(directory, 'emulator.log'));
  const controller = new AbortController();
  const abort = () =>
    controller.abort(new Error('Managed emulator verification interrupted.'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  const emulator = spawnOwned(
    join(
      sdk,
      'emulator',
      process.platform === 'win32' ? 'emulator.exe' : 'emulator',
    ),
    [
      '-avd',
      name,
      '-port',
      String(port),
      '-no-snapshot',
      '-no-window',
      '-no-boot-anim',
      '-no-audio',
      '-gpu',
      TOOLCHAIN.ANDROID_EMULATOR_GPU,
      '-feature',
      '-Vulkan',
      '-cores',
      TOOLCHAIN.ANDROID_EMULATOR_CORES,
      '-memory',
      TOOLCHAIN.ANDROID_EMULATOR_MEMORY,
      '-camera-back',
      'none',
      '-camera-front',
      'none',
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  emulator.stdout.pipe(log, { end: false });
  emulator.stderr.pipe(log, { end: false });
  try {
    return await withCleanup(async () => {
      try {
        const deadline = Date.now() + 360_000;
        let readySince;
        while (Date.now() < deadline) {
          controller.signal.throwIfAborted();
          if (emulator.exitCode !== null || emulator.signalCode !== null)
            throw new Error(
              'Android emulator exited before boot. See emulator.log.',
            );
          const booted = await runCommand(
            adb,
            ['-s', device, 'shell', 'getprop', 'sys.boot_completed'],
            { env, quiet: true, signal: controller.signal },
          ).catch(() => '');
          if (booted.trim() === '1') {
            const windows = await runCommand(
              adb,
              ['-s', device, 'shell', 'dumpsys', 'window'],
              { env, quiet: true, stdoutOnly: true, signal: controller.signal },
            );
            if (assertAndroidUiHealthy(windows)) {
              readySince ??= Date.now();
              if (Date.now() - readySince >= 30_000)
                return operation({ env, device, signal: controller.signal });
            } else readySince = undefined;
          } else readySince = undefined;
          await delay(1000, undefined, { signal: controller.signal });
        }
        throw new Error(
          'Android emulator did not become UI-ready within six minutes. See emulator.log.',
        );
      } catch (error) {
        if (!controller.signal.aborted)
          await Promise.allSettled(
            [
              ['windows', ['shell', 'dumpsys', 'window']],
              ['system', ['logcat', '-d', '-b', 'system']],
              ['events', ['logcat', '-d', '-b', 'events']],
            ].map(async ([name, args]) => {
              const output = await runCommand(adb, ['-s', device, ...args], {
                env,
                quiet: true,
                stdoutOnly: true,
                signal: AbortSignal.timeout(10_000),
              });
              writeFileSync(join(directory, `${name}.log`), output);
            }),
          );
        throw error;
      }
    }, [
      async () => {
        await stopOwned(emulator);
        if (!emulator.closed)
          throw new Error(
            'Emulator is still running; its owned AVD data is retained.',
          );
        await rm(home, { recursive: true, force: true, maxRetries: 10 });
      },
    ]);
  } finally {
    log.end();
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    console.log(`Emulator evidence: ${directory}`);
  }
};

export const managedAndroidWorkflow = async (
  options,
  {
    workflow,
    emulator = withAndroidEmulator,
    environment = androidSdkEnvironment(),
  } = {},
) => {
  const previous = process.env;
  process.env = environment;
  options = { ...options, platform: 'android' };
  try {
    workflow ??= (await import('./native-workflow.mjs')).nativeWorkflow;
    // Keep compilation and security/unit checks from competing with Android startup.
    const prepared = await workflow({ ...options, prepareOnly: true });
    return await emulator(async ({ env, device }) => {
      process.env = env;
      return workflow({
        ...options,
        command: 'test',
        app: prepared.app,
        sourceBuilt: prepared.sourceBuilt,
        buildMetadata: prepared.metadata,
        device,
      });
    });
  } finally {
    process.env = previous;
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { parseNativeArguments } = await import('./native-config.mjs');
  managedAndroidWorkflow(
    parseNativeArguments([
      'test',
      '--platform',
      'android',
      ...process.argv.slice(2),
    ]),
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
