import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyMaestroArchive, installMaestro } from './install-maestro.mjs';

test('a corrupted Maestro download is rejected before extraction or execution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead checksum '));
  const file = join(directory, 'archive.zip');
  writeFileSync(file, 'corrupted archive');
  try {
    await assert.rejects(verifyMaestroArchive(file), /checksum mismatch/);
    await verifyMaestroArchive(
      file,
      createHash('sha256').update('corrupted archive').digest('hex'),
    );
    await assert.rejects(
      installMaestro({
        directory: join(directory, 'installation'),
        archive: file,
      }),
      /checksum mismatch/,
    );
    await assert.rejects(installMaestro({ directory }), /Refusing to replace/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
