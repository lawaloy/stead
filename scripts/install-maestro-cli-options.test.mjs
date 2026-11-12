import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCommand } from './process-utils.mjs';

const script = fileURLToPath(new URL('./install-maestro.mjs', import.meta.url));

test('Maestro installer CLI refuses omitted or unknown options before downloading', async () => {
  for (const args of [
    ['--directory'],
    ['--archive'],
    ['--help'],
    ['--foo', 'bar'],
  ]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      await assert.rejects(
        runCommand(process.execPath, [script, ...args], {
          quiet: true,
          signal: controller.signal,
        }),
        /Use --directory <empty path> and optionally --archive/,
      );
    } finally {
      clearTimeout(timer);
    }
  }
});
