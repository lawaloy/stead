import assert from 'node:assert/strict';
import test from 'node:test';
import { IOS_SIMULATOR_RECEIPT_ENV, prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const xcodeVersion = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;

test('iOS setup creates and starts a fresh simulator with an Actions run receipt', async () => {
  const calls = [];
  const selected = await prepareIos({
    host: 'darwin',
    exists: () => true,
    env: {
      GITHUB_RUN_ID: '12345',
      STEAD_IOS_WARM_BOOT: 'true',
    },
    execute: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'xcodebuild') return xcodeVersion;
      if (args.includes('runtimes'))
        return JSON.stringify({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return JSON.stringify({ devices: { [TOOLCHAIN.IOS_RUNTIME]: [] } });
      if (args.includes('create')) return 'fresh-udid\n';
      if (args.includes('boot')) return '';
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

  assert.equal(selected[IOS_SIMULATOR_RECEIPT_ENV.created], 'true');
  assert.equal(selected[IOS_SIMULATOR_RECEIPT_ENV.owner], '12345');
  assert.equal(selected[IOS_SIMULATOR_RECEIPT_ENV.udid], 'fresh-udid');
  assert.deepEqual(calls.at(-1), ['xcrun', 'simctl', 'boot', 'fresh-udid']);
});

test('iOS setup warms but does not claim an existing simulator as fresh', async () => {
  const calls = [];
  const selected = await prepareIos({
    host: 'darwin',
    exists: () => true,
    env: {
      GITHUB_RUN_ID: '12345',
      STEAD_IOS_WARM_BOOT: 'true',
    },
    execute: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'xcodebuild') return xcodeVersion;
      if (args.includes('runtimes'))
        return JSON.stringify({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return JSON.stringify({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: [
              {
                isAvailable: true,
                name: 'Stead Native iPhone 17',
                state: 'Shutdown',
                udid: 'existing-udid',
              },
            ],
          },
        });
      if (args.includes('boot')) return '';
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

  assert.equal(selected[IOS_SIMULATOR_RECEIPT_ENV.created], 'false');
  assert.equal(selected[IOS_SIMULATOR_RECEIPT_ENV.udid], 'existing-udid');
  assert.equal(
    calls.some((call) => call.includes('create')),
    false,
  );
  assert.deepEqual(calls.at(-1), ['xcrun', 'simctl', 'boot', 'existing-udid']);
});
