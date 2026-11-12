import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sdkLock,
  sdkReceipt,
  packageMetadata,
  installAndroidSdk,
} from './android-sdk.mjs';

const writeReceiptTree = (directory, receipt) => {
  const { lock } = sdkLock();
  writeFileSync(join(directory, '.stead-sdk.json'), JSON.stringify(receipt));
  for (const pkg of lock.packages) {
    const target = join(directory, ...pkg.path.split(';'));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'source.properties'), 'fixture');
    writeFileSync(join(target, 'package.xml'), packageMetadata(lock, pkg));
  }
};

test('Android SDK receipt rejects a digest that does not match the committed archive lock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead sdk digest '));
  try {
    const { digest } = sdkLock();
    writeReceiptTree(dir, {
      digest: '0'.repeat(64),
      platform: process.platform,
    });
    assert.notEqual(digest, '0'.repeat(64));
    assert.throws(
      () => sdkReceipt(dir),
      /Android SDK receipt does not match the committed archive lock/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Android SDK receipt rejects a tree recorded for a different host platform', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead sdk platform '));
  try {
    const { digest } = sdkLock();
    const otherPlatform = process.platform === 'linux' ? 'darwin' : 'linux';
    writeReceiptTree(dir, { digest, platform: otherPlatform });
    assert.throws(
      () => sdkReceipt(dir),
      /Android SDK receipt does not match the committed archive lock/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing dedicated SDK is not installed without an explicit license acceptance', async () => {
  const directory = join(
    tmpdir(),
    `stead-sdk-license-${Date.now()}-${process.pid}`,
  );
  assert.equal(existsSync(directory), false);
  await assert.rejects(
    installAndroidSdk({ directory, acceptLicenses: false }),
    /Review the Android SDK license, then use --accept-licenses/,
  );
  assert.equal(existsSync(directory), false);
});
