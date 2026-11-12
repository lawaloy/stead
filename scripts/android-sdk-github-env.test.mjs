import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdkLock, packageMetadata, installAndroidSdk } from './android-sdk.mjs';
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

test('a cached dedicated SDK records ANDROID_HOME and tool paths for GitHub Actions', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead sdk github env '));
  const directory = join(root, 'sdk');
  const githubEnv = join(root, 'github.env');
  const githubPath = join(root, 'github.path');
  mkdirSync(directory);
  writeReceiptTree(directory);
  writeFileSync(githubEnv, '');
  writeFileSync(githubPath, '');

  const previousEnv = process.env.GITHUB_ENV;
  const previousPath = process.env.GITHUB_PATH;
  process.env.GITHUB_ENV = githubEnv;
  process.env.GITHUB_PATH = githubPath;
  try {
    assert.equal(await installAndroidSdk({ directory }), directory);
    assert.equal(
      readFileSync(githubEnv, 'utf8'),
      `ANDROID_HOME=${directory}\nANDROID_SDK_ROOT=${directory}\n`,
    );
    assert.equal(
      readFileSync(githubPath, 'utf8'),
      [
        join(directory, 'platform-tools'),
        join(directory, 'emulator'),
        join(
          directory,
          'cmdline-tools',
          TOOLCHAIN.ANDROID_CMDLINE_TOOLS_VERSION,
          'bin',
        ),
      ]
        .map((path) => `${path}\n`)
        .join(''),
    );
  } finally {
    if (previousEnv === undefined) delete process.env.GITHUB_ENV;
    else process.env.GITHUB_ENV = previousEnv;
    if (previousPath === undefined) delete process.env.GITHUB_PATH;
    else process.env.GITHUB_PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
});
