# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

### Next work queue

Complete these items before real-provider validation, removing each item from this document as it is completed.

Rationale:

- Real Twilio validation is blocked until a paid or verified sender setup is available.
- Local/dev SMS mode exists, and OTP requests should still exercise the persisted notification job pipeline.
- Operator inspection exists for provider status and recent masked notification jobs.
- Focused coverage should keep the local OTP path and future live-provider changes from drifting apart.

1. Run the local OTP flow end to end through the dev provider.
   - Start the API with `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true`.
   - Keep `SMS_PROVIDER=dev` limited to non-production environments; startup validation rejects it in production.
   - Request OTP from the mobile app.
   - Verify the OTP, land in the authenticated app flow, and inspect the notification job as `sent`.
   - Confirm token persistence survives an app restart.

2. Prepare for real-provider validation.
   - Pick the first live provider for the target environment.
   - Configure provider credentials outside source control.
   - Run request OTP -> notification job -> provider delivery -> verify OTP with a real phone number.
   - Capture the operator playbook for diagnosing send failures and dead-letter jobs.

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
- Local/dev SMS provider mode exists for queue-backed OTP testing without third-party SMS spend. Done.
- Notification inspection exposes recent masked jobs, status, provider metadata, and failures. Done.
- PostgreSQL-backed e2e coverage verifies OTP persistence, dev-provider delivery, verification, retries, and dead-lettering in CI. Done.
- Remaining work focuses on real-provider validation, stronger device-aware abuse controls, and operator visibility.
