import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdkLock, sdkReceipt, packageMetadata } from './android-sdk.mjs';

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

const receiptDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead sdk package '));
  writeReceiptTree(directory, {
    digest: sdkLock().digest,
    platform: process.platform,
  });
  return directory;
};

const firstPackageTarget = (directory) => {
  const pkg = sdkLock().lock.packages[0];
  return { pkg, target: join(directory, ...pkg.path.split(';')) };
};

test('Android SDK receipt accepts a tree whose locked packages still match the archive lock', () => {
  const directory = receiptDirectory();
  try {
    const receipt = sdkReceipt(directory);
    assert.equal(receipt.digest, sdkLock().digest);
    assert.equal(receipt.platform, process.platform);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Android SDK receipt rejects a locked package whose package.xml no longer matches the archive lock', () => {
  const directory = receiptDirectory();
  try {
    const { pkg, target } = firstPackageTarget(directory);
    writeFileSync(join(target, 'package.xml'), '<common:repository/>');
    assert.throws(
      () => sdkReceipt(directory),
      (error) => {
        assert.equal(
          error.message,
          `Locked SDK package is missing or changed: ${pkg.path}. Reinstall the dedicated SDK.`,
        );
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Android SDK receipt rejects a locked package that is missing source.properties', () => {
  const directory = receiptDirectory();
  try {
    const { pkg, target } = firstPackageTarget(directory);
    unlinkSync(join(target, 'source.properties'));
    assert.throws(
      () => sdkReceipt(directory),
      (error) => {
        assert.equal(
          error.message,
          `Locked SDK package is missing or changed: ${pkg.path}. Reinstall the dedicated SDK.`,
        );
        return true;
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
