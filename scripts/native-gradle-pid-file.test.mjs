import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAndroidGradle, waitForBuildExit } from './native-gradle.mjs';

test('Gradle cleanup fails closed when the recorded JVM identifier is unusable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'stead gradle garbage pid '));
  try {
    await assert.rejects(
      buildAndroidGradle({
        directory: root,
        sdk: join(root, 'sdk'),
        env: {},
        execute: async (_command, args) => {
          const pidFile = args
            .find((arg) => arg.startsWith('-Dstead.native.build.pidFile='))
            .split('=')
            .slice(1)
            .join('=');
          writeFileSync(pidFile, 'not-a-pid\n');
        },
      }),
      /Invalid Gradle build JVM/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a live Gradle JVM that cannot be signaled fails closed instead of blocking startup', async () => {
  const error = new Error('Operation not permitted');
  error.code = 'EPERM';
  await assert.rejects(
    waitForBuildExit(4242, 1_000, () => {
      throw error;
    }),
    (thrown) => thrown === error,
  );
});
