import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractEntitlements,
  assertSimulatorSigning,
} from './ios-simulator-entitlements.mjs';

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

const signedSimulator = (key, slot = 5, platform = 7) => {
  const content = key ? Buffer.from(key) : Buffer.alloc(0);
  const slots = key ? 2 : 1;
  const indexEnd = 12 + slots * 8;
  const signature = Buffer.alloc(indexEnd + 8 + (key ? 8 + content.length : 0));
  signature.writeUInt32BE(0xfade0cc0, 0);
  signature.writeUInt32BE(signature.length, 4);
  signature.writeUInt32BE(slots, 8);
  signature.writeUInt32BE(0, 12);
  signature.writeUInt32BE(indexEnd, 16);
  signature.writeUInt32BE(0xfade0c02, indexEnd);
  signature.writeUInt32BE(8, indexEnd + 4);
  if (key) {
    signature.writeUInt32BE(slot, 20);
    signature.writeUInt32BE(indexEnd + 8, 24);
    signature.writeUInt32BE(slot === 5 ? 0xfade7171 : 0xfade7172, indexEnd + 8);
    signature.writeUInt32BE(8 + content.length, indexEnd + 12);
    content.copy(signature, indexEnd + 16);
  }
  const binary = Buffer.alloc(72 + signature.length);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(2, 16);
  binary.writeUInt32LE(40, 20);
  binary.writeUInt32LE(0x32, 32);
  binary.writeUInt32LE(24, 36);
  binary.writeUInt32LE(platform, 40);
  binary.writeUInt32LE(0x1d, 56);
  binary.writeUInt32LE(16, 60);
  binary.writeUInt32LE(72, 64);
  binary.writeUInt32LE(signature.length, 68);
  signature.copy(binary, 72);
  return binary;
};

const universal = (...slices) => {
  const start = 8 + slices.length * 20;
  const binary = Buffer.alloc(
    start + slices.reduce((size, slice) => size + slice.length, 0),
  );
  binary.writeUInt32BE(0xcafebabe, 0);
  binary.writeUInt32BE(slices.length, 4);
  let offset = start;
  for (let i = 0; i < slices.length; i++) {
    binary.writeUInt32BE(offset, 16 + i * 20);
    binary.writeUInt32BE(slices[i].length, 20 + i * 20);
    slices[i].copy(binary, offset);
    offset += slices[i].length;
  }
  return binary;
};

test('simulator signing accepts a plain host signature and macOS debugging entitlement', () => {
  assertSimulatorSigning(signedSimulator());
  assertSimulatorSigning(signedSimulator('com.apple.security.get-task-allow'));
  assertSimulatorSigning(universal(signedSimulator(), signedSimulator()));
});

test('iOS keychain entitlement dictionaries in XML or DER host signature slots are rejected', () => {
  for (const slot of [5, 7])
    for (const key of ['application-identifier', 'keychain-access-groups'])
      assert.throws(
        () => assertSimulatorSigning(signedSimulator(key, slot)),
        /host signature contains iOS/,
      );
});

test('every universal architecture is checked, including a bad second slice', () => {
  assert.throws(
    () =>
      assertSimulatorSigning(
        universal(signedSimulator(), signedSimulator('application-identifier')),
      ),
    /host signature contains iOS/,
  );
});

test('non-simulator and malformed executable/signature bounds cannot pass signing preflight', () => {
  for (const binary of [
    Buffer.alloc(0),
    Buffer.alloc(32),
    signedSimulator(undefined, 5, 2),
    universal(signedSimulator()).subarray(0, 30),
  ])
    assert.throws(() => assertSimulatorSigning(binary));
  const invalid = signedSimulator();
  invalid.writeUInt32LE(0xffffffff, 64);
  assert.throws(() => assertSimulatorSigning(invalid), /Malformed/);
});
