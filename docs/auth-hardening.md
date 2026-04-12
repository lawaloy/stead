# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

## Current Status

Implemented:

- Phone numbers are normalized before user lookup and OTP lifecycle operations.
- OTP request and verify endpoints accept request IP and user-agent metadata.
- OTP request throttling exists for both phone-level and IP-level limits.
- OTP resend cooldown is enforced.
- OTP verify attempts are counted per OTP record and lock after the configured max attempts.
- OTP verify failures are also rate-limited by IP within a configurable time window.
- Auth events are persisted for request, rate-limit, resend-blocked, verify-failed, verify-locked, and verify-succeeded outcomes.
- OTP delivery is queued through persisted notification jobs.
- Notification jobs support `pending`, `processing`, `sent`, and `dead_letter` states, retry backoff, provider name, and provider message id capture.
- Twilio and Termii are supported SMS providers.
- Provider configuration fails fast when required env vars are missing.
- A dev-only OTP response path exists behind `DEV_EXPOSE_OTP=true`.
- Authenticated inspection endpoints exist for auth telemetry and notification queue state.
- Mobile auth has request, verify, resend cooldown, invalid-code, expired-code, lockout messaging, token persistence, and unauthorized-session clearing behavior.

## Remaining

### Auth controls

- Extend abuse controls beyond the current phone- and IP-level throttles.
- Consider whether OTP request and verify should capture more device/request context.

#### Checklist

- Add device-aware throttling in addition to OTP- and IP-level attempt limits.
- Add operator-facing visibility for lockout trends and repeated auth failures by phone or IP.

### Provider and operations

- Configure a real SMS provider in at least one target environment.
- Validate the full OTP path with a real phone number.
- Add clearer operator-facing tooling for inspecting OTP delivery and dead-letter jobs.

#### Checklist

- Pick the first live provider for the target environment.
- Configure the target environment with real provider credentials.
- Run one real-phone OTP request and verify pass end to end.
- Confirm notification jobs move through `pending` -> `sent` and capture provider metadata.
- Capture an operator playbook for diagnosing send failures and dead-letter jobs.

### Mobile and product flow

- Verify the mobile request OTP -> verify OTP -> authenticated session flow end to end.
- Confirm token persistence and app restart behavior against a real API environment.
- Continue refining user-facing handling now that the auth flow has clearer resend, cooldown, invalid-code, and lockout states.

#### Checklist

- Test request OTP, receive code, verify OTP, and land in the authenticated app flow on a real device.
- Verify token persistence survives app restart.
- Verify the new UI states for invalid code, expired code, resend cooldown, and too-many-attempts cases against a real provider-backed flow.
- Confirm unauthorized session expiry still clears auth state and returns the user to the auth flow.

## Acceptance Criteria

- Phone numbers are stored and used in a canonical format. Done.
- OTP requests enforce a short resend cooldown. Done.
- OTP request records include client metadata when available. Done.
- Auth tests cover the critical request and verify paths. Done.
- OTP jobs survive process restarts and persist retry/dead-letter state. Done.
- Active SMS provider configuration fails fast when required env is missing. Done.
- Auth events persist resend and verify outcomes for later inspection. Done.
- Remaining work focuses on real-provider validation, stronger device-aware abuse controls, and operator visibility.
