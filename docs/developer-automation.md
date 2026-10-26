# Developer Automation

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Run these commands from the repository root. For onboarding and the PR
workflow, see [Contributing](../CONTRIBUTING.md).

## Command Matrix

| Command                                              | Purpose                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run bootstrap`                                  | Install all dependencies, initialize missing env files, start PostgreSQL, and apply development migrations.    |
| `npm run env:init`                                   | Create missing env files from examples and generate three independent API secrets. Preserve existing files.    |
| `npm run db:start` / `npm run db:stop`               | Start and wait for PostgreSQL, or stop it while preserving its volume.                                         |
| `npm run dev:prepare`                                | Initialize missing env files, start PostgreSQL, and migrate the development database.                          |
| `npm run dev:api` / `npm run dev:mobile`             | Start the API or Expo using its package's `.env`.                                                              |
| `npm run verify`                                     | Check tool versions, formatting, workflows, automation tests, lint, contracts, types, unit tests, and builds.  |
| `npm run test:e2e:local`                             | Migrate the isolated `e2e` schema and run API e2e tests with safe test settings.                               |
| `npm run test:journey:local`                         | Migrate `e2e_mobile`, start the API, run the real mobile API-client journey, and stop the API.                 |
| `npm run verify:full`                                | Run `verify`, API e2e tests, and the API-client journey.                                                       |
| `npm run dependencies:check`                         | Run root, API, and mobile audits with the committed expiring exceptions.                                       |
| `npm run mobile:compatibility:check`                 | Check Expo dependencies and run the pinned Expo Doctor against online maintenance metadata.                    |
| `npm run workflows:check`                            | Run workflow contracts, actionlint, and ShellCheck in a pinned container.                                      |
| `npm run tools:install:maestro`                      | Install the checksum-verified Maestro release into ignored repository storage.                                 |
| `npm run tools:install:android -- --accept-licenses` | Install the checksum-locked Android SDK after reviewing its license.                                           |
| `npm run native -- setup --platform ios`             | Select pinned Xcode and prepare the dedicated simulator on macOS.                                              |
| `npm run native -- doctor --platform android`        | Check the native toolchain and a booted emulator. Use `ios` on a Mac.                                          |
| `npm run native -- build --platform android`         | Build a simulator app using CI's recipe. Use `ios` on a Mac.                                                   |
| `npm run native -- test --platform android`          | Run the journey on a prepared device. Select `--android-runner managed` or `container` to own the emulator.    |
| `npm run native -- remote-ios`                       | Push the exact clean commit to a temporary branch, run iOS remotely, download evidence, and remove it on pass. |
| `npm run security:codeql:local`                      | Run the pinned CodeQL bundle and fail on unsuppressed warnings/errors.                                         |
| `npm run validate -- --platform android`             | Run audits, `verify:full`, CodeQL, a native source build, and UI journeys.                                     |

Package-level scripts remain available for focused iteration. Use the root
gates before pushing; they enforce ordering and test database isolation.

## Safety Properties

- Environment initialization never overwrites existing `.env` files or prints
  generated secrets. Restart API or Expo processes after environment changes.
- Database-backed tests use dedicated schemas, never development `public`.
  Native attempts accept only a local database and drop only their own
  `e2e_native_<random>` schema. Local `.env` files do not select the native backend.
- Journeys reject occupied ports without stopping their owners. Use
  `STEAD_TEST_API_PORT=3001` for the API-client journey or `--api-port 3001`
  for native commands. Android debug apps require Metro port 8081; iOS journey
  builds carry their JavaScript bundle and do not start Metro.
- Managed runs remove only their owned emulator data and services. Native
  Android validation rejects physical devices; iOS setup clears the dedicated
  simulator's keychain and refuses personal simulators. The signed-in restart
  step preserves credentials and verifies session restoration.
- Repeats use fresh fixtures and retain every result. Any failed attempt or
  container OOM kill fails the command, even if later attempts pass.
- Each Maestro process has the shared 12-minute deadline in `.github/ci.env`.
  A driver/JVM hang fails the attempt and stops its process tree so cleanup and
  evidence collection can finish. App assertion timeouts remain independent.

## Native and Security Setup

Install dependencies and keep Docker running. Exact local/CI versions live in
[`.github/ci.env`](../.github/ci.env); `.nvmrc` selects Node, and
`npm run toolchain:check` verifies Node/npm. The package engine range does not
replace these exact validation pins. Commit installer source, pins and
lockfiles; keep downloaded tools, images and evidence out of Git.

Install Maestro with the root command above. Set `STEAD_MAESTRO_BIN` to select
an existing matching installation (`.bat` on Windows). Install the full official
CodeQL bundle, including query packs, at the pinned version; put its executable
on PATH or set `STEAD_CODEQL_BIN`.

**Android:** use the SDK installer and Eclipse Temurin pin. The installer
preserves global SDKs and stores complete installations under
`.tmp/android-sdk/`. [The SDK lock](../.github/android-sdk-lock.json) owns archive
URLs, revisions and checksums. Validation checks SDK/build tools, emulator and
system-image identity. Use the pinned AOSP image and `pixel_6` profile.
Set `JAVA_HOME` and `ANDROID_HOME` when discovery needs help. On Windows, run
Windows Node and SDK tools together.

The controlled runner needs an x86_64 Linux Docker engine exposing usable
`/dev/kvm`, including on supported WSL2 installations, and at least 10 GiB of
engine memory (9 GiB runner plus 1 GiB reserve). Its first build downloads the
pinned tools; later local builds reuse Docker layers. CI restores dependency
layers from a repository-scoped BuildKit cache keyed by the immutable
toolchain, Docker recipe, and package inputs, while rebuilding the exact source
and transferred-APK layers. The cache is an acceleration only and cannot
replace source or artifact identity checks. Host-managed Android needs at least
5 GiB of available RAM before emulator allocation. Builds finish before booting
fresh emulators; readiness checks reject blocking system dialogs. Host CPU/RAM,
KVM, kernel and Docker health remain external requirements.

**iOS:** macOS is required for Xcode and simulator execution; Windows, WSL and
Docker cannot run this gate. Install the pinned Xcode/runtime, Ruby and Bundler,
then run `bundle install` in `mobile/` and `npm run native -- setup --platform ios` at the root.
Setup selects Xcode without changing the machine default and creates the
dedicated simulator. Release-configured simulator builds embed JavaScript, use
locked CocoaPods, and validate simulator keychain entitlements. The journey
warms the installed app before Maestro and performs one erase-and-reboot
recovery only when that infrastructure launch fails.
`IOS_DRIVER_STARTUP_TIMEOUT_MS` sets the shared driver startup budget; app
assertions keep their own limits. `IOS_SIMULATOR_PREPARATION_TIMEOUT_MS` bounds
the complete boot/install/warm-up sequence, including its one recovery.

Use `--platform ios` for iOS or `--platform all` where both pinned environments
are available. Omitting the platform from `validate` requires both.
Unavailable platforms fail rather than skip. Android results provide Android
evidence only. `--device` selects a prepared Android emulator; `--app <path>`
reuses an existing artifact and must be reported separately from a source
build. A provided iOS app must retain its sibling repository build-metadata
file and match the run's API port and fixture phone because both values are
embedded in its Release JavaScript bundle.

Native journeys print each Maestro command's status live. The single-flow
runner uses plain output because Maestro's JUnit mode suppresses step progress.
Evidence stays in ignored directories:

- `.tmp/native-validation/`: service logs, bundle, Maestro command results and
  screenshots, plus JSON results with source/tool/device identity and app SHA-256.
- `.tmp/native-container/`: source/image identity, per-attempt logs, results and
  `memory.json` with peak usage and OOM counters.
- `.tmp/codeql-validation/`: source snapshot, database, SARIF and finding count.

Native CI retains the Android and iOS journey evidence artifacts for seven days
on successful and failed runs. Build caches are not evidence and are not
included in those artifacts.

## Local Validation

Run the complete gate explicitly before pushing native changes. For CI's
controlled Android runner:

```bash
npm run validate -- --platform android --android-runner container --api-port 3001 --repeat 3
```

Omit `--android-runner container` to use a managed host emulator. Use
`--platform ios` on a Mac. `validate` replaces the previous `verify:local` command.
Validation runs independently of Git; `git push` does not start tests or
emulators. Rerun the relevant gate after source changes and report the tested
commit and platforms in the PR. CI checks still gate merging.

Earlier checkouts that installed the removed repository hook can clear its
local configuration with `git config --local --unset core.hooksPath` if
`git config --get core.hooksPath` reports `.githooks`. Preserve custom hook
configurations.

Native subcommands replace the previous per-platform npm wrappers. Run
`npm run native` for usage. `verify` retains all stages of the removed `check`
alias; focused lint, format, test and build commands remain available.

`IOS_NATIVE_ENABLED` in [`.github/ci.env`](../.github/ci.env) is an emergency
switch, not a normal optimization. The aggregate `Native Readiness` job fails a
native-impacting PR when iOS is disabled or either applicable platform does not
complete. Each PR execution runs the complete financial and signed-in
cold-start journey once; repetition is not additional functional coverage.

`npm run native -- remote-ios` is the Windows/Linux bridge: it requires a clean
committed public-repository checkout, uploads that exact commit to an owned
temporary branch, dispatches the iOS-only workflow, downloads evidence, and
deletes the branch after a verified pass. A failed run retains its branch and
evidence for investigation. Read-only GitHub polling uses bounded exponential
backoff for transient transport failures; pushes and workflow dispatches are
never retried automatically. Windows/WSL still cannot execute the simulator locally.

GitHub permissions, events, caches, artifacts, PR automation, dependency review
and branch protection require GitHub execution. Portable workflow/setup tests
cover contracts, not those integrations. Hosted runner image updates also
remain provider-controlled.

Audits depend on current registry advisories. Online Expo compatibility is a
separate dependency-maintenance check and can recommend updates even when the
locked app builds and passes its journeys.

## Intentionally Manual Gates

A local or CI pass does not replace live SMS delivery, TalkBack/VoiceOver and
physical-device testing, usability/customer validation, production operations
and release approval, or repository governance decisions. Track those gates in
[Project Status](project-status.md) and the relevant operational documentation.

</details>
