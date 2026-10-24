import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { runCommand } from './process-utils.mjs';
import { checkJsToolchain, assertToolVersion } from './toolchain.mjs';
import { repositorySdk, sdkReceipt, validateSdkModel } from './android-sdk.mjs';
import { checkXcodeVersion, iosEnvironment } from './ios-setup.mjs';

export const readSdkProperties = (path) =>
  Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );

export const checkAndroidBuildSdk = (sdk) => {
  const packages = [
    [
      'build-tools',
      TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION,
      'Android build tools',
    ],
    [
      'build-tools',
      TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION,
      'Expo module build tools',
    ],
    ['ndk', TOOLCHAIN.ANDROID_NDK_VERSION, 'Android NDK'],
    ['cmake', TOOLCHAIN.ANDROID_CMAKE_VERSION, 'CMake'],
    [
      'platforms',
      `android-${TOOLCHAIN.ANDROID_COMPILE_SDK}`,
      'Android compile SDK',
      TOOLCHAIN.ANDROID_PLATFORM_REVISION,
    ],
  ];
  for (const [name, directory, label, expected = directory] of packages) {
    const path = join(sdk, name, directory, 'source.properties');
    if (!existsSync(path))
      throw new Error(
        `Install SDK package ${name};${directory} to match .github/ci.env.`,
      );
    assertToolVersion(label, readSdkProperties(path)['Pkg.Revision'], expected);
  }
  return {
    buildTools: TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION,
    moduleBuildTools: TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION,
    ndk: TOOLCHAIN.ANDROID_NDK_VERSION,
    cmake: TOOLCHAIN.ANDROID_CMAKE_VERSION,
    compileSdk: TOOLCHAIN.ANDROID_COMPILE_SDK,
    platformRevision: TOOLCHAIN.ANDROID_PLATFORM_REVISION,
  };
};

export const nativeTools = (env = process.env, platform = process.platform) => {
  const windows = platform === 'win32';
  const sdk =
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    (existsSync(repositorySdk(platform))
      ? repositorySdk(platform)
      : undefined) ||
    (windows
      ? join(
          env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
          'Android',
          'Sdk',
        )
      : platform === 'darwin'
        ? join(homedir(), 'Library', 'Android', 'sdk')
        : join(homedir(), 'Android', 'Sdk'));
  const repositoryMaestro = join(
    ROOT,
    '.tmp/tools/maestro',
    TOOLCHAIN.MAESTRO_VERSION,
    'bin',
    windows ? 'maestro.bat' : 'maestro',
  );
  return {
    sdk,
    java:
      env.STEAD_JAVA_BIN ||
      (env.JAVA_HOME
        ? join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java')
        : 'java'),
    adb:
      env.STEAD_ADB_BIN ||
      join(sdk, 'platform-tools', windows ? 'adb.exe' : 'adb'),
    maestro:
      env.STEAD_MAESTRO_BIN ||
      (existsSync(repositoryMaestro)
        ? repositoryMaestro
        : join(
            env.MAESTRO_HOME || join(homedir(), '.maestro'),
            'bin',
            windows ? 'maestro.bat' : 'maestro',
          )),
  };
};

export const selectAndroidDevice = (output, requested) => {
  const devices = output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[1] === 'device')
    .map(([id]) => id);
  if (requested && !devices.includes(requested))
    throw new Error(`Android device ${requested} is not online.`);
  if (!requested && devices.length !== 1)
    throw new Error(
      'Start one dedicated Android emulator, or choose it with --device. No device will be reset automatically.',
    );
  return requested || devices[0];
};

export const selectIosDevice = (listing, requested) => {
  const devices = Object.entries(listing.devices).flatMap(
    ([runtime, entries]) =>
      entries
        .filter((device) => device.isAvailable)
        .map((device) => ({ ...device, runtime })),
  );
  const selected = requested
    ? devices.find((device) => device.udid === requested)
    : devices
        .filter((device) => device.runtime === TOOLCHAIN.IOS_RUNTIME)
        .find(
          (device) =>
            device.state === 'Booted' &&
            device.name === 'Stead Native iPhone 17',
        ) ||
      devices
        .filter(
          (device) =>
            device.name === 'Stead Native iPhone 17' &&
            device.runtime === TOOLCHAIN.IOS_RUNTIME,
        )
        .at(-1);
  if (!selected || !selected.name.startsWith('Stead Native '))
    throw new Error(
      'Create a dedicated simulator named "Stead Native iPhone 17". The journey clears the entire simulator keychain; personal simulators are refused.',
    );
  assertToolVersion(
    'iOS simulator runtime',
    selected.runtime,
    TOOLCHAIN.IOS_RUNTIME,
  );
  return selected;
};

