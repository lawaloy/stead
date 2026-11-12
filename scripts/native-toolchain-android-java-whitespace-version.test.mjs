import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

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

test('Android Java preflight fails closed when Temurin output is whitespace-only', async () => {
  const { commands, pending } = androidJavaPreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(
      `Use Eclipse Temurin ${TOOLCHAIN.JAVA_VERSION.replaceAll('+', '\\+')} to match CI \\(found a different Java distribution\\)`,
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
