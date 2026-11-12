import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeArguments } from './native-config.mjs';

test('setup accepts only --platform ios, including the inline form', () => {
  assert.deepEqual(parseNativeArguments(['setup', '--platform', 'ios']), {
    command: 'setup',
    platform: 'ios',
  });
  assert.deepEqual(parseNativeArguments(['setup', '--platform=ios']), {
    command: 'setup',
    platform: 'ios',
  });
});

test('setup refuses Android, omitted platform, and extra options before any toolchain work', () => {
  for (const args of [
    ['setup'],
    ['setup', '--platform', 'android'],
    ['setup', '--platform=android'],
    ['setup', '--platform', 'ios', '--device', 'booted'],
  ])
    assert.throws(
      () => parseNativeArguments(args),
      /Setup supports only --platform ios/,
    );
});

test('help and remote-ios refuse additional options', () => {
  assert.throws(
    () => parseNativeArguments(['help', '--platform', 'ios']),
    /help takes no additional options/,
  );
  assert.throws(
    () => parseNativeArguments(['--help', 'remote-ios']),
    /--help takes no additional options/,
  );
  assert.throws(
    () => parseNativeArguments(['remote-ios', '--platform', 'ios']),
    /remote-ios takes no additional options/,
  );
});
