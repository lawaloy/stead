import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCodeQL } from './codeql-local.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const restoreProperty = (object, name, descriptor) => {
  Object.defineProperty(object, name, descriptor);
};

test('CodeQL preflight invokes codeql.cmd on Windows when STEAD_CODEQL_BIN is unset', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    configurable: true,
    enumerable: true,
    writable: false,
  });
  const commands = [];
  try {
    const binary = await checkCodeQL({
      env: {},
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        return JSON.stringify({ version: TOOLCHAIN.CODEQL_VERSION });
      },
    });
    assert.equal(binary, 'codeql.cmd');
    assert.deepEqual(commands, [['codeql.cmd', 'version', '--format=json']]);
  } finally {
    restoreProperty(process, 'platform', platform);
  }
});
