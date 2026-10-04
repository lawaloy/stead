import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const severityOrder = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const args = new Set(process.argv.slice(2));
const auditLevelArgument = process.argv.find((argument) =>
  argument.startsWith('--audit-level='),
);
const auditLevel = auditLevelArgument?.split('=', 2)[1] ?? 'high';

if (!(auditLevel in severityOrder)) {
  throw new Error(`Unsupported audit level: ${auditLevel}`);
}

const npmArguments = ['audit', '--json', `--audit-level=${auditLevel}`];
if (args.has('--omit-dev')) npmArguments.push('--omit=dev');

const executable =
  process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
const executableArguments =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm ${npmArguments.join(' ')}`]
    : npmArguments;
const audit = spawnSync(executable, executableArguments, {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: false,
});

if (audit.error) throw audit.error;

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stderr || audit.stdout);
  throw new Error('npm audit did not return a JSON report.');
}

if (report.error) {
  process.stderr.write(audit.stderr || audit.stdout);
  throw new Error('npm audit returned an error instead of an audit report.');
}

if (audit.status !== 0 && audit.status !== 1) {
  process.stderr.write(audit.stderr || audit.stdout);
  throw new Error(`npm audit exited unexpectedly with status ${audit.status}.`);
}

const workspace = basename(process.cwd());
const configPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dependency-audit-exceptions.json',
);
const { exceptions } = JSON.parse(readFileSync(configPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const exceptionByAdvisory = new Map(
  exceptions.map((exception) => [String(exception.advisoryId), exception]),
);
const vulnerabilities = report.vulnerabilities ?? {};

const advisoryIdsFor = (packageName, visited = new Set()) => {
  if (visited.has(packageName)) return new Set();
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) return new Set();

  const nextVisited = new Set(visited).add(packageName);
  const advisoryIds = new Set();

  for (const cause of vulnerability.via ?? []) {
    if (typeof cause === 'string') {
      for (const advisoryId of advisoryIdsFor(cause, nextVisited)) {
        advisoryIds.add(advisoryId);
      }
    } else if (cause?.source !== undefined) {
      advisoryIds.add(String(cause.source));
    }
  }

  return advisoryIds;
};

const relevant = Object.entries(vulnerabilities).filter(
  ([, vulnerability]) =>
    severityOrder[vulnerability.severity] >= severityOrder[auditLevel],
);
const accepted = [];
const blocked = [];

for (const [packageName, vulnerability] of relevant) {
  const advisoryIds = [...advisoryIdsFor(packageName)];
  const applicableExceptions = advisoryIds.map((advisoryId) =>
    exceptionByAdvisory.get(advisoryId),
  );
  const isAccepted =
    advisoryIds.length > 0 &&
    applicableExceptions.every(
      (exception) =>
        exception &&
        exception.workspace === workspace &&
        exception.expiresOn >= today &&
        exception.allowedVulnerabilities.includes(packageName),
    );

  const finding = {
    packageName,
    severity: vulnerability.severity,
    advisoryIds,
  };
  (isAccepted ? accepted : blocked).push(finding);
}

if (accepted.length > 0) {
  const acceptedAdvisories = [
    ...new Set(accepted.flatMap((finding) => finding.advisoryIds)),
  ].map((advisoryId) => {
    const exception = exceptionByAdvisory.get(advisoryId);
    return `${exception.ghsa} (${exception.package}, expires ${exception.expiresOn})`;
  });
  console.warn(
    `Accepted ${accepted.length} temporary ${workspace} audit finding(s) derived only from: ${acceptedAdvisories.join(', ')}`,
  );
}

if (blocked.length > 0) {
  console.error('Blocking npm audit findings:');
  for (const finding of blocked) {
    console.error(
      `- ${finding.packageName} (${finding.severity}); advisories: ${finding.advisoryIds.join(', ') || 'unresolved dependency cycle'}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `No unexcepted ${auditLevel}-or-higher vulnerabilities found in ${workspace}.`,
  );
}
