import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const iosRubyPreflight = (ruby) => {
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
      if (command === 'ruby') return ruby;
      if (command === 'bundle' && args.includes('pod'))
        return TOOLCHAIN.COCOAPODS_VERSION;
      if (command === 'bundle')
        return `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}`;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS source-build preflight fails closed when Ruby reports a whitespace-only version', async () => {
  const { commands, pending } = iosRubyPreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(`Use Ruby ${TOOLCHAIN.RUBY_VERSION} to match CI`),
  );
  assert.equal(
    commands.some(([command]) => command === 'ruby'),
    true,
  );
  assert.equal(
    commands.some(([command]) => command === 'bundle'),
    false,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcrun'),
    false,
  );
});
