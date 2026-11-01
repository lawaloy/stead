const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const minimumTypeScriptApiVersion = '7.1.0';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const installTimeoutMs = 10 * 60 * 1000;
const probeTimeoutMs = 2 * 60 * 1000;

const toolPackageNames = [
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'ts-jest',
  'ts-loader',
  'ts-node',
  '@hey-api/openapi-ts',
];

const runtimeProbeDefinitions = {
  'typescript-eslint': {
    description: 'parse TypeScript through the aggregate parser',
    args: [
      '-e',
      "const tool = require('typescript-eslint'); tool.parser.parseForESLint('const value: number = 1;', { filePath: 'probe.ts' });",
    ],
  },
  '@typescript-eslint/parser': {
    description: 'parse TypeScript through the parser',
    args: [
      '-e',
      "const parser = require('@typescript-eslint/parser'); parser.parseForESLint('const value: number = 1;', { filePath: 'probe.ts' });",
    ],
  },
  '@typescript-eslint/eslint-plugin': {
    description: 'load the ESLint plugin and its rules',
    args: [
      '-e',
      "const plugin = require('@typescript-eslint/eslint-plugin'); if (!plugin.rules || Object.keys(plugin.rules).length === 0) throw new Error('No ESLint rules were loaded');",
    ],
  },
  'ts-jest': {
    description: 'transform and execute a TypeScript Jest test',
    files: {
      'jest.config.cjs': `module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/ts-jest-probe.test.ts'],
  transform: {
    '^.+\\\\.tsx?$': ['ts-jest', { diagnostics: false, isolatedModules: true }],
  },
};
`,
      'ts-jest-probe.test.ts': `test('TypeScript transformer probe', () => {
  const value: number = 1;
  expect(value).toBe(1);
});
`,
    },
    args: (probeRoot) => [
      path.join(probeRoot, 'node_modules', 'jest', 'bin', 'jest.js'),
      '--config',
      path.join(probeRoot, 'jest.config.cjs'),
      '--runInBand',
      '--no-cache',
    ],
  },
  'ts-loader': {
    description: 'compile TypeScript through ts-loader and webpack',
    files: {
      'ts-loader-entry.ts': 'export const value: number = 1;\n',
      'ts-loader-probe.cjs': `const path = require('node:path');
const webpack = require('webpack');

webpack(
  {
    context: __dirname,
    entry: './ts-loader-entry.ts',
    mode: 'development',
    module: {
      rules: [
        {
          test: /\\.ts$/,
          use: { loader: 'ts-loader', options: { transpileOnly: true } },
        },
      ],
    },
    output: { path: path.join(__dirname, 'dist'), filename: 'probe.js' },
    resolve: { extensions: ['.ts', '.js'] },
  },
  (error, stats) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
      return;
    }

    if (stats.hasErrors()) {
      console.error(stats.toString({ all: false, errors: true }));
      process.exitCode = 1;
    }
  },
);
`,
    },
    args: (probeRoot) => [path.join(probeRoot, 'ts-loader-probe.cjs')],
  },
  'ts-node': {
    description: 'register ts-node and execute TypeScript',
    files: {
      'ts-node-probe.ts': 'const value: number = 1;\nvoid value;\n',
    },
    args: (probeRoot) => [
      '-r',
      'ts-node/register/transpile-only',
      path.join(probeRoot, 'ts-node-probe.ts'),
    ],
  },
  '@hey-api/openapi-ts': {
    description: 'load the OpenAPI generator with the target compiler API',
    args: [
      '-e',
      "import('@hey-api/openapi-ts').catch((error) => { console.error(error); process.exitCode = 1; });",
    ],
  },
};

function npmView(packageSpec, field) {
  const args = ['view', packageSpec, field, '--json'];
  const output = runNpm(args).trim();

  if (!output) {
    return undefined;
  }

  return JSON.parse(output);
}

function runNpm(args, options = {}) {
  const commandOptions = {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NPM_CONFIG_FUND: 'false',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    },
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout,
  };

  if (process.platform === 'win32') {
    const command = [
      npmCommand,
      ...args.map((arg) => JSON.stringify(arg)),
    ].join(' ');
    return execSync(command, commandOptions);
  }

  return execFileSync(npmCommand, args, commandOptions);
}

function getPackageMetadata(packageName) {
  return {
    packageName,
    peerDependencies:
      npmView(`${packageName}@latest`, 'peerDependencies') ?? {},
    version: npmView(`${packageName}@latest`, 'version'),
  };
}

function createProbeEnvironment(
  targetTypeScript,
  toolPackages,
  runtimeCandidates,
) {
  const packageByName = new Map(
    toolPackages.map((toolPackage) => [toolPackage.packageName, toolPackage]),
  );
  const packageSpecs = [
    `typescript@${targetTypeScript}`,
    ...runtimeCandidates.map(
      ({ packageName, version }) => `${packageName}@${version}`,
    ),
  ];

  if (runtimeCandidates.some(({ packageName }) => packageName === 'ts-jest')) {
    const jestRange = packageByName.get('ts-jest').peerDependencies.jest;

    if (!jestRange) {
      throw new Error(
        'The ts-jest readiness probe could not resolve its Jest peer dependency range.',
      );
    }

    packageSpecs.push(`jest@${jestRange}`);
  }

  if (
    runtimeCandidates.some(({ packageName }) => packageName === 'ts-loader')
  ) {
    const webpackRange =
      packageByName.get('ts-loader').peerDependencies.webpack;

    if (!webpackRange) {
      throw new Error(
        'The ts-loader readiness probe could not resolve its webpack peer dependency range.',
      );
    }

    packageSpecs.push(`webpack@${webpackRange}`);
  }

  const probeRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'stead-typescript-readiness-'),
  );

  try {
    runNpm(
      [
        'install',
        '--prefix',
        probeRoot,
        '--package-lock=false',
        '--ignore-scripts',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        ...packageSpecs,
      ],
      { timeout: installTimeoutMs },
    );
  } catch (error) {
    fs.rmSync(probeRoot, { force: true, recursive: true });
    throw error;
  }

  return probeRoot;
}

