import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyArchive } from './archive-utils.mjs';

test('archives whose SHA-256 does not match the lock are rejected even when the size matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stead archive checksum '));
  try {
    const file = join(dir, 'sdk.zip');
    const contents = 'sdk-archive-bytes';
    writeFileSync(file, contents);
    const digest = createHash('sha256').update(contents).digest('hex');
    const wrong = createHash('sha256')
      .update('different-archive-bytes')
      .digest('hex');

    await assert.rejects(
      verifyArchive(file, wrong),
      /Archive checksum\/size mismatch/,
    );
    await assert.rejects(
      verifyArchive(file, wrong, contents.length),
      /Archive checksum\/size mismatch/,
    );
    await verifyArchive(file, digest, contents.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
