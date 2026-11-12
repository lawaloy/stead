import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { checkXcodeVersion, prepareIos } from './ios-setup.mjs';

test('Xcode pins accept CRLF xcodebuild output and still reject a mismatched release', () => {
  assert.doesNotThrow(() =>
    checkXcodeVersion(
      `Xcode ${TOOLCHAIN.XCODE_VERSION}\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`,
    ),
  );
  assert.throws(
    () =>
      checkXcodeVersion(
        `Xcode 16.0\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`,
      ),
    new RegExp(`Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI`),
  );
});

test('iOS setup fails closed on a CRLF mismatched Xcode release before listing runtimes', async () => {
  const commands = [];
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'xcodebuild')
          return `Xcode 16.0\r\nBuild version ${TOOLCHAIN.XCODE_BUILD}\r\n`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI`),
  );
  assert.deepEqual(commands, [['xcodebuild', '-version']]);
});
