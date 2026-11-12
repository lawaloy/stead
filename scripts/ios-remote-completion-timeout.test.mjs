import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteIos } from './ios-remote.mjs';

const feature = 'a'.repeat(40);
const tree = 'c'.repeat(40);
const branch = 'validation/ios-test';

test('a dispatched iOS run that never completes is a failed preflight and keeps the remote ref', async () => {
  const calls = [];
  const saved = new Map();
  let clock = 0;
  const run = {
    databaseId: 123,
    headSha: feature,
    headBranch: branch,
    event: 'workflow_dispatch',
    status: 'in_progress',
    conclusion: '',
    url: 'https://github.com/owner/repo/actions/runs/123',
    jobs: [{ name: 'native-ios', status: 'in_progress', conclusion: '' }],
  };
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'git') {
      if (args[0] === 'status') return '';
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
      if (args[0] === 'rev-parse')
        return args[1].endsWith('^{tree}') ? tree : feature;
      return '';
    }
    assert.equal(command, 'gh');
    if (args[0] === 'repo') return JSON.stringify({ isPrivate: false });
    if (args[0] === 'workflow') return '';
    if (args[1] === 'list')
      return JSON.stringify([
        { databaseId: 123, headSha: feature, url: run.url },
      ]);
    if (args[1] === 'view') return JSON.stringify(run);
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };

  await assert.rejects(
    remoteIos({
      root: '/unused',
      iosEnabled: true,
      execute,
      token: 'test',
      log: () => {},
      sleep: async () => {
        clock += 3_600_000;
      },
      now: () => clock,
      save: (_directory, name, value) => saved.set(name, value),
    }),
    /Timed out waiting for iOS\. The remote run may still be active/,
  );

  const evidence = JSON.parse(saved.get('result.json'));
  assert.equal(evidence.status, 'failed');
  assert.match(evidence.error, /Timed out waiting for iOS/);
  assert.equal(
    calls.filter(({ args }) => args[0] === 'workflow').length,
    1,
    'completion timeout must not dispatch twice',
  );
  assert.equal(
    calls.filter(
      ({ command, args }) =>
        command === 'gh' && (args.includes('--log') || args[1] === 'download'),
    ).length,
    0,
    'a stuck run must not collect evidence after the completion deadline',
  );
  assert.ok(
    !calls.some(({ args }) => args.includes(`:refs/heads/${branch}`)),
    'the temporary ref must be retained for investigation',
  );
  assert.ok(
    clock >= 120 * 60_000,
    'the poll loop must wait the two-hour completion budget',
  );
});
