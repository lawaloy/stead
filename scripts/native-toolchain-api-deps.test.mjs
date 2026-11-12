import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

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
    `Pkg.Revision=${TOOLCHAIN.ANDROID_EMULATOR_VERSION}\nPkg.BuildId=${TOOLCHAIN.ANDROID_EMULATOR_BUILD}\n`,
  );
};

test('native Android device preflight fails closed when API dependencies are missing', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-api-deps-'));
  const dependencyChecks = [];
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
        exists: (path) => {
          dependencyChecks.push(path);
          return path === join(ROOT, 'mobile', 'node_modules');
        },
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
      /Install api dependencies with npm run setup first/,
    );
    assert.ok(
      dependencyChecks.includes(join(ROOT, 'api', 'node_modules')),
      'device journeys must require the API package',
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('iOS artifact preflight fails closed when API dependencies are missing', async () => {
  const dependencyChecks = [];
  await assert.rejects(
    checkNativeToolchain('ios', {
      host: 'darwin',
      requireBuild: false,
      requireDevice: true,
      requireMaestro: false,
      env: {
        DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
      },
      exists: (path) => {
        dependencyChecks.push(path);
        return path === join(ROOT, 'mobile', 'node_modules');
      },
      execute: async (command, args = []) => {
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'xcodebuild')
          return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        if (command === 'xcrun')
          return JSON.stringify({
            devices: {
              [TOOLCHAIN.IOS_RUNTIME]: [
                {
                  name: 'Stead Native iPhone 17',
                  udid: 'stead-test',
                  isAvailable: true,
                  state: 'Shutdown',
                },
              ],
            },
          });
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    /Install api dependencies with npm run setup first/,
  );
  assert.deepEqual(dependencyChecks, [join(ROOT, 'api', 'node_modules')]);
});
