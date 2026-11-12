import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertIosRun } from './ios-remote.mjs';
import { ROOT } from './toolchain.mjs';

const configurationJob = readFileSync(
  join(ROOT, '.github/workflows/native-ci.yml'),
  'utf8',
).match(/^  config:\r?\n    name: ([^\r\n]+)/m)?.[1];
assert.ok(
  configurationJob,
  'Native CI must declare its configuration check name.',
);

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const branch = 'validation/ios-test';
const expected = { testedCommit: sha, remoteBranch: branch };

const passingJobs = [
  configurationJob,
  'build-ios',
  'native-ios',
  'Native Readiness',
  'build-android',
  'native-android',
].map((name) => ({
  name,
  status: 'completed',
  conclusion: name.includes('android') ? 'skipped' : 'success',
}));

const passingRun = (overrides = {}) => ({
  headSha: sha,
  headBranch: branch,
  event: 'workflow_dispatch',
  status: 'completed',
  conclusion: 'success',
  jobs: passingJobs,
  ...overrides,
});

test('remote iOS preflight accepts a matching workflow_dispatch run with required jobs', () => {
  assert.doesNotThrow(() => assertIosRun(passingRun(), expected));
});

test('remote iOS preflight refuses a successful run for a different commit, branch, or event', () => {
  for (const run of [
    passingRun({ headSha: otherSha }),
    passingRun({ headBranch: 'other' }),
    passingRun({ event: 'pull_request' }),
  ])
    assert.throws(
      () => assertIosRun(run, expected),
      /Remote run does not match the uploaded validation commit/,
    );
});

test('remote iOS preflight refuses a matching run that did not complete successfully', () => {
  for (const run of [
    passingRun({ conclusion: 'failure' }),
    passingRun({ conclusion: 'cancelled' }),
    passingRun({ status: 'in_progress', conclusion: '' }),
  ])
    assert.throws(
      () => assertIosRun(run, expected),
      /iOS validation did not pass/,
    );
});
