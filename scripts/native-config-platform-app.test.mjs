import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments } from './native-config.mjs';

test('verify cannot provide an app artifact while targeting every platform', () => {
  assert.throws(
    () =>
      parseNativeArguments(['verify', '--platform', 'all', '--app', 'app.apk']),
    /Select one platform when providing an app artifact/,
  );
  assert.throws(
    () =>
      parseNativeArguments(['test', '--platform', 'all', '--app', 'app.app']),
    /Select one platform when providing an app artifact/,
  );
});
