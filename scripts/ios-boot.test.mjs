import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeIosBoot } from './ios-setup.mjs';

const owned = '00000000-0000-4000-8000-000000000002';

test('simulator boot deadline preserves migration details and still cleans its own device', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-boot-'));
  const cleanup = [];
  try {
    await assert.rejects(
      probeIosBoot({
        directory,
        env: {},
        timeoutMs: 20,
        execute: async (command, args, options) => {
          if (command !== 'xcrun') return 'host snapshot';
          if (args[1] === 'create') return owned;
          if (args[1] === 'bootstatus')
            await new Promise((resolve, reject) =>
              options.signal.addEventListener(
                'abort',
                () =>
                  reject(
                    new Error('Waiting on Data Migration: KeychainMigrator'),
                  ),
                { once: true },
              ),
            );
          if (['shutdown', 'delete'].includes(args[1])) cleanup.push(args);
          return '';
        },
      }),
      /boot exceeded 20 ms.*KeychainMigrator/,
    );
    assert.deepEqual(cleanup, [
      ['simctl', 'shutdown', owned],
      ['simctl', 'delete', owned],
    ]);
    const evidence = JSON.parse(
      readFileSync(join(directory, 'boot.json'), 'utf8'),
    );
    assert.equal(evidence.passed, false);
    assert.equal(evidence.diagnostics.beforeBoot.sysctl, 'host snapshot');
    assert.match(evidence.failure, /Data Migration/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a simulator cleanup failure cannot be reported as a successful boot probe', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-clean-'));
  try {
    await assert.rejects(
      probeIosBoot({
        directory,
        env: {},
        execute: async (command, args) => {
          if (args[1] === 'create') return owned;
          if (args[1] === 'delete') throw new Error('delete stuck');
          return '';
        },
      }),
      /delete stuck/,
    );
    assert.equal(
      JSON.parse(readFileSync(join(directory, 'boot.json'), 'utf8')).passed,
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
