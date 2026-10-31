import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDependencies } from './dependency-checks.mjs';
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
