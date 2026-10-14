import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionableSarifResults,
  checkCodeQL,
  snapshotSource,
} from './codeql-local.mjs';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CodeQL snapshots current edits and untracked source without including ignored local data', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead snapshot '));
  const root = join(directory, 'checkout'),
    output = join(directory, 'snapshot');
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'current.ts'), 'current working-tree edit');
  writeFileSync(join(root, 'new.mjs'), 'new source');
  writeFileSync(join(root, '.env'), 'local data');
  try {
    await snapshotSource(root, output, async (command, args) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, [
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
      ]);
      return 'src/current.ts\0new.mjs\0deleted.ts\0';
    });
    assert.equal(
      readFileSync(join(output, 'src', 'current.ts'), 'utf8'),
      'current working-tree edit',
    );
    assert.equal(readFileSync(join(output, 'new.mjs'), 'utf8'), 'new source');
    assert.equal(existsSync(join(output, '.env')), false);
    assert.equal(existsSync(join(output, 'deleted.ts')), false);
    await assert.rejects(
      snapshotSource(root, output, async () => '../outside.js\0'),
      /outside the checkout/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CodeQL results respect explicit and rule-default levels and accepted suppressions', () => {
  const runs = [
    {
      tool: {
        driver: {
          rules: [
            { id: 'default-error', defaultConfiguration: { level: 'error' } },
            { id: 'default-note', defaultConfiguration: { level: 'note' } },
          ],
        },
      },
      results: [
        { ruleId: 'explicit-error', level: 'error' },
        { ruleId: 'default-error' },
        { ruleId: 'default-note' },
        {
          ruleId: 'warning',
          level: 'warning',
          suppressions: [{ status: 'underReview' }],
        },
        {
          ruleId: 'suppressed',
          level: 'error',
          suppressions: [{ status: 'accepted' }],
        },
      ],
    },
  ];
  assert.deepEqual(
    actionableSarifResults({ runs }).map((result) => result.ruleId),
    ['explicit-error', 'default-error', 'warning'],
  );
});

test('an empty or invalid analysis cannot silently report no vulnerabilities', () => {
  assert.throws(() => actionableSarifResults({}));
  assert.throws(() => actionableSarifResults({ runs: [] }));
  assert.deepEqual(
    actionableSarifResults({ runs: [{ tool: { driver: {} }, results: [] }] }),
    [],
  );
});

test('CodeQL preflight blocks missing or mismatched versions', async () => {
  await assert.rejects(
    checkCodeQL({
      execute: async () => {
        throw new Error('not installed');
      },
    }),
    /Install the official/,
  );
  await assert.rejects(
    checkCodeQL({ execute: async () => JSON.stringify({ version: '1.0.0' }) }),
    /match CI/,
  );
});
