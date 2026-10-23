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

Android runs `mobile/.maestro/critical-native-journey.yaml` against the real API
and PostgreSQL. It covers dev OTP login, goal setup, transaction creation,
amount/note editing, deletion, and dashboard recalculation from 20% to 30% to 0%.
A signed-in process restart must reload the corrected data without another OTP;
after logout, a second restart must remain signed out.

Automatic iOS validation remains paused by `IOS_NATIVE_ENABLED=false`.
`mobile/e2e/compatibility.test.cjs` is an experimental Detox probe for bundled
app launch, exact keyboard input, an app-native alert, and signed-in process
restoration. It does not implement the financial journey and has not qualified
a replacement merge gate. Earlier native passes omitted editing and signed-in
iOS restoration; they do not establish those cases' coverage.

The iOS replacement must eventually cover the complete financial assertions
above, including corrected values after restoration. Qualify the framework on
fresh hosts without retries before porting the full journey. A compatibility
pass does not establish that the known fast-input React Native defect is fixed.

Native fixtures use only a disposable local database schema and test phone with
`SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true`. Each attempt gets a fresh schema;
never use real customer accounts or a production API. iOS attempts own and clean
up fresh simulators while preserving their credentials across the restart step.
The bundled Release simulator app validates keychain entitlements and does not
need Metro during execution. Android continues to use its Debug app and Metro.

`.github/workflows/native-ci.yml` delegates to the same root runner used locally.
Android runs for relevant PR/main changes, daily, and on demand. The iOS probe
requires explicit manual opt-in and provides only the coverage actually
executed. Commands, version pins, evidence, deadlines and the Windows/macOS
boundary are documented in [Developer Automation](developer-automation.md).
`native -- remote-ios` remains disabled until replacement qualification.

Simulator passes do not establish physical-device behavior, carrier SMS
delivery, TalkBack, or VoiceOver. API-client and component tests provide their
own boundaries; passing them does not substitute for native iOS evidence.

</details>
