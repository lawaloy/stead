import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeDatabaseUrl, newSchema } from './native-config.mjs';

test('native fixtures refuse lookalike remote hosts even when they mention localhost', () => {
  const schema = newSchema();
  assert.equal(
    new URL(nativeDatabaseUrl('postgresql://stead:stead@[::1]/stead', schema))
      .hostname,
    '[::1]',
  );
  assert.equal(
    new URL(
      nativeDatabaseUrl(
        'postgresql://stead:stead@127.0.0.1:5432/stead',
        schema,
      ),
    ).hostname,
    '127.0.0.1',
  );
  for (const host of [
    'localhost.evil.com',
    '127.0.0.1.example',
    '0.0.0.0',
    '[::ffff:127.0.0.1]',
  ])
    assert.throws(
      () => nativeDatabaseUrl(`postgresql://stead:stead@${host}/stead`, schema),
      /Native verification requires a local PostgreSQL database/,
    );
});
