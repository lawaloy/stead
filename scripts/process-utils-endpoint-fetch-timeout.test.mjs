import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForEndpoint } from './process-utils.mjs';

test(
  'waitForEndpoint retries a hung health check that is aborted by the per-attempt timeout',
  { timeout: 10_000 },
  async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (_url, { signal } = {}) => {
      calls += 1;
      if (calls === 1) {
        assert.ok(signal, 'readiness fetch must pass an abort signal');
        await new Promise((_, reject) => {
          const fail = () =>
            reject(signal.reason ?? new Error('readiness fetch aborted'));
          if (signal.aborted) {
            fail();
            return;
          }
          signal.addEventListener('abort', fail, { once: true });
        });
      }
      return { ok: true };
    };
    try {
      const started = Date.now();
      await waitForEndpoint(
        'http://127.0.0.1:9/health',
        { exitCode: null, signalCode: null },
        { timeout: 5_000 },
      );
      assert.equal(calls, 2);
      assert.ok(Date.now() - started < 4_500);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
