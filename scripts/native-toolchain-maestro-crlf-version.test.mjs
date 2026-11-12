import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';

const androidMaestroOptions = (maestroVersion) => ({
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
  execute: async (command) => {
    if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
    if (command === 'java')
      return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
    if (command === 'maestro') return maestroVersion;
    throw new Error(`Unexpected ${command}`);
  },
});

test('Android Maestro preflight accepts a CRLF version listing and still rejects a mismatched pin', async () => {
  await checkNativeToolchain(
    'android',
    androidMaestroOptions(`${TOOLCHAIN.MAESTRO_VERSION}\r\n`),
  );

  await assert.rejects(
    checkNativeToolchain('android', androidMaestroOptions('1.0.0\r\n')),
    new RegExp(`Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI`),
  );
});
