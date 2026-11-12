import assert from 'node:assert/strict';
import test from 'node:test';
import { checkNativeToolchain } from './native-toolchain.mjs';

test('native toolchain refuses combined or unknown platforms before identity checks', async () => {
  let executions = 0;
  for (const platform of ['all', 'web', 'Android', ''])
    await assert.rejects(
      checkNativeToolchain(platform, {
        execute: async () => {
          executions += 1;
        },
      }),
      /Choose android or ios/,
    );
  assert.equal(executions, 0);
});
