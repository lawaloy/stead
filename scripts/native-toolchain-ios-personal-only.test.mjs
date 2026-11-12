import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { selectIosDevice } from './native-toolchain.mjs';

test('iOS selection refuses personal-only listings instead of wiping a personal keychain', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        {
          name: 'iPhone 17',
          udid: 'personal-booted',
          isAvailable: true,
          state: 'Booted',
        },
        {
          name: 'iPhone 16 Pro',
          udid: 'personal-shutdown',
          isAvailable: true,
          state: 'Shutdown',
        },
      ],
    },
  };

  assert.throws(
    () => selectIosDevice(listing),
    /personal simulators are refused/,
  );
  assert.throws(
    () => selectIosDevice({ devices: { [TOOLCHAIN.IOS_RUNTIME]: [] } }),
    /personal simulators are refused/,
  );
});
