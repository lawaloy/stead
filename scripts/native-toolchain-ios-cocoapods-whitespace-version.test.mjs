import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const iosCocoaPodsPreflight = (pods) => {
  const commands = [];
  const pending = checkNativeToolchain('ios', {
    host: 'darwin',
    requireDevice: false,
    requireMaestro: false,
    requireBuild: true,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
    },
    exists: (path) => path === join(ROOT, 'mobile', 'node_modules'),
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'xcodebuild') return pinnedXcode;
      if (command === 'ruby') return TOOLCHAIN.RUBY_VERSION;
      if (command === 'xcrun')
        throw new Error(
          'simctl must not be queried after a CocoaPods whitespace mismatch',
        );
      if (command === 'bundle' && args.includes('pod')) return pods;
      if (command === 'bundle')
        return `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}`;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS source-build preflight fails closed when CocoaPods reports a whitespace-only version', async () => {
  const { commands, pending } = iosCocoaPodsPreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(`Use CocoaPods ${TOOLCHAIN.COCOAPODS_VERSION} to match CI`),
  );
  assert.equal(
    commands.some(
      ([command, ...args]) => command === 'bundle' && args.includes('pod'),
    ),
    true,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    false,
  );
});
