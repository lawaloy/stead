const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const semver = require('semver');

const minimumTypeScriptApiVersion = '7.1.0';
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

function supportsTypeScript(packageName, targetTypeScript) {
  const range = getPeerRange(packageName);

  if (!range) {
    return {
      packageName,
      ready: false,
      range: '(no declared TypeScript peer dependency)',
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

const targetTypeScript = packageVersion('typescript');
const compilerApiReady = semver.gte(
  targetTypeScript,
  minimumTypeScriptApiVersion,
  { includePrerelease: true },
);

const toolPackages = [
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'ts-jest',
  'ts-loader',
  'ts-node',
  '@hey-api/openapi-ts',
].map((packageName) => supportsTypeScript(packageName, targetTypeScript));

const toolsReady = toolPackages.every((result) => result.ready);
const ready = compilerApiReady && toolsReady;

const lines = [
  '# TypeScript 6 Compatibility Removal Readiness',
  '',
  `Latest stable TypeScript checked: \`${targetTypeScript}\``,
  `Stable compiler API required from: \`${minimumTypeScriptApiVersion}\``,
  `- TypeScript compiler API: ${compilerApiReady ? 'ready' : 'blocked'}`,
  '',
  '## Compiler API Consumers',
  '',
  ...toolPackages.map((result) => {
    const status = result.ready ? 'ready' : 'blocked';
    return `- \`${result.packageName}\`: ${status}; peer range \`${result.range}\``;
  }),
  '',
];

if (ready) {
  lines.push(
    '## Result',
    '',
    'The published package metadata indicates that the TypeScript 6 compatibility layer is eligible for a removal trial.',
    'Open a dedicated PR that removes the compatibility aliases and run the complete API and mobile CI suites before removal.',
  );
} else {
  lines.push(
    '## Result',
    '',
    'TypeScript 6 is still required by the repository toolchain. Keep the compatibility aliases and dependency-maintenance exclusions in place.',
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
