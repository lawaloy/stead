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

test('a successful Maestro exit still fails closed when XCTest lost its HTTP server', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stead xctest server failed '));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'device-xctest.log');

  await assert.rejects(
    runMaestroCommand(
      'unused',
      [],
      {},
      {
        xctestOutput: directory,
        pollIntervalMs: 5,
        timeoutMs: 5_000,
        execute: async () => {
          writeFileSync(log, serverFailure);
        },
      },
    ),
    (error) =>
      error.nativeFailure?.kind === 'xctest-server-failed' &&
      error.nativeFailure.log === log &&
      /will not be retried/.test(error.message),
  );
});
