import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand, spawnOwned, stopOwned } from './process-utils.mjs';

test(
  'spawnOwned reports the terminating signal instead of a null exit code',
  { skip: process.platform === 'win32' },
  async () => {
    const child = spawnOwned(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: 'ignore' },
    );
    try {
      process.kill(child.pid, 'SIGTERM');
      await assert.rejects(child.completion, (error) => {
        assert.match(error.message, /failed \(SIGTERM\)/);
        assert.doesNotMatch(error.message, /exit null/);
        return true;
      });
    } finally {
      await stopOwned(child);
    }
  },
);

test(
  'runCommand preserves terminating-signal diagnostics',
  { skip: process.platform === 'win32' },
  async () => {
    await assert.rejects(
      runCommand(
        process.execPath,
        ['-e', 'process.kill(process.pid, "SIGTERM")'],
        { quiet: true },
      ),
      (error) => {
        assert.match(error.message, /failed \(SIGTERM\)/);
        assert.doesNotMatch(error.message, /exit null/);
        return true;
      },
    );
  },
);
