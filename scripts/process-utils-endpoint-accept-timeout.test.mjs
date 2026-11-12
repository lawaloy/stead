import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForEndpoint } from './process-utils.mjs';

test('waitForEndpoint times out when HTTP 200 never satisfies the accept predicate', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      text: async () => 'packager-status:starting',
    };
  };
  try {
    await assert.rejects(
      waitForEndpoint(
        'http://127.0.0.1:9/status',
        { exitCode: null, signalCode: null },
        {
          timeout: 50,
          accept: async (response) =>
            response.ok &&
            (await response.text()).includes('packager-status:running'),
        },
      ),
      /Timed out waiting for http:\/\/127\.0\.0\.1:9\/status/,
    );
    assert.ok(
      calls >= 1,
      'readiness must fetch before treating Metro as not ready',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
