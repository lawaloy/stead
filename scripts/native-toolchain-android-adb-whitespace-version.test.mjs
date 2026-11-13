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

const androidAdbVersionPreflight = (sdk, platformToolsOutput) => {
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
        if (args.includes('version')) return platformToolsOutput;
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

test('Android platform-tools preflight fails closed when adb version output is whitespace-only', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-adb-whitespace-'));
  try {
    writePinnedSdk(sdk);
    const { commands, pending } = androidAdbVersionPreflight(sdk, ' \t\n ');
    await assert.rejects(
      pending,
      new RegExp(
        `Use Android platform tools ${TOOLCHAIN.ANDROID_PLATFORM_TOOLS_VERSION} to match CI \\(found no version\\)`,
      ),
    );
    assert.equal(
      commands.some(
        ([command, ...args]) => command === 'adb' && args.includes('version'),
      ),
      true,
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
