import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroWithBootstrapRecovery } from './native-attempts.mjs';

const TRANSIENT_LOG =
  "DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554: StatusRuntimeException: UNAVAILABLE";

test('Android Maestro bootstrap stops after the last attempt even when the death stays transient', async () => {
  const output = mkdtempSync(
    join(tmpdir(), 'stead maestro bootstrap exhaust '),
  );
  const sleeps = [];
  let operations = 0;
  let recoveries = 0;
  try {
    await assert.rejects(
      runMaestroWithBootstrapRecovery(
        async (attempt) => {
          operations += 1;
          const logs = join(output, `attempt-${attempt}`);
          mkdirSync(logs, { recursive: true });
          writeFileSync(join(logs, 'maestro.log'), TRANSIENT_LOG);
          throw new Error(`maestro failed (exit ${attempt}).`);
        },
        {
          platform: 'android',
          debugOutput: output,
          maxAttempts: 3,
          recover: async () => {
            recoveries += 1;
          },
          sleep: async (milliseconds) => sleeps.push(milliseconds),
        },
      ),
      /maestro failed \(exit 3\)/,
    );
    assert.equal(operations, 3);
    assert.equal(recoveries, 2);
    assert.deepEqual(sleeps, [1000, 2000]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
