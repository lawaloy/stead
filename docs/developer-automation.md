# Developer Automation

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Stead keeps repeatable local setup and validation behind repository-root npm
commands. The automation is cross-platform, refuses to overwrite local
environment files, and gives database-backed tests their own schemas.

## Command Matrix

| Command                                                     | Automated work                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run bootstrap`                                         | Installs root, API, and mobile dependencies; initializes missing env files; starts and waits for PostgreSQL; applies development migrations.                                                                |
| `npm run env:init`                                          | Copies both env examples only when the targets are absent and replaces the three API placeholders with independent cryptographically random secrets.                                                        |
| `npm run db:start`                                          | Starts the Compose PostgreSQL service and polls `pg_isready` before returning.                                                                                                                              |
| `npm run db:stop`                                           | Stops the Compose service without deleting its persistent volume.                                                                                                                                           |
| `npm run dev:prepare`                                       | Initializes missing env files, starts/waits for PostgreSQL, and applies committed migrations.                                                                                                               |
| `npm run dev:api`                                           | Starts the watch-mode NestJS API using `api/.env`.                                                                                                                                                          |
| `npm run dev:mobile`                                        | Starts Expo using `mobile/.env`.                                                                                                                                                                            |
| `npm run verify`                                            | Runs formatting, workflow contracts, automation tests, lint, generated-contract drift, API/mobile typechecks, unit tests, and builds.                                                                       |
| `npm run test:e2e:local`                                    | Starts/waits for PostgreSQL, migrates the isolated `e2e` schema, supplies safe test settings, and runs API e2e tests.                                                                                       |
| `npm run test:journey:local`                                | Migrates `e2e_mobile`, builds/starts/waits for the API, runs the real mobile API-client journey, and stops the API even when the test fails.                                                                |
| `npm run verify:full`                                       | Runs `verify`, the API e2e suite, and the live mobile API-client journey in sequence.                                                                                                                       |
| `npm run tools:install:android -- --accept-licenses`        | Installs the checksum-locked SDK into dedicated repository tooling storage.                                                                                                                                 |
| `npm run native:setup:ios`                                  | Selects the pinned Xcode build and verifies/creates the dedicated pinned simulator on a Mac.                                                                                                                |
| `npm run test:native:android:managed`                       | Owns a pinned emulator lifecycle and runs the same native journey recipe as CI.                                                                                                                             |
| `npm run native:doctor -- --platform android`               | Checks the pinned Node/npm/Maestro versions, Java, SDK, and a booted API 34 emulator before changing anything.                                                                                              |
| `npm run native:build:android` / `npm run native:build:ios` | Builds an installable debug APK or signed simulator app from source using the same build recipe as native CI.                                                                                               |
| `npm run test:native:android` / `npm run test:native:ios`   | Builds the native app, creates a fresh isolated schema, runs the actual Maestro UI journey, and cleans up owned services, schema, and emulator settings.                                                    |
| `npm run security:codeql:local`                             | Runs the pinned CodeQL bundle and default JavaScript/TypeScript code-scanning queries with CI's source scope; retains SARIF and fails on unsuppressed warnings/errors.                                      |
| `npm run dependencies:check`                                | Runs the root dependency audit, API production audit, and mobile production/full audits with the existing expiring exceptions.                                                                              |
| `npm run mobile:compatibility:check`                        | Runs Expo dependency compatibility and the pinned Expo Doctor against online maintenance metadata.                                                                                                          |
| `npm run verify:local -- --platform android`                | Runs dependency audits, `verify:full`, local CodeQL, a source native build, and the native UI journey for the explicitly selected platform. Without a platform argument, both Android and iOS are required. |
| `npm run hooks:install -- --platform android`               | Installs a repository-local pre-push gate using the shared native path policy; native changes run `verify:local`, other changes run `verify:full` and CodeQL.                                               |

The lower-level package scripts remain available for focused iteration. Use the
root commands for onboarding and pre-push confidence because they encode the
required ordering and safety settings.

## Safety Properties

- Environment initialization uses exclusive file creation and never prints the
  generated secrets.
- Existing `.env` files are preserved, including deliberate developer changes.
- E2e commands set their database URLs directly and never inherit the
  development `public` schema.
- Journeys refuse occupied API/Metro ports without stopping their owners.
  Use `STEAD_TEST_API_PORT=3001` for the API-client journey or
  `--api-port 3001` for native commands and hook installation. Debug native
  artifacts require Metro port 8081; stop an existing Metro session first.
- Native runs use a new `e2e_native_<random>` schema per attempt, including
  repeats, and drop only that owned schema. They reject remote database hosts
  and physical Android devices. Local `.env` settings never select the native
  test backend; Expo dotenv loading is disabled for these runs.
- `db:stop` preserves the database volume. Removing local data remains an
  explicit operator action.

## Native and Security Setup

Install root, API, and mobile dependencies and keep the Docker daemon running.
Exact tool versions live in `.github/ci.env`. Local and CI gates require the
same Node patch, npm, Eclipse Temurin build, Maestro, and CodeQL release.
`.nvmrc` selects the Node pin; `npm run toolchain:check` checks Node and npm
before the base verification gate. The package engine range describes
compatibility and does not replace the exact verification baseline.

Android also checks app and Expo module build tools, compile SDK revision, NDK, CMake, Gradle
wrapper, emulator version/build, platform tools, and the booted image's API,
revision, architecture, and fingerprint. Use the manifest's default AOSP
image and `pixel_6` profile. A Google APIs image is a different test environment.
The debug APK builds the selected emulator ABI in both local and CI recipes;
release and physical-device builds have a separate architecture matrix.
Run `npm run tools:install:android -- --accept-licenses` after reviewing the
Android SDK license. `.github/android-sdk-lock.json` selects exact Google
archive URLs, revisions and SHA-256 checksums for the entire SDK baseline,
including command-line tools and the system image. The installer stages a
complete SDK under `.tmp/android-sdk/<lock digest>-<host>-x64`, preserves global
SDK installations, and publishes only complete installations. Cached SDKs must
match the lock and their package metadata; source builds also validate the
packages through the SDK manager's read-only installed-package listing.
CI uses this installer too and does not run SDK updates or the third-party
emulator installer. The archive lock includes Build Tools 36 for the app and
Build Tools 35 required by Expo modules. Gradle SDK downloads are disabled, so
a new missing requirement fails instead of silently changing the installation.
Changing the lock invalidates SDK and app caches.
Set `ANDROID_HOME` and `JAVA_HOME` when automatic discovery
does not find them. Windows uses the native Windows CLI tools; invoking a
Windows SDK from a Linux Node process is not the supported setup.
The mobile package's `android` and `ios` scripts use Expo's native build/run
commands, matching the scripts generated by Expo prebuild.

Run `npm run tools:install:maestro` to install the pinned release into ignored
repository tooling storage. The shared installer checks the committed SHA-256
before extraction and refuses to replace unrelated existing directories.
CI's `install-maestro.sh` delegates to that same installer. Installer source,
version pins, and dependency lockfiles belong in Git; downloaded CLI binaries
and archives do not. An existing matching installation can be selected with
`STEAD_MAESTRO_BIN` (a `.bat` on Windows).
Install the full official CodeQL bundle matching `CODEQL_VERSION`, including
its query packs; set `STEAD_CODEQL_BIN` to its executable or put it on PATH.
`npm run native:doctor -- --platform android` reports the detected toolchain
and device and fails before builds or fixtures when requirements are missing.

iOS requires macOS and the pinned Xcode, Ruby, Bundler, CocoaPods, and simulator
runtime. Install the gems with `bundle install` from `mobile/` using those Ruby
and Bundler pins; `Gemfile.lock` locks the transitive CocoaPods dependencies.
Builds use `bundle exec pod`, so a different globally installed CocoaPods cannot
change the recipe. Create the dedicated simulator with
`xcrun simctl create "Stead Native iPhone 17" com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-26-5`.
Alternatively, `npm run native:setup:ios` selects Xcode 26.6 build 17F113,
checks the separately pinned iOS 26.5 runtime, and creates only the dedicated
simulator when needed. Local builds and CI select the same Xcode installation
without changing the machine's default. The runner image's Xcode version does
not imply an identically numbered simulator runtime.
Run `npm run native:doctor -- --platform ios` on that host. The iOS build signs simulator entitlements and validates its keychain
group using the same script as CI. Unit tests exercise entitlement extraction
on other hosts; they cannot execute Xcode, simulator keychain storage, or the
iOS cold-start journey. Initial test setup clears the entire simulator
keychain; the runner refuses personal simulators. The signed-in restart step
preserves the keychain and must restore the session.

`verify:local` and the pre-push hook also run `dependencies:check` with the
same blocking audit policy used in dependency CI. Registry advisories require
network access and can change without a source change.

`npm run workflows:check` runs repository workflow contracts plus actionlint
1.7.12 and ShellCheck 0.11.0 inside a digest-pinned container, both locally and
in CI. The checkout is read-only and analysis has no network access; only the
first image pull needs network access. Automation tests execute the actual
GitHub-script bodies with mocked API responses and intercepted writes. They
cover trusted provenance, drafts, missing/pending/failed/stale-head workflows,
merge SHA binding and preservation of human PR descriptions. API permissions,
webhook delivery and artifact/cache integration still need an actual PR run.
CI selects Ubuntu 24.04 explicitly. Hosted image patches and the host kernel
remain provider-controlled; the SDK archives and workflow-check container
are independently frozen.

`npm run mobile:compatibility:check` runs the pinned Expo Doctor and Expo's
online dependency check used in scheduled maintenance. That online check can
recommend newer patches even when an unchanged locked native app passes all
build and journey checks. It remains separate from the PR gate; address its
findings through the dependency-maintenance workflow. Do not weaken or skip its
checks to manufacture a pass.

Run the full available local gate before pushing:

```bash
npm run verify:local -- --platform android --api-port 3001
npm run test:native:android:managed -- --api-port 3001 --repeat 3
```

For Android, `verify:local` finishes its audits, base checks, CodeQL and source
build before creating, cold-booting and stopping a dedicated emulator from the
locked SDK, unless `--device` is supplied. Compilation and verification do not
compete with emulator startup. The
verification build uses Gradle's `--no-daemon` mode so its build JVM exits
before the emulator starts instead of retaining memory between builds. Kotlin
compiles inside that JVM. An init script records its process identifier, and
the runner waits for the process to exit even after the Gradle client returns.
A stuck build JVM blocks startup. The
managed journey command uses the same lifecycle as CI. Each run creates fresh
AVD user data and removes only that owned directory after stopping its emulator.
Managed validation checks available host memory before preparation and again
before boot: the pinned 4096 MiB guest needs another 1024 MiB of host reserve
for the API, Metro and Maestro. Insufficient memory fails before emulator
allocation with an actionable message; close unused applications or pause
other test runs before retrying. This preflight does not guarantee emulator
health or attribute every SystemUI failure to memory pressure.
It checks boot and
window focus through thirty seconds of stable startup before fixtures, reports blocking system dialogs as infrastructure
failures, retains emulator logs, and never dismisses dialogs automatically.
Emulator graphics, four CPU cores and memory settings are shared between local and CI.
An explicit `--device` continues to support a deliberately prepared emulator.
On a host capable of both pinned native environments, use `--platform all`.
The Android baseline uses an x86_64 emulator; an Apple Silicon Mac can provide
the iOS gate while Windows/Linux provides the matching Android gate. An unavailable
platform causes failure rather than a successful skip. An explicit Android
selection provides Android evidence only; it does not certify iOS. Native
tests build from source by default. `--app <path>` is available for focused
retests of a deliberately selected existing artifact and for CI's build-once
artifact transfer; report it separately from a new source build.

Each native attempt retains API/Metro logs, the prewarmed bundle, Maestro
debug output, JUnit results, and a summary with tool/device versions and app
SHA-256 under `.tmp/native-validation/`. CodeQL retains its database, SARIF,
and finding count under `.tmp/codeql-validation/`.
CodeQL extracts a snapshot of tracked and non-ignored untracked working-tree
files, including current edits and excluding installed tools and build caches.
This gives local extraction the same source-only checkout boundary as CI.
PostgreSQL uses an immutable Docker image locally and in Linux CI. macOS CI
builds the same exact PostgreSQL source release with a committed checksum;
native runs reject a different server patch version before allocating fixtures.
Repeats always use fresh fixtures. Every original failure remains a failure for the command even if a
later attempt passes; repeated successes help diagnose instability but do not
prove tests are never flaky. Do not commit these generated directories.

## Pre-push Defense

After tool setup, install the gate once for this checkout:

```bash
npm run hooks:install -- --platform android --api-port 3001 --repeat 3
```

The hook checks that the working tree is clean and the ref being pushed is
checked out, then validates those contents. It compares changed paths using
`.github/native-ci-paths.yml`, the same policy used by native CI. New branches
compare against their merge base with `origin/main`. Keep that remote ref
current. Installation saves tool paths and platform choice in repository-local
Git config, refuses to replace a custom hooks path, and defaults to requiring
both native platforms with one attempt. `--repeat 3` saves three independent
native attempts for each native-impacting push; any failed attempt blocks it.
Existing hook users should chain
`node scripts/pre-push-verification.mjs` into their hook, forwarding Git's
standard input. Later pushes also include the branch's full diff from that
merge base, so earlier native changes keep triggering the native gate.
Hooks are a developer guardrail, not branch protection: Git
can bypass them, so CI remains the independent verification gate.

This Windows checkout can execute Android, database-backed tests, and CodeQL.
To move iOS failures earlier too, provide a local or dedicated development Mac
with the same pins and run `verify:local -- --platform ios` there before pushing,
alongside the Android gate on this checkout. CI remains a second line of defense.
GitHub-specific permissions, Actions caches/artifact transfer, hosted runner
image changes, PR automation, dependency review, and branch protection still
need GitHub execution. Local source builds and workflow-contract checks reduce
that gap but cannot reproduce GitHub's control plane. Without a development Mac,
report local iOS execution as deferred and require macOS CI evidence before
merging. Portable setup tests cannot replace that build and simulator journey.

## Intentionally Manual Gates

Automation can prepare evidence, but it cannot truthfully replace these checks:

- Twilio or Termii account enrollment, sender approval, credentials, billing,
  and live carrier delivery on target devices.
- TalkBack and VoiceOver acceptance, physical-device secure-storage behavior,
  and subjective usability review.
- Customer validation of CSV exports, stability thresholds, and alert copy.
- Production infrastructure selection, support staffing, backup restoration,
  deletion-expiry evidence, incident response, and release approval.
- Repository governance decisions such as approval counts, bypass actors,
  merge strategy, and making new checks required.

These remain named release gates in the project documentation so a successful
local command is never mistaken for production validation.

</details>
