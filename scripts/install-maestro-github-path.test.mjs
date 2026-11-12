import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installMaestro } from './install-maestro.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

test('a matching Maestro install records its bin directory on GITHUB_PATH', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead maestro github path '));
  const directory = join(root, 'maestro');
  const bin = join(directory, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'maestro'),
    `#!${process.execPath}\nconsole.log(${JSON.stringify(TOOLCHAIN.MAESTRO_VERSION)});\n`,
  );
  chmodSync(join(bin, 'maestro'), 0o755);
  const githubPath = join(root, 'github.path');
  writeFileSync(githubPath, '');
  const previousPath = process.env.GITHUB_PATH;
  process.env.GITHUB_PATH = githubPath;
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return { ok: false, status: 500 };
  };
  try {
    assert.equal(await installMaestro({ directory }), join(bin, 'maestro'));
    assert.equal(fetched, false);
    assert.equal(readFileSync(githubPath, 'utf8'), `${bin}\n`);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousPath === undefined) delete process.env.GITHUB_PATH;
    else process.env.GITHUB_PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
});
