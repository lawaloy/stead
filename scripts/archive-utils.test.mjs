import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  downloadArchive,
  extractZip,
  verifyArchive,
} from './archive-utils.mjs';

test('archives whose byte size does not match the lock are rejected even when the hash matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead archive size '));
  try {
    const file = join(dir, 'sdk.zip');
    const contents = 'sdk-archive-bytes';
    writeFileSync(file, contents);
    const digest = createHash('sha256').update(contents).digest('hex');

    await assert.rejects(
      verifyArchive(file, digest, contents.length + 1),
      /Archive checksum\/size mismatch/,
    );
    await verifyArchive(file, digest, contents.length);
    await verifyArchive(file, digest);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('failed archive downloads never write a local file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead archive download '));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  try {
    const file = join(dir, 'sdk.zip');
    await assert.rejects(
      downloadArchive('https://example.invalid/sdk.zip', file),
      /Archive download failed: HTTP 503/,
    );
    assert.equal(existsSync(file), false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt zip archives fail closed and do not populate the destination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead archive extract '));
  try {
    const archive = join(dir, 'sdk.zip');
    const destination = join(dir, 'extracted');
    writeFileSync(archive, 'not-a-zip-archive');
    await assert.rejects(extractZip(archive, destination), /unzip failed/);
    assert.equal(
      existsSync(destination) ? readdirSync(destination).length : 0,
      0,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
