import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const iosRubyPreflight = ({ ruby, bundler, pods } = {}) => {
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
      if (command === 'ruby') return ruby ?? `${TOOLCHAIN.RUBY_VERSION}\r\n`;
      if (command === 'bundle' && args.includes('pod'))
        return pods ?? `${TOOLCHAIN.COCOAPODS_VERSION}\r\n`;
      if (command === 'bundle')
        return bundler ?? `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}\r\n`;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS source-build preflight accepts CRLF Ruby, Bundler, and CocoaPods pins', async () => {
  const { commands, pending } = iosRubyPreflight();
  const result = await pending;
  assert.equal(result.metadata.ruby, TOOLCHAIN.RUBY_VERSION);
  assert.equal(result.metadata.bundler, TOOLCHAIN.BUNDLER_VERSION);
  assert.equal(result.metadata.cocoapods, TOOLCHAIN.COCOAPODS_VERSION);
  assert.deepEqual(
    commands.filter(([command]) =>
      ['ruby', 'bundle', 'xcrun'].includes(command),
    ),
    [
      ['ruby', '-e', 'print RUBY_VERSION'],
      ['bundle', '--version'],
      ['bundle', 'exec', 'pod', '--version'],
    ],
  );
});

test('iOS source-build preflight still rejects a mismatched CRLF Ruby before Bundler or CocoaPods', async () => {
  const { commands, pending } = iosRubyPreflight({ ruby: '1.0.0\r\n' });
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

test('iOS source-build preflight still rejects a mismatched CRLF CocoaPods version before simulators', async () => {
  const { commands, pending } = iosRubyPreflight({ pods: '1.0.0\r\n' });
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
