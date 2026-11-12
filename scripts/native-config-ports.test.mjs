import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments, parsePort } from './native-config.mjs';

test('test ports reject privileged and overflow values before any native work', () => {
  assert.equal(parsePort(1024), 1024);
  assert.equal(parsePort('65535'), 65535);
  for (const value of [0, 80, 1023, 65536, 99999, '08', '-1', '3000.5', ''])
    assert.throws(
      () => parsePort(value),
      /Test ports must be integers between 1024 and 65535/,
    );
  for (const args of [
    ['test', '--api-port', '80'],
    ['test', '--api-port', '1023'],
    ['test', '--api-port', '65536'],
    ['verify', '--metro-port', '1023'],
  ])
    assert.throws(
      () => parseNativeArguments(args),
      /Test ports must be integers between 1024 and 65535/,
    );
  assert.equal(
    parseNativeArguments(['test', '--api-port', '1024']).apiPort,
    1024,
  );
  assert.equal(
    parseNativeArguments(['test', '--api-port', '65535']).apiPort,
    65535,
  );
});