function summarizeProbeFailure(error) {
  const output = [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .map((value) => value.toString())
    .join('\n')
    .replace(/\u001b\[[0-9;]*m/g, '');
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const usefulLine =
    lines.find((line) => /^(?:typeerror|referenceerror|error):/i.test(line)) ??
    lines.find((line) =>
      /(?:does not expose|does not support|cannot read|unsupported)/i.test(
        line,
      ),
    ) ??
    lines.find((line) => /(?:error|failed)/i.test(line)) ??
    lines[0] ??
    'The runtime probe failed without diagnostic output.';

  return usefulLine.length > 240
    ? `${usefulLine.slice(0, 237)}...`
    : usefulLine;
}

function executeRuntimeProbe(probeRoot, packageName) {
  const definition = runtimeProbeDefinitions[packageName];

  if (!definition) {
    throw new Error(`No runtime probe is defined for ${packageName}.`);
  }

  for (const [relativePath, contents] of Object.entries(
    definition.files ?? {},
  )) {
    fs.writeFileSync(path.join(probeRoot, relativePath), contents);
  }

  const args =
    typeof definition.args === 'function'
      ? definition.args(probeRoot)
      : definition.args;

  try {
    execFileSync(process.execPath, args, {
      cwd: probeRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: probeTimeoutMs,
    });
    return {
      description: definition.description,
      ready: true,
    };
  } catch (error) {
    return {
      description: definition.description,
      detail: summarizeProbeFailure(error),
      ready: false,
    };
  }
}

function combineSupportSignals({
  metadataReady,
  packageName,
  range,
  runtimeResult,
  version,
}) {
  return {
    metadataReady,
    packageName,
    range,
    ready: metadataReady && runtimeResult.ready,
    runtimeResult,
    version,
  };
}

function assessToolSupport(toolPackage, targetTypeScript, semver) {
  const range = toolPackage.peerDependencies.typescript;
  const metadataReady = Boolean(
    range &&
    semver.satisfies(targetTypeScript, range, { includePrerelease: true }),
  );

  return {
    metadataReady,
    range: range ?? '(no declared TypeScript peer dependency)',
  };
}

function formatToolResult(result) {
  const status = result.ready ? 'ready' : 'blocked';
  const metadataStatus = result.metadataReady ? 'ready' : 'blocked';
  const runtimeStatus = result.runtimeResult.skipped
    ? 'not run; declared support already blocks removal'
    : result.runtimeResult.ready
      ? 'ready'
      : 'blocked';
  const runtimeDetail = result.runtimeResult.detail
    ? ` — ${result.runtimeResult.detail.replaceAll('`', "'")}`
    : '';

  return [
    `- \`${result.packageName}@${result.version}\`: ${status}`,
    `  - declared support: ${metadataStatus}; peer range \`${result.range}\``,
    `  - runtime probe (${result.runtimeResult.description}): ${runtimeStatus}${runtimeDetail}`,
  ].join('\n');
}

function main() {
  const semver = require('semver');
  const targetTypeScript = npmView('typescript@latest', 'version');
  const compilerApiReady = semver.gte(
    targetTypeScript,
    minimumTypeScriptApiVersion,
    { includePrerelease: true },
  );
  const toolPackages = toolPackageNames.map(getPackageMetadata);
  const packagesWithMetadata = toolPackages.map((toolPackage) => ({
    ...toolPackage,
    ...assessToolSupport(toolPackage, targetTypeScript, semver),
  }));
  const runtimeCandidates = packagesWithMetadata.filter(
    ({ metadataReady }) => metadataReady,
  );
  const probeRoot = createProbeEnvironment(
    targetTypeScript,
    toolPackages,
    runtimeCandidates,
  );
  let toolResults;

  try {
    toolResults = packagesWithMetadata.map((toolPackage) => {
      const runtimeResult = toolPackage.metadataReady
        ? executeRuntimeProbe(probeRoot, toolPackage.packageName)
        : {
            description:
              runtimeProbeDefinitions[toolPackage.packageName].description,
            ready: false,
            skipped: true,
          };

      return combineSupportSignals({
        metadataReady: toolPackage.metadataReady,
        packageName: toolPackage.packageName,
        range: toolPackage.range,
        runtimeResult,
        version: toolPackage.version,
      });
    });
  } finally {
    fs.rmSync(probeRoot, { force: true, recursive: true });
  }

  const toolsReady = toolResults.every((result) => result.ready);
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
    ...toolResults.map(formatToolResult),
    '',
  ];

  if (ready) {
    lines.push(
      '## Result',
      '',
      'Package metadata and executable probes indicate that the TypeScript 6 compatibility layer is eligible for a removal trial.',
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
}

module.exports = {
  combineSupportSignals,
  executeRuntimeProbe,
  runtimeProbeDefinitions,
  summarizeProbeFailure,
};

if (require.main === module) {
  main();
}
