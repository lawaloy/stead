import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const pinnedJava = `openjdk version "17.0.20.1"\r\nOpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}\r\n`;
const mismatchedJava =
  'openjdk version "21.0.1"\r\nOpenJDK Runtime Environment Temurin-21.0.1+1\r\n';

const androidJavaPreflight = (javaOutput) => {
  const commands = [];
  const pending = checkNativeToolchain('android', {
    requireDevice: false,
    requireMaestro: false,
    requireBuild: false,
    env: {
      ANDROID_HOME: ROOT,
      STEAD_JAVA_BIN: 'java',
    },
    exists: (path) => path === join(ROOT, 'mobile', 'node_modules'),
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'java') return javaOutput;
      throw new Error(`Unexpected ${command} ${args.join(' ')}`);
    },
  });
  return { commands, pending };
};

test('Android Java preflight accepts CRLF Temurin output for the pinned runtime', async () => {
  const { commands, pending } = androidJavaPreflight(pinnedJava);
  const result = await pending;
  assert.equal(result.metadata.java, TOOLCHAIN.JAVA_VERSION);
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['java', '-version'],
  ]);
});

test('Android Java preflight still rejects a mismatched CRLF Temurin runtime before adb', async () => {
  const { commands, pending } = androidJavaPreflight(mismatchedJava);
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
    commands.some(([command]) => command === 'adb'),
    false,
  );
});
