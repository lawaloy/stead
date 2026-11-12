import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroCommand } from './native-attempts.mjs';

const serverFailure = `
request: GET /runningApp
Test Case '-[maestro_driver_iosUITests.maestro_driver_iosUITests testHttpServer]' failed (4.102 seconds).
`;

test('a caller abort is not wrapped as an XCTest nativeFailure even when the driver also died', async (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), 'stead xctest abort precedence '),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'device-xctest.log');
  const controller = new AbortController();
  const reason = new Error('validation cancelled');

  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      { signal: controller.signal },
      {
        xctestOutput: directory,
        pollIntervalMs: 5,
        timeoutMs: 5_000,
        execute: async () => {
          writeFileSync(log, serverFailure);
          controller.abort(reason);
          throw reason;
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
