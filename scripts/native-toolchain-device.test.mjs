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
  { revision = TOOLCHAIN.ANDROID_IMAGE_REVISION } = {},
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
    `<revision>\n  <major>${revision}</major>\n</revision>\n`,
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

const androidToolchain = ({
  sdk,
  qemu = '1',
  apiLevel = TOOLCHAIN.ANDROID_API_LEVEL,
  bootCompleted = '1',
  fingerprint = FINGERPRINT,
  getprops = [],
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
          return `Android Debug Bridge version 1.0.41\nVersion ${TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION}`;
        if (args.includes('getprop')) {
          const key = args.at(-1);
          getprops.push(key);
          if (key === 'ro.kernel.qemu') return qemu;
          if (key === 'ro.build.fingerprint') return fingerprint;
          if (key === 'ro.product.cpu.abi') return TOOLCHAIN.ANDROID_ARCH;
          if (key === 'ro.build.version.sdk') return apiLevel;
          if (key === 'sys.boot_completed') return bootCompleted;
        }
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

test('native Android preflight refuses a physical device before any identity or boot probes', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-physical-'));
  const getprops = [];
  try {
    await assert.rejects(
      androidToolchain({ sdk, qemu: '0', getprops }),
      /dedicated emulator/,
    );
    assert.deepEqual(getprops, ['ro.kernel.qemu']);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight rejects an emulator whose API level does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-api-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk, apiLevel: '33' }),
      new RegExp(`Use an API ${TOOLCHAIN.ANDROID_API_LEVEL} emulator`),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight waits when the emulator has not finished booting', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-boot-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk, bootCompleted: '0' }),
      /finish booting/,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight refuses an emulator before the pinned system image is installed', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-image-'));
  const getprops = [];
  try {
    await assert.rejects(
      androidToolchain({ sdk, getprops }),
      new RegExp(
        `Install system-images;android-${TOOLCHAIN.ANDROID_API_LEVEL};${TOOLCHAIN.ANDROID_IMAGE_TARGET};${TOOLCHAIN.ANDROID_ARCH}`,
      ),
    );
    assert.deepEqual(getprops, ['ro.kernel.qemu']);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight rejects an emulator whose system image fingerprint does not match the SDK', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-fingerprint-'));
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk, fingerprint: 'other-emulator-fingerprint' }),
      /Android system image fingerprint/,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight fails closed when ANDROID_HOME is missing', async () => {
  const commands = [];
  await assert.rejects(
    androidToolchain({
      sdk: join(tmpdir(), `stead-missing-android-sdk-${Date.now()}`),
      getprops: commands,
    }),
    /Android SDK is missing/,
  );
  assert.deepEqual(commands, []);
});

test('native Android preflight rejects an installed system image whose revision does not match CI', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-revision-'));
  const getprops = [];
  try {
    writePinnedSdk(sdk, { revision: '0' });
    await assert.rejects(
      androidToolchain({ sdk, getprops }),
      new RegExp(
        `Use Android system image revision ${TOOLCHAIN.ANDROID_IMAGE_REVISION} to match CI`,
      ),
    );
    assert.deepEqual(getprops, ['ro.kernel.qemu']);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
