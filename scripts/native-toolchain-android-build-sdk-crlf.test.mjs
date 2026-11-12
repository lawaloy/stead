import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOLCHAIN } from './native-config.mjs';
import { checkAndroidBuildSdk } from './native-toolchain.mjs';

const lockedPackages = () => [
  ['build-tools', TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION],
  ['build-tools', TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION],
  ['ndk', TOOLCHAIN.ANDROID_NDK_VERSION],
  ['cmake', TOOLCHAIN.ANDROID_CMAKE_VERSION],
  [
    'platforms',
    `android-${TOOLCHAIN.ANDROID_COMPILE_SDK}`,
    TOOLCHAIN.ANDROID_PLATFORM_REVISION,
  ],
];

const writeLockedSdk = (sdk, revisionFor) => {
  for (const [name, directory, revision = directory] of lockedPackages()) {
    const path = join(sdk, name, directory);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'source.properties'),
      `# Android SDK Package\r\nPkg.Revision=${revisionFor(revision)}\r\n`,
    );
  }
};

test('Android build preflight accepts CRLF source.properties for locked SDK revisions', () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-build-sdk-crlf-'));
  try {
    writeLockedSdk(sdk, (revision) => revision);
    assert.deepEqual(checkAndroidBuildSdk(sdk), {
      buildTools: TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION,
      moduleBuildTools: TOOLCHAIN.ANDROID_MODULE_BUILD_TOOLS_VERSION,
      ndk: TOOLCHAIN.ANDROID_NDK_VERSION,
      cmake: TOOLCHAIN.ANDROID_CMAKE_VERSION,
      compileSdk: TOOLCHAIN.ANDROID_COMPILE_SDK,
      platformRevision: TOOLCHAIN.ANDROID_PLATFORM_REVISION,
    });
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android build preflight still rejects a mismatched CRLF platform revision', () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-build-sdk-crlf-mismatch-'),
  );
  try {
    writeLockedSdk(sdk, (revision) =>
      revision === TOOLCHAIN.ANDROID_PLATFORM_REVISION ? '999' : revision,
    );
    assert.throws(
      () => checkAndroidBuildSdk(sdk),
      /Use Android compile SDK .* to match CI/,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
