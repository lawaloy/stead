import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installMaestro } from './install-maestro.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const stubMaestro = (directory, version) => {
  const bin = join(directory, 'bin');
  mkdirSync(bin, { recursive: true });
  const executable = join(bin, 'maestro');
  writeFileSync(
    executable,
    `#!${process.execPath}\nconsole.log(${JSON.stringify(version)});\n`,
  );
  chmodSync(executable, 0o755);
  return executable;
};

test('an existing Maestro install is refused when its version does not match CI', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead maestro pin '));
  const executable = stubMaestro(directory, '1.0.0');
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return { ok: false, status: 500 };
  };
  try {
    await assert.rejects(
      installMaestro({ directory }),
      new RegExp(
        `Use Maestro ${TOOLCHAIN.MAESTRO_VERSION} to match CI \\(found 1\\.0\\.0\\)`,
      ),
    );
    assert.equal(fetched, false);
    assert.equal(existsSync(executable), true);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an existing Maestro install matching CI is reused without downloading', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead maestro reuse '));
  stubMaestro(directory, TOOLCHAIN.MAESTRO_VERSION);
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    return { ok: false, status: 500 };
  };
  try {
    const executable = await installMaestro({ directory });
    assert.equal(fetched, false);
    assert.equal(executable, join(directory, 'bin', 'maestro'));
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  }
});
