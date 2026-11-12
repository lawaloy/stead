import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('iOS setup fails closed before xcodebuild when the pinned Xcode is missing', async () => {
  let executed = false;
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => false,
      execute: async () => {
        executed = true;
        return '';
      },
    }),
    /Install Xcode/,
  );
  assert.equal(executed, false);
});

test('iOS setup fails closed when the pinned simulator runtime is present but unavailable', async () => {
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args) => {
        if (command === 'xcodebuild')
          return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        if (args.includes('runtimes'))
          return JSON.stringify({
            runtimes: [
              { identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: false },
            ],
          });
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Install simulator runtime ${TOOLCHAIN.IOS_RUNTIME}`),
  );
});

test('iOS setup creates the dedicated simulator when the runtime is present but the device is missing', async () => {
  const calls = [];
  await prepareIos({
    host: 'darwin',
    exists: () => true,
    execute: async (command, args) => {
      calls.push([command, ...args]);
      if (command === 'xcodebuild')
        return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
      if (args.includes('runtimes'))
        return JSON.stringify({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return JSON.stringify({ devices: { [TOOLCHAIN.IOS_RUNTIME]: [] } });
      if (args.includes('create')) return '';
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  assert.deepEqual(
    calls.find((call) => call.includes('create')),
    [
      'xcrun',
      'simctl',
      'create',
      'Stead Native iPhone 17',
      'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
      TOOLCHAIN.IOS_RUNTIME,
    ],
  );
});
