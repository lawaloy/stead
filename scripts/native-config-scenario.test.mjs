import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments } from './native-config.mjs';

test('diagnostic sign-in is allowed only for iOS test, never verify or Android', () => {
  assert.equal(
    parseNativeArguments(['test', '--platform', 'ios', '--scenario', 'sign-in'])
      .scenario,
    'sign-in',
  );
  for (const args of [
    ['test', '--platform', 'android', '--scenario', 'sign-in'],
    ['verify', '--platform', 'ios', '--scenario', 'sign-in'],
    ['test', '--scenario', 'sign-in'],
    ['test', '--platform', 'ios', '--scenario', 'login'],
  ])
    assert.throws(() => parseNativeArguments(args));
});
