import assert from 'node:assert/strict';
import test from 'node:test';
import { withCleanup } from './process-utils.mjs';

test('a failed operation is rethrown unchanged when cleanup succeeds', async () => {
  const original = new Error('journey failed');
  const cleaned = [];

  await assert.rejects(
    withCleanup(async () => {
      throw original;
    }, [
      async () => {
        cleaned.push('first');
      },
      () => {
        cleaned.push('second');
      },
    ]),
    (error) => {
      assert.equal(error, original);
      assert.notEqual(error.name, 'AggregateError');
      return true;
    },
  );
  assert.deepEqual(cleaned, ['first', 'second']);
});
