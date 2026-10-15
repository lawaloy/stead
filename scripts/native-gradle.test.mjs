import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnOwned, stopOwned } from './process-utils.mjs';
import { waitForBuildExit } from './native-gradle.mjs';

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
