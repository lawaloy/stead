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
- Add verify-attempt throttling and OTP invalidation after repeated failed verification attempts.
- Strengthen auth service tests around request and verify behavior.

### Delivery reliability

- Replace the in-memory notification queue with a durable database-backed notification job queue.
- Persist retry, dead-letter, provider, and delivery metadata for OTP jobs.
- Add provider and environment validation for the active SMS provider.
- Add a protected notification inspection endpoint for recent OTP job visibility.

### Auth telemetry and inspection

- Persist auth behavior events for OTP request, resend blocking, verify failure, verify lockout, and verify success.
- Capture request metadata on OTP verification as well as OTP request.
- Add a protected auth inspection endpoint for recent auth event visibility and summary counts.
- Add IP-aware throttling for OTP requests and repeated verification failures.

## Remaining

### Auth controls

- Extend abuse controls beyond the current OTP- and IP-level throttles.
- Consider whether OTP request and verify should capture more device/request context.

#### Checklist

- Add device-aware throttling in addition to OTP- and IP-level attempt limits.
- Decide whether verify-attempt limits should be configurable per environment.
- Add operator-facing visibility for lockout trends and repeated auth failures by phone or IP.

### Provider and operations

- Configure a real SMS provider in at least one target environment.
- Validate the full OTP path with a real phone number.
- Decide whether to add a dev-only OTP inspection path for faster local iteration.
- Add clearer operator-facing tooling for inspecting OTP delivery and dead-letter jobs.

#### Checklist

- Pick the first live provider and document the required environment variables.
- Configure the target environment with real provider credentials.
- Run one real-phone OTP request and verify pass end to end.
- Confirm notification jobs move through `pending` -> `sent` and capture provider metadata.
- Capture the operator playbook for diagnosing send failures and dead-letter jobs.

### Mobile and product flow

- Verify the mobile request OTP -> verify OTP -> authenticated session flow end to end.
- Confirm token persistence and app restart behavior against a real API environment.
- Improve user-facing handling for provider downtime, expired codes, and repeated invalid attempts.

#### Checklist

- Test request OTP, receive code, verify OTP, and land in the authenticated app flow on a real device.
- Verify token persistence survives app restart.
- Add clearer UI states for invalid code, expired code, resend cooldown, and too-many-attempts cases.
- Confirm unauthorized session expiry still clears auth state and returns the user to the auth flow.

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

- Add verify-attempt throttling and layered abuse controls.
- Add end-to-end mobile verification in a real environment.
- Add support tooling for OTP delivery inspection and failure diagnosis.

## Acceptance Criteria

- Phone numbers are stored and used in a canonical format.
- OTP requests enforce a short resend cooldown.
- OTP request records include client metadata when available.
- Auth tests cover the critical request and verify paths.
- OTP jobs survive process restarts and persist retry/dead-letter state.
- Active SMS provider configuration fails fast when required env is missing.
- Auth events persist resend and verify outcomes for later inspection.
- Remaining work focuses on real-provider validation, stronger abuse controls, and operator visibility.
