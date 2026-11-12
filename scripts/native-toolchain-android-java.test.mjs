import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

test('Android device preflight rejects a different Java distribution before adb', async () => {
  const commands = [];
  await assert.rejects(
    checkNativeToolchain('android', {
      requireBuild: false,
      requireDevice: true,
      requireMaestro: false,
      env: {
        STEAD_JAVA_BIN: 'java',
        STEAD_ADB_BIN: 'adb',
        STEAD_MAESTRO_BIN: 'maestro',
      },
      execute: async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'java')
          return 'openjdk version "17.0.20.1"\nOpenJDK Runtime Environment OtherVendor-17.0.20.1+1';
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      },
    }),
    /Use Eclipse Temurin/,
  );
  assert.equal(
    commands.some(([command]) => command === 'java'),
    true,
  );
  assert.equal(
    commands.some(([command]) => command === 'adb'),
    false,
  );
  assert.equal(
    commands.some(([command]) => command === 'maestro'),
    false,
  );
});
