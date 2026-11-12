import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkDependencies,
  checkMobileCompatibility,
} from './dependency-checks.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('dependency checks report full-tree findings without weakening production gates', async () => {
  const calls = [];
  await checkDependencies({
    execute: async (command, args) => {
      calls.push({ command, args });
      if (args[0] === '--version') return TOOLCHAIN.NPM_VERSION;
      return '';
    },
  });

  assert.equal(calls.length, 6);
  assert.ok(
    calls.some(
      ({ args }) =>
        args.includes('--audit-level=moderate') &&
        args.includes('--report-only'),
    ),
  );

  await assert.rejects(
    checkDependencies({
      execute: async (_command, args) => {
        if (args[0] === '--version') return TOOLCHAIN.NPM_VERSION;
        if (args.includes('--omit-dev')) throw new Error('production finding');
        return '';
      },
    }),
    /production finding/,
  );
});

test('mobile compatibility checks pin Expo Doctor and fail closed on doctor findings', async () => {
  const calls = [];
  await checkMobileCompatibility({
    execute: async (command, args) => {
      calls.push({ command, args });
      if (args[0] === '--version') return TOOLCHAIN.NPM_VERSION;
      return '';
    },
  });

  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === process.execPath &&
        args.some((arg) => String(arg).endsWith('expo/bin/cli')) &&
        args.includes('install') &&
        args.includes('--check'),
    ),
  );
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'npm' &&
        args.includes(
          `--package=expo-doctor@${TOOLCHAIN.EXPO_DOCTOR_VERSION}`,
        ) &&
        args.includes('expo-doctor'),
    ),
  );

  await assert.rejects(
    checkMobileCompatibility({
      execute: async (_command, args) => {
        if (args[0] === '--version') return TOOLCHAIN.NPM_VERSION;
        if (args.includes('expo-doctor')) throw new Error('doctor finding');
        return '';
      },
    }),
    /doctor finding/,
  );
});
