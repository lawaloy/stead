import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareIos } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const crlfJson = (value) => `${JSON.stringify(value)}\r\n`;

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`;

test('iOS setup accepts CRLF simctl JSON when the pinned runtime and simulator are present', async () => {
  const calls = [];
  await prepareIos({
    host: 'darwin',
    exists: () => true,
    execute: async (command, args = []) => {
      calls.push([command, ...args]);
      if (command === 'xcodebuild') return pinnedXcode;
      if (args.includes('runtimes'))
        return crlfJson({
          runtimes: [{ identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: true }],
        });
      if (args.includes('devices'))
        return crlfJson({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: [
              {
                name: 'Stead Native iPhone 17',
                udid: 'ready',
                isAvailable: true,
                state: 'Booted',
              },
            ],
          },
        });
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });

  assert.equal(
    calls.some((call) => call.includes('create')),
    false,
  );
  assert.equal(
    calls.some((call) => call.includes('runtimes')),
    true,
  );
  assert.equal(
    calls.some((call) => call.includes('devices')),
    true,
  );
});

test('iOS setup still rejects an unavailable CRLF runtime listing before creating a simulator', async () => {
  const calls = [];
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args = []) => {
        calls.push([command, ...args]);
        if (command === 'xcodebuild') return pinnedXcode;
        if (args.includes('runtimes'))
          return crlfJson({
            runtimes: [
              { identifier: TOOLCHAIN.IOS_RUNTIME, isAvailable: false },
            ],
          });
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Install simulator runtime ${TOOLCHAIN.IOS_RUNTIME}`),
  );
  assert.equal(
    calls.some((call) => call.includes('create')),
    false,
  );
  assert.equal(
    calls.some((call) => call.includes('devices')),
    false,
  );
});
