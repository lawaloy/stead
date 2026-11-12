import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('iOS setup keeps the dedicated simulator instead of creating a second one', async () => {
  const calls = [];
  const selected = await prepareIos({
    host: 'darwin',
    exists: () => true,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    },
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
                isAvailable: true,
                name: 'Stead Native iPhone 17',
                udid: 'existing-udid',
              },
            ],
          },
        });
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

  assert.equal(
    selected.DEVELOPER_DIR,
    '/Applications/Xcode.app/Contents/Developer',
  );
  assert.equal(
    calls.some((call) => call.includes('create')),
    false,
    'an existing dedicated simulator must not be recreated',
  );
});
