import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAndroidDevice } from './native-toolchain.mjs';

test('Android selection refuses requested serials that are in recovery, bootloader, or sideload', () => {
  const listing = [
    'List of devices attached',
    'emulator-5554 recovery',
    'emulator-5556 bootloader',
    'emulator-5558 sideload',
    'emulator-5560 device product:sdk',
  ].join('\n');

  assert.equal(selectAndroidDevice(listing), 'emulator-5560');
  assert.throws(
    () => selectAndroidDevice(listing, 'emulator-5554'),
    /Android device emulator-5554 is not online/,
  );
  assert.throws(
    () => selectAndroidDevice(listing, 'emulator-5556'),
    /Android device emulator-5556 is not online/,
  );
  assert.throws(
    () => selectAndroidDevice(listing, 'emulator-5558'),
    /Android device emulator-5558 is not online/,
  );
});
