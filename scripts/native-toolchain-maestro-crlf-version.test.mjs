import assert from 'node:assert/strict';
import test from 'node:test';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

test('Android Maestro preflight accepts a CRLF version listing and still rejects a mismatched pin', async () => {
  await checkNativeToolchain('android', {
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
      if (command === 'maestro') return `${TOOLCHAIN.MAESTRO_VERSION}\r\n`;
      throw new Error(`Unexpected ${command}`);
    },
  });

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
        if (command === 'maestro') return '1.0.0\r\n';
        throw new Error(`Unexpected ${command}`);
      },
    }),
    new RegExp(`Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI`),
  );
});
