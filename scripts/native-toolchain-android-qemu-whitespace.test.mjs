import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const androidQemuPreflight = (sdk, qemu) => {
  const getprops = [];
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
        }
      }
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { getprops, pending };
};

test('Android device preflight refuses a whitespace-only qemu getprop before identity or boot probes', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-qemu-whitespace-'));
  try {
    const { getprops, pending } = androidQemuPreflight(sdk, ' \t\n ');
    await assert.rejects(pending, /dedicated emulator/);
    assert.deepEqual(getprops, ['ro.kernel.qemu']);
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
