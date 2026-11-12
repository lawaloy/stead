import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const FINGERPRINT = 'stead-emulator-fingerprint';

const writePinnedSdk = (sdk, packageXml) => {
  const image = join(
    sdk,
    'system-images',
    `android-${TOOLCHAIN.ANDROID_API_LEVEL}`,
    TOOLCHAIN.ANDROID_IMAGE_TARGET,
    TOOLCHAIN.ANDROID_ARCH,
  );
  mkdirSync(image, { recursive: true });
  mkdirSync(join(sdk, 'emulator'), { recursive: true });
  writeFileSync(join(image, 'package.xml'), packageXml);
  writeFileSync(
    join(image, 'build.prop'),
    `ro.system.build.fingerprint=${FINGERPRINT}\n`,
  );
  writeFileSync(
    join(sdk, 'emulator', 'source.properties'),
    `Pkg.Revision=${TOOLCHAIN.ANDROID_EMULATOR_VERSION}\nPkg.BuildId=${TOOLCHAIN.ANDROID_EMULATOR_BUILD}\n`,
  );
};

const crlfPackageXml = (revision) =>
  `<revision>\r\n  <major>${revision}</major>\r\n  <minor>0</minor>\r\n</revision>\r\n`;

const androidImageRevisionPreflight = (sdk) => {
  const commands = [];
  const pending = checkNativeToolchain('android', {
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
      commands.push([command, ...args]);
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
  return { commands, pending };
};

test('Android device preflight accepts CRLF system-image package.xml for the pinned revision', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-image-crlf-'));
  try {
    writePinnedSdk(sdk, crlfPackageXml(TOOLCHAIN.ANDROID_IMAGE_REVISION));
    const { pending } = androidImageRevisionPreflight(sdk);
    const result = await pending;
    assert.equal(
      result.metadata.androidImage.revision,
      TOOLCHAIN.ANDROID_IMAGE_REVISION,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android device preflight still rejects a mismatched CRLF system-image revision before boot probes', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-image-crlf-mismatch-'));
  try {
    writePinnedSdk(sdk, crlfPackageXml('0'));
    const { commands, pending } = androidImageRevisionPreflight(sdk);
    await assert.rejects(
      pending,
      new RegExp(
        `Use Android system image revision ${TOOLCHAIN.ANDROID_IMAGE_REVISION} to match CI`,
      ),
    );
    assert.equal(
      commands.some(
        ([command, ...args]) =>
          command === 'adb' && args.includes('ro.build.version.sdk'),
      ),
      false,
    );
    assert.equal(
      commands.some(
        ([command, ...args]) =>
          command === 'adb' && args.includes('sys.boot_completed'),
      ),
      false,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android device preflight fails closed when CRLF package.xml omits a major revision', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-image-crlf-empty-'));
  try {
    writePinnedSdk(sdk, '<revision>\r\n  <minor>0</minor>\r\n</revision>\r\n');
    const { commands, pending } = androidImageRevisionPreflight(sdk);
    await assert.rejects(
      pending,
      new RegExp(
        `Use Android system image revision ${TOOLCHAIN.ANDROID_IMAGE_REVISION} to match CI \\(found no version\\)`,
      ),
    );
    assert.equal(
      commands.some(
        ([command, ...args]) =>
          command === 'adb' && args.includes('sys.boot_completed'),
      ),
      false,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
