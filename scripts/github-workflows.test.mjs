import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './toolchain.mjs';

// Execute the actual workflow bodies, with every GitHub write intercepted.
const script = (file, step) => {
  const lines = readFileSync(
    join(ROOT, '.github/workflows', file),
    'utf8',
  ).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `- name: ${step}`);
  assert.ok(start >= 0);
  const index = lines.findIndex(
    (line, i) => i > start && line.trim() === 'script: |',
  );
  assert.ok(index > start);
  const body = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && !line.startsWith('            ')) break;
    body.push(line.slice(12));
  }
  return new (Object.getPrototypeOf(async function () {}).constructor)(
    'github',
    'context',
    'core',
    'process',
    'require',
    'setTimeout',
    body.join('\n'),
  );
};
const context = { repo: { owner: 'owner', repo: 'stead' }, payload: {} };
const finish = script('pr-auto-finish-reusable.yml', 'Merge PR when ready');
const required = [
  'ci',
  'native-ci',
  'CodeQL Advanced',
  'Dependency review',
  'Dependency Audit',
];
const pr = () => ({
  state: 'open',
  draft: false,
  user: { login: 'dependabot[bot]' },
  labels: [],
  head: { sha: 'current', ref: 'dependabot/npm/mobile/expo' },
  base: { ref: 'main' },
  mergeable_state: 'clean',
});
const runs = () =>
  required.map((name) => ({
    name,
    head_sha: 'current',
    status: 'completed',
    conclusion: 'success',
  }));
const runFinish = async (pull = pr(), workflows = runs()) => {
  const writes = [];
  const requests = [];
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: pull }),
        merge: async (args) => writes.push(['merge', args]),
        updateBranch: async (args) => writes.push(['update', args]),
      },
      actions: { listWorkflowRunsForRepo: () => {} },
      issues: {
        listComments: () => {},
        createComment: async (args) => writes.push(['comment', args]),
        addLabels: async (args) => writes.push(['label', args]),
      },
    },
    paginate: async (endpoint, args) => {
      requests.push(args);
      return endpoint === github.rest.actions.listWorkflowRunsForRepo
        ? workflows.filter((run) => run.head_sha === args.head_sha)
        : [];
    },
  };
  await finish(
    github,
    context,
    { info: () => {} },
    { env: { LANE: 'auto', PULL_NUMBER: '42' } },
    () => {
      throw Error('Unexpected require');
    },
    (callback) => queueMicrotask(callback),
  );
  return { writes, requests };
};
test('automation never merges human PRs, drafts, closed PRs or blocked bot PRs', async () => {
  for (const override of [
    { user: { login: 'human' } },
    { draft: true },
    { state: 'closed' },
    { labels: [{ name: 'automerge-blocked' }] },
  ])
    assert.deepEqual((await runFinish({ ...pr(), ...override })).writes, []);
});
test('automation refuses missing, pending, failed, cancelled and stale-head workflows', async () => {
  for (const workflows of [
    runs().slice(1),
    runs().map((run) => ({ ...run, status: 'in_progress' })),
    runs().map((run) => ({ ...run, conclusion: 'failure' })),
    runs().map((run) => ({ ...run, conclusion: 'cancelled' })),
    runs().map((run) => ({ ...run, head_sha: 'old' })),
  ])
    assert.deepEqual((await runFinish(pr(), workflows)).writes, []);
});
test('automation requests checks for the current head and binds a merge to that same SHA', async () => {
  const { writes, requests } = await runFinish();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][1].sha, 'current');
  assert.equal(requests[0].head_sha, 'current');
});
test('behind Dependabot branches wait without merging or updating the branch', async () => {
  assert.deepEqual(
    (await runFinish({ ...pr(), mergeable_state: 'behind' })).writes,
    [],
  );
});

const describe = script('pr-description.yml', 'Update PR description');
const runDescription = async (body, auto, action = 'synchronize') => {
  const writes = [];
  await describe(
    { rest: { pulls: { update: async (args) => writes.push(args) } } },
    { ...context, payload: { action, pull_request: { number: 42, body } } },
    { info: () => {} },
    { env: {} },
    (name) => {
      assert.equal(name, 'fs');
      return { readFileSync: () => auto };
    },
    (callback) => queueMicrotask(callback),
  );
  return writes;
};
test('description sync preserves human content around the generated block', async () => {
  const before = '## What + Why\n\n- Fix validation.';
  const after = '## Checks\n\n- Verified locally.';
  const writes = await runDescription(
    `${before}\n\n<!-- AUTO:START -->\nold\n<!-- AUTO:END -->\n\n${after}`,
    'new',
  );
  assert.equal(writes.length, 1);
  assert.ok(writes[0].body.startsWith(before));
  assert.ok(writes[0].body.endsWith(after));
  assert.ok(!writes[0].body.includes('\nold\n'));
});
test('description sync waits for a filled What + Why and truncates whole generated lines', async () => {
  assert.deepEqual(
    await runDescription('## What + Why\n\n- \n\n## Checks\n', 'generated'),
    [],
  );
  const [write] = await runDescription(
    '## What + Why\n\n- Content.',
    '- `mobile/src/a-long-path.ts`\n'.repeat(100),
  );
  assert.ok(write.body.includes('\n\n...'));
  assert.ok(!write.body.includes('`mobile/src/a-long-path\n'));
});
