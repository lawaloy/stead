import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { TOOLCHAIN } from '../../scripts/toolchain.mjs';

const readBlock = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(
    start,
    -1,
    `Missing workflow contract marker: ${startMarker}`,
  );

  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing workflow contract marker: ${endMarker}`);

  return source.slice(start, end);
};

const readQuotedItems = (source, startMarker, endMarker) =>
  [...readBlock(source, startMarker, endMarker).matchAll(/'([^']+)'/g)].map(
    ([, value]) => value,
  );

const [
  finishEntrypoint,
  finishReusable,
  prepareEntrypoint,
  prepareReusable,
  nativeWorkflow,
  ciWorkflow,
  dependencyAuditWorkflow,
  dependencyMaintenanceWorkflow,
  codeqlWorkflow,
  criticalNativeJourney,
  iosCharacterInput,
  androidJourney,
  iosBuild,
  nativeRunner,
  rootPackage,
] = await Promise.all([
  readFile('.github/workflows/dependency-auto-finish.yml', 'utf8'),
  readFile('.github/workflows/pr-auto-finish-reusable.yml', 'utf8'),
  readFile('.github/workflows/dependency-auto-prepare.yml', 'utf8'),
  readFile('.github/workflows/pr-auto-prepare-reusable.yml', 'utf8'),
  readFile('.github/workflows/native-ci.yml', 'utf8'),
  readFile('.github/workflows/ci.yml', 'utf8'),
  readFile('.github/workflows/dependency-audit.yml', 'utf8'),
  readFile('.github/workflows/deps-maintenance.yml', 'utf8'),
  readFile('.github/workflows/codeql.yml', 'utf8'),
  readFile('mobile/.maestro/critical-native-journey.yaml', 'utf8'),
  readFile('mobile/.maestro/input-text-character-by-character.yaml', 'utf8'),
  readFile('.github/scripts/run-android-native-journey.sh', 'utf8'),
  readFile('.github/scripts/build-ios-simulator-app.sh', 'utf8'),
  readFile('scripts/native-workflow.mjs', 'utf8'),
  readFile('package.json', 'utf8'),
]);

const triggerWorkflows = readQuotedItems(
  finishEntrypoint,
  'workflows:',
  'types:',
);
const requiredWorkflowContractBlock = readBlock(
  finishReusable,
  'const requiredWorkflowContracts = [',
  '];',
);
const requiredWorkflows = [
  ...requiredWorkflowContractBlock.matchAll(
    /name: '([^']+)',\s+path: '([^']+)'/g,
  ),
].map(([, name, path]) => ({ name, path }));
const dependencyAuditPaths = readQuotedItems(
  finishReusable,
  'const dependencyAuditPaths = [',
  '];',
);
const dependencyAuditTriggerPaths = readQuotedItems(
  dependencyAuditWorkflow,
  'pull_request:',
  'push:',
);

assert.deepEqual(
  triggerWorkflows,
  ['native-ci'],
  'Dependency auto-finish must have one aggregate trigger instead of one run per required workflow.',
);
assert.match(
  finishEntrypoint,
  /workflow_dispatch:[\s\S]*pull_number:[\s\S]*type: number/,
  'Dependency auto-finish must expose a lightweight recovery dispatch for a specific PR.',
);
assert.match(
  finishEntrypoint,
  /pull_number: \$\{\{ inputs\.pull_number \|\| 0 \}\}/,
  'The recovery dispatch must pass its PR number to the reusable readiness coordinator.',
);
assert.deepEqual(
  requiredWorkflows,
  [
    { name: 'ci', path: '.github/workflows/ci.yml' },
    { name: 'native-ci', path: '.github/workflows/native-ci.yml' },
    { name: 'CodeQL Advanced', path: '.github/workflows/codeql.yml' },
    {
      name: 'Dependency review',
      path: '.github/workflows/dependency-review.yml',
    },
    {
      name: 'Dependency Audit',
      path: '.github/workflows/dependency-audit.yml',
    },
  ],
  'Dependency auto-finish must retain every required workflow gate.',
);
assert.deepEqual(
  dependencyAuditPaths,
  dependencyAuditTriggerPaths,
  'Dependency auto-finish must expect the audit exactly when its pull-request path filter runs.',
);
assert.match(
  finishReusable,
  /normalizeWorkflowPath\(run\.path\)/,
  'Dependency readiness must identify workflows by stable workflow paths rather than dynamic run names.',
);
assert.match(
  finishReusable,
  /github\.rest\.pulls\.listFiles[\s\S]*contract\.expected\(changedFiles\)/,
  'Path-filtered workflows must be required from the current PR file set.',
);
assert.match(
  finishReusable,
  /if \(missingWorkflows\.length > 0 \|\| incompleteWorkflows\.length > 0\)[\s\S]*await sleep\(delayMs\);[\s\S]*continue;/,
  'The single auto-finish trigger must wait for remaining required workflows.',
);
assert.match(
  finishReusable,
  /core\.setFailed\([\s\S]*Required workflows failed[\s\S]*Rerun or dispatch Dependency Auto Finish/,
  'Failed required workflows must leave a visible, independently rerunnable readiness check.',
);
assert.match(
  finishReusable,
  /core\.setFailed\([\s\S]*Timed out waiting for required workflows/,
  'Dependency readiness must fail visibly instead of silently timing out.',
);
assert.match(
  prepareEntrypoint,
  /lane: auto/,
  'One dependency auto-prepare entrypoint must resolve both trusted lanes.',
);
assert.match(
  prepareReusable,
  /requestedLane === 'auto'[\s\S]*trustedDependabot[\s\S]*trustedMaintenance/,
  'Dependency preparation must resolve trusted Dependabot and maintenance provenance.',
);
const workflowFilenames = await readdir('.github/workflows');
for (const removedEntrypoint of [
  'dependabot-auto-prepare.yml',
  'deps-maintenance-auto-prepare.yml',
])
  assert.ok(
    !workflowFilenames.includes(removedEntrypoint),
    `${removedEntrypoint} must remain consolidated into dependency-auto-prepare.yml.`,
  );
assert.match(
  ciWorkflow,
  /config:\n\s+name: CI Configuration/,
  'General CI must publish an unambiguous configuration check name.',
);
assert.match(
  nativeWorkflow,
  /run-name:[\s\S]*workflow_dispatch[\s\S]*inputs\.platform/,
  'Native runs must identify manual platform selection in the run name.',
);
assert.match(
  nativeWorkflow,
  /config:\n\s+name: Native CI Configuration/,
  'Native CI must publish an unambiguous configuration check name.',
);
assert.match(
  nativeWorkflow,
  /filters: \.github\/native-ci-paths\.yml/,
  'native-ci must use the shared native path policy.',
);
assert.match(
  nativeWorkflow,
  /npm run native -- build --platform android/,
  'CI Android builds must reuse the local build command.',
);
assert.match(
  nativeWorkflow,
  /npm run native -- build --platform ios --project-ready/,
  'CI iOS builds must reuse the local build command after prebuild.',
);
assert.match(
  nativeWorkflow,
  /npm run native -- test --platform ios --database-ready/,
  'CI iOS journeys must reuse the local runner.',
);
const iosJourneyJob = nativeWorkflow
  .split('  native-ios:\n')[1]
  ?.split(/\n  [a-z][\w-]*:/)[0];
assert.doesNotMatch(
  iosJourneyJob ?? '',
  /--repeat|npm ci --prefix mobile|ruby\/setup-ruby|Restore iOS Metro/,
  'The transferred iOS app must run one complete journey without build-only dependencies or Metro.',
);
assert.match(
  iosBuild,
  /-configuration Release[\s\S]*test -s "\$APP_PATH\/main\.jsbundle"/,
  'The iOS simulator artifact must embed JavaScript so its journey does not require Metro.',
);
assert.match(
  iosBuild,
  /SENTRY_DISABLE_AUTO_UPLOAD="\$\{SENTRY_DISABLE_AUTO_UPLOAD:-true\}"/,
  'Simulator builds must not require production Sentry upload credentials.',
);
assert.match(
  nativeRunner,
  /IOS_SIMULATOR_PREPARATION_TIMEOUT_MS/,
  'The iOS simulator preparation deadline must come from shared CI configuration.',
);
assert.match(
  TOOLCHAIN.IOS_SIMULATOR_PREPARATION_TIMEOUT_MS,
  /^\d+$/,
  'The shared iOS simulator preparation deadline must be milliseconds.',
);
assert.ok(
  Number(TOOLCHAIN.IOS_SIMULATOR_PREPARATION_TIMEOUT_MS) >=
    Number(TOOLCHAIN.IOS_DRIVER_STARTUP_TIMEOUT_MS),
  'Simulator preparation must allow at least the full iOS driver startup budget.',
);
assert.match(
  androidJourney,
  /native-workflow\.mjs" test --platform android --android-runner container --database-ready/,
  'CI Android journeys must reuse the local runner.',
);
assert.doesNotMatch(
  criticalNativeJourney,
  /eraseText:\s+\d+/,
  'Native journeys must use Maestro standard field clearing instead of unexplained character counts.',
);
assert.equal(
  [...criticalNativeJourney.matchAll(/^- eraseText$/gm)].length,
  4,
  'Every deterministic native text replacement must use the same standard clear operation.',
);
assert.match(
  await readFile('mobile/.maestro/fill-goal.yaml', 'utf8'),
  /file: input-text\.yaml[\s\S]*TEXT: Native journey goal[\s\S]*id: goal-name\n\s+text: Native journey goal/,
  'Goal input must use the shared input flow and verify the field before saving.',
);
assert.match(
  iosCharacterInput,
  /^appId: com\.lawaloy\.stead\r?\n---\r?\n/m,
  'Reusable Maestro flows must contain a config section before their commands.',
);
const maestroFlowFilenames = (await readdir('mobile/.maestro')).filter(
  (filename) => /\.ya?ml$/.test(filename),
);
const maestroFlows = new Map(
  await Promise.all(
    maestroFlowFilenames.map(async (filename) => [
      filename,
      await readFile(`mobile/.maestro/${filename}`, 'utf8'),
    ]),
  ),
);
for (const [owner, flow] of maestroFlows) {
  for (const [, referenced] of flow.matchAll(
    /^\s*file:\s*([^\s#]+\.ya?ml)\s*$/gm,
  )) {
    const reusable = maestroFlows.get(referenced);
    assert.ok(
      reusable,
      `${owner} references missing Maestro flow ${referenced}.`,
    );
    const separator = reusable.indexOf('\n---');
    assert.ok(
      separator > 0 && /^appId:\s*\S+/m.test(reusable.slice(0, separator)),
      `${referenced} must define its own Maestro config section.`,
    );
  }
}
assert.match(
  iosCharacterInput,
  /times: 100[\s\S]*inputText: \$\{output\.characterInput\.text\.charAt\(output\.characterInput\.index\)\}[\s\S]*characterInput\.index = output\.characterInput\.index \+ 1/,
  'Paced iOS input must send one character per bounded driver request.',
);
assert.match(
  criticalNativeJourney,
  /id: transaction-note\n\s+point: '95%,50%'\n\s+retryTapIfNoChange: false[\s\S]*waitForAnimationToEnd\n- eraseText/,
  'The transaction note must settle the iOS text keyboard before clearing its bounded default value.',
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
for (const feature of ['OVERLAY_ANALYSIS', 'DIFF_INFORMED_QUERIES'])
  assert.match(
    codeqlWorkflow,
    new RegExp(`CODEQL_ACTION_${feature}: 'false'`),
    'CI must use full analysis like the local CodeQL CLI.',
  );
for (const [output, pin] of [
  ['ram', 'CODEQL_RAM_MB'],
  ['threads', 'CODEQL_THREADS'],
]) {
  assert.match(codeqlWorkflow, new RegExp(`${output}=\\$${pin}`));
  assert.ok(
    codeqlWorkflow.includes(
      output + ': ${{ steps.toolchain.outputs.' + output + ' }}',
    ),
    `CI must consume the shared CodeQL ${output} setting.`,
  );
}
assert.equal(
  JSON.parse(rootPackage).scripts.validate,
  'node scripts/native-workflow.mjs verify',
  'The complete local gate must use the shared native runner.',
);
assert.equal(
  JSON.parse(rootPackage).scripts.native,
  'node scripts/native-workflow.mjs',
  'Native subcommands must share one public entry point.',
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
  4,
  'Dependency audits must use one parser for blocking gates and report-only findings.',
);
assert.equal(
  [...dependencyMaintenanceWorkflow.matchAll(auditWrapperInvocation)].length,
  4,
  'Dependency maintenance must use one parser for blocking gates and report-only findings.',
);
assert.match(
  dependencyAuditWorkflow,
  /name: Report moderate-or-higher full-tree vulnerabilities\n\s+if: always\(\)\n\s+run: node \.\.\/\.github\/scripts\/audit-npm\.mjs --audit-level=moderate --report-only/,
  'Full-tree audits must report findings without hiding audit execution failures.',
);
assert.match(
  dependencyMaintenanceWorkflow,
  /name: Mobile full-tree audit report\n\s+if: always\(\)\n\s+working-directory: mobile\n\s+run: node \.\.\/\.github\/scripts\/audit-npm\.mjs --audit-level=moderate --report-only/,
  'Maintenance full-tree audits must report findings without hiding audit execution failures.',
);
for (const filename of workflowFilenames) {
  if (!filename.endsWith('.yml')) continue;
  const workflow = await readFile(`.github/workflows/${filename}`, 'utf8');
  assert.doesNotMatch(
    workflow,
    /^\s*continue-on-error\s*:/m,
    `${filename} must express expected outcomes in the command contract, not suppress step failures.`,
  );
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
  /npm run native -- test --platform android --android-runner container/,
  'Native CI must reuse the locally tested controlled container runner.',
);
assert.match(
  nativeWorkflow,
  /npm run tools:install:android -- --accept-licenses/,
  'Native CI must provision the immutable Android SDK archive lock.',
);
const androidBuild =
  nativeWorkflow.split('  build-android:\n')[1]?.split(/\n  [a-z][\w-]*:/)[0] ??
  '';
assert.ok(androidBuild, 'Native CI must define the Android build job.');
assert.ok(
  androidBuild.indexOf('Restore Android simulator app') <
    androidBuild.indexOf('actions/setup-node@v4'),
  'Android CI must check for a complete cached APK before provisioning build tools.',
);
for (const setup of ['actions/setup-node@v4', 'actions/setup-java@v6']) {
  const section = androidBuild.slice(androidBuild.indexOf(`- uses: ${setup}`));
  assert.match(
    section.split(/\n\s+- (?:uses|name):/)[0],
    /if: steps\.android-app-cache\.outputs\.cache-hit != 'true'/,
    `${setup} must be skipped when the Android APK cache is complete.`,
  );
}
assert.match(
  androidBuild,
  /name: Cache Gradle dependencies and build outputs\n\s+if: steps\.android-app-cache\.outputs\.cache-hit != 'true'\n\s+uses: gradle\/actions\/setup-gradle@v5/,
  'Gradle setup must be skipped when the Android APK cache is complete.',
);
const nativeAndroidJob =
  nativeWorkflow
    .split('  native-android:\n')[1]
    ?.split(/\n  [a-z][\w-]*:/)[0] ?? '';
assert.ok(nativeAndroidJob, 'Native CI must define the Android journey job.');
assert.match(
  nativeAndroidJob,
  /uses: actions\/upload-artifact@v4\n\s+if: failure\(\)[\s\S]*name: android-native-journey-logs[\s\S]*\.tmp\/native-container\/\*\*\/attempts\.json/,
  'Android CI must retain journey evidence when a run fails.',
);
assert.equal(
  TOOLCHAIN.NATIVE_EVIDENCE_RETENTION_DAYS,
  '3',
  'Native journey evidence must retain a three-day debugging window.',
);
assert.match(
  nativeWorkflow,
  /native_evidence_retention_days: \$\{\{ steps\.versions\.outputs\.native_evidence_retention_days \}\}/,
  'Native CI must expose the shared evidence retention setting as a config output.',
);
assert.match(
  nativeWorkflow,
  /echo "native_evidence_retention_days=\$NATIVE_EVIDENCE_RETENTION_DAYS"/,
  'Native CI must read evidence retention from the shared toolchain pin.',
);
const androidEvidenceUpload = nativeAndroidJob.split(
  '      - uses: actions/upload-artifact@v4\n',
)[1];
assert.ok(
  androidEvidenceUpload,
  'Native Android CI must upload journey evidence.',
);
assert.match(
  androidEvidenceUpload,
  /!\.tmp\/native-container\/\*\*\/\*\.bundle[\s\S]*!\.tmp\/native-container\/\*\*\/\*\.apk[\s\S]*!\.tmp\/native-container\/\*\*\/\*\.aab[\s\S]*!\.tmp\/native-container\/\*\*\/\*\.zip/,
  'Android evidence must exclude generated bundles and application archives.',
);
assert.match(
  androidEvidenceUpload,
  /if-no-files-found: error[\s\S]*retention-days: \$\{\{ needs\.config\.outputs\.native_evidence_retention_days \}\}/,
  'Android evidence must fail closed when empty and use shared retention.',
);
assert.match(
  nativeAndroidJob,
  /uses: docker\/setup-buildx-action@v4[\s\S]*path: \.tmp\/android-buildkit-cache[\s\S]*STEAD_ANDROID_BUILDKIT_CACHE: \$\{\{ github\.workspace \}\}\/\.tmp\/android-buildkit-cache/,
  'Android CI must restore the repository BuildKit cache before the container journey.',
);
assert.doesNotMatch(
  nativeWorkflow,
  /sdkmanager|android-emulator-runner/,
  'CI must not silently update the locked SDK.',
);
assert.match(
  nativeWorkflow,
  /npm run native -- setup --platform ios/,
  'iOS CI must select the pinned Xcode and runtime.',
);
assert.match(
  nativeWorkflow,
  /options: \[all, ios, android\]/,
  'Manual native preflight must support iOS without allocating Android runners.',
);
assert.doesNotMatch(
  nativeWorkflow,
  /^  schedule:/m,
  'Native customer-journey validation is PR/main/on-demand only; do not add an unrequested nightly tier.',
);
for (const [job, excluded] of [
  ['build-android', 'ios'],
  ['build-ios', 'android'],
])
  assert.match(
    nativeWorkflow,
    new RegExp(
      `${job}:\\n\\s+needs: config\\n\\s+if: .*inputs\\.platform != '${excluded}'`,
    ),
    `Manual platform selection must control ${job}.`,
  );
assert.match(
  nativeWorkflow,
  /echo "ios_enabled=\$IOS_NATIVE_ENABLED"/,
  'Native iOS CI must read its enable switch from shared configuration.',
);
for (const job of ['build-ios', 'native-ios']) {
  const section = nativeWorkflow
    .split(`  ${job}:\n`)[1]
    ?.split(/\n  [a-z][\w-]*:/)[0];
  assert.match(
    section ?? '',
    /if: .*needs\.config\.outputs\.ios_enabled == 'true'/,
    `The iOS enable switch must gate ${job}.`,
  );
}
const nativeIosJob =
  nativeWorkflow.split('  native-ios:\n')[1]?.split(/\n  [a-z][\w-]*:/)[0] ??
  '';
const iosEvidenceUpload = nativeIosJob.split(
  '      - uses: actions/upload-artifact@v4\n',
)[1];
assert.ok(iosEvidenceUpload, 'Native iOS CI must upload journey evidence.');
assert.match(
  iosEvidenceUpload,
  /if: failure\(\)[\s\S]*\.tmp\/native-validation[\s\S]*~\/\.maestro\/tests[\s\S]*mobile\/\.expo\/\*\*\/\*\.log/,
  'iOS CI must retain focused logs and native journey evidence when a run fails.',
);
assert.doesNotMatch(
  iosEvidenceUpload,
  /mobile\/\.ci\/ios|\*\.app|\*\.zip/,
  'iOS journey evidence must not duplicate simulator application artifacts.',
);
assert.match(
  iosEvidenceUpload,
  /!\.tmp\/native-validation\/\*\*\/\*\.bundle/,
  'iOS evidence must exclude generated JavaScript bundles.',
);
assert.match(
  iosEvidenceUpload,
  /if-no-files-found: error[\s\S]*retention-days: \$\{\{ needs\.config\.outputs\.native_evidence_retention_days \}\}/,
  'iOS evidence must fail closed when empty and use shared retention.',
);
const iosAppCacheKey =
  nativeWorkflow.match(/key: ios-simulator-app-[^\n]+/)?.[0] ?? '';
for (const path of [
  'mobile/package.json',
  'mobile/babel.config.js',
  'mobile/metro.config.js',
  'mobile/tsconfig.json',
])
  assert.ok(
    iosAppCacheKey.includes(`'${path}'`),
    `The embedded iOS app cache must include ${path}.`,
  );
const readiness = nativeWorkflow.split('  native-readiness:\n')[1];
assert.match(
  readiness ?? '',
  /name: .*'iOS Diagnostic Probe' \|\| 'Native Readiness'[\s\S]*if: always\(\)[\s\S]*needs: \[config, build-android, build-ios, native-android, native-ios\]/,
  'Native CI must expose one stable aggregate result across conditional platform jobs.',
);
assert.match(
  readiness ?? '',
  /Native configuration failed:[\s\S]*Native configuration produced no execution decision[\s\S]*iOS native validation is disabled for a native-impacting change/,
  'The aggregate native result must reject configuration failure, missing decisions, and disabled iOS.',
);
assert.match(
  nativeWorkflow,
  /working-directory: mobile\n/,
  'iOS bundler must use the committed mobile Gemfile.',
);
assert.match(
  nativeWorkflow,
  /key: react-native-ios-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-v1-\$\{\{ steps\.react-native\.outputs\.version \}\}/,
  'iOS CI must cache React Native prebuilt binaries independently of the Pods lockfile.',
);
assert.match(
  nativeWorkflow,
  /build-ios-simulator-app\.sh --prepare-only[\s\S]*Save React Native iOS binaries[\s\S]*IOS_PODS_PREPARED: true/,
  'iOS CI must save native dependency downloads before starting the Xcode build.',
);
assert.match(
  iosBuild,
  /ENTERPRISE_REPOSITORY="\$\{ENTERPRISE_REPOSITORY:-\$REACT_NATIVE_MAVEN_REPOSITORY\}"/,
  'iOS dependency preparation must use the shared React Native Maven repository.',
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
assert.match(
  nativeWorkflow,
  /pull_request:\n\s+branches: \[main\]\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/,
  'Native CI must rerun when a draft PR is marked ready for review.',
);
assert.match(
  nativeWorkflow,
  /EVENT_NAME" == "pull_request" && "\$DRAFT" == "true"[\s\S]*run_native=false/,
  'Draft pull requests must skip expensive native jobs.',
);
assert.match(
  nativeIosJob,
  /if: needs\.config\.outputs\.run_native == 'true' && needs\.config\.outputs\.ios_enabled == 'true' && inputs\.platform != 'android'/,
  'The iOS journey job must skip drafts, path-filtered runs, and Android-only dispatch.',
);
assert.match(
  readiness ?? '',
  /Draft PR: native jobs skipped; they run when marked ready for review/,
  'Native Readiness must pass draft PRs with an explicit skip message.',
);
assert.match(
  readiness ?? '',
  /permissions:\n\s+contents: read\n\s+pull-requests: read\n\s+actions: write/,
  'Native Readiness must keep its existing permissions and be able to delete artifacts.',
);
assert.match(
  readiness ?? '',
  /Delete simulator app artifacts[\s\S]*if: always\(\)[\s\S]*NATIVE_ANDROID[\s\S]*NATIVE_IOS[\s\S]*result" != "success" && "\$result" != "skipped"[\s\S]*Keeping simulator app artifacts because a journey job did not succeed[\s\S]*android-simulator-app[\s\S]*ios-simulator-app[\s\S]*Warning: failed to delete simulator app artifact/,
  'Native Readiness must delete simulator app artifacts after successful or skipped journeys, keep them when a journey fails or is cancelled, and never fail the check if cleanup fails.',
);

console.log('Workflow contracts are synchronized.');
