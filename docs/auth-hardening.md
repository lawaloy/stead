# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

## Completed

### Auth foundation

- Normalize phone numbers before lookup, storage, and SMS dispatch.
- Make auth input country-aware so local numbers can be normalized without assuming Nigeria by default.
- Use `libphonenumber-js` for phone parsing instead of custom string rules.
- Capture request metadata for OTP issuance.
- Add basic OTP resend cooldown.
- Strengthen auth service tests around request and verify behavior.

### Delivery reliability

- Replace the in-memory notification queue with a durable database-backed notification job queue.
- Persist retry, dead-letter, provider, and delivery metadata for OTP jobs.
- Add provider and environment validation for the active SMS provider.
- Add a protected notification inspection endpoint for recent OTP job visibility.

## Remaining

### Auth controls

- Add verify-attempt throttling and stronger abuse controls.
- Add resend and verify telemetry that is easier to inspect over time.
- Consider whether OTP request and verify should capture more device/request context.

### Provider and operations

- Configure a real SMS provider in at least one target environment.
- Validate the full OTP path with a real phone number.
- Decide whether to add a dev-only OTP inspection path for faster local iteration.
- Add clearer operator-facing tooling for inspecting OTP delivery and dead-letter jobs.

### Mobile and product flow

- Verify the mobile request OTP -> verify OTP -> authenticated session flow end to end.
- Confirm token persistence and app restart behavior against a real API environment.
- Improve user-facing handling for provider downtime, expired codes, and repeated invalid attempts.

## Earlier Phase Framing

### Phase 1

- Normalize phone numbers before lookup, storage, and SMS dispatch.
- Make auth input country-aware so local numbers can be normalized without assuming Nigeria by default.
- Capture request metadata for OTP issuance.
- Add basic OTP resend cooldown.
- Strengthen auth service tests around request and verify behavior.

### Phase 2

- Replace the in-memory notification queue with a durable queue or outbox.
- Add structured delivery logs for enqueue, send, retry, and dead-letter events.
- Add provider and environment validation for the active SMS provider.

### Phase 3

- Add verify-attempt throttling and stronger abuse controls.
- Add end-to-end mobile verification in a real environment.
- Add support tooling for OTP delivery inspection and failure diagnosis.

## Acceptance Criteria

- Phone numbers are stored and used in a canonical format.
- OTP requests enforce a short resend cooldown.
- OTP request records include client metadata when available.
- Auth tests cover the critical request and verify paths.
- OTP jobs survive process restarts and persist retry/dead-letter state.
- Active SMS provider configuration fails fast when required env is missing.
- Remaining work focuses on real-provider validation, abuse controls, and operator visibility.
