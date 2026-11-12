import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSourceFormatting } from './format-check.mjs';

test('source formatting splits Prettier argv before the Windows command-line limit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead format batch '));
  mkdirSync(join(root, 'src'));
  const files = Array.from({ length: 90 }, (_, index) => {
    const name = `f${String(index).padStart(3, '0')}-${'a'.repeat(180)}.json`;
    return `src/${name}`;
  });
  for (const file of files) writeFileSync(join(root, file), '{}\n');

  const batches = [];
  const execute = async (command, args = []) => {
    if (command === 'git') return `${files.join('\0')}\0`;
    const batch = args.filter((argument) => argument.startsWith('./'));
    batches.push(batch);
    assert.equal(args.includes('--check'), true);
    assert.ok(
      batch.join(' ').length <= 16_000,
      `Prettier file argv exceeded the Windows batch budget (${batch.join(' ').length})`,
    );
    return '';
  };

  try {
    await checkSourceFormatting(root, execute);
    assert.equal(batches.length, 2);
    assert.equal(
      batches.reduce((count, batch) => count + batch.length, 0),
      files.length,
    );
    assert.deepEqual(
      batches.flat(),
      files.map((file) => `./${file}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
