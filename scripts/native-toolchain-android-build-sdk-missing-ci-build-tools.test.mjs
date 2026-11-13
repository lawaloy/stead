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

const writeLockedSdkExcept = (sdk, skipName, skipDirectory) => {
  for (const [name, directory, revision = directory] of lockedPackages()) {
    if (name === skipName && directory === skipDirectory) continue;
    const path = join(sdk, name, directory);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'source.properties'),
      `Pkg.Path=android\nPkg.Revision=${revision}\n`,
    );
  }
};

test('Android build preflight fails closed when CI build-tools source.properties is missing', () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-build-sdk-missing-ci-build-tools-'),
  );
  try {
    writeLockedSdkExcept(
      sdk,
      'build-tools',
      TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION,
    );
    assert.throws(
      () => checkAndroidBuildSdk(sdk),
      new RegExp(
        `Install SDK package build-tools;${TOOLCHAIN.ANDROID_BUILD_TOOLS_VERSION} to match \\.github/ci\\.env\\.`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
