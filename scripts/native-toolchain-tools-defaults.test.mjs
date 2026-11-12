import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { repositorySdk } from './android-sdk.mjs';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { nativeTools } from './native-toolchain.mjs';

test('Windows native tool discovery uses LOCALAPPDATA, MAESTRO_HOME, and PATH java when dedicated overrides are absent', () => {
  const tools = nativeTools(
    {
      LOCALAPPDATA: 'C:\\Users\\ci\\AppData\\Local',
      MAESTRO_HOME: 'C:\\Users\\ci\\.maestro',
    },
    'win32',
  );
  const sdk = repositorySdk('win32');
  const repositoryMaestro = join(
    ROOT,
    '.tmp/tools/maestro',
    TOOLCHAIN.MAESTRO_VERSION,
    'bin',
    'maestro.bat',
  );

  assert.equal(
    tools.sdk,
    existsSync(sdk)
      ? sdk
      : join('C:\\Users\\ci\\AppData\\Local', 'Android', 'Sdk'),
  );
  assert.equal(tools.java, 'java');
  assert.equal(tools.adb, join(tools.sdk, 'platform-tools', 'adb.exe'));
  assert.equal(
    tools.maestro,
    existsSync(repositoryMaestro)
      ? repositoryMaestro
      : join('C:\\Users\\ci\\.maestro', 'bin', 'maestro.bat'),
  );
});

test('macOS native tool discovery uses the user Library SDK when ANDROID_HOME and ANDROID_SDK_ROOT are absent', () => {
  const tools = nativeTools({ MAESTRO_HOME: '/Users/ci/.maestro' }, 'darwin');
  const sdk = repositorySdk('darwin');
  const repositoryMaestro = join(
    ROOT,
    '.tmp/tools/maestro',
    TOOLCHAIN.MAESTRO_VERSION,
    'bin',
    'maestro',
  );

  assert.equal(
    tools.sdk,
    existsSync(sdk) ? sdk : join(homedir(), 'Library', 'Android', 'sdk'),
  );
  assert.equal(tools.java, 'java');
  assert.equal(tools.adb, join(tools.sdk, 'platform-tools', 'adb'));
  assert.equal(
    tools.maestro,
    existsSync(repositoryMaestro)
      ? repositoryMaestro
      : join('/Users/ci/.maestro', 'bin', 'maestro'),
  );
});
