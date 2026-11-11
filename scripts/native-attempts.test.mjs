import assert from 'node:assert/strict';
import test from 'node:test';
import {
  repeatJourneys,
  runMaestroCommand,
  runMaestroWithBootstrapRecovery,
} from './native-attempts.mjs';

test('Maestro bootstrap attempts and XCTest polling intervals are validated before work starts', async () => {
  let operations = 0;
  let recoveries = 0;
  for (const maxAttempts of [0, -1, 1.5, NaN]) {
    await assert.rejects(
      runMaestroWithBootstrapRecovery(
        async () => {
          operations += 1;
        },
        {
          platform: 'android',
          debugOutput: '/unused',
          recover: async () => {
            recoveries += 1;
          },
          maxAttempts,
        },
      ),
      /positive integer/,
    );
  }
  assert.equal(operations, 0);
  assert.equal(recoveries, 0);

  for (const pollIntervalMs of [0, -1, NaN, 0.5]) {
    await assert.rejects(
      runMaestroCommand(
        'unused',
        [],
        {},
        {
          pollIntervalMs,
          execute: async () => {
            operations += 1;
          },
        },
      ),
      /polling interval/,
    );
  }
  assert.equal(operations, 0);
});

test('an aborted signal is not treated as a retryable Maestro bootstrap failure', async () => {
  const controller = new AbortController();
  const reason = new Error('validation cancelled');
  controller.abort(reason);
  let operations = 0;
  let recoveries = 0;
  await assert.rejects(
    runMaestroWithBootstrapRecovery(
      async () => {
        operations += 1;
      },
      {
        platform: 'android',
        debugOutput: '/unused',
        recover: async () => {
          recoveries += 1;
        },
        signal: controller.signal,
      },
    ),
    (error) => error === reason,
  );
  assert.equal(operations, 0);
  assert.equal(recoveries, 0);
});

test('an already-aborted signal schedules no repeated journeys', async () => {
  const controller = new AbortController();
  controller.abort();
  let operations = 0;
  const results = await repeatJourneys(
    3,
    async () => {
      operations += 1;
      return { schema: 'unused' };
    },
    controller.signal,
  );
  assert.deepEqual(results, []);
  assert.equal(operations, 0);
});

test('Android Maestro bootstrap does not retry a deviceInfo death without a new maestro.log', async () => {
  let operations = 0;
  let recoveries = 0;
  await assert.rejects(
    runMaestroWithBootstrapRecovery(
      async () => {
        operations += 1;
        throw new Error('maestro failed (exit 1).');
      },
      {
        platform: 'android',
        debugOutput: '/nonexistent-stead-maestro-debug',
        recover: async () => {
          recoveries += 1;
        },
        sleep: async () => {
          throw new Error('missing logs must not sleep for retry');
        },
      },
    ),
    /maestro failed \(exit 1\)/,
  );
  assert.equal(operations, 1);
  assert.equal(recoveries, 0);
});
