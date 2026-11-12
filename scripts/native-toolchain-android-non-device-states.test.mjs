import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAndroidDevice } from './native-toolchain.mjs';

test('Android selection refuses requested serials that are connecting or have no permissions', () => {
  const listing = [
    'List of devices attached',
    'emulator-5554 no permissions',
    'emulator-5556 connecting',
    'emulator-5558 device product:sdk',
  ].join('\n');

  assert.equal(selectAndroidDevice(listing), 'emulator-5558');
  assert.throws(
    () => selectAndroidDevice(listing, 'emulator-5554'),
    /Android device emulator-5554 is not online/,
  );
  assert.throws(
    () => selectAndroidDevice(listing, 'emulator-5556'),
    /Android device emulator-5556 is not online/,
  );
});
