import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForEndpoint } from './process-utils.mjs';

test('waitForEndpoint fails closed when the service was killed instead of waiting out the timeout', async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error('not ready');
  };
  try {
    const started = Date.now();
    await assert.rejects(
      waitForEndpoint(
        'http://127.0.0.1:9/health',
        { exitCode: null, signalCode: 'SIGTERM' },
        { timeout: 5_000 },
      ),
      /Service exited before http:\/\/127\.0\.0\.1:9\/health became ready/,
    );
    assert.equal(fetches, 0);
    assert.ok(Date.now() - started < 1_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
