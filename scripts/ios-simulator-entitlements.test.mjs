import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEntitlements } from './ios-simulator-entitlements.mjs';

const commands = (size, offset = 32, name = '__entitlements') =>
  `Section\n  sectname ${name}\n   segname __TEXT\n      addr 0x0000000100000020\n      size 0x${size.toString(16)}\n    offset ${offset}\n     align 2^0 (1)\n`;

test('extractor returns only the specified section, preserving XML and non-UTF8 binary bytes', () => {
  for (const bytes of [
    Buffer.from('<?xml version="1.0"?><plist><dict/></plist>'),
    Buffer.from([0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0, 0xfa, 0xde, 0, 0xff]),
  ]) {
    const binary = Buffer.concat([
      Buffer.alloc(32, 0xcc),
      bytes,
      Buffer.alloc(16, 0xff),
    ]);
    assert.deepEqual(
      extractEntitlements(binary, commands(bytes.length)),
      bytes,
    );
  }
});

test('extractor rejects missing, empty, overflowing, and outside-file sections', () => {
  const binary = Buffer.alloc(64);
  for (const text of [
    commands(16, 32, '__text'),
    commands(0),
    commands(128),
    commands(16, 128),
    commands(Number.MAX_SAFE_INTEGER + 1),
  ])
    assert.throws(() => extractEntitlements(binary, text));
});

test('extractor selects the entitlement section instead of a preceding unrelated section', () => {
  const binary = Buffer.from(Array.from({ length: 64 }, (_, index) => index));
  assert.deepEqual(
    extractEntitlements(binary, commands(4, 0, '__text') + commands(8, 32)),
    binary.subarray(32, 40),
  );
});
