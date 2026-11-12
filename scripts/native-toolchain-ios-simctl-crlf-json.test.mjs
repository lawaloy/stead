import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const crlfJson = (value) => `${JSON.stringify(value)}\r\n`;

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const dedicatedListing = (devices) =>
  crlfJson({
    devices,
  });

const iosDevicePreflight = (listing) => {
  const commands = [];
  const pending = checkNativeToolchain('ios', {
    host: 'darwin',
    requireBuild: false,
    requireDevice: true,
    requireMaestro: false,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    },
    exists: (path) => path === join(ROOT, 'api', 'node_modules'),
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'xcodebuild') return pinnedXcode;
      if (command === 'xcrun') return listing;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS device preflight accepts CRLF simctl JSON for the pinned dedicated simulator', async () => {
  const { commands, pending } = iosDevicePreflight(
    dedicatedListing({
      [TOOLCHAIN.IOS_RUNTIME]: [
        {
          name: 'Stead Native iPhone 17',
          udid: 'stead-crlf',
          isAvailable: true,
          state: 'Booted',
        },
      ],
    }),
  );
  const result = await pending;
  assert.equal(result.metadata.device, 'stead-crlf');
  assert.equal(result.metadata.iosRuntime, TOOLCHAIN.IOS_RUNTIME);
  assert.deepEqual(
    commands.filter(([command]) => command === 'xcrun'),
    [['xcrun', 'simctl', 'list', 'devices', 'available', '--json']],
  );
});

test('iOS device preflight still refuses a personal simulator in CRLF simctl JSON', async () => {
  const { commands, pending } = iosDevicePreflight(
    dedicatedListing({
      [TOOLCHAIN.IOS_RUNTIME]: [
        {
          name: 'iPhone 17',
          udid: 'personal-crlf',
          isAvailable: true,
          state: 'Booted',
        },
      ],
    }),
  );
  await assert.rejects(
    pending,
    /Create a dedicated simulator named "Stead Native iPhone 17"/,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    true,
  );
});
