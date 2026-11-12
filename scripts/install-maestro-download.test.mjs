import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installMaestro } from './install-maestro.mjs';

test('a failed Maestro download is rejected before extraction or execution', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead maestro download '));
  const installation = join(directory, 'installation');
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => {
    requested = String(url);
    return { ok: false, status: 503 };
  };
  try {
    await assert.rejects(
      installMaestro({ directory: installation }),
      /Maestro download failed: HTTP 503/,
    );
    assert.match(requested, /\/cli-[\d.]+\/maestro\.zip$/);
    assert.equal(existsSync(installation), false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
