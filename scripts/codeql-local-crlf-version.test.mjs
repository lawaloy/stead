import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCodeQL } from './codeql-local.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('CodeQL preflight accepts CRLF version JSON for the pinned bundle', async () => {
  const commands = [];
  const binary = await checkCodeQL({
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      return `${JSON.stringify({ version: TOOLCHAIN.CODEQL_VERSION })}\r\n`;
    },
  });

  assert.equal(binary, 'codeql');
  assert.deepEqual(commands, [['codeql', 'version', '--format=json']]);
});

test('CodeQL preflight still rejects a mismatched CRLF version JSON', async () => {
  let commands = 0;
  await assert.rejects(
    checkCodeQL({
      execute: async () => {
        commands += 1;
        return `${JSON.stringify({ version: '1.0.0' })}\r\n`;
      },
    }),
    new RegExp(
      `Use CodeQL bundle ${TOOLCHAIN.CODEQL_VERSION} to match CI \\(found 1\\.0\\.0\\)`,
    ),
  );
  assert.equal(commands, 1);
});
