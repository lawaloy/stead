import assert from 'node:assert/strict';
import test from 'node:test';
import { withCleanup } from './process-utils.mjs';

test('a successful operation is returned unchanged when cleanup succeeds', async () => {
  const result = { ok: true };
  const cleaned = [];

  assert.equal(
    await withCleanup(
      async () => result,
      [
        async () => {
          cleaned.push('first');
        },
        () => {
          cleaned.push('second');
        },
      ],
    ),
    result,
  );
  assert.deepEqual(cleaned, ['first', 'second']);
});
