import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments } from './native-config.mjs';

test('verify cannot select a device while targeting every platform', () => {
  assert.throws(
    () =>
      parseNativeArguments([
        'verify',
        '--platform',
        'all',
        '--device',
        'emulator-5554',
      ]),
    /Select one platform when choosing a device/,
  );
  assert.throws(
    () =>
      parseNativeArguments([
        'test',
        '--platform',
        'all',
        '--device',
        'emulator-5554',
      ]),
    /Select one platform when choosing a device/,
  );
});

test('--project-ready is refused for doctor, test, and verify', () => {
  assert.equal(
    parseNativeArguments(['build', '--platform', 'android', '--project-ready'])
      .projectReady,
    true,
  );
  for (const args of [
    ['test', '--platform', 'android', '--project-ready'],
    ['verify', '--platform', 'android', '--project-ready'],
    ['doctor', '--platform', 'android', '--project-ready'],
  ])
    assert.throws(
      () => parseNativeArguments(args),
      /--project-ready is only valid for build/,
    );
});
