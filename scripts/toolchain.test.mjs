import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  TOOLCHAIN,
  checkJsToolchain,
  checkPostgresVersion,
} from './toolchain.mjs';

test('a different database patch version is rejected before native fixtures', async () => {
  await assert.rejects(
    checkPostgresVersion({
      query: async () => ({ rows: [{ server_version: '16.1' }] }),
    }),
    /Use PostgreSQL/,
  );
  assert.equal(
    await checkPostgresVersion({
      query: async () => ({
        rows: [
          { server_version: `${TOOLCHAIN.POSTGRES_VERSION} (vendor build)` },
        ],
      }),
    }),
    TOOLCHAIN.POSTGRES_VERSION,
  );
});

test('a different patch version cannot pass local runtime preflight', async () => {
  let commands = 0;
  await assert.rejects(
    checkJsToolchain({ node: '24.15.0', execute: async () => commands++ }),
    /Use Node/,
  );
  assert.equal(commands, 0);
  await assert.rejects(
    checkJsToolchain({
      node: TOOLCHAIN.NODE_VERSION,
      execute: async () => '11.17.0',
    }),
    /Use npm/,
  );
  assert.deepEqual(
    await checkJsToolchain({
      node: TOOLCHAIN.NODE_VERSION,
      execute: async () => TOOLCHAIN.NPM_VERSION,
    }),
    { node: TOOLCHAIN.NODE_VERSION, npm: TOOLCHAIN.NPM_VERSION },
  );
});

test('developer version selection agrees with the shared CI pins', () => {
  assert.match(TOOLCHAIN.MAESTRO_SHA256, /^[a-f0-9]{64}$/);
  assert.match(TOOLCHAIN.POSTGRES_SHA256, /^[a-f0-9]{64}$/);
  assert.ok(
    TOOLCHAIN.POSTGRES_IMAGE.startsWith(
      `postgres:${TOOLCHAIN.POSTGRES_VERSION}@sha256:`,
    ),
  );
  assert.equal(
    readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim(),
    TOOLCHAIN.NODE_VERSION,
  );
  assert.equal(
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).packageManager,
    `npm@${TOOLCHAIN.NPM_VERSION}`,
  );
});
