import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { githubRepository, remoteIos } from './ios-remote.mjs';
import { runCommand } from './process-utils.mjs';

const feature = 'a'.repeat(40),
  base = 'b'.repeat(40),
  tree = 'c'.repeat(40),
  tested = feature;
const branch = 'validation/ios-test';
const fixture = (overrides = {}) => {
  const calls = [],
    saved = new Map();
  let inspected = 0,
    clock = 0;
  const run = {
    headSha: overrides.commit ?? tested,
    headBranch: branch,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    url: 'https://github.com/owner/repo/actions/runs/123',
    jobs: [
      'config',
      'build-ios',
      'native-ios',
      'build-android',
      'native-android',
    ].map((name) => ({
      name,
      status: 'completed',
      conclusion: name.includes('android') ? 'skipped' : 'success',
    })),
    ...overrides.run,
  };
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === 'git') {
      if (overrides.executeGit) return overrides.executeGit(args, options);
      if (args[0] === 'status') return overrides.dirty ? ' M source.js' : '';
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
      if (args[0] === 'rev-parse') {
        if (args[1].endsWith('^{tree}')) return tree;
        return inspected++ && overrides.changedHead ? base : feature;
      }
      return '';
    }
    assert.equal(command, 'gh');
    if (args[0] === 'repo') {
      assert.deepEqual(args, [
        'repo',
        'view',
        'owner/repo',
        '--json',
        'isPrivate',
      ]);
      return JSON.stringify({
        isPrivate: !!overrides.private,
      });
    }
    if (args[0] === 'workflow') {
      if (overrides.dispatchFailure) throw new Error('dispatch rejected');
      return '';
    }
    if (args[1] === 'list')
      return JSON.stringify([
        { databaseId: 123, headSha: overrides.commit ?? tested, url: run.url },
      ]);
    if (args.includes('--log')) return 'Assert dashboard visible ... COMPLETED';
    if (args[1] === 'view') return JSON.stringify(run);
    if (args[1] === 'download' && overrides.artifactFailure)
      throw new Error('artifact missing');
    return '';
  };
  const start = () =>
    remoteIos({
      root: '/unused',
      execute,
      token: 'test',
      log: () => {},
      sleep: async () => {
        clock += 3_600_000;
      },
      now: () => clock,
      save: (directory, name, value) => saved.set(name, value),
    });
  const result = () => JSON.parse(saved.get('result.json'));
  return { start, calls, saved, result };
};

test('remote iOS tests exactly HEAD, collects evidence, and deletes only its owned ref', async () => {
  const f = fixture();
  const result = await f.start();
  assert.equal(result.status, 'passed');
  assert.equal(result.featureCommit, feature);
  assert.equal(result.baseCommit, undefined);
  assert.equal(result.tree, tree);
  assert.equal(result.testedCommit, tested);
  assert.equal(result.remoteBranchDeleted, true);
  assert.ok(
    f.calls.some(
      ({ args }) =>
        args.includes('--ref') &&
        args.includes(branch) &&
        args.includes('platform=ios'),
    ),
  );
  const pushes = f.calls.filter(
    ({ command, args }) => command === 'git' && args[0] === 'push',
  );
  assert.deepEqual(
    pushes.map(({ args }) => args),
    [
      [
        'push',
        `--force-with-lease=refs/heads/${branch}:`,
        'origin',
        `${tested}:refs/heads/${branch}`,
      ],
      [
        'push',
        `--force-with-lease=refs/heads/${branch}:${tested}`,
        'origin',
        `:refs/heads/${branch}`,
      ],
    ],
  );
  assert.ok(f.saved.get('workflow.log').includes('COMPLETED'));
  assert.ok(
    !f.calls.some(
      ({ command, args }) =>
        command === 'git' &&
        ['fetch', 'merge', 'rebase', 'merge-tree', 'commit-tree'].includes(
          args[0],
        ),
    ),
  );
});

