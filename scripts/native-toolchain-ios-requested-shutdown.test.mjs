import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN } from './native-config.mjs';
import { selectIosDevice } from './native-toolchain.mjs';

const dedicated = (udid, state) => ({
  name: 'Stead Native iPhone 17',
  udid,
  isAvailable: true,
  state,
});

test('iOS selection honors a requested shutdown dedicated simulator even when another is booted', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        dedicated('shutdown-requested', 'Shutdown'),
        dedicated('booted', 'Booted'),
      ],
    },
  };

  assert.equal(
    selectIosDevice(listing, 'shutdown-requested').udid,
    'shutdown-requested',
  );
  assert.equal(selectIosDevice(listing).udid, 'booted');
});
