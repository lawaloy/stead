import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const androidMaestroPreflight = (maestroVersion) => {
  const commands = [];
  const pending = checkNativeToolchain('android', {
    requireDevice: false,
    requireBuild: false,
    requireMaestro: true,
    env: {
      ANDROID_HOME: ROOT,
      STEAD_JAVA_BIN: 'java',
      STEAD_MAESTRO_BIN: 'maestro',
    },
    exists: (path) =>
      path === join(ROOT, 'api', 'node_modules') ||
      path === join(ROOT, 'mobile', 'node_modules'),
    execute: async (command, args = []) => {
      commands.push([command, ...args]);
      if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
      if (command === 'java')
        return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
      if (command === 'maestro') return maestroVersion;
      throw new Error(`Unexpected ${command}`);
    },
  });
  return { commands, pending };
};

test('Android Maestro preflight fails closed when --version is whitespace-only', async () => {
  const { commands, pending } = androidMaestroPreflight(' \t\n ');
  await assert.rejects(
    pending,
    new RegExp(`Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI`),
  );
  assert.deepEqual(commands, [
    ['npm', '--version'],
    ['java', '-version'],
    ['maestro', '--version'],
  ]);
  assert.equal(
    commands.some(([command]) => command === 'adb'),
    false,
  );
});
