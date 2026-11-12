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

test('iOS selection prefers a booted dedicated simulator over later shutdown copies', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        dedicated('shutdown-first', 'Shutdown'),
        dedicated('booted', 'Booted'),
        dedicated('shutdown-last', 'Shutdown'),
      ],
    },
  };
  assert.equal(selectIosDevice(listing).udid, 'booted');
});

test('iOS selection uses the last available dedicated simulator when none is booted', () => {
  const listing = {
    devices: {
      [TOOLCHAIN.IOS_RUNTIME]: [
        dedicated('shutdown-first', 'Shutdown'),
        dedicated('shutdown-last', 'Shutdown'),
      ],
    },
  };
  assert.equal(selectIosDevice(listing).udid, 'shutdown-last');
});