export const checkNativeToolchain = async (
  platform,
  {
    device,
    requireDevice = true,
    requireMaestro = true,
    requireBuild = true,
    execute = runCommand,
    env = process.env,
    host = process.platform,
  } = {},
) => {
  if (!['android', 'ios'].includes(platform))
    throw new Error('Choose android or ios.');
  if (platform === 'ios' && host !== 'darwin')
    throw new Error(
      'iOS native verification requires macOS and Xcode. Run the same command on a Mac; iOS has not been verified here.',
    );
  if (platform === 'ios') env = iosEnvironment(env);
  const tools = nativeTools(env, host);
  const metadata = { platform, ...(await checkJsToolchain({ execute, env })) };
  if (requireMaestro || platform === 'android') {
    const java = await execute(tools.java, ['-version'], { quiet: true, env });
    const runtime = java.match(/Runtime Environment Temurin-([^\s]+)/)?.[1];
    if (runtime !== TOOLCHAIN.JAVA_VERSION)
      throw new Error(
        `Use Eclipse Temurin ${TOOLCHAIN.JAVA_VERSION} to match CI (found ${runtime || 'a different Java distribution'}). Set JAVA_HOME to that installation.`,
      );
    metadata.java = runtime;
  }
  if (requireMaestro) {
    const maestro = await execute(tools.maestro, ['--version'], {
      quiet: true,
      env,
    });
    if (
      !maestro
        .split(/\r?\n/)
        .some((line) => line.trim() === TOOLCHAIN.MAESTRO_VERSION)
    )
      throw new Error(
        `Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI. Install it or set STEAD_MAESTRO_BIN.`,
      );
    metadata.maestro = TOOLCHAIN.MAESTRO_VERSION;
  }
  if (platform === 'android') {
    if (!existsSync(tools.sdk))
      throw new Error('Android SDK is missing. Set ANDROID_HOME.');
    if (existsSync(join(tools.sdk, '.stead-sdk.json')))
      metadata.sdkArchiveLock = sdkReceipt(tools.sdk).digest;
    if (requireBuild && metadata.sdkArchiveLock)
      await validateSdkModel(tools.sdk, execute, env);
    if (requireBuild) metadata.androidBuild = checkAndroidBuildSdk(tools.sdk);
    if (requireDevice) {
      const output = await execute(tools.adb, ['devices', '-l'], {
        quiet: true,
        env,
      });
      tools.device = selectAndroidDevice(output, device);
      const adb = (args) =>
        execute(tools.adb, ['-s', tools.device, ...args], { quiet: true, env });
      if ((await adb(['shell', 'getprop', 'ro.kernel.qemu'])).trim() !== '1')
        throw new Error(
          'Native verification resets app data and requires a dedicated emulator. Physical-device acceptance remains a separate check.',
        );
      const image = join(
        tools.sdk,
        'system-images',
        `android-${TOOLCHAIN.ANDROID_API_LEVEL}`,
        TOOLCHAIN.ANDROID_IMAGE_TARGET,
        TOOLCHAIN.ANDROID_ARCH,
      );
      if (!existsSync(join(image, 'package.xml')))
        throw new Error(
          `Install system-images;android-${TOOLCHAIN.ANDROID_API_LEVEL};${TOOLCHAIN.ANDROID_IMAGE_TARGET};${TOOLCHAIN.ANDROID_ARCH}.`,
        );
      const revision = readFileSync(join(image, 'package.xml'), 'utf8').match(
        /<revision>\s*<major>(\d+)<\/major>/,
      )?.[1];
      assertToolVersion(
        'Android system image revision',
        revision,
        TOOLCHAIN.ANDROID_IMAGE_REVISION,
      );
      const imageProperties = readSdkProperties(join(image, 'build.prop'));
      const fingerprint = (
        await adb(['shell', 'getprop', 'ro.build.fingerprint'])
      ).trim();
      assertToolVersion(
        'Android system image fingerprint',
        fingerprint,
        imageProperties['ro.system.build.fingerprint'],
      );
      assertToolVersion(
        'Android emulator',
        readSdkProperties(join(tools.sdk, 'emulator/source.properties'))[
          'Pkg.Revision'
        ],
        TOOLCHAIN.ANDROID_EMULATOR_VERSION,
      );
      assertToolVersion(
        'Android emulator build',
        readSdkProperties(join(tools.sdk, 'emulator/source.properties'))[
          'Pkg.BuildId'
        ],
        TOOLCHAIN.ANDROID_EMULATOR_BUILD,
      );
      assertToolVersion(
        'Android architecture',
        (await adb(['shell', 'getprop', 'ro.product.cpu.abi'])).trim(),
        TOOLCHAIN.ANDROID_ARCH,
      );
      const adbVersion = await execute(tools.adb, ['version'], {
        quiet: true,
        env,
      });
      assertToolVersion(
        'Android platform tools',
        adbVersion.match(/\bVersion ([\d.]+)/)?.[1],
        TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION,
      );
      if (
        (await adb(['shell', 'getprop', 'ro.build.version.sdk'])).trim() !==
        TOOLCHAIN.ANDROID_API_LEVEL
      )
        throw new Error(
          `Use an API ${TOOLCHAIN.ANDROID_API_LEVEL} emulator to match CI.`,
        );
      if (
        (await adb(['shell', 'getprop', 'sys.boot_completed'])).trim() !== '1'
      )
        throw new Error('Wait for the Android emulator to finish booting.');
      metadata.device = tools.device;
      metadata.androidApi = TOOLCHAIN.ANDROID_API_LEVEL;
      metadata.androidImage = {
        target: TOOLCHAIN.ANDROID_IMAGE_TARGET,
        revision,
        fingerprint,
      };
      metadata.emulator = TOOLCHAIN.ANDROID_EMULATOR_VERSION;
      metadata.emulatorBuild = TOOLCHAIN.ANDROID_EMULATOR_BUILD;
      metadata.platformTools = TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION;
    }
  } else {
    const xcode = await execute('xcodebuild', ['-version'], {
      quiet: true,
      env,
    });
    checkXcodeVersion(xcode);
    metadata.xcode = TOOLCHAIN.XCODE_VERSION;
    metadata.xcodeBuild = TOOLCHAIN.XCODE_BUILD;
    if (requireBuild) {
      const ruby = (
        await execute('ruby', ['-e', 'print RUBY_VERSION'], {
          quiet: true,
          env,
          stdoutOnly: true,
        })
      ).trim();
      if (ruby !== TOOLCHAIN.RUBY_VERSION)
        throw new Error(
          `Use Ruby ${TOOLCHAIN.RUBY_VERSION} to match CI (found ${ruby}).`,
        );
      const bundler = (
        await execute('bundle', ['--version'], { quiet: true, env })
      ).trim();
      if (bundler !== `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}`)
        throw new Error(
          `Use Bundler ${TOOLCHAIN.BUNDLER_VERSION} to match CI (found ${bundler}).`,
        );
      const pods = (
        await execute('bundle', ['exec', 'pod', '--version'], {
          quiet: true,
          env: { ...env, BUNDLE_GEMFILE: join(ROOT, 'mobile/Gemfile') },
          cwd: join(ROOT, 'mobile'),
        })
      ).trim();
      if (pods !== TOOLCHAIN.COCOAPODS_VERSION)
        throw new Error(
          `Use CocoaPods ${TOOLCHAIN.COCOAPODS_VERSION} to match CI (found ${pods}).`,
        );
      metadata.cocoapods = pods;
      metadata.ruby = ruby;
      metadata.bundler = TOOLCHAIN.BUNDLER_VERSION;
    }
    if (requireDevice) {
      const listing = JSON.parse(
        await execute(
          'xcrun',
          ['simctl', 'list', 'devices', 'available', '--json'],
          { quiet: true, env, stdoutOnly: true },
        ),
      );
      tools.simulator = selectIosDevice(listing, device);
      metadata.device = tools.simulator.udid;
      metadata.iosRuntime = tools.simulator.runtime;
    }
  }
  const dependencyDirectories = new Set();
  if (requireDevice) dependencyDirectories.add('api');
  if (requireBuild || platform === 'android')
    dependencyDirectories.add('mobile');
  for (const directory of dependencyDirectories) {
    if (!existsSync(join(ROOT, directory, 'node_modules')))
      throw new Error(
        `Install ${directory} dependencies with npm run setup first.`,
      );
  }
  return { tools, metadata };
};
