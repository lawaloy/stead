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
  tested = 'd'.repeat(40);
const branch = 'validation/ios-test';
const fixture = (overrides = {}) => {
  const calls = [],
    saved = new Map();
  let inspected = 0,
    clock = 0;
  const run = {
    headSha: tested,
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
      if (args[0] === 'status') return overrides.dirty ? ' M source.js' : '';
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git';
      if (args[0] === 'rev-parse') {
        if (args[1] === 'FETCH_HEAD') return base;
        return inspected++ && overrides.changedHead ? base : feature;
      }
      if (args[0] === 'merge-tree') {
        if (overrides.conflict) throw new Error('merge conflict');
        return tree;
      }
      if (args[0] === 'commit-tree') return tested;
      if (args[0] === 'ls-remote')
        return `${overrides.changedMain ? feature : base}\trefs/heads/main`;
      return '';
    }
    assert.equal(command, 'gh');
    if (args[0] === 'repo') {
      assert.deepEqual(args, [
        'repo',
        'view',
        'owner/repo',
        '--json',
        'isPrivate,defaultBranchRef',
      ]);
      return JSON.stringify({
        isPrivate: !!overrides.private,
        defaultBranchRef: { name: 'main' },
      });
    }
    if (args[0] === 'workflow') {
      if (overrides.dispatchFailure) throw new Error('dispatch rejected');
      return '';
    }
    if (args[1] === 'list')
      return JSON.stringify([
        { databaseId: 123, headSha: tested, url: run.url },
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

test('remote iOS validates an integration commit, collects evidence, and deletes only its owned ref', async () => {
  const f = fixture();
  const result = await f.start();
  assert.equal(result.status, 'passed');
  assert.equal(result.featureCommit, feature);
  assert.equal(result.baseCommit, base);
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
});

test('dirty checkouts, private repositories and merge conflicts never upload source', async () => {
  for (const scenario of [
    { dirty: true },
    { private: true },
    { conflict: true },
  ]) {
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
    { headSha: feature },
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

test('changed source, moving main and missing evidence fail and retain the remote ref', async () => {
  for (const scenario of [
    { changedHead: true },
    { changedMain: true },
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

test('real git integration trees include both branches without modifying checkout or index; conflicts fail', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stead-ios-integration-'));
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
    const original = await git('rev-parse', 'HEAD');
    await git('switch', '-c', 'feature');
    writeFileSync(join(directory, 'feature'), 'feature\n');
    await git('add', '.');
    await git('commit', '-m', 'feature');
    const featureCommit = await git('rev-parse', 'HEAD');
    await git('switch', 'main');
    writeFileSync(join(directory, 'main'), 'main\n');
    await git('add', '.');
    await git('commit', '-m', 'main');
    const baseCommit = await git('rev-parse', 'HEAD');
    await git('switch', 'feature');
    const merged = await git(
      'merge-tree',
      '--write-tree',
      featureCommit,
      baseCommit,
    );
    assert.equal(await git('show', `${merged}:feature`), 'feature');
    assert.equal(await git('show', `${merged}:main`), 'main');
    assert.equal(await git('rev-parse', 'HEAD'), featureCommit);
    assert.equal(await git('status', '--porcelain'), '');
    assert.equal(readFileSync(join(directory, 'shared'), 'utf8'), 'original\n');
    writeFileSync(join(directory, 'shared'), 'feature version\n');
    await git('add', '.');
    await git('commit', '-m', 'conflict feature');
    const conflict = await git('rev-parse', 'HEAD');
    await git('switch', '-c', 'conflicting-main', original);
    writeFileSync(join(directory, 'shared'), 'main version\n');
    await git('add', '.');
    await git('commit', '-m', 'conflict main');
    await assert.rejects(git('merge-tree', '--write-tree', conflict, 'HEAD'));
    assert.equal(await git('status', '--porcelain'), '');
    assert.equal(
      readFileSync(join(directory, 'shared'), 'utf8'),
      'main version\n',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
