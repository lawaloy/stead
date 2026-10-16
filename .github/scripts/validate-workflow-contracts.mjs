import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TOOLCHAIN } from '../../scripts/toolchain.mjs';

const readQuotedItems = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    `Missing workflow contract marker: ${startMarker}`,
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing workflow contract marker: ${endMarker}`);

  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map(
    ([, value]) => value,
  );
};

const [
  entrypoint,
  reusable,
  nativeWorkflow,
  ciWorkflow,
  dependencyAuditWorkflow,
  dependencyMaintenanceWorkflow,
  codeqlWorkflow,
  androidJourney,
  rootPackage,
] = await Promise.all([
  readFile('.github/workflows/dependency-auto-finish.yml', 'utf8'),
  readFile('.github/workflows/pr-auto-finish-reusable.yml', 'utf8'),
  readFile('.github/workflows/native-ci.yml', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/dependency-audit.yml', 'utf8'),
  readFile('.github/workflows/deps-maintenance.yml', 'utf8'),
  readFile('.github/workflows/codeql.yml', 'utf8'),
  readFile('.github/scripts/run-android-native-journey.sh', 'utf8'),
  readFile('package.json', 'utf8'),
]);

const triggerWorkflows = readQuotedItems(entrypoint, 'workflows:', 'types:');
const requiredWorkflows = readQuotedItems(
  reusable,
  'const requiredWorkflowNames = [',
  '];',
);

assert.deepEqual(
  requiredWorkflows,
  triggerWorkflows,
  'Dependency auto-finish trigger workflows must exactly match its required workflows.',
);
assert.match(
  nativeWorkflow,
  /filters: \.github\/native-ci-paths\.yml/,
  'native-ci must use the shared native path policy.',
);
assert.match(
  nativeWorkflow,
  /npm run native:build:android/,
  'CI Android builds must reuse the local build command.',
);
assert.match(
  nativeWorkflow,
  /npm run native:build:ios -- --project-ready/,
  'CI iOS builds must reuse the local build command after prebuild.',
);
assert.match(
  nativeWorkflow,
  /node scripts\/native-workflow\.mjs test --platform ios --database-ready/,
  'CI iOS journeys must reuse the local runner.',
);
assert.match(
  androidJourney,
  /android-container\.mjs" --database-ready/,
  'CI Android journeys must reuse the local runner.',
);
assert.match(
  nativeWorkflow,
  /scripts\/native-\*\.mjs/,
  'App caches must include the shared native build recipe.',
);
assert.match(
  nativeWorkflow,
  /maestro_version=.*MAESTRO_VERSION/,
  'CI must consume the shared Maestro version pin.',
);
assert.match(
  codeqlWorkflow,
  /version=.*CODEQL_VERSION/,
  'CI must consume the shared CodeQL version pin.',
);
assert.match(
  codeqlWorkflow,
  /config-file: \.github\/codeql-config\.yml/,
  'CI must use the local CodeQL source scope.',
);
assert.equal(
  JSON.parse(rootPackage).scripts['verify:local'],
  'node scripts/native-workflow.mjs verify',
  'The complete local gate must use the shared native runner.',
);
assert.match(
  ciWorkflow,
  /node scripts\/local-workflow\.mjs test:e2e --database-ready/,
  'CI API e2e must reuse the developer automation runner.',
);
assert.match(
  ciWorkflow,
  /node scripts\/local-workflow\.mjs test:journey --database-ready/,
  'CI mobile/API journey must reuse the developer automation runner.',
);
assert.match(
  ciWorkflow,
  /name: Install shared runner dependencies\n\s+working-directory: \.\n\s+run: npm ci/,
  'CI API e2e must install root dependencies before invoking the shared runner.',
);
assert.match(
  ciWorkflow,
  /name: Install API and mobile dependencies\n\s+run: \|\n\s+npm ci\n/,
  'CI mobile/API journey must install the shared root runner dependencies.',
);

const auditWrapperInvocation = /node \.\.\/\.github\/scripts\/audit-npm\.mjs/g;
assert.equal(
  [...dependencyAuditWorkflow.matchAll(auditWrapperInvocation)].length,
  2,
  'Scheduled mobile audits must use the expiring advisory-exception wrapper.',
);
assert.equal(
  [...dependencyMaintenanceWorkflow.matchAll(auditWrapperInvocation)].length,
  2,
  'Mobile dependency maintenance must use the same audit exception policy.',
);

for (const filename of await readdir('.github/workflows')) {
  if (!filename.endsWith('.yml')) continue;
  const workflow = await readFile(`.github/workflows/${filename}`, 'utf8');
  for (const [, version] of workflow.matchAll(/node-version:\s*([^\r\n]+)/g))
    assert.ok(
      version.includes('outputs.node_version'),
      `${filename} must use the shared exact Node pin.`,
    );
}
assert.match(
  TOOLCHAIN.NODE_VERSION,
  /^\d+\.\d+\.\d+$/,
  'The shared Node baseline must select an exact patch.',
);
assert.match(
  nativeWorkflow,
  /java-version: \$\{\{ needs.config.outputs.java_version \}\}/,
  'Native CI must consume the exact shared Java build.',
);
assert.match(
  nativeWorkflow,
  /npm run test:native:android:container/,
  'Native CI must reuse the locally tested controlled container runner.',
);
assert.match(
  nativeWorkflow,
  /npm run tools:install:android -- --accept-licenses/,
  'Native CI must provision the immutable Android SDK archive lock.',
);
assert.doesNotMatch(
  nativeWorkflow,
  /sdkmanager|android-emulator-runner/,
  'CI must not silently update the locked SDK.',
);
assert.match(
  nativeWorkflow,
  /npm run native:setup:ios/,
  'iOS CI must select the pinned Xcode and runtime.',
);
assert.match(
  nativeWorkflow,
  /working-directory: mobile\n/,
  'iOS bundler must use the committed mobile Gemfile.',
);
assert.match(
  nativeWorkflow,
  /install-native-postgres\.sh/,
  'macOS CI must install the exact PostgreSQL source release.',
);
assert.match(
  ciWorkflow,
  /image: \$\{\{ needs.config.outputs.postgres_image \}\}/,
  'API CI must use the shared immutable PostgreSQL image.',
);

console.log('Workflow contracts are synchronized.');
