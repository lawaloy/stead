import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requiresNative,
  parsePushRefs,
  verifyPush,
} from './pre-push-verification.mjs';

test('pre-push refuses dirty trees and refs other than the checked-out commit before running checks', async () => {
  const sha = 'a'.repeat(40),
    zero = '0'.repeat(40);
  const input = `refs/heads/test ${sha} refs/heads/test ${zero}`;
  let checks = 0;
  await assert.rejects(
    verifyPush(input, {
      executeGit: async () => ' M changed.js',
      execute: async () => checks++,
    }),
    /Commit or stash/,
  );
  await assert.rejects(
    verifyPush(input, {
      executeGit: async (args) => (args[0] === 'status' ? '' : 'b'.repeat(40)),
      execute: async () => checks++,
    }),
    /Check out/,
  );
  assert.equal(checks, 0);
});

test('later pushes still run native checks for native changes already present on the PR branch', async () => {
  const head = 'a'.repeat(40),
    remote = 'b'.repeat(40),
    main = 'c'.repeat(40);
  const checks = [],
    bases = [];
  await verifyPush(`refs/heads/test ${head} refs/heads/test ${remote}`, {
    executeGit: async (args) => {
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-parse') return head;
      if (args[0] === 'merge-base') return main;
      if (args[0] === 'diff') {
        bases.push(args[3]);
        return args[3] === main
          ? 'mobile/src/auth/token-store.ts\0'
          : 'README.md\0';
      }
      if (args[2] === 'stead.nativePlatforms') return 'android';
      if (args[2] === 'stead.nativeRepeat') return '3';
      throw new Error('unset config');
    },
    execute: async (command, args) => checks.push({ command, args }),
  });
  assert.deepEqual(bases, [main, remote]);
  assert.equal(checks.length, 1);
  assert.deepEqual(checks[0].args, [
    'run',
    'verify:local',
    '--',
    '--platform',
    'android',
    '--api-port',
    '3000',
    '--repeat',
    '3',
  ]);
});

test('pre-push uses the same native include/exclude policy as CI', () => {
  for (const path of [
    'package.json',
    'package-lock.json',
    'mobile/app/(app)/transactions.tsx',
    'api/src/auth/auth.service.ts',
    'scripts/native-workflow.mjs',
    'scripts/process-utils.mjs',
    'scripts/ios-simulator-entitlements.mjs',
    '.github/ci.env',
  ])
    assert.equal(requiresNative([path]), true, path);
  for (const path of [
    'docs/overview.md',
    'mobile/src/__tests__/token-store.test.ts',
    'scripts/native-config.test.mjs',
  ])
    assert.equal(requiresNative([path]), false, path);
});

test('push ref parsing preserves new-branch and deletion information and rejects invalid SHAs', () => {
  const sha = 'a'.repeat(40),
    zero = '0'.repeat(40);
  const refs = parsePushRefs(
    `refs/heads/local ${sha} refs/heads/local ${zero}\n(delete) ${zero} refs/heads/old ${sha}\n`,
  );
  assert.equal(refs[0].localSha, sha);
  assert.equal(refs[0].remoteSha, zero);
  assert.equal(refs[1].localSha, zero);
  assert.throws(() => parsePushRefs('refs/heads/a not-a-sha refs/heads/a 123'));
  assert.deepEqual(parsePushRefs(''), []);
});
