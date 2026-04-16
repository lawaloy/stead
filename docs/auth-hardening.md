# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

### Next work queue

Complete these items before real-provider validation, removing each item from this document as it is completed.

Rationale:

- Real Twilio validation is blocked until a paid or verified sender setup is available.
- The auth and notification pipeline should still be testable end to end in local and early development environments.
- Operator inspection and focused coverage should be ready before live SMS debugging.

1. Add a local/dev SMS provider mode.
   - Add a development provider option, for example `SMS_PROVIDER=dev`.
   - Ensure dev-provider startup validation is explicit and only safe for non-production use.
   - Process OTP notification jobs through the existing consumer without calling Twilio or Termii.
   - Mark dev-provider jobs as `sent` with provider metadata.
   - Log or expose the OTP only in development-safe output or inspection paths.
   - Validate the queue, consumer, and job lifecycle without Twilio spend.

2. Improve operator inspection for OTP jobs.
   - Make the existing inspection endpoint show recent jobs, status, last error, provider, provider message id, timestamps, and masked phone.
   - Keep raw OTP values out of normal operator output.
   - Ensure the output is useful for diagnosing provider failures and dead-letter jobs.

3. Add contract and integration coverage around auth plus notification queue.
   - Confirm request OTP creates an OTP record, auth event, and notification job.
   - Confirm the consumer can process a job through the SMS abstraction.
   - Confirm failures retry and eventually dead-letter.
   - Add focused tests for provider selection, job processing, and non-production guardrails.

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
