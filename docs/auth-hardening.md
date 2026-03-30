# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

## Remaining

### Auth controls

- Extend abuse controls beyond the current OTP- and IP-level throttles.
- Consider whether OTP request and verify should capture more device/request context.

#### Checklist

- Add device-aware throttling in addition to OTP- and IP-level attempt limits.
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
- Continue refining user-facing handling now that the auth flow has clearer resend, cooldown, invalid-code, and lockout states.

#### Checklist

- Test request OTP, receive code, verify OTP, and land in the authenticated app flow on a real device.
- Verify token persistence survives app restart.
- Verify the new UI states for invalid code, expired code, resend cooldown, and too-many-attempts cases against a real provider-backed flow.
- Confirm unauthorized session expiry still clears auth state and returns the user to the auth flow.

## Acceptance Criteria

- Phone numbers are stored and used in a canonical format.
- OTP requests enforce a short resend cooldown.
- OTP request records include client metadata when available.
- Auth tests cover the critical request and verify paths.
- OTP jobs survive process restarts and persist retry/dead-letter state.
- Active SMS provider configuration fails fast when required env is missing.
- Auth events persist resend and verify outcomes for later inspection.
- Remaining work focuses on real-provider validation, stronger abuse controls, and operator visibility.
