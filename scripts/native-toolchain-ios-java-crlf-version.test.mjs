import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedJava = `openjdk version "17.0.20.1"\r\nOpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}\r\n`;
const mismatchedJava =
  'openjdk version "21.0.1"\r\nOpenJDK Runtime Environment Temurin-21.0.1+1\r\n';
const pinnedXcode = `Xcode ${TOOLCHAIN.XCODE_VERSION}\nBuild version ${TOOLCHAIN.XCODE_BUILD}\n`;

const iosJavaPreflight = (javaOutput) => {
  const commands = [];
  const pending = checkNativeToolchain('ios', {
    host: 'darwin',
    requireDevice: false,
    requireMaestro: true,
    requireBuild: false,
    env: {
      DEVELOPER_DIR: '/Applications/Xcode.app/Contents/Developer',
      STEAD_JAVA_BIN: 'java',
      STEAD_MAESTRO_BIN: 'maestro',
    },
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'java') return javaOutput;
      if (command === 'maestro') return TOOLCHAIN.MAESTRO_VERSION;
      if (command === 'xcodebuild') return pinnedXcode;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('iOS Java preflight accepts CRLF Temurin output for the pinned runtime', async () => {
  const { commands, pending } = iosJavaPreflight(pinnedJava);
  const result = await pending;
  assert.equal(result.metadata.java, TOOLCHAIN.JAVA_VERSION);
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['java', '-version'],
    ['maestro', '--version'],
    ['xcodebuild', '-version'],
  ]);
});

test('iOS Java preflight still rejects a mismatched CRLF Temurin runtime before Maestro or Xcode', async () => {
  const { commands, pending } = iosJavaPreflight(mismatchedJava);
  await assert.rejects(
    pending,
    new RegExp(
      `Use Eclipse Temurin ${TOOLCHAIN.JAVA_VERSION.replaceAll('+', '\\+')} to match CI`,
    ),
  );
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['java', '-version'],
  ]);
  assert.equal(
    commands.some(([command]) => command === 'maestro'),
    false,
  );
  assert.equal(
    commands.some(([command]) => command === 'xcodebuild'),
    false,
  );
});
