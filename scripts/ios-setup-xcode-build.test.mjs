import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './toolchain.mjs';
import { checkXcodeVersion, prepareIos } from './ios-setup.mjs';

const WRONG_BUILD = '16A242d';

test('Xcode build is rejected even when the release string matches CI', () => {
  assert.notEqual(WRONG_BUILD, TOOLCHAIN.XCODE_BUILD);
  assert.throws(
    () =>
      checkXcodeVersion(
        `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${WRONG_BUILD}`,
      ),
    new RegExp(`Use Xcode build ${TOOLCHAIN.XCODE_BUILD} to match CI`),
  );
});

test('iOS setup fails closed on a different Xcode build before listing runtimes', async () => {
  const commands = [];
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'xcodebuild')
          return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${WRONG_BUILD}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Use Xcode build ${TOOLCHAIN.XCODE_BUILD} to match CI`),
  );
  assert.deepEqual(commands, [['xcodebuild', '-version']]);
});
