import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { checkXcodeVersion, prepareIos } from './ios-setup.mjs';

test('unparseable xcodebuild output is rejected as a missing Xcode pin', () => {
  assert.throws(
    () => checkXcodeVersion('Command Line Tools\nBuild version unknown'),
    new RegExp(
      `Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI \\(found no version\\)`,
    ),
  );
});

test('iOS setup fails closed on unparseable xcodebuild output before listing runtimes', async () => {
  const commands = [];
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'xcodebuild') return 'xcodebuild is not Xcode';
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    /found no version/,
  );
  assert.deepEqual(commands, [['xcodebuild', '-version']]);
});
