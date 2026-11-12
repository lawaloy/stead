import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForEndpoint } from './process-utils.mjs';

test(
  'waitForEndpoint fails fast when the caller aborts during the unready delay',
  { timeout: 5_000 },
  async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    let calls = 0;
    let firstFetch;
    const fetched = new Promise((resolve) => {
      firstFetch = resolve;
    });
    globalThis.fetch = async () => {
      calls += 1;
      firstFetch();
      throw new Error('not ready');
    };
    try {
      const pending = waitForEndpoint(
        'http://127.0.0.1:9/health',
        { exitCode: null, signalCode: null },
        { timeout: 90_000, signal: controller.signal },
      );
      await fetched;
      await delay(20);
      const started = Date.now();
      controller.abort();
      await assert.rejects(pending, (error) => error.name === 'AbortError');
      assert.equal(calls, 1);
      assert.ok(Date.now() - started < 1_000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
