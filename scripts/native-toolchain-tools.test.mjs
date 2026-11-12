import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { nativeTools } from './native-toolchain.mjs';

test('native tool discovery prefers ANDROID_HOME and explicit binary overrides', () => {
  const tools = nativeTools(
    {
      ANDROID_HOME: '/opt/android-sdk',
      ANDROID_SDK_ROOT: '/legacy/sdk',
      STEAD_JAVA_BIN: '/opt/java/bin/java',
      STEAD_ADB_BIN: '/opt/platform-tools/adb',
      STEAD_MAESTRO_BIN: '/opt/maestro/bin/maestro',
    },
    'linux',
  );

  assert.equal(tools.sdk, '/opt/android-sdk');
  assert.equal(tools.java, '/opt/java/bin/java');
  assert.equal(tools.adb, '/opt/platform-tools/adb');
  assert.equal(tools.maestro, '/opt/maestro/bin/maestro');
});

test('native tool discovery uses ANDROID_SDK_ROOT and JAVA_HOME when dedicated overrides are absent', () => {
  const tools = nativeTools(
    {
      ANDROID_HOME: '',
      ANDROID_SDK_ROOT: '/sdk-root',
      JAVA_HOME: '/opt/temurin',
    },
    'linux',
  );

  assert.equal(tools.sdk, '/sdk-root');
  assert.equal(tools.java, join('/opt/temurin', 'bin', 'java'));
  assert.equal(tools.adb, join('/sdk-root', 'platform-tools', 'adb'));
});

test('Windows native tool discovery uses platform executable names from JAVA_HOME and the SDK', () => {
  const tools = nativeTools(
    {
      ANDROID_HOME: 'C:\\Android\\Sdk',
      JAVA_HOME: 'C:\\Java\\temurin',
      STEAD_MAESTRO_BIN: 'C:\\maestro\\maestro.bat',
    },
    'win32',
  );

  assert.equal(tools.sdk, 'C:\\Android\\Sdk');
  assert.equal(tools.java, join('C:\\Java\\temurin', 'bin', 'java.exe'));
  assert.equal(
    tools.adb,
    join('C:\\Android\\Sdk', 'platform-tools', 'adb.exe'),
  );
  assert.equal(tools.maestro, 'C:\\maestro\\maestro.bat');
});
