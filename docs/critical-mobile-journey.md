# Critical Mobile Journey Verification

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
cover their form and management paths. These tests do not render the whole app against the live API
or drive native Android/iOS navigation. They do not validate Twilio/Termii
delivery, device secure storage, TalkBack, or VoiceOver. JWT revocation and
expiry UX remain separate session-lifecycle work.

To repeat the live client/API run locally, use only a disposable database schema:

1. Start PostgreSQL with `cd api; docker compose up -d`.
2. In `api/`, set `DATABASE_URL` to
   `postgresql://stead:stead@localhost:5432/stead?schema=e2e_mobile`, set the
   three distinct test secrets, `NODE_ENV=test`, `SMS_PROVIDER=dev`, and
   `DEV_EXPOSE_OTP=true`.
3. Run `npx prisma migrate deploy`, then `npm run build`, then
   `node dist/src/main.js`. Keep that process running.
4. In `mobile/`, set `STEAD_TEST_API_URL=http://127.0.0.1:3000` and run
   `npm run test:live-api`.

The test refuses any non-localhost URL. Never point the server at a development
`public` schema or a production database for this run. The CI job supplies all
test environment variables and starts/stops the API automatically.

## Native UI journey

`mobile/.maestro/critical-native-journey.yaml` drives the installed Android or
iOS app through OTP login, goal setup, transaction creation/correction/deletion,
dashboard refresh, process restart with session restoration, and logout with a
second restart. It uses visible development OTP, so it does **not** require a
Twilio or Termii account. It requires a disposable API database schema and
`SMS_PROVIDER=dev`, `DEV_EXPOSE_OTP=true`; never use a real customer account or
production API. The flow clears the app's local state at the beginning and
uses a dedicated test phone (`TEST_PHONE`) supplied by the runner.

Native simulator jobs live in `.github/workflows/native-ci.yml`. Android and
iOS Maestro run on path-filtered pull requests and after merge to `main` (when
mobile UI, Maestro, packaging, API, or native CI wiring changes), on a daily
schedule, and via `workflow_dispatch`. Dedicated `build-android` /
`build-ios` jobs produce installable binaries (cached by native inputs) and
hand them to Maestro jobs as artifacts. Android warm boots use a cached AVD
snapshot; iOS miss builds restore source mtimes and use inode-aware DerivedData
plus Pods caches. Metro transforms and the Maestro CLI are cached per platform.
Pull requests also keep `mobile-api-journey` and unit coverage for the same
business journey. It does not prove physical device behavior, carrier SMS
delivery, TalkBack, or VoiceOver.

To run locally, start the API against a dedicated disposable schema as above,
install and start a native debug build (`npx expo run:android` on a configured
Android emulator, or `npx expo run:ios` on macOS with Xcode and an iOS
simulator), and run
`maestro test -e TEST_PHONE=0803XXXXXXX .maestro/critical-native-journey.yaml`
from `mobile/`. Use a different disposable Nigerian test number for each run.
Android needs `adb reverse tcp:3000 tcp:3000` and
`adb reverse tcp:8081 tcp:8081` when the app uses `127.0.0.1`. The local
machine must have Java 17+, the Maestro CLI, the appropriate native SDK, and
the development API/Metro servers running. This Windows workstation has no
Android emulator and cannot run an iOS simulator; CI is the execution source
for both platform results.
