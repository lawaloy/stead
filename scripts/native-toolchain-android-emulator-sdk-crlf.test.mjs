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
    fingerprint = FINGERPRINT,
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
    `ro.system.build.fingerprint=${fingerprint}\r\n`,
  );
  writeFileSync(
    join(sdk, 'emulator', 'source.properties'),
    `Pkg.Revision=${emulatorVersion}\r\nPkg.BuildId=${emulatorBuild}\r\n`,
  );
};

const androidEmulatorPreflight = ({ sdk } = {}) =>
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
  });

test('Android device preflight accepts CRLF emulator source.properties and system-image build.prop pins', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-emulator-crlf-'));
  try {
    writePinnedSdk(sdk);
    const result = await androidEmulatorPreflight({ sdk });
    assert.equal(result.metadata.device, 'emulator-5554');
    assert.equal(result.metadata.emulator, TOOLCHAIN.ANDROID_EMULATOR_VERSION);
    assert.equal(
      result.metadata.emulatorBuild,
      TOOLCHAIN.ANDROID_EMULATOR_BUILD,
    );
    assert.equal(result.metadata.androidImage.fingerprint, FINGERPRINT);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android device preflight still rejects a mismatched CRLF emulator revision', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-emulator-rev-crlf-'));
  try {
    writePinnedSdk(sdk, { emulatorVersion: '0' });
    await assert.rejects(
      androidEmulatorPreflight({ sdk }),
      new RegExp(
        `Use Android emulator ${TOOLCHAIN.ANDROID_EMULATOR_VERSION} to match CI`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android device preflight still rejects a mismatched CRLF system-image fingerprint', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-fingerprint-crlf-'));
  try {
    writePinnedSdk(sdk, { fingerprint: 'wrong-fingerprint' });
    await assert.rejects(
      androidEmulatorPreflight({ sdk }),
      /Use Android system image fingerprint/,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
