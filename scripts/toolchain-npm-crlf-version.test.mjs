import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN, checkJsToolchain } from './toolchain.mjs';

const WRONG_NPM = '11.0.0';

test('JS toolchain preflight accepts CRLF npm --version for the pinned release', async () => {
  assert.notEqual(WRONG_NPM, TOOLCHAIN.NPM_VERSION);
  const metadata = await checkJsToolchain({
    node: TOOLCHAIN.NODE_VERSION,
    execute: async () => `${TOOLCHAIN.NPM_VERSION}\r\n`,
  });
  assert.deepEqual(metadata, {
    node: TOOLCHAIN.NODE_VERSION,
    npm: TOOLCHAIN.NPM_VERSION,
  });
});

test('JS toolchain preflight still rejects a mismatched CRLF npm version before other tools', async () => {
  let commands = 0;
  await assert.rejects(
    checkJsToolchain({
      node: TOOLCHAIN.NODE_VERSION,
      execute: async () => {
        commands += 1;
        return `${WRONG_NPM}\r\n`;
      },
    }),
    new RegExp(`Use npm ${TOOLCHAIN.NPM_VERSION} to match CI`),
  );
  assert.equal(commands, 1);
});
