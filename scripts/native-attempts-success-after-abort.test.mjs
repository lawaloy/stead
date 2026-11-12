import assert from 'node:assert/strict';
import test from 'node:test';
import { runMaestroCommand } from './native-attempts.mjs';

test('a Maestro command that returns after cancellation is still failed as cancellation', async () => {
  const controller = new AbortController();
  const reason = new Error('validation cancelled');
  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      { signal: controller.signal },
      {
        execute: async () => {
          controller.abort(reason);
          return 'ok';
        },
      },
    ),
    (error) => {
      assert.equal(error, reason);
      assert.equal(error.nativeFailure, undefined);
      return true;
    },
  );
});
