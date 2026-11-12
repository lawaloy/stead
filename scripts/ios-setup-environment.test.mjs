import assert from 'node:assert/strict';
import test from 'node:test';
import { iosEnvironment } from './ios-setup.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('iOS environment pins the Maestro driver timeout and default Xcode path', () => {
  const env = iosEnvironment({
    MAESTRO_DRIVER_STARTUP_TIMEOUT: '1',
    PATH: '/usr/bin',
  });

  assert.equal(
    env.MAESTRO_DRIVER_STARTUP_TIMEOUT,
    TOOLCHAIN.IOS_DRIVER_STARTUP_TIMEOUT_MS,
  );
  assert.equal(
    env.DEVELOPER_DIR,
    `/Applications/Xcode_${TOOLCHAIN.XCODE_VERSION}.app/Contents/Developer`,
  );
  assert.equal(env.PATH, '/usr/bin');
});

test('iOS environment keeps an explicit DEVELOPER_DIR while still pinning the driver timeout', () => {
  const env = iosEnvironment({
    DEVELOPER_DIR: '/custom/Xcode.app/Contents/Developer',
    MAESTRO_DRIVER_STARTUP_TIMEOUT: '5000',
  });

  assert.equal(env.DEVELOPER_DIR, '/custom/Xcode.app/Contents/Developer');
  assert.equal(
    env.MAESTRO_DRIVER_STARTUP_TIMEOUT,
    TOOLCHAIN.IOS_DRIVER_STARTUP_TIMEOUT_MS,
  );
});
