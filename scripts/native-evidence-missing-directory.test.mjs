import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  nativeEvidenceFiles,
  summarizeMaestro,
  xctestLogFiles,
} from './native-evidence.mjs';

test('native evidence collection is a no-op when the debug directory was never created', () => {
  const missing = join(
    tmpdir(),
    `stead-missing-evidence-${Date.now()}-${process.pid}`,
  );

  assert.deepEqual(
    nativeEvidenceFiles('', () => true),
    [],
  );
  assert.deepEqual(
    nativeEvidenceFiles(undefined, () => true),
    [],
  );
  assert.deepEqual(
    nativeEvidenceFiles(missing, () => true),
    [],
  );
  assert.deepEqual(xctestLogFiles(missing), []);
  assert.deepEqual(summarizeMaestro(missing), []);
});
