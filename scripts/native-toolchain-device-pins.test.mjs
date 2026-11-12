import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const FINGERPRINT = 'stead-emulator-fingerprint';

const writePinnedSdk = (
  sdk,
  {
    emulatorVersion = TOOLCHAIN.ANDROID_EMULATOR_VERSION,
    emulatorBuild = TOOLCHAIN.ANDROID_EMULATOR_BUILD,
  } = {},
) => {
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
    `Pkg.Revision=${emulatorVersion}\nPkg.BuildId=${emulatorBuild}\n`,
  );
};

const androidToolchain = ({
  sdk,
  abi = TOOLCHAIN.ANDROID_ARCH,
  platformTools = TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION,
} = {}) =>
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
          return `Android Debug Bridge version 1.0.41\nVersion ${platformTools}`;
        if (args.includes('getprop')) {
          const key = args.at(-1);
          if (key === 'ro.kernel.qemu') return '1';
          if (key === 'ro.build.fingerprint') return FINGERPRINT;
          if (key === 'ro.product.cpu.abi') return abi;
          if (key === 'ro.build.version.sdk')
            return TOOLCHAIN.ANDROID_API_LEVEL;
          if (key === 'sys.boot_completed') return '1';
        }
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

test('native Android preflight rejects an emulator whose build id does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-emulator-build-'));
  try {
    writePinnedSdk(sdk, { emulatorBuild: '0' });
    await assert.rejects(
      androidToolchain({ sdk }),
      new RegExp(
        `Use Android emulator build ${TOOLCHAIN.ANDROID_EMULATOR_BUILD} to match CI`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight rejects an emulator whose architecture does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-arch-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk, abi: 'armeabi-v7a' }),
      new RegExp(
        `Use Android architecture ${TOOLCHAIN.ANDROID_ARCH} to match CI`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight rejects platform tools whose version does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-platform-tools-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk, platformTools: '0.0.0' }),
      new RegExp(
        `Use Android platform tools ${TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION} to match CI`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
