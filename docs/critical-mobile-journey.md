# Critical Mobile Journey Verification

<details open>
<summary><strong>Show or hide document contents</strong></summary>

CI runs `mobile/integration/critical-journey.test.ts` against a running NestJS
API and PostgreSQL 16 in the dedicated `e2e_mobile` schema. The test uses the
mobile app's actual API client, generated response validators, request
interceptors, and bearer handling. It requests and verifies an OTP through the
development SMS provider, creates an active goal, creates/edits/deletes linked
transactions, verifies dashboard recalculation, restores bearer access, and
verifies that local logout causes an unauthenticated request. It removes its
test account after the case, including when an assertion fails after OTP
verification. Each run uses a fresh installation ID so a failure before
verification cannot exhaust the device OTP limit on later reruns.

The companion React Native component tests cover the auth and dashboard
screens, while an AuthProvider test covers token persistence, restoration, and
session-cache clearing on logout. Existing goal and transaction screen tests
cover their form and management paths. These tests do not render the whole app
against the live API or drive native Android/iOS navigation. They do not
validate Twilio/Termii delivery, device secure storage, TalkBack, or VoiceOver.
Rotating refresh-token behavior and session-expiry feedback are automated
separately; live-provider and physical-device expiry/revocation acceptance
remain release checks.

Repeat the live client/API run from the repository root:

```bash
npm run test:journey:local
```

The command starts PostgreSQL, waits for readiness, applies migrations to the
dedicated `e2e_mobile` schema, supplies test-only secrets and the development
SMS provider, builds and starts the API, waits for its health endpoint, runs the
mobile test, and always stops the API process.

The test refuses any non-localhost URL. Never point the server at a development
`public` schema or a production database for this run. The local runner and CI
both supply the isolated settings and manage the API process automatically.

## Native UI journey

`mobile/.maestro/critical-native-journey.yaml` requires the installed Android and
iOS apps to complete OTP login, goal setup, transaction creation, amount/note
editing, and deletion. An income initially funds 20% of the goal; editing its
amount must update the dashboard to 30%. A signed-in process stop and launch
preserves app state and the iOS keychain, then requires the authenticated
dashboard, the 30% progress, and the corrected transaction to reload without
another OTP. After deletion, progress must return to 0%. Logout is followed by
a second process restart that must stay on the login screen. Both platforms
execute both restart checks; iOS restoration has no skip or login fallback.

It uses visible development OTP, so it does **not** require a
Twilio or Termii account. It requires a disposable API database schema and
`SMS_PROVIDER=dev`, `DEV_EXPOSE_OTP=true`; never use a real customer account or
production API. The flow clears the app's local state at the beginning and
uses a dedicated test phone supplied by the runner. Each attempt gets a fresh
database schema so a repeated run does not inherit the previous account.

Native simulator jobs live in `.github/workflows/native-ci.yml`. Its `config`
job reports on every pull request and `main` push; Android Maestro runs
when the shared native path policy detects relevant mobile, API, contract, or CI
changes, and iOS runs the same complete journey. `Native Readiness` requires
both applicable platforms and fails rather than treating disabled iOS as
success. The suite also supports an explicit `workflow_dispatch`; there is no
separate nightly or release variant. Earlier successful runs covered a narrower flow: they did
not exercise transaction editing or signed-in iOS cold-start restoration.
Evidence for those cases must come from runs of the expanded flow. Dedicated `build-android` /
`build-ios` jobs produce installable binaries (cached by native inputs) and
hand them to Maestro jobs as artifacts. The iOS simulator build uses ad-hoc
signing with a bundle-scoped keychain group and checks the resulting signature
and embedded simulator entitlements in each architecture before publishing
the artifact. This enables SecureStore
persistence required by the signed-in cold-start check. Android cold-boots a
dedicated emulator from the checksum-locked SDK without snapshots; iOS miss
builds restore source mtimes and use inode-aware DerivedData
plus Pods caches. Metro transforms and the Maestro CLI are cached per platform.
Android CI also restores BuildKit dependency layers across hosted runners, but
always rebuilds the source and transferred-APK layers and verifies their image
identity. Both platform jobs retain journey evidence for seven days whether the
journey succeeds or fails.
The iOS build embeds JavaScript so its journey runner does not install mobile
dependencies or run Metro alongside PostgreSQL, the API, Maestro, and the
simulator.
Pull requests also keep `mobile-api-journey` and unit coverage for the same
business journey. It does not prove physical device behavior, carrier SMS
delivery, TalkBack, or VoiceOver.

Local native commands now own the build, isolated database fixtures, API,
Metro, emulator port forwarding, and Maestro execution. Setup, commands,
repeat-run evidence, explicit local validation, and the remaining macOS boundary
are documented in
[Developer Automation](developer-automation.md#native-and-security-setup).
Native CI delegates to the same runner. Developers should produce local
evidence for their available platforms. Developers without a Mac can run
`npm run native -- remote-ios` from a clean committed checkout to validate the
exact commit on GitHub-hosted macOS and download its evidence.

</details>
