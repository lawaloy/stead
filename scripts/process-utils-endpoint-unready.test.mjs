import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForEndpoint } from './process-utils.mjs';

test('waitForEndpoint fails closed when the service exits 0 before becoming ready', async () => {
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
        { exitCode: 0, signalCode: null },
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

test('waitForEndpoint does not treat HTTP error responses as ready', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 503,
      text: async () => 'starting',
    };
  };
  try {
    await assert.rejects(
      waitForEndpoint(
        'http://127.0.0.1:9/health',
        { exitCode: null, signalCode: null },
        { timeout: 50 },
      ),
      /Timed out waiting for http:\/\/127\.0\.0\.1:9\/health/,
    );
    assert.ok(
      calls >= 1,
      'readiness must fetch before treating HTTP 503 as unready',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
