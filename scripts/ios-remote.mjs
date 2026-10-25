import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN } from './toolchain.mjs';
import { runCommand } from './process-utils.mjs';

const WORKFLOW = 'native-ci.yml';
const SHA = /^[a-f0-9]{40}$/;
const TRANSIENT_GITHUB_ERROR =
  /TLS handshake timeout|ETIMEDOUT|ECONNRESET|connection reset|temporary failure|Bad Gateway|Service Unavailable|Gateway Timeout|\b50[234]\b/i;

export const retryGitHubRead = async (
  operation,
  { attempts = 4, sleep = delay } = {},
) => {
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      failure = error;
      if (attempt === attempts || !TRANSIENT_GITHUB_ERROR.test(error.message))
        throw error;
      await sleep(2 ** (attempt - 1) * 1_000);
    }
  }
  throw failure;
};

export const githubRepository = (url) => {
  const match = url.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
  );
  if (!match) throw new Error('origin must be a github.com repository URL.');
  return match[1];
};
const commit = (value) => {
  if (!SHA.test(value))
    throw new Error('Git returned an invalid commit/tree SHA.');
  return value;
};

export const assertIosRun = (run, expected) => {
  if (
    run.headSha !== expected.testedCommit ||
    run.headBranch !== expected.remoteBranch ||
    run.event !== 'workflow_dispatch'
  )
    throw new Error(
      'Remote run does not match the uploaded validation commit.',
    );
  if (run.status !== 'completed' || run.conclusion !== 'success')
    throw new Error(
      `iOS validation did not pass (${run.conclusion || run.status}).`,
    );
  for (const name of [
    'config',
    'build-ios',
    'native-ios',
    'Native Readiness',
  ]) {
    const job = run.jobs.find((job) => job.name === name);
    if (job?.status !== 'completed' || job.conclusion !== 'success')
      throw new Error(`Required job ${name} did not pass.`);
  }
  for (const name of ['build-android', 'native-android']) {
    if (run.jobs.find((job) => job.name === name)?.conclusion !== 'skipped')
      throw new Error(`Expected ${name} to be skipped for this iOS-only run.`);
  }
};

