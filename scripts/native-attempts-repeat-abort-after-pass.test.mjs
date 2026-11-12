import assert from 'node:assert/strict';
import test from 'node:test';
import { repeatJourneys } from './native-attempts.mjs';

test('a cancelled signal after a passed attempt does not schedule later journeys', async () => {
  const controller = new AbortController();
  const calls = [];
  const results = await repeatJourneys(
    3,
    async (attempt) => {
      calls.push(attempt);
      controller.abort();
      return { schema: `run_${attempt}` };
    },
    controller.signal,
  );
  assert.deepEqual(calls, [1]);
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'passed');
  assert.equal(results[0].schema, 'run_1');
});
