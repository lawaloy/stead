import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('iOS setup creates the dedicated simulator when the namesake on the pinned runtime is unavailable', async () => {
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
        return JSON.stringify({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: [
              {
                isAvailable: false,
                name: 'Stead Native iPhone 17',
                udid: 'unavailable-udid',
              },
            ],
          },
        });
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
