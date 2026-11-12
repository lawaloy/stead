import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments } from './native-config.mjs';

test('native options fail closed when a value is omitted or is another flag', () => {
  assert.throws(
    () => parseNativeArguments(['test', '--phone']),
    /Missing value for --phone/,
  );
  assert.throws(
    () => parseNativeArguments(['test', '--app', '--phone', '08030000001']),
    /Missing value for --app/,
  );
  assert.throws(
    () => parseNativeArguments(['test', '--mystery']),
    /Unknown native option: --mystery/,
  );
  assert.equal(
    parseNativeArguments(['test', '--database-ready']).databaseReady,
    true,
  );
});
