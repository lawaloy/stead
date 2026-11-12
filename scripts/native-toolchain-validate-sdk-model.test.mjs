import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdkLock, packageMetadata } from './android-sdk.mjs';
import { checkNativeToolchain } from './native-toolchain.mjs';
import { TOOLCHAIN } from './toolchain.mjs';

const writeReceiptTree = (directory) => {
  const { lock, digest } = sdkLock();
  writeFileSync(
    join(directory, '.stead-sdk.json'),
    JSON.stringify({ digest, platform: process.platform }),
  );
  for (const pkg of lock.packages) {
    const target = join(directory, ...pkg.path.split(';'));
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'source.properties'), 'fixture');
    writeFileSync(join(target, 'package.xml'), packageMetadata(lock, pkg));
  }
};

const androidPreflight = (sdk, execute) =>
  checkNativeToolchain('android', {
    requireDevice: false,
    requireBuild: true,
    requireMaestro: false,
    env: {
      ANDROID_HOME: sdk,
      STEAD_JAVA_BIN: 'java',
    },
    execute,
  });

test('Android source-build preflight runs sdkmanager against a locked receipt before Gradle packages', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-sdkmodel-'));
  writeReceiptTree(sdk);
  const commands = [];
  try {
    await assert.rejects(
      androidPreflight(sdk, async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'java')
          return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
        if (
          String(command).endsWith('sdkmanager') &&
          args.includes('--list_installed')
        )
          return 'Warning: Undefined ID for package emulator';
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      }),
      /Android SDK metadata could not be parsed/,
    );
    assert.equal(
      commands.some(
        ([command, ...args]) =>
          String(command).endsWith('sdkmanager') &&
          args.includes(`--sdk_root=${sdk}`) &&
          args.includes('--list_installed'),
      ),
      true,
    );
    assert.equal(
      commands.some(([command]) => String(command).endsWith('gradlew')),
      false,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});

test('Android source-build preflight skips sdkmanager when the dedicated receipt is absent', async () => {
  const sdk = mkdtempSync(join(tmpdir(), 'stead-android-noreceipt-'));
  const commands = [];
  try {
    await assert.rejects(
      androidPreflight(sdk, async (command, args = []) => {
        commands.push([command, ...args]);
        if (command === 'npm') return TOOLCHAIN.NPM_VERSION;
        if (command === 'java')
          return `OpenJDK Runtime Environment Temurin-${TOOLCHAIN.JAVA_VERSION}`;
        throw new Error(`Unexpected ${command} ${args.join(' ')}`);
      }),
      /Install SDK package build-tools/,
    );
    assert.equal(
      commands.some(([command]) => String(command).includes('sdkmanager')),
      false,
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
