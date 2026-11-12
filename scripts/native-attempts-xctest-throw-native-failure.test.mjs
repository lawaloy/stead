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

test('a Maestro CLI failure is wrapped as an XCTest nativeFailure when the driver also died', async (t) => {
  const directory = mkdtempSync(
    join(tmpdir(), 'stead xctest throw native failure '),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = join(directory, 'device-xctest.log');
  const maestroFailure = new Error('maestro failed (exit 1).');

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
          throw maestroFailure;
        },
      },
    ),
    (error) => {
      assert.notEqual(error, maestroFailure);
      assert.equal(error.nativeFailure?.kind, 'xctest-server-failed');
      assert.equal(error.nativeFailure.log, log);
      assert.match(error.message, /will not be retried/);
      assert.equal(error.cause, maestroFailure);
      return true;
    },
  );
});
