import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

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

test('iOS native preflight fails closed when xcodebuild version output is whitespace-only', async () => {
  const { commands, pending } = iosXcodePreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(
      `Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI \\(found no version\\)`,
    ),
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
