import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const FINGERPRINT = 'stead-emulator-fingerprint';

const writePinnedSdk = (sdk, { fingerprintLine } = {}) => {
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
    fingerprintLine === undefined
      ? 'ro.build.version.sdk=34\n'
      : fingerprintLine,
  );
  writeFileSync(
    join(sdk, 'emulator', 'source.properties'),
    `Pkg.Revision=${TOOLCHAIN.ANDROID_EMULATOR_VERSION}\nPkg.BuildId=${TOOLCHAIN.ANDROID_EMULATOR_BUILD}\n`,
  );
};

const androidToolchain = ({ sdk, fingerprint = FINGERPRINT } = {}) =>
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
          if (key === 'ro.build.fingerprint') return fingerprint;
          if (key === 'ro.product.cpu.abi') return TOOLCHAIN.ANDROID_ARCH;
          if (key === 'ro.build.version.sdk')
            return TOOLCHAIN.ANDROID_API_LEVEL;
          if (key === 'sys.boot_completed') return '1';
        }
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

test('native Android preflight fails closed when system-image build.prop omits the fingerprint pin', async () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-image-fingerprint-omit-'),
  );
  try {
    writePinnedSdk(sdk);
    await assert.rejects(
      androidToolchain({ sdk }),
      /Use Android system image fingerprint undefined to match CI \(found stead-emulator-fingerprint\)/,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('native Android preflight fails closed when the emulator reports no fingerprint', async () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-image-fingerprint-empty-'),
  );
  try {
    writePinnedSdk(sdk, {
      fingerprintLine: `ro.system.build.fingerprint=${FINGERPRINT}\n`,
    });
    await assert.rejects(
      androidToolchain({ sdk, fingerprint: '' }),
      new RegExp(
        `Use Android system image fingerprint ${FINGERPRINT} to match CI \\(found no version\\)`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
