import assert from 'node:assert/strict';
import test from 'node:test';
import { delimiter, join } from 'node:path';
import { androidSdkEnvironment } from './android-emulator.mjs';
import { ROOT, TOOLCHAIN } from './toolchain.mjs';

test('androidSdkEnvironment pins the locked SDK, isolates AVDs by receipt digest, and prepends SDK tool bins', () => {
  const env = {
    PATH: '/usr/bin',
    ANDROID_HOME: '/legacy-sdk',
    ANDROID_SDK_ROOT: '/other-sdk',
    ANDROID_AVD_HOME: '/legacy-avds',
    KEEP: 'yes',
  };
  const sdk = '/tmp/locked-sdk';
  const digest = 'abcdef0123456789deadbeefcafebabe';
  const result = androidSdkEnvironment({ env, sdk, digest });

  assert.equal(result.ANDROID_HOME, sdk);
  assert.equal(result.ANDROID_SDK_ROOT, sdk);
  assert.equal(
    result.ANDROID_AVD_HOME,
    join(ROOT, '.tmp/android-avds', digest.slice(0, 16)),
  );
  assert.equal(result.KEEP, 'yes');
  assert.equal(env.ANDROID_HOME, '/legacy-sdk');
  assert.deepEqual(result.PATH.split(delimiter), [
    join(sdk, 'platform-tools'),
    join(sdk, 'emulator'),
    join(sdk, 'cmdline-tools', TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION, 'bin'),
    '/usr/bin',
  ]);
});

test('androidSdkEnvironment keeps the host Path when PATH is absent and does not mutate process.env', () => {
  const previousHome = process.env.ANDROID_HOME;
  const result = androidSdkEnvironment({
    env: { Path: '/windows/system32' },
    sdk: '/locked-sdk',
    digest: 'f'.repeat(64),
    root: '/repo',
  });

  assert.equal(process.env.ANDROID_HOME, previousHome);
  assert.equal(
    result.ANDROID_AVD_HOME,
    join('/repo', '.tmp/android-avds', 'f'.repeat(16)),
  );
  assert.equal(result.PATH.split(delimiter).at(-1), '/windows/system32');
});
