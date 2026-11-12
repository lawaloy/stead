import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeSourceIdentity } from './native-workflow.mjs';

test('native source identity uses an injected source and does not query git', async () => {
  const source = { commit: 'c'.repeat(40), workingTreeClean: true };
  assert.deepEqual(
    await nativeSourceIdentity({ source, app: '/tmp/stead-debug.apk' }, () => {
      throw new Error('git must not run when source is injected');
    }),
    {
      ...source,
      build: 'provided-artifact',
    },
  );
});

test('a source-built artifact is recorded as a source build even when --app is set', async () => {
  const source = { commit: 'd'.repeat(40), workingTreeClean: true };
  assert.deepEqual(
    await nativeSourceIdentity(
      { source, app: '/tmp/stead-debug.apk', sourceBuilt: true },
      () => {
        throw new Error('git must not run when source is injected');
      },
    ),
    {
      ...source,
      build: 'source',
    },
  );
});
