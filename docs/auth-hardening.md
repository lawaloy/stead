# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable"
for early environments.

## Current Validation Status

The API path is automated: PostgreSQL-backed e2e tests cover OTP persistence,
dev-provider delivery, verification, retry, and dead-letter behavior. Mobile
schemas and token storage have unit coverage. The integrated Expo web path has
also passed against a running local API. A native Android/iOS device pass
remains part of real-provider validation.

## P0: Local Mobile Auth Acceptance Pass

This acceptance pass is complete for Expo web and did not require a paid SMS
provider.

- Start Postgres and apply current migrations to the development schema.
- Start the API with `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true`.
- Request an OTP from the mobile app and confirm the development hint is shown.
- Verify the OTP and land in the authenticated application flow.
- Confirm the persisted notification job reaches `sent` with provider `dev`,
  either through the allowlisted operator inspection endpoint or directly in
  the local database.
- Restart the app and confirm the authenticated session is restored.
- Exercise an unauthorized response and confirm the token is cleared and the
  app returns to the auth flow.
- Record the device/platform tested and any defects found.

Exit criterion: one repeatable mobile -> API -> notification job -> verify ->
authenticated session -> app restart pass, with no manual database edits.

`SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true` remain development-only; startup
validation rejects them in production.

### Validation Record

Completed on 2026-08-05 using Expo web in Microsoft Edge against the local
NestJS API and PostgreSQL 16 container. No manual database edits were used.

- OTP request returned successfully and displayed the development OTP hint.
- The persisted `otp.requested` notification job reached `sent` with provider
  `dev` and a populated send timestamp.
- OTP verification returned successfully and routed to the authenticated
  dashboard.
- The JWT remained in platform storage and restored the authenticated session
  after a full page reload, the Expo web equivalent of an app restart.
- Replacing the stored JWT with an invalid token produced a protected API 401;
  the app cleared the token and returned to the login flow.
- The browser reported no uncaught page errors during the pass.

The workstation has no Android SDK/emulator (`adb` and `emulator` are not
installed), so this record does not claim a native Android/iOS lifecycle pass.

## P1: Abuse Controls and Operator Diagnostics

The mobile app now creates a random installation UUID and persists it with the
same platform-aware SecureStore/browser fallback strategy used for sessions. It
sends that value in `X-Stead-Device-Id`. The API validates the UUID, converts it
immediately to an HMAC using `AUTH_DEVICE_IDENTIFIER_SECRET`, and persists only
the keyed hash on auth events. Raw device IDs are neither stored nor returned.

The device signal is intentionally additive, not trusted identity: clients can
omit or rotate it, so phone and IP controls remain authoritative independent
limits. Device request and verify-failure windows make abuse from one honest
installation visible even when networks or target phone numbers change.

The allowlisted auth inspection endpoint now includes:

- event counts for the last 15 minutes, hour, and 24 hours;
- top repeated abuse dimensions for masked phones, IPs, and short device
  references;
- device-signal coverage for OTP requests; and
- the short device reference on recent events.

The notification inspection endpoint now reports retrying work, stale processing
locks, attempt failures and dead letters in the last 24 hours, the oldest pending
job, and the most recent failure. Inspection payloads continue to omit OTPs and
raw device IDs.

Operator workflow:

1. Compare the auth inspection windows to distinguish a current spike from a
   longer-running pattern, then identify whether a masked phone, network, or
   device reference is recurring.
2. Check notification queue health to distinguish abuse controls from delivery
   trouble. Start with stale processing, the oldest pending job, and the latest
   failure.
3. Correlate timestamps and pseudonymous references. OTP payloads and raw device
   identifiers are intentionally unavailable through inspection.

If self-declared installation IDs become insufficient against a stronger abuse
threat, platform attestation or a dedicated edge risk service is the next
control; expanding the authority of this header is not.

## Deferred: Real-provider Validation

Real-provider validation remains blocked until a paid or verified sender setup
is available. Once available:

- Pick the first live provider for the target environment.
- Configure provider credentials outside source control.
- Run request OTP -> notification job -> provider delivery -> verify OTP with a
  real phone number.
- Confirm notification jobs move from `pending` to `sent` and retain provider
  metadata.
- Verify invalid-code, expired-code, resend-cooldown, and attempt-lockout states
  against the provider-backed flow on a real device.
- Capture the operator playbook for diagnosing send failures and dead-letter
  jobs.

## Acceptance Criteria

Completed:

- [x] Phone numbers are stored and used in a canonical format.
- [x] OTP requests enforce a short resend cooldown.
- [x] OTP request records include client metadata when available.
- [x] Auth tests cover the critical request and verify paths.
- [x] OTP jobs survive process restarts and persist retry/dead-letter state.
- [x] Active SMS provider configuration fails fast when required environment
      variables are missing.
- [x] Auth events persist resend and verify outcomes for later inspection.
- [x] Local/dev SMS mode exercises queue-backed OTP delivery without third-party
      SMS spend.
- [x] Notification inspection exposes recent masked jobs, status, provider
      metadata, and failures.
- [x] PostgreSQL-backed CI coverage verifies OTP persistence, dev-provider
      delivery, verification, retries, and dead-lettering.
- [x] Complete the P0 local mobile auth acceptance pass on Expo web.
- [x] Add stronger device-aware abuse controls.
- [x] Expand operator diagnostics for abuse and delivery failures.

Remaining:

- [ ] Complete a real-provider, real-device OTP pass when sender access is
      available.
