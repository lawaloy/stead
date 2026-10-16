import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  lstatSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, TOOLCHAIN } from './native-config.mjs';
import { runCommand } from './process-utils.mjs';

export const actionableSarifResults = (sarif) => {
  if (!Array.isArray(sarif.runs) || sarif.runs.length === 0)
    throw new Error('CodeQL did not produce a SARIF analysis run.');
  return sarif.runs.flatMap((run) =>
    (run.results ?? []).filter((result) => {
      if (
        (result.suppressions ?? []).some(
          (suppression) => suppression.status === 'accepted',
        )
      )
        return false;
      const rule = run.tool?.driver?.rules?.find(
        (candidate) => candidate.id === result.ruleId,
      );
      const level =
        result.level ?? rule?.defaultConfiguration?.level ?? 'warning';
      return level === 'error' || level === 'warning';
    }),
  );
};

export const checkCodeQL = async ({
  execute = runCommand,
  env = process.env,
  signal,
} = {}) => {
  const binary =
    env.STEAD_CODEQL_BIN ||
    (process.platform === 'win32' ? 'codeql.cmd' : 'codeql');
  let version;
  try {
    version = JSON.parse(
      await execute(binary, ['version', '--format=json'], {
        quiet: true,
        stdoutOnly: true,
        env,
        signal,
      }),
    ).version;
  } catch (error) {
    throw new Error(
      `Install the official CodeQL bundle ${TOOLCHAIN.CODEQL_VERSION} and set STEAD_CODEQL_BIN or PATH. ${error.message}`,
    );
  }
  if (version !== TOOLCHAIN.CODEQL_VERSION)
    throw new Error(
      `Use CodeQL bundle ${TOOLCHAIN.CODEQL_VERSION} to match CI (found ${version}).`,
    );
  return binary;
};

export const snapshotSource = async (
  root,
  destination,
  execute = runCommand,
) => {
  const paths = (
    await execute(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, quiet: true, stdoutOnly: true },
    )
  )
    .split('\0')
    .filter(Boolean);
  for (const path of new Set(paths)) {
    const source = resolve(root, path);
    const within = relative(root, source);
    if (
      isAbsolute(within) ||
      within === '..' ||
      within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    )
      throw new Error('Git returned a source path outside the checkout.');
    if (!existsSync(source)) continue; // Tracked deletions are absent from this working tree.
    if (lstatSync(source).isSymbolicLink())
      throw new Error(`CodeQL source snapshots require regular files: ${path}`);
    if (!lstatSync(source).isFile()) continue;
    const target = join(destination, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
};

export const scanCodeQL = async ({ signal } = {}) => {
  const binary = await checkCodeQL({ signal });
  const output = join(ROOT, '.tmp', 'codeql-validation', String(Date.now()));
  mkdirSync(output, { recursive: true });
  const database = join(output, 'javascript');
  const config = join(ROOT, '.github', 'codeql-config.yml');
  const source = join(output, 'source');
  await snapshotSource(ROOT, source);
  await runCommand(
    binary,
    [
      'database',
      'create',
      database,
      '--language=javascript-typescript',
      '--build-mode=none',
      `--source-root=${source}`,
      `--codescanning-config=${config}`,
      `--threads=${TOOLCHAIN.CODEQL_THREADS}`,
      `--ram=${TOOLCHAIN.CODEQL_RAM_MB}`,
    ],
    { cwd: ROOT, signal },
  );
  const report = join(output, 'results.sarif');
  await runCommand(
    binary,
    [
      'database',
      'analyze',
      database,
      'codeql/javascript-queries:codeql-suites/javascript-code-scanning.qls',
      '--format=sarifv2.1.0',
      `--output=${report}`,
      `--threads=${TOOLCHAIN.CODEQL_THREADS}`,
      `--ram=${TOOLCHAIN.CODEQL_RAM_MB}`,
    ],
    { cwd: ROOT, signal },
  );
  const findings = actionableSarifResults(
    JSON.parse(readFileSync(report, 'utf8')),
  );
  writeFileSync(
    join(output, 'summary.json'),
    JSON.stringify(
      { codeql: TOOLCHAIN.CODEQL_VERSION, findings: findings.length, report },
      null,
      2,
    ),
  );
  console.log(`Local CodeQL evidence: ${output}`);
  if (findings.length)
    throw new Error(
      `${findings.length} unsuppressed CodeQL warning/error result(s). Review ${report}.`,
    );
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  scanCodeQL().catch((error) => {
    console.error(`Local CodeQL failed: ${error.message}`);
    process.exitCode = 1;
  });
}
