import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCodeQL } from './codeql-local.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('CodeQL preflight uses STEAD_CODEQL_BIN instead of the default binary name', async () => {
  const commands = [];
  const binary = await checkCodeQL({
    env: { STEAD_CODEQL_BIN: '/custom/codeql' },
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      return JSON.stringify({ version: TOOLCHAIN.CODEQL_VERSION });
    },
  });

  assert.equal(binary, '/custom/codeql');
  assert.deepEqual(commands, [['/custom/codeql', 'version', '--format=json']]);
});

test('CodeQL preflight names STEAD_CODEQL_BIN when the pinned custom binary is missing', async () => {
  await assert.rejects(
    checkCodeQL({
      env: { STEAD_CODEQL_BIN: '/missing/codeql' },
      execute: async () => {
        throw new Error('not installed');
      },
    }),
    (error) =>
      error.message.includes(
        `Install the official CodeQL bundle ${TOOLCHAIN.CODEQL_VERSION} and set STEAD_CODEQL_BIN or PATH. not installed`,
      ),
  );
});
