import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroWithBootstrapRecovery } from './native-attempts.mjs';

const TRANSIENT_LOG =
  "DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554: StatusRuntimeException: UNAVAILABLE";

test('iOS Maestro bootstrap does not retry an Android device-server death', async () => {
  const output = mkdtempSync(join(tmpdir(), 'stead maestro bootstrap ios '));
  let operations = 0;
  let recoveries = 0;
  try {
    await assert.rejects(
      runMaestroWithBootstrapRecovery(
        async () => {
          operations += 1;
          const logs = join(output, 'first');
          mkdirSync(logs, { recursive: true });
          writeFileSync(join(logs, 'maestro.log'), TRANSIENT_LOG);
          throw new Error('maestro failed (exit 1).');
        },
        {
          platform: 'ios',
          debugOutput: output,
          maxAttempts: 3,
          recover: async () => {
            recoveries += 1;
          },
          sleep: async () => {
            throw new Error('iOS bootstrap must not sleep for Android retry');
          },
        },
      ),
      /maestro failed \(exit 1\)/,
    );
    assert.equal(operations, 1);
    assert.equal(recoveries, 0);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
