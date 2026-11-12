import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const WRONG_BUILD = '16A242d';
const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`;
const mismatchedBuild = `Xcode ${TOOLCHAIN.XCODE_VERSION}\r\nBuild version ${WRONG_BUILD}\r\n`;

const iosXcodePreflight = (xcodeOutput) => {
  const commands = [];
  const pending = checkNativeToolchain('ios', {
    host: 'darwin',
    requireBuild: false,
    requireDevice: false,
    requireMaestro: false,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    },
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'xcodebuild') return xcodeOutput;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS native preflight accepts CRLF xcodebuild output for the pinned build', async () => {
  assert.notEqual(WRONG_BUILD, TOOLCHAIN.XCODE_BUILD);
  const { commands, pending } = iosXcodePreflight(pinnedXcode);
  const result = await pending;
  assert.equal(result.metadata.xcode, TOOLCHAIN.XCODE_VERSION);
  assert.equal(result.metadata.xcodeBuild, TOOLCHAIN.XCODE_BUILD);
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['xcodebuild', '-version'],
  ]);
});

test('iOS native preflight still rejects a mismatched CRLF Xcode build before listing simulators', async () => {
  const { commands, pending } = iosXcodePreflight(mismatchedBuild);
  await assert.rejects(
    pending,
    new RegExp(`Use Xcode build ${TOOLCHAIN.XCODE_BUILD} to match CI`),
  );
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['xcodebuild', '-version'],
  ]);
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    false,
  );
});
