import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnOwned, stopOwned, runCommand } from './process-utils.mjs';
import { waitForBuildExit, buildAndroidGradle } from './native-gradle.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Gradle children receive the checked SDK when the host has no SDK variables or conflicting defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead gradle sdk '));
  const sdk = join(root, 'locked-sdk');
  const output = join(root, 'child-sdk.json');
  try {
    for (const inherited of [
      {},
      { ANDROID_HOME: '/legacy', ANDROID_SDK_ROOT: '/other' },
    ]) {
      await buildAndroidGradle({
        directory: root,
        sdk,
        env: inherited,
        execute: async (_command, args, options) => {
          const pidFile = args
            .find((arg) => arg.startsWith('-Dstead.native.build.pidFile='))
            .split('=')
            .slice(1)
            .join('=');
          await runCommand(
            process.execPath,
            [
              '-e',
              `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));fs.writeFileSync(${JSON.stringify(output)},JSON.stringify([process.env.ANDROID_HOME,process.env.ANDROID_SDK_ROOT]));`,
            ],
            options,
          );
        },
      });
      assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), [sdk, sdk]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native startup waits for an outliving build process to actually exit', async () => {
  const child = spawnOwned(process.execPath, [
    '-e',
    'setTimeout(() => {}, 250)',
  ]);
  try {
    await waitForBuildExit(child.pid, 10_000);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    await child.completion;
  } finally {
    await stopOwned(child);
  }
});

test('a stuck build blocks startup and invalid process identifiers are rejected', async () => {
  for (const pid of [0, 1, -1, NaN, 1.5, process.pid])
    await assert.rejects(waitForBuildExit(pid), /Invalid Gradle build JVM/);
  const child = spawnOwned(process.execPath, [
    '-e',
    'setTimeout(() => {}, 5000)',
  ]);
  try {
    await assert.rejects(waitForBuildExit(child.pid, 20), /startup is blocked/);
    process.kill(child.pid, 0);
  } finally {
    await stopOwned(child);
  }
});