test('dirty checkouts and private repositories never upload source', async () => {
  for (const scenario of [{ dirty: true }, { private: true }]) {
    const f = fixture(scenario);
    await assert.rejects(f.start());
    assert.ok(
      !f.calls.some(({ args }) => ['push', 'workflow'].includes(args[0])),
    );
  }
});

test('failed, cancelled, unrelated, skipped and incomplete native runs never produce a pass', async () => {
  for (const run of [
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { headSha: base },
    { headBranch: 'other' },
    { event: 'pull_request' },
    { jobs: [] },
    {
      jobs: [
        { name: 'native-ios', status: 'completed', conclusion: 'skipped' },
      ],
    },
  ]) {
    const f = fixture({ run });
    await assert.rejects(f.start());
    assert.equal(f.result().status, 'failed');
    assert.ok(
      !f.calls.some(({ args }) => args.includes(`:refs/heads/${branch}`)),
    );
    assert.ok(f.saved.has('workflow.log'), 'failure logs must be retained');
  }
});

test('changed source and missing evidence fail and retain the remote ref', async () => {
  for (const scenario of [
    { changedHead: true },
    { artifactFailure: true },
    { dispatchFailure: true },
  ]) {
    const f = fixture(scenario);
    await assert.rejects(f.start());
    assert.equal(f.result().status, 'failed');
    assert.ok(
      !f.calls.some(({ args }) => args.includes(`:refs/heads/${branch}`)),
    );
  }
});

test('remote polling is bounded and a timed-out remote run is never treated as passed', async () => {
  const f = fixture({ run: { status: 'in_progress', conclusion: '' } });
  await assert.rejects(f.start(), /Timed out waiting/);
  assert.equal(f.result().status, 'failed');
  assert.equal(f.result().runId, 123);
});

test('repository URL parsing accepts GitHub HTTPS and SSH without accepting other hosts or options', () => {
  for (const url of [
    'https://github.com/owner/repo.git',
    'git@github.com:owner/repo.git',
    'https://github.com/owner/repo',
  ])
    assert.equal(githubRepository(url), 'owner/repo');
  for (const url of [
    'https://github.com.evil/owner/repo',
    '--option',
    'https://token@github.com/owner/repo',
    'git@other:owner/repo.git',
  ])
    assert.throws(() => githubRepository(url));
});

test('a diverged main is never combined with the real checked-out feature commit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-snapshot-'));
  const git = async (...args) =>
    (
      await runCommand('git', args, {
        cwd: directory,
        quiet: true,
        stdoutOnly: true,
      })
    ).trim();
  try {
    await git('init', '-b', 'main');
    await git('config', 'user.name', 'Test');
    await git('config', 'user.email', 'test@example.invalid');
    writeFileSync(join(directory, 'shared'), 'original\n');
    await git('add', '.');
    await git('commit', '-m', 'base');
    await git('switch', '-c', 'feature');
    writeFileSync(join(directory, 'shared'), 'feature version\n');
    await git('add', '.');
    await git('commit', '-m', 'feature');
    const featureCommit = await git('rev-parse', 'HEAD');
    await git('switch', 'main');
    writeFileSync(join(directory, 'shared'), 'conflicting main version\n');
    await git('add', '.');
    await git('commit', '-m', 'main');
    await git('switch', 'feature');
    const f = fixture({
      commit: featureCommit,
      executeGit: async (args) => {
        if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
        if (args[0] === 'push') return '';
        assert.ok(
          ['status', 'rev-parse'].includes(args[0]),
          'validation must only inspect the checkout',
        );
        return git(...args);
      },
    });
    const result = await f.start();
    assert.equal(result.testedCommit, featureCommit);
    assert.equal(
      result.tree,
      await git('rev-parse', `${featureCommit}^{tree}`),
    );
    assert.equal(await git('rev-parse', 'HEAD'), featureCommit);
    assert.equal(await git('status', '--porcelain'), '');
    assert.equal(
      readFileSync(join(directory, 'shared'), 'utf8').trim(),
      'feature version',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
