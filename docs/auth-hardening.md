# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable"
for early environments.

## Current Validation Status

The API path is automated: PostgreSQL-backed e2e tests cover OTP persistence,
dev-provider delivery, verification, retry, and dead-letter behavior. Mobile
schemas and token storage have unit coverage. What remains unproven is the
integrated mobile/device experience against a running local API.

## P0: Local Mobile Auth Acceptance Pass

This is the next engineering task and does not depend on a paid SMS provider.

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

## P1: Abuse Controls and Operator Diagnostics

- Add device-aware throttling beyond the current phone- and IP-level limits.
- Decide which additional device/request context OTP request and verify events
  should retain.
- Add operator visibility for lockout trends and repeated failures by phone or
  IP.
- Improve operator workflows for investigating failed and dead-letter
  notification jobs.

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

Remaining:

- [ ] Complete the P0 local mobile auth acceptance pass.
- [ ] Add stronger device-aware abuse controls.
- [ ] Expand operator diagnostics for abuse and delivery failures.
- [ ] Complete a real-provider, real-device OTP pass when sender access is
  available.
