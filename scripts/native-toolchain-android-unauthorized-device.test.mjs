import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAndroidDevice } from './native-toolchain.mjs';

test('Android selection refuses a requested serial that is unauthorized or offline', () => {
  const listing = [
    'List of devices attached',
    'emulator-5554 unauthorized',
    'emulator-5556 offline',
    'emulator-5558 device product:sdk',
  ].join('\n');

  for (const requested of ['emulator-5554', 'emulator-5556']) {
    assert.throws(
      () => selectAndroidDevice(listing, requested),
      new RegExp(`Android device ${requested} is not online`),
    );
  }

  assert.equal(selectAndroidDevice(listing, 'emulator-5558'), 'emulator-5558');
});
