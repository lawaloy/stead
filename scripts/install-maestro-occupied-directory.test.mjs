import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installMaestro } from './install-maestro.mjs';

test('an occupied Maestro directory without the CLI is refused before download', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead maestro occupied '));
  writeFileSync(join(directory, 'README.txt'), 'not a maestro install');
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return { ok: false, status: 500 };
  };
  try {
    await assert.rejects(
      installMaestro({ directory }),
      /Refusing to replace existing directory/,
    );
    assert.equal(fetched, false);
    assert.equal(existsSync(join(directory, 'README.txt')), true);
    assert.equal(existsSync(join(directory, 'bin')), false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
