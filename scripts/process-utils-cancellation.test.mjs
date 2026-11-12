import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand, spawnOwned } from './process-utils.mjs';

test('spawnOwned and runCommand do not start a child when the signal is already aborted', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead abort before spawn '));
  const marker = join(directory, 'ran');
  const controller = new AbortController();
  controller.abort();
  try {
    assert.throws(
      () =>
        spawnOwned(
          process.execPath,
          [
            '-e',
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`,
          ],
          { signal: controller.signal },
        ),
      (error) => error.name === 'AbortError',
    );
    await assert.rejects(
      runCommand(
        process.execPath,
        [
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`,
        ],
        { quiet: true, signal: controller.signal },
      ),
      (error) => error.name === 'AbortError',
    );
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  'runCommand fails closed when an aborted child still exits 0',
  { timeout: 15_000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'stead abort after success '));
    const ready = join(directory, 'ready');
    const controller = new AbortController();
    try {
      const command = runCommand(
        process.execPath,
        [
          '-e',
          `process.on('SIGTERM',()=>process.exit(0));require('node:fs').writeFileSync(${JSON.stringify(ready)},'1');setTimeout(()=>{},30000)`,
        ],
        { quiet: true, signal: controller.signal },
      );
      const deadline = Date.now() + 5_000;
      while (!existsSync(ready)) {
        if (Date.now() >= deadline)
          throw new Error('child did not become ready before abort');
        await delay(10);
      }
      controller.abort();
      await assert.rejects(command, /aborted/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