export const remoteIos = async ({
  root = ROOT,
  iosEnabled = TOOLCHAIN.IOS_NATIVE_ENABLED === 'true',
  execute = runCommand,
  sleep = delay,
  log = console.log,
  now = Date.now,
  token = `${Date.now()}-${randomBytes(4).toString('hex')}`,
  save = (directory, name, value) => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, name), value);
  },
} = {}) => {
  if (!iosEnabled)
    throw new Error(
      'Native iOS CI is disabled by its emergency switch. No code was uploaded and no run was started. See docs/developer-automation.md.',
    );
  const command = async (name, args, options = {}) =>
    (
      await execute(name, args, {
        cwd: root,
        quiet: true,
        stdoutOnly: true,
        ...options,
      })
    ).trim();
  const git = (...args) => command('git', args);
  const clean = async () => {
    if (await git('status', '--porcelain', '--untracked-files=all'))
      throw new Error(
        'Commit your changes first, including untracked source files. Ignored files are never uploaded.',
      );
  };
  await clean();
  const featureCommit = commit(await git('rev-parse', 'HEAD'));
  const repository = githubRepository(await git('remote', 'get-url', 'origin'));
  const gh = (...args) => command('gh', [...args, '--repo', repository]);
  const ghRead = (...args) => retryGitHubRead(() => gh(...args), { sleep });
  // Use gh's credential store; no token is read, printed or passed on the command line.
  const info = JSON.parse(
    await retryGitHubRead(
      () => command('gh', ['repo', 'view', repository, '--json', 'isPrivate']),
      { sleep },
    ),
  );
  if (info.isPrivate)
    throw new Error(
      'This free preflight requires a public repository with standard GitHub-hosted runners.',
    );
  const tree = commit(await git('rev-parse', `${featureCommit}^{tree}`));
  const testedCommit = featureCommit;
  const remoteBranch = `validation/ios-${token}`;
  const directory = join(root, '.tmp', 'ios-remote', token);
  const evidence = {
    repository,
    featureCommit,
    tree,
    testedCommit,
    remoteBranch,
    platform: 'ios',
    execution: 'github-hosted-macos',
    status: 'preparing',
  };
  const record = () =>
    save(directory, 'result.json', `${JSON.stringify(evidence, null, 2)}\n`);
  record();
  try {
    // Ref creation must fail if a same-named ref already exists.
    await git(
      'push',
      `--force-with-lease=refs/heads/${remoteBranch}:`,
      'origin',
      `${testedCommit}:refs/heads/${remoteBranch}`,
    );
    evidence.status = 'uploaded';
    record();
    log(`Uploaded commit ${featureCommit.slice(0, 8)} to ${remoteBranch}.`);
    log(
      'Starting the iOS build and complete simulator journey on GitHub macOS.',
    );
    await gh(
      'workflow',
      'run',
      WORKFLOW,
      '--ref',
      remoteBranch,
      '-f',
      'platform=ios',
    );
    let run;
    const discoveryDeadline = now() + 120_000;
    while (!run && now() < discoveryDeadline) {
      const runs = JSON.parse(
        await ghRead(
          'run',
          'list',
          '--workflow',
          WORKFLOW,
          '--branch',
          remoteBranch,
          '--event',
          'workflow_dispatch',
          '--json',
          'databaseId,headSha,url',
          '--limit',
          '10',
        ),
      );
      run = runs.find((item) => item.headSha === testedCommit);
      if (!run) await sleep(5_000);
    }
    if (!run)
      throw new Error(
        'Timed out finding the dispatched workflow. Check Actions before retrying.',
      );
    evidence.runId = run.databaseId;
    evidence.url = run.url;
    evidence.status = 'running';
    record();
    log(run.url);
    log(`Evidence: ${directory}`);
    log(
      'If interrupted, the remote job keeps running; use the run URL to inspect or cancel it.',
    );
    const deadline = now() + 120 * 60_000;
    let previous;
    while (true) {
      run = JSON.parse(
        await ghRead(
          'run',
          'view',
          String(evidence.runId),
          '--json',
          'headSha,headBranch,event,status,conclusion,jobs,url',
        ),
      );
      const progress = run.jobs
        .map((job) => {
          const step = job.steps?.find((item) => item.status === 'in_progress');
          return `${job.name}: ${job.conclusion || job.status}${step ? ` (${step.name})` : ''}`;
        })
        .join('; ');
      if (progress !== previous) {
        log(progress || run.status);
        previous = progress;
      }
      if (run.status === 'completed') break;
      if (now() >= deadline)
        throw new Error(
          'Timed out waiting for iOS. The remote run may still be active.',
        );
      await sleep(15_000);
    }
    evidence.jobs = run.jobs;
    evidence.conclusion = run.conclusion;
    // Collect evidence on failures too. Failed builds may have no journey artifact.
    const collectionErrors = [];
    for (const collect of [
      async () =>
        save(
          directory,
          'workflow.log',
          await ghRead('run', 'view', String(evidence.runId), '--log'),
        ),
      async () =>
        gh(
          'run',
          'download',
          String(evidence.runId),
          '--name',
          'ios-native-journey-logs',
          '--dir',
          join(directory, 'journey'),
        ),
    ]) {
      try {
        await collect();
      } catch (error) {
        collectionErrors.push(error.message);
      }
    }
    evidence.collectionErrors = collectionErrors;
    assertIosRun(run, evidence);
    if (collectionErrors.length)
      throw new Error(
        `iOS passed, but evidence collection failed: ${collectionErrors.join('; ')}`,
      );
    await clean();
    if ((await git('rev-parse', 'HEAD')) !== featureCommit)
      throw new Error(
        'Local HEAD changed during validation. Rerun for the current commit.',
      );
    evidence.status = 'passed';
    record();
    // Delete only the ref we created, and only if it still points at our commit.
    await git(
      'push',
      `--force-with-lease=refs/heads/${remoteBranch}:${testedCommit}`,
      'origin',
      `:refs/heads/${remoteBranch}`,
    );
    evidence.remoteBranchDeleted = true;
    record();
    log(
      `PASS: iOS build and complete journey. Remote evidence: ${evidence.url}`,
    );
    log(`Saved logs and available debug artifacts: ${directory}`);
    return evidence;
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = error.message;
    record();
    log(
      `Evidence: ${directory}. Temporary ref retained for investigation: ${remoteBranch}`,
    );
    throw error;
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) {
    console.log(
      'Usage: npm run native -- remote-ios\nRequires a clean committed checkout, Git, and authenticated GitHub CLI (gh auth login).\nPushes your HEAD to a temporary branch; runs iOS on GitHub macOS, then downloads evidence.',
    );
    if (process.argv.slice(2).some((arg) => arg !== '--help'))
      process.exitCode = 1;
  } else {
    remoteIos().catch((error) => {
      console.error(`Remote iOS preflight failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
