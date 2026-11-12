import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const iosBundlerPreflight = (bundler) => {
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
      if (command === 'bundle' && args.includes('pod'))
        throw new Error(
          'CocoaPods must not be queried after a Bundler whitespace mismatch',
        );
      if (command === 'bundle') return bundler;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS source-build preflight fails closed when Bundler reports a whitespace-only version', async () => {
  const { commands, pending } = iosBundlerPreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(`Use Bundler ${TOOLCHAIN.BUNDLER_VERSION} to match CI`),
  );
  assert.equal(
    commands.some(
      ([command, ...args]) =>
        command === 'bundle' && args.includes('--version'),
    ),
    true,
  );
  assert.equal(
    commands.some(
      ([command, ...args]) => command === 'bundle' && args.includes('pod'),
    ),
    false,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    false,
  );
});
