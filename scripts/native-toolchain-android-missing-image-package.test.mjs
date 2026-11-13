import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const FINGERPRINT = 'stead-emulator-fingerprint';

const writePinnedSdkWithoutPackageXml = (sdk) => {
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
    join(image, 'build.prop'),
    `ro.system.build.fingerprint=${FINGERPRINT}\n`,
  );
  writeFileSync(
    join(sdk, 'emulator', 'source.properties'),
    `Pkg.Revision=${TOOLCHAIN.ANDROID_EMULATOR_VERSION}\nPkg.BuildId=${TOOLCHAIN.ANDROID_EMULATOR_BUILD}\n`,
  );
};

const androidToolchain = (sdk) =>
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

test('native Android preflight fails closed when system-image package.xml is missing', async () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-missing-image-package-'),
  );
  try {
    writePinnedSdkWithoutPackageXml(sdk);
    await assert.rejects(
      androidToolchain(sdk),
      new RegExp(
        `Install system-images;android-${TOOLCHAIN.ANDROID_API_LEVEL};${TOOLCHAIN.ANDROID_IMAGE_TARGET};${TOOLCHAIN.ANDROID_ARCH}`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
