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
