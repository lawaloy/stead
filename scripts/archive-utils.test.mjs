import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { downloadArchive, verifyArchive } from './archive-utils.mjs';

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
