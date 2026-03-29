# Auth Hardening

## Goal

Move OTP authentication from "implemented in code" to "operationally usable" for early environments.

## Phase 1

- Normalize phone numbers before lookup, storage, and SMS dispatch.
- Make auth input country-aware so local numbers can be normalized without assuming Nigeria by default.
- Capture request metadata for OTP issuance.
- Add basic OTP resend cooldown.
- Strengthen auth service tests around request and verify behavior.

## Phase 2

- Replace the in-memory notification queue with a durable queue or outbox.
- Add structured delivery logs for enqueue, send, retry, and dead-letter events.
- Add provider and environment validation for the active SMS provider.

## Phase 3

- Add verify-attempt throttling and stronger abuse controls.
- Add end-to-end mobile verification in a real environment.
- Add support tooling for OTP delivery inspection and failure diagnosis.

## Acceptance Criteria

- Phone numbers are stored and used in a canonical format.
- OTP requests enforce a short resend cooldown.
- OTP request records include client metadata when available.
- Auth tests cover the critical request and verify paths.
- Later phases make OTP delivery durable, observable, and production-ready.
