import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeDatabaseUrl, newSchema } from './native-config.mjs';

test('native fixtures accept postgres URLs and reject other engines even on localhost', () => {
  const schema = newSchema();
  assert.equal(
    new URL(
      nativeDatabaseUrl('postgres://stead:stead@localhost:5432/stead', schema),
    ).protocol,
    'postgres:',
  );
  assert.equal(
    new URL(
      nativeDatabaseUrl(
        'postgresql://stead:stead@127.0.0.1:5432/stead',
        schema,
      ),
    ).protocol,
    'postgresql:',
  );
  for (const url of [
    'mysql://stead:stead@localhost:5432/stead',
    'postgresql://stead:stead@localhost./stead',
    'postgresql://stead:stead@127.0.0.1./stead',
  ])
    assert.throws(
      () => nativeDatabaseUrl(url, schema),
      /Native verification requires a local PostgreSQL database/,
    );
});
