import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSourceFormatting } from './format-check.mjs';

test('source formatting does not invoke Prettier when git lists no existing files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead format empty '));
  let prettierCalls = 0;
  const execute = async (command, args = []) => {
    if (command === 'git') return 'deleted.json\0gone.ts\0\0';
    prettierCalls += 1;
    throw new Error(
      `Prettier must not run when every git-listed file is gone: ${args.join(' ')}`,
    );
  };

  try {
    await checkSourceFormatting(root, execute);
    assert.equal(prettierCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
