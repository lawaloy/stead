# ADR 0002: Notification-Service Extraction Boundary

- Status: Accepted
- Date: 2026-08-06

## Context

OTP issuance belongs to Identity & Access, while OTP delivery, provider
selection, retries, dead-letter handling, and delivery diagnostics belong to
Messaging. The API already persists encrypted notification jobs and processes
them asynchronously, but `AuthService` depended directly on the concrete
`NotificationsService`. That dependency mixed the identity request path with a
service that also owns operator inspection and made a later process boundary
harder to introduce safely.

Extracting a separately deployed notification service now would force an early
queue-technology and operational-ownership decision. Keeping the concrete
dependency would instead allow more messaging details to leak into Identity.

## Decision

Identity publishes OTP delivery work through the `NotificationPublisher` port
identified by the `NOTIFICATION_PUBLISHER` injection token. The port accepts an
`otp.requested` payload and resolves only after the delivery command has been
durably accepted. It does not expose queue job identifiers, provider responses,
inspection APIs, retry controls, or worker lifecycle concerns.

The current `QueuedNotificationPublisher` adapter implements that port by
writing an encrypted job to the PostgreSQL-backed notification queue.
`NotificationConsumerService` remains an in-process worker and continues to own
provider dispatch, retry scheduling, terminal redaction, and dead-letter state.
An OTP request therefore waits for durable job persistence, but never waits for
the SMS provider to deliver the message.

When Notifications becomes independently deployable, API Core will replace the
adapter binding with an outbox or broker publisher. Before the command crosses
a process or repository boundary, its schema will be versioned and added to the
contract-governance process. The transport must encrypt data in transit, limit
consumer access, prevent sensitive payload logging, and define retention for
OTP-bearing messages.

Delivery remains at least once. Consumers must tolerate a command being
delivered more than once, and any future broker adapter must preserve the
current durable-acceptance, retry, dead-letter, redaction, and diagnostic
semantics.

## Consequences

- Identity no longer imports the concrete notification orchestration service.
- Messaging can change its storage or transport behind one application port.
- The API response still fails if notification work cannot be durably accepted,
  avoiding successful OTP responses for work that was silently dropped.
- Inspection remains an internal Notifications concern rather than part of the
  publishing contract.
- The database and worker still share the API deployment for now, so this is a
  logical boundary rather than an independent-service deployment.
- A cross-process command contract, correlation/idempotency identifier, broker
  choice, and independent worker deployment remain Stage 2 work.

## Alternatives Considered

- Keep injecting `NotificationsService` into `AuthService`: rejected because it
  exposes a broad concrete service across the domain boundary.
- Call an SMS provider directly from the OTP request: rejected because provider
  latency and outages would become request-path concerns and retry state would
  be lost.
- Publish in memory and return immediately: rejected because a process exit
  could acknowledge an OTP request while dropping its delivery work.
- Extract the service and choose a broker immediately: deferred until the
  logical boundary and operational requirements are stable.
