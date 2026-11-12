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

const androidGetpropPreflight = ({
  sdk,
  qemu = '1\r\n',
  apiLevel = `${TOOLCHAIN.ANDROID_API_LEVEL}\r\n`,
  bootCompleted = '1\r\n',
  fingerprint = `${FINGERPRINT}\r\n`,
  abi = `${TOOLCHAIN.ANDROID_ARCH}\r\n`,
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
          if (key === 'ro.product.cpu.abi') return abi;
          if (key === 'ro.build.version.sdk') return apiLevel;
          if (key === 'sys.boot_completed') return bootCompleted;
        }
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

test('Android device preflight accepts CRLF getprop values for the pinned emulator', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-getprop-crlf-'));
  try {
    writePinnedSdk(sdk);
    const result = await androidGetpropPreflight({ sdk });
    assert.equal(result.metadata.device, 'emulator-5554');
    assert.equal(result.metadata.androidApi, TOOLCHAIN.ANDROID_API_LEVEL);
    assert.equal(result.metadata.androidImage.fingerprint, FINGERPRINT);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android device preflight still rejects a mismatched CRLF API level before the boot probe', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-getprop-api-crlf-'));
  const getprops = [];
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidGetpropPreflight({ sdk, apiLevel: '33\r\n', getprops }),
      new RegExp(`Use an API ${TOOLCHAIN.ANDROID_API_LEVEL} emulator`),
    );
    assert.equal(getprops.includes('ro.build.version.sdk'), true);
    assert.equal(getprops.includes('sys.boot_completed'), false);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
