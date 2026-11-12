import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotSource } from './codeql-local.mjs';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CodeQL snapshots skip directory entries and still copy regular files', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead codeql directory '));
  const root = join(directory, 'checkout');
  const output = join(directory, 'snapshot');
  mkdirSync(join(root, 'src', 'pkg'), { recursive: true });
  writeFileSync(join(root, 'src', 'pkg', 'index.ts'), 'export {};\n');
  try {
    await snapshotSource(
      root,
      output,
      async () => 'src/pkg\0src/pkg/index.ts\0',
    );
    assert.equal(existsSync(join(output, 'src', 'pkg', 'index.ts')), true);
    assert.equal(statSync(join(output, 'src', 'pkg')).isDirectory(), true);
    assert.equal(
      statSync(join(output, 'src', 'pkg', 'index.ts')).isFile(),
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
