import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAndroidSdk } from './android-sdk.mjs';

const restoreProperty = (object, name, descriptor) => {
  Object.defineProperty(object, name, descriptor);
};

test('Android SDK install refuses a non-x64 host before creating a tree', async () => {
  const arch = Object.getOwnPropertyDescriptor(process, 'arch');
  const directory = join(
    tmpdir(),
    `stead-sdk-arch-${Date.now()}-${process.pid}`,
  );
  Object.defineProperty(process, 'arch', {
    value: 'arm64',
    configurable: true,
    enumerable: true,
    writable: false,
  });
  try {
    assert.equal(existsSync(directory), false);
    await assert.rejects(
      installAndroidSdk({ directory, acceptLicenses: false }),
      /The CI Android baseline requires an x86_64 host/,
    );
    assert.equal(existsSync(directory), false);
  } finally {
    restoreProperty(process, 'arch', arch);
  }
});

test('Android SDK install refuses an unsupported OS before creating a tree', async () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const directory = join(
    tmpdir(),
    `stead-sdk-platform-${Date.now()}-${process.pid}`,
  );
  Object.defineProperty(process, 'platform', {
    value: 'freebsd',
    configurable: true,
    enumerable: true,
    writable: false,
  });
  try {
    assert.equal(existsSync(directory), false);
    await assert.rejects(
      installAndroidSdk({ directory, acceptLicenses: false }),
      /The CI Android baseline requires an x86_64 host/,
    );
    assert.equal(existsSync(directory), false);
  } finally {
    restoreProperty(process, 'platform', platform);
  }
});
