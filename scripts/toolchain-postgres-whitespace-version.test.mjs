import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLCHAIN, checkPostgresVersion } from './toolchain.mjs';

test('Postgres toolchain preflight fails closed when server_version is whitespace-only', async () => {
  let queries = 0;
  await assert.rejects(
    checkPostgresVersion({
      query: async () => {
        queries += 1;
        return { rows: [{ server_version: ' \t\n ' }] };
      },
    }),
    new RegExp(
      `Use PostgreSQL ${TOOLCHAIN.POSTGRES_VERSION} to match CI \\(found no version\\)`,
    ),
  );
  assert.equal(queries, 1);
});
