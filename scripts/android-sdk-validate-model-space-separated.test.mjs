import assert from 'node:assert/strict';
import test from 'node:test';
import { sdkLock, validateSdkModel } from './android-sdk.mjs';

const spaceListing = (revisionFor, extraLines = []) =>
  [
    ...sdkLock().lock.packages.map(
      (pkg) =>
        `  ${pkg.path.replaceAll(';', '/')}  ${revisionFor(pkg.revision)}  description`,
    ),
    ...extraLines,
  ].join('\n');

test('SDK model accepts space-separated listings and slash package paths', async () => {
  await validateSdkModel('/fixture', async () =>
    spaceListing((revision) => revision),
  );
});

test('SDK model still rejects unexpected packages in space-separated listings', async () => {
  await assert.rejects(
    validateSdkModel('/fixture', async () =>
      spaceListing((revision) => revision, ['  extra.package  1.0  leftover']),
    ),
    /Unexpected SDK package outside the archive lock: extra.package/,
  );
});
