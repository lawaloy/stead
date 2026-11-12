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

const writeLockedSdk = (sdk, propertiesFor) => {
  for (const [name, directory, revision = directory] of lockedPackages()) {
    const path = join(sdk, name, directory);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'source.properties'),
      propertiesFor(name, directory, revision),
    );
  }
};

const pinnedProperties = (_name, _directory, revision) =>
  `Pkg.Path=android\nPkg.Revision=${revision}\n`;

test('Android build preflight fails closed when NDK Pkg.Revision is whitespace-only', () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-build-sdk-whitespace-ndk-'),
  );
  try {
    writeLockedSdk(sdk, (name, directory, revision) =>
      name === 'ndk'
        ? 'Pkg.Path=android\nPkg.Revision= \t \n'
        : pinnedProperties(name, directory, revision),
    );
    assert.throws(
      () => checkAndroidBuildSdk(sdk),
      new RegExp(
        `Use Android NDK ${TOOLCHAIN.ANDROID_NDK_VERSION} to match CI \\(found no version\\)`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android build preflight fails closed when CMake Pkg.Revision is whitespace-only', () => {
  const sdk = mkdtempSync(
    join(tmpdir(), 'stead-android-build-sdk-whitespace-cmake-'),
  );
  try {
    writeLockedSdk(sdk, (name, directory, revision) =>
      name === 'cmake'
        ? 'Pkg.Path=android\nPkg.Revision= \t \n'
        : pinnedProperties(name, directory, revision),
    );
    assert.throws(
      () => checkAndroidBuildSdk(sdk),
      new RegExp(
        `Use CMake ${TOOLCHAIN.ANDROID_CMAKE_VERSION} to match CI \\(found no version\\)`,
      ),
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
