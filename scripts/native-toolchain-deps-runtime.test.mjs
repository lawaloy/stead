import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain, selectIosDevice } from './native-toolchain.mjs';

const FINGERPRINT = 'stead-emulator-fingerprint';

const writePinnedSdk = (sdk) => {
  const image = join(
    sdk,
    'system-images',
    `android-${TOOLCHAIN.ANDROID_API_LEVEL}`,
    TOOLCHAIN.ANDROID_IMAGE_TARGET,
    TOOLCHAIN.ANDROID_ARCH,
  );
  mkdirSync(image, { recursive: true });
  mkdirSync(join(sdk, 'emulator'), { recursive: true });
  writeFileSync(
    join(image, 'package.xml'),
    `<revision>\n  <major>${TOOLCHAIN.ANDROID_IMAGE_REVISION}</major>\n</revision>\n`,
  );
  writeFileSync(
    join(image, 'build.prop'),
    `ro.system.build.fingerprint=${FINGERPRINT}\n`,
  );
  writeFileSync(
    join(sdk, 'emulator', 'source.properties'),
    `Pkg.Revision=0\nPkg.BuildId=${TOOLCHAIN.ANDROID_EMULATOR_BUILD}\n`,
  );
};

test('iOS selection rejects a dedicated simulator whose runtime does not match CI', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [],
      'com.apple.CoreSimulator.SimRuntime.iOS-99-0': [
        {
          name: 'Stead Native iPhone 17',
          udid: 'wrong-runtime',
          isAvailable: true,
          state: 'Booted',
        },
      ],
    },
  };
  assert.throws(
    () => selectIosDevice(listing, 'wrong-runtime'),
    /iOS simulator runtime/,
  );
});

test('iOS source-build preflight fails closed when mobile dependencies are missing', async () => {
  await assert.rejects(
    checkNativeToolchain('ios', {
      host: 'darwin',
      requireDevice: false,
      requireBuild: true,
      requireMaestro: false,
      env: {
        DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
      },
      exists: () => false,
      execute: async (command, args = []) => {
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'xcodebuild')
          return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        if (command === 'ruby') return TOOLCHAIN.RUBY_VERSION;
        if (command === 'bundle' && args.includes('pod'))
          return TOOLCHAIN.COCOAPODS_VERSION;
        if (command === 'bundle')
          return `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    /Install mobile dependencies with npm run setup first/,
  );
});

test('Android preflight fails closed when mobile dependencies are missing', async () => {
  await assert.rejects(
    checkNativeToolchain('android', {
      requireDevice: false,
      requireBuild: false,
      requireMaestro: false,
      env: {
        ANDROID_HOME: ROOT,
        STEAD_JAVA_BIN: 'java',
      },
      exists: () => false,
      execute: async (command) => {
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'java')
          return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
        throw new Error(`Unexpected ${command}`);
      },
    }),
    /Install mobile dependencies with npm run setup first/,
  );
});

test('native Android preflight rejects an emulator whose version does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-emulator-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      checkNativeToolchain('android', {
        requireBuild: false,
        requireMaestro: false,
        requireDevice: true,
        env: {
          ANDROID_HOME: sdk,
          STEAD_JAVA_BIN: 'java',
          STEAD_ADB_BIN: 'adb',
        },
        exists: (path) =>
          path === join(ROOT, 'api', 'node_modules') ||
          path === join(ROOT, 'mobile', 'node_modules'),
        execute: async (command, args = []) => {
          if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
          if (command === 'java')
            return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
          if (command === 'adb') {
            if (args.includes('devices'))
              return 'List of devices attached\nemulator-5554 device product:sdk';
            if (args.includes('version'))
              return `Android Debug Bridge version 1.0.41\nVersion ${TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION}`;
            if (args.includes('getprop')) {
              const key = args.at(-1);
              if (key === 'ro.kernel.qemu') return '1';
              if (key === 'ro.build.fingerprint') return FINGERPRINT;
              if (key === 'ro.product.cpu.abi') return TOOLCHAIN.ANDROID_ARCH;
              if (key === 'ro.build.version.sdk')
                return TOOLCHAIN.ANDROID_API_LEVEL;
              if (key === 'sys.boot_completed') return '1';
            }
          }
          throw new Error(`Unexpected ${command} ${args.join(' ')}`);
        },
      }),
      new RegExp(
        `Use Android emulator ${TOOLCHAIN.ANDROID_EMULATOR_VERSION} to match CI`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
