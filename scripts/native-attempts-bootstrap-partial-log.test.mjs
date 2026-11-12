import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMaestroWithBootstrapRecovery } from './native-attempts.mjs';

test('Android Maestro bootstrap does not retry a partial deviceInfo death without UNAVAILABLE', async () => {
  const output = mkdtempSync(
    join(tmpdir(), 'stead maestro partial bootstrap '),
  );
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
            "DeviceServerDiedException: Device server died during 'deviceInfo' on emulator-5554",
          );
          throw new Error('maestro failed (exit 1).');
        },
        {
          platform: 'android',
          debugOutput: output,
          recover: async () => {
            recoveries += 1;
          },
          sleep: async () => {
            throw new Error('partial bootstrap logs must not sleep for retry');
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

test('Android Maestro bootstrap does not retry UNAVAILABLE without a deviceInfo death', async () => {
  const output = mkdtempSync(join(tmpdir(), 'stead maestro unavailable only '));
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
            'StatusRuntimeException: UNAVAILABLE: io exception',
          );
          throw new Error('maestro failed (exit 1).');
        },
        {
          platform: 'android',
          debugOutput: output,
          recover: async () => {
            recoveries += 1;
          },
          sleep: async () => {
            throw new Error(
              'UNAVAILABLE without deviceInfo must not sleep for retry',
            );
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
