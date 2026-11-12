import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroWithBootstrapRecovery } from './native-attempts.mjs';

test('an abort during Android bootstrap backoff does not recover or retry', async () => {
  const output = mkdtempSync(
    join(tmpdir(), 'stead maestro bootstrap sleep abort '),
  );
  const controller = new AbortController();
  const reason = new Error('validation cancelled');
  let operations = 0;
  let recoveries = 0;
  try {
    await assert.rejects(
      runMaestroWithBootstrapRecovery(
        async () => {
          operations += 1;
          const logs = join(output, 'first');
          mkdirSync(logs, { recursive: true });
          writeFileSync(
            join(logs, 'maestro.log'),
            "DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554: StatusRuntimeException: UNAVAILABLE",
          );
          throw new Error('maestro failed (exit 1).');
        },
        {
          platform: 'android',
          debugOutput: output,
          recover: async () => {
            recoveries += 1;
          },
          sleep: async (_milliseconds, waitSignal) => {
            controller.abort(reason);
            waitSignal.throwIfAborted();
          },
          signal: controller.signal,
        },
      ),
      (error) => error === reason,
    );
    assert.equal(operations, 1);
    assert.equal(recoveries, 0);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
