import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';
import { checkXcodeVersion, prepareIos } from './ios-setup.mjs';

const WRONG_XCODE = '16.0';

test('Xcode release is rejected even when the build string matches CI', () => {
  assert.notEqual(WRONG_XCODE, TOOLCHAIN.XCODE_VERSION);
  assert.throws(
    () =>
      checkXcodeVersion(
        `Xcode ${WRONG_XCODE}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`,
      ),
    new RegExp(`Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI`),
  );
});

test('iOS setup fails closed on a different Xcode release before listing runtimes', async () => {
  const commands = [];
  await assert.rejects(
    prepareIos({
      host: 'darwin',
      exists: () => true,
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'xcodebuild')
          return `Xcode ${WRONG_XCODE}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI`),
  );
  assert.deepEqual(commands, [['xcodebuild', '-version']]);
});

test('iOS native preflight fails closed on a different Xcode release before listing simulators', async () => {
  const commands = [];
  await assert.rejects(
    checkNativeToolchain('ios', {
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
        if (command === 'xcodebuild')
          return `Xcode ${WRONG_XCODE}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    new RegExp(`Use Xcode ${TOOLCHAIN.XCODE_VERSION} to match CI`),
  );
  assert.equal(
    commands.some(([command]) => command === 'xcodebuild'),
    true,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    false,
  );
});
