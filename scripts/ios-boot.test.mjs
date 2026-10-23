import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  probeIosBoot,
  cleanupIosSimulator,
  acquireIosSimulator,
} from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const owned = '00000000-0000-4000-8000-000000000002';

test('simulator boot deadline preserves migration details and still cleans its own device', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-boot-'));
  const cleanup = [];
  try {
    await assert.rejects(
      probeIosBoot({
        directory,
        env: {},
        timeoutMs: 20,
        execute: async (command, args, options) => {
          if (command !== 'xcrun') return 'host snapshot';
          if (args[1] === 'create') return owned;
          if (args[1] === 'bootstatus')
            await new Promise((resolve, reject) =>
              options.signal.addEventListener(
                'abort',
                () =>
                  reject(
                    new Error('Waiting on Data Migration: KeychainMigrator'),
                  ),
                { once: true },
              ),
            );
          if (['shutdown', 'delete'].includes(args[1])) cleanup.push(args);
          return '';
        },
      }),
      /boot exceeded 20 ms.*KeychainMigrator/,
    );
    assert.deepEqual(cleanup, [
      ['simctl', 'shutdown', owned],
      ['simctl', 'delete', owned],
    ]);
    const evidence = JSON.parse(
      readFileSync(join(directory, 'boot.json'), 'utf8'),
    );
    assert.equal(evidence.passed, false);
    assert.equal(evidence.diagnostics.beforeBoot.sysctl, 'host snapshot');
    assert.match(evidence.failure, /Data Migration/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('persistent-host cleanup failure fails the command without erasing successful readiness', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-clean-'));
  try {
    await assert.rejects(
      probeIosBoot({
        directory,
        env: {},
        execute: async (command, args) => {
          if (args[1] === 'create') return owned;
          if (args[1] === 'delete') throw new Error('delete stuck');
          return '';
        },
      }),
      /delete stuck/,
    );
    const result = JSON.parse(
      readFileSync(join(directory, 'boot.json'), 'utf8'),
    );
    assert.equal(result.passed, false);
    assert.equal(result.readiness.status, 'passed');
    assert.equal(result.cleanup.status, 'failed');
    assert.match(result.failure, /cleanup failed.*delete stuck/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('hosted VM disposal leaves successful readiness intact without running simctl teardown', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-hosted-'));
  const calls = [];
  try {
    const result = await probeIosBoot({
      directory,
      env: { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
      execute: async (command, args) => {
        calls.push([command, ...args]);
        if (args.includes('devices'))
          return JSON.stringify({
            devices: {
              [TOOLCHAIN.IOS_RUNTIME]: [
                {
                  udid: owned,
                  name: 'iPhone 17',
                  isAvailable: true,
                  state: 'Booted',
                },
              ],
            },
          });
        if (args[1] === 'create') return owned;
        if (['shutdown', 'delete'].includes(args[1]))
          throw new Error('Hosted jobs must use VM disposal');
        return '';
      },
    });
    assert.equal(result.passed, true);
    assert.equal(result.readiness.status, 'passed');
    assert.equal(result.cleanup.status, 'deferred');
    assert.equal(result.cleanup.owner, 'github-hosted-vm');
    assert.equal(result.simulatorOrigin, 'hosted-image');
    assert.ok(calls.some((call) => call.includes('bootstatus')));
    assert.equal(
      calls.some((call) => call.includes('boot')),
      false,
    );
    assert.equal(
      calls.some((call) => call.includes('create')),
      false,
    );
    assert.equal(
      calls.some((call) => call.includes('shutdown')),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('persistent Macs never inspect or reuse provisioned/personal simulators', async () => {
  const calls = [];
  const result = await acquireIosSimulator(
    async (_command, args) => {
      calls.push(args);
      assert.equal(args[1], 'create');
      return owned;
    },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' },
  );
  assert.equal(result.origin, 'created');
  assert.equal(result.udid, owned);
  assert.equal(calls.length, 1);
});

test('hosted allocation refuses a different runtime, unavailable device, and wrong iPhone type', async () => {
  const calls = [];
  const result = await acquireIosSimulator(
    async (_command, args) => {
      calls.push(args);
      if (args[1] === 'create') return owned;
      return JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-26-4': [
            { udid: owned, name: 'iPhone 17', isAvailable: true },
          ],
          [TOOLCHAIN.IOS_RUNTIME]: [
            { udid: owned, name: 'iPhone 17', isAvailable: false },
            {
              udid: owned,
              name: 'iPhone 17',
              isAvailable: true,
              deviceTypeIdentifier:
                'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
            },
          ],
        },
      });
    },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' },
  );
  assert.equal(result.origin, 'created');
  assert.equal(calls.at(-1)[1], 'create');
});

test('CI flags and self-hosted runners never bypass owned-device cleanup', async () => {
  for (const env of [
    { CI: 'true' },
    { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'self-hosted' },
    { GITHUB_ACTIONS: 'true' },
    { RUNNER_ENVIRONMENT: 'github-hosted' },
  ]) {
    const actions = [];
    const result = await cleanupIosSimulator(owned, {
      env,
      execute: async (_command, args) => actions.push(args),
    });
    assert.equal(result.status, 'passed');
    assert.deepEqual(actions, [
      ['simctl', 'shutdown', owned],
      ['simctl', 'delete', owned],
    ]);
  }
});
