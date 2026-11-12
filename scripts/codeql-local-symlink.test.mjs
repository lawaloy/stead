import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotSource } from './codeql-local.mjs';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CodeQL snapshots refuse tracked symlinks instead of copying their targets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead codeql symlink '));
  const root = join(directory, 'checkout');
  const output = join(directory, 'snapshot');
  const secret = join(directory, 'secret.env');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(secret, 'JWT_SECRET=not-for-codeql');
  symlinkSync(secret, join(root, 'src', 'leak.env'));
  try {
    await assert.rejects(
      snapshotSource(root, output, async () => 'src/leak.env\0'),
      /CodeQL source snapshots require regular files: src\/leak.env/,
    );
    assert.equal(existsSync(join(output, 'src', 'leak.env')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
