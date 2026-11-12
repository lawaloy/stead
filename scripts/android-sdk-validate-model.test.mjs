import assert from 'node:assert/strict';
import test from 'node:test';
import { sdkLock, validateSdkModel } from './android-sdk.mjs';

const lockedListing = (revisionFor) =>
  sdkLock()
    .lock.packages.map(
      (pkg) =>
        ` ${pkg.path} | ${revisionFor(pkg.revision)} | description | location`,
    )
    .join('\n');

test('SDK model treats trailing .0 segments as the same locked revision', async () => {
  const { lock } = sdkLock();
  await validateSdkModel('/fixture', async () =>
    lockedListing((revision) => `${revision}.0.0`),
  );
  await validateSdkModel('/fixture', async () =>
    lockedListing((revision) => revision.replace(/(\.0)+$/, '')),
  );

  const cmdlineTools = lock.packages.find((pkg) =>
    pkg.path.startsWith('cmdline-tools;'),
  );
  assert.match(cmdlineTools.revision, /\.0$/);
  await assert.rejects(
    validateSdkModel('/fixture', async () =>
      lockedListing((revision) =>
        revision === cmdlineTools.revision
          ? cmdlineTools.revision.replace(/\.0$/, '.1')
          : revision,
      ),
    ),
    (error) =>
      error.message.includes(
        `did not recognize locked package ${cmdlineTools.path} ${cmdlineTools.revision}`,
      ),
  );
});

test('SDK model rejects a dedicated tree that omits a locked package', async () => {
  const omitted = sdkLock().lock.packages.find((pkg) =>
    pkg.path.startsWith('ndk;'),
  );
  const output = sdkLock()
    .lock.packages.filter((pkg) => pkg.path !== omitted.path)
    .map((pkg) => ` ${pkg.path} | ${pkg.revision} | description | location`)
    .join('\n');

  await assert.rejects(
    validateSdkModel('/fixture', async () => output),
    (error) =>
      error.message.includes(
        `did not recognize locked package ${omitted.path} ${omitted.revision}`,
      ),
  );
});
