import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/native-artifact-cleanup.yml', import.meta.url),
  'utf8',
).replace(/\r/g, '');
const marker = '          script: |\n';
const scriptStart = workflow.indexOf(marker);
assert.notEqual(scriptStart, -1, 'Cleanup workflow script block must exist.');
const script = workflow
  .slice(scriptStart + marker.length)
  .split('\n')
  .map((line) => line.slice(12))
  .join('\n');
const runCleanup = new Function(
  'github',
  'context',
  'core',
  `return (async () => {\n${script}\n})()`,
);

const sha = (character) => character.repeat(40);
const cancelledRun = (overrides = {}) => ({
  id: 101,
  event: 'pull_request',
  head_branch: 'feature/native-cleanup',
  head_sha: sha('a'),
  pull_requests: [{ number: 17 }],
  ...overrides,
});

const fixture = ({
  run = cancelledRun(),
  pull = { state: 'open', head: { sha: run.head_sha } },
  branch = { commit: { sha: run.head_sha } },
  artifacts = [],
  associated = [],
  pullError,
  branchError,
  deleteError,
} = {}) => {
  const calls = {
    artifactLists: [],
    deletes: [],
    infos: [],
    pullGets: [],
    warnings: [],
  };
  const listAssociated = () => {};
  const listArtifacts = () => {};
  const github = {
    paginate: async (method, args) => {
      if (method === listAssociated) return associated;
      if (method === listArtifacts) {
        calls.artifactLists.push(args);
        return artifacts;
      }
      throw new Error('Unexpected pagination method.');
    },
    rest: {
      repos: {
        listPullRequestsAssociatedWithCommit: listAssociated,
        getBranch: async () => {
          if (branchError) throw branchError;
          return { data: branch };
        },
      },
      pulls: {
        get: async (args) => {
          calls.pullGets.push(args);
          if (pullError) throw pullError;
          return { data: pull };
        },
      },
      actions: {
        listWorkflowRunArtifacts: listArtifacts,
        deleteArtifact: async (args) => {
          calls.deletes.push(args);
          if (deleteError) throw deleteError;
        },
      },
    },
  };
  const context = {
    payload: { workflow_run: run },
    repo: { owner: 'lawaloy', repo: 'stead' },
  };
  const core = {
    info: (message) => calls.infos.push(message),
    warning: (message) => calls.warnings.push(message),
  };

  return {
    calls,
    execute: () => runCleanup(github, context, core),
  };
};

test('cancelled current-head PR applications remain available for rerun', async () => {
  const { calls, execute } = fixture();
  await execute();
  assert.deepEqual(calls.artifactLists, []);
  assert.deepEqual(calls.deletes, []);
  assert.match(calls.infos.join('\n'), /retaining its applications for rerun/);
});

test('missing workflow payload metadata prefers an associated open PR', async () => {
  const run = cancelledRun({ pull_requests: [] });
  const { calls, execute } = fixture({
    run,
    associated: [
      { number: 16, state: 'closed', head: { sha: run.head_sha } },
      { number: 17, state: 'open', head: { sha: run.head_sha } },
    ],
  });
  await execute();
  assert.equal(calls.pullGets[0].pull_number, 17);
  assert.deepEqual(calls.artifactLists, []);
});

test('an advanced PR deletes only live simulator applications from its cancelled run', async () => {
  const { calls, execute } = fixture({
    pull: { state: 'open', head: { sha: sha('b') } },
    artifacts: [
      { id: 1, name: 'android-simulator-app', expired: false },
      { id: 2, name: 'ios-simulator-app', expired: false },
      { id: 3, name: 'ios-native-journey-logs', expired: false },
      { id: 4, name: 'android-simulator-app', expired: true },
    ],
  });
  await execute();
  assert.deepEqual(calls.artifactLists, [
    { owner: 'lawaloy', repo: 'stead', run_id: 101, per_page: 100 },
  ]);
  assert.deepEqual(
    calls.deletes.map(({ artifact_id }) => artifact_id),
    [1, 2],
  );
});

test('closed PR and deleted branch applications are obsolete', async () => {
  const closed = fixture({
    pull: { state: 'closed', head: { sha: sha('a') } },
    artifacts: [{ id: 5, name: 'ios-simulator-app', expired: false }],
  });
  await closed.execute();
  assert.deepEqual(
    closed.calls.deletes.map(({ artifact_id }) => artifact_id),
    [5],
  );

  const deletedBranch = fixture({
    run: cancelledRun({
      event: 'workflow_dispatch',
      pull_requests: [],
    }),
    branchError: Object.assign(new Error('Not Found'), { status: 404 }),
    artifacts: [{ id: 6, name: 'android-simulator-app', expired: false }],
  });
  await deletedBranch.execute();
  assert.deepEqual(
    deletedBranch.calls.deletes.map(({ artifact_id }) => artifact_id),
    [6],
  );
});

test('lookup uncertainty retains cancelled applications', async () => {
  const { calls, execute } = fixture({
    pullError: new Error('API unavailable'),
  });
  await execute();
  assert.deepEqual(calls.artifactLists, []);
  assert.deepEqual(calls.deletes, []);
  assert.match(calls.warnings.join('\n'), /retaining its applications/);
});

test('an artifact deletion race is accepted only when the artifact is already gone', async () => {
  const gone = fixture({
    pull: { state: 'closed', head: { sha: sha('a') } },
    artifacts: [{ id: 7, name: 'ios-simulator-app', expired: false }],
    deleteError: Object.assign(new Error('Not Found'), { status: 404 }),
  });
  await gone.execute();
  assert.match(gone.calls.infos.join('\n'), /already deleted or expired/);

  const denied = fixture({
    pull: { state: 'closed', head: { sha: sha('a') } },
    artifacts: [{ id: 8, name: 'ios-simulator-app', expired: false }],
    deleteError: Object.assign(new Error('Forbidden'), { status: 403 }),
  });
  await assert.rejects(denied.execute(), /Forbidden/);
});
