import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

test('native preflight rejects a Maestro binary that does not match CI', async () => {
  let maestroChecks = 0;
  await assert.rejects(
    checkNativeToolchain('android', {
      requireDevice: false,
      requireBuild: false,
      requireMaestro: true,
      env: {
        ANDROID_HOME: ROOT,
        STEAD_JAVA_BIN: 'java',
        STEAD_MAESTRO_BIN: 'maestro',
      },
      execute: async (command) => {
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'java')
          return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
        if (command === 'maestro') {
          maestroChecks += 1;
          return '1.0.0';
        }
        throw new Error(`Unexpected ${command}`);
      },
    }),
    new RegExp(`Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI`),
  );
  assert.equal(maestroChecks, 1);
});

test('iOS source-build preflight rejects a CocoaPods version that does not match CI', async () => {
  const commands = [];
  await assert.rejects(
    checkNativeToolchain('ios', {
      host: 'darwin',
      requireDevice: false,
      requireBuild: true,
      requireMaestro: false,
      env: {
        DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
      },
      exists: (path) => path === join(ROOT, 'mobile', 'node_modules'),
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'xcodebuild')
          return `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}`;
        if (command === 'ruby') return TOOLCHAIN.RUBY_VERSION;
        if (command === 'bundle' && args.includes('pod')) return '1.0.0';
        if (command === 'bundle')
          return `Bundler version ${TOOLCHAIN.BUNDLER_VERSION}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
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
