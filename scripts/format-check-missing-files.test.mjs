import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSourceFormatting } from './format-check.mjs';

test('source formatting skips git-listed files that are absent from the working tree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead format missing '));
  writeFileSync(join(root, 'present.json'), '{}\n');
  const batches = [];
  const execute = async (command, args = []) => {
    if (command === 'git') return 'present.json\0deleted.json\0';
    const batch = args.filter((argument) => argument.startsWith('./'));
    batches.push(batch);
    assert.equal(args.includes('--check'), true);
    assert.ok(
      !batch.includes('./deleted.json'),
      'Prettier must not be invoked for a git-listed file that is gone',
    );
    return '';
  };

  try {
    await checkSourceFormatting(root, execute);
    assert.deepEqual(batches, [['./present.json']]);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
