const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const semver = require('semver');

const targetTypeScript = '7.0.0';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function npmView(packageSpec, field) {
  const args = ['view', packageSpec, field, '--json'];
  const output = runNpm(args).trim();

  if (!output) {
    return undefined;
  }

  return JSON.parse(output);
}

function runNpm(args) {
  if (process.platform === 'win32') {
    const command = [npmCommand, ...args.map((arg) => JSON.stringify(arg))].join(
      ' ',
    );
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  return execFileSync(npmCommand, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function getPeerRange(packageName) {
  const peerDependencies = npmView(`${packageName}@latest`, 'peerDependencies');
  return peerDependencies?.typescript;
}

function supportsTypeScript7(packageName) {
  const range = getPeerRange(packageName);

  if (!range) {
    return {
      packageName,
      ready: true,
      range: '(no TypeScript peer dependency)',
    };
  }

  return {
    packageName,
    ready: semver.satisfies(targetTypeScript, range, {
      includePrerelease: true,
    }),
    range,
  };
}

function packageVersion(packageName) {
  return npmView(`${packageName}@latest`, 'version');
}

const lintPackages = [
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
].map(supportsTypeScript7);

const tsJest = supportsTypeScript7('ts-jest');
const swcJestAvailable =
  Boolean(packageVersion('@swc/jest')) && Boolean(packageVersion('@swc/core'));

const lintReady = lintPackages.every((result) => result.ready);
const jestReady = tsJest.ready || swcJestAvailable;
const ready = lintReady && jestReady;

const lines = [
  '# TypeScript 7 API Toolchain Readiness',
  '',
  `Target TypeScript version checked: \`${targetTypeScript}\``,
  '',
  '## Lint Toolchain',
  '',
  ...lintPackages.map((result) => {
    const status = result.ready ? 'ready' : 'blocked';
    return `- \`${result.packageName}\`: ${status}; peer range \`${result.range}\``;
  }),
  '',
  '## Jest Transform',
  '',
  `- \`ts-jest\`: ${tsJest.ready ? 'ready' : 'blocked'}; peer range \`${tsJest.range}\``,
  `- \`@swc/jest\` replacement path: ${swcJestAvailable ? 'available' : 'unavailable'}`,
  '',
];

if (ready) {
  lines.push(
    '## Result',
    '',
    'TypeScript 7 appears ready for an API migration. Remove the Dependabot ignore and open a migration PR.',
  );
} else {
  lines.push(
    '## Result',
    '',
    'TypeScript 7 is still blocked for the API toolchain. Keep the Dependabot major-version ignore in place.',
  );
}

const summary = `${lines.join('\n')}\n`;
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (ready) {
  process.exitCode = 1;
}
