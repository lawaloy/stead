import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAndroidDevice } from './native-toolchain.mjs';

test('Android selection parses CRLF adb listings without treating carriage returns as part of the serial', () => {
  const listing =
    'List of devices attached\r\nemulator-5554 device product:sdk\r\nemulator-5556 device\r\n';

  assert.throws(
    () => selectAndroidDevice(listing),
    /Start one dedicated Android emulator/,
  );
  assert.equal(selectAndroidDevice(listing, 'emulator-5556'), 'emulator-5556');
  assert.equal(
    selectAndroidDevice(
      'List of devices attached\r\nemulator-5554 device product:sdk\r\n',
    ),
    'emulator-5554',
  );
});
