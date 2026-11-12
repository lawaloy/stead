import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const crlfJson = (value) => `${JSON.stringify(value)}\r\n`;

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`;

const dedicated = (overrides = {}) => ({
  name: 'Stead Native iPhone 17',
  udid: 'ready',
  isAvailable: true,
  state: 'Booted',
  ...overrides,
});

const iosDevicePreflight = ({ listing } = {}) => {
  const commands = [];
  const pending = checkNativeToolchain('ios', {
    host: 'darwin',
    requireBuild: false,
    requireMaestro: false,
    requireDevice: true,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    },
    exists: (path) => path === join(ROOT, 'api', 'node_modules'),
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'xcodebuild') return pinnedXcode;
      if (command === 'xcrun' && args.includes('devices'))
        return crlfJson({
          devices: {
            [TOOLCHAIN.IOS_RUNTIME]: listing ?? [dedicated()],
          },
        });
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS device preflight accepts CRLF simctl JSON when the dedicated simulator is present', async () => {
  const { commands, pending } = iosDevicePreflight();
  const result = await pending;
  assert.equal(result.metadata.device, 'ready');
  assert.equal(result.metadata.iosRuntime, TOOLCHAIN.IOS_RUNTIME);
  assert.deepEqual(
    commands.filter(([command]) => ['xcodebuild', 'xcrun'].includes(command)),
    [
      ['xcodebuild', '-version'],
      ['xcrun', 'simctl', 'list', 'devices', 'available', '--json'],
    ],
  );
});

test('iOS device preflight still refuses an unavailable CRLF dedicated simulator', async () => {
  const { commands, pending } = iosDevicePreflight({
    listing: [dedicated({ udid: 'offline', isAvailable: false })],
  });
  await assert.rejects(pending, /personal simulators are refused/);
  assert.equal(
    commands.some((call) => call.includes('devices')),
    true,
  );
  assert.equal(
    commands.some((call) => call.includes('boot') || call.includes('create')),
    false,
  );
});
