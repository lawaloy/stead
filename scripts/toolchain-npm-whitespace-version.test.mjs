import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';

test('JS toolchain preflight fails closed when npm --version is whitespace-only', async () => {
  let commands = 0;
  await assert.rejects(
    checkJsToolchain({
      node: TOOLCHAIN.NODE_VERSION,
      execute: async () => {
        commands += 1;
        return ' \t\n ';
      },
    }),
    new RegExp(
      `Use npm ${TOOLCHAIN.NPM_VERSION} to match CI \\(found no version\\)`,
    ),
  );
  assert.equal(commands, 1);
});
