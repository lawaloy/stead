import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments, phoneDisplay } from './native-config.mjs';

test('native fixtures accept only 11-digit disposable Nigerian test numbers', () => {
  assert.equal(phoneDisplay('07030000001'), '0703 000 0001');
  assert.equal(phoneDisplay('08130000001'), '0813 000 0001');
  assert.equal(phoneDisplay('09030000001'), '0903 000 0001');
  assert.equal(
    parseNativeArguments(['test', '--phone', '09130000001']).phone,
    '09130000001',
  );
  for (const phone of [
    '06030000001',
    '08230000001',
    '0803000000',
    '080300000011',
    '+2348030000001',
  ]) {
    assert.throws(
      () => phoneDisplay(phone),
      /Use an 11-digit disposable Nigerian mobile test number/,
    );
    assert.throws(
      () => parseNativeArguments(['test', '--phone', phone]),
      /Use an 11-digit disposable Nigerian mobile test number/,
    );
  }
});
