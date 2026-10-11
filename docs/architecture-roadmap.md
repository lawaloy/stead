# Architecture Roadmap

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This roadmap owns Stead's future technical direction, sequencing, exit
criteria, and unresolved architecture decisions. It deliberately does not list
completed product features or current priorities; those belong in
[Project Status](project-status.md).

## Context

The [Product and System Overview](overview.md#current-system-shape) owns the
present deployment and domain shape. This roadmap begins from that baseline and
allows independently deployable services and separate repositories only when
stable boundaries, ownership, reliability needs, or release cadence justify the
operational cost.

## Guiding Principles

- Preserve shipping speed while the product is still being validated.
- Harden logical boundaries before extracting physical services.
- Prefer asynchronous integration for work outside the customer request path.
- Keep schemas and API contracts explicit, versioned, and test-enforced.
- Require measurable reliability goals before and after extraction.
- Avoid big-bang rewrites and speculative infrastructure.

## Target Architecture

- **API core:** identity, accounts, goals, transactions, ingestion, and
  customer-facing dashboard APIs.
- **Notification service:** OTP, weekly summaries, and risk/recovery delivery.
- **Stability engine:** deterministic, versioned scoring inputs and outputs,
  initially a package and later a service only if justified.
- **Mobile application:** primary customer product consuming public contracts.
- **Platform:** gateway/edge controls, durable event transport, centralized
  logs, metrics, alerts, and secrets management.

## Boundary Evolution

The current logical boundaries are defined in the
[Product and System Overview](overview.md#current-boundaries). Cross-boundary
access should use explicit interfaces. The current example is authentication
publishing OTP work through `NotificationPublisher` without depending on queue
or provider internals.

A boundary becomes an extraction candidate only when its contract is stable
and independent deployment improves measured ownership, scaling, release, or
failure-isolation needs.

## Data and Integration Strategy

Short term:

- One PostgreSQL instance with explicit module ownership of tables.
- Synchronous mobile-to-API reads and writes.
- Database-backed notification jobs for durable asynchronous delivery.

Before service extraction:

- Define domain event names and versioned payloads.
- Define the cross-process command envelope, correlation identifiers,
  idempotency strategy, retry ownership, and poison-message behavior.
- Establish outbox and consumer-observability requirements.
- Select managed or self-hosted queue technology from measured needs.

Long term:

- Add read-model projections where query or ownership pressure warrants them.
- Adopt database-per-service only when independent scaling, ownership, or
  compliance needs justify the consistency and operational trade-offs.

## Contract and Repository Strategy

`contracts/openapi.yaml` remains authoritative while API and mobile share this
repository. Generated API/mobile artifacts and CI drift checks enforce it.

A separately versioned `stead-contracts` package becomes useful only when
deployables move to independent repositories or release cadences. At that
point, compatibility checks must cover supported API and mobile versions.

Expected repositories at maturity may include:

- `stead-api-core`
- `stead-notification-service`
- `stead-mobile`
- `stead-contracts`

## Delivery Stages

### Stage 1: Harden the Modular Monolith

Architecture work:

- Keep module ownership and cross-module ports explicit.
- Extend contract generation to every new mobile-consumed route.
- Define service-extraction envelopes and observability requirements.
- Keep the in-process notification worker until independent deployment has a
  measured reliability or ownership benefit.

Exit criteria:

- Boundary contracts are explicit and versioned.
- CI enforces lint, tests, builds, and contract drift.
- The first extraction has documented SLOs and a rollback plan.

### Stage 2: Extract Notification Delivery

- Move notification consumption and provider delivery behind an independently
  deployable worker without changing the mobile-facing OTP or alert APIs.
- Preserve encryption, leasing, retries, deduplication, and dead-letter
  semantics.
- Add queue-depth, delivery-latency, failure-rate, and dead-letter alerting.

Exit criteria:

- Delivery is observable and independently deployable.
- Failure isolation improves without regressing OTP completion or alert latency.

### Stage 3: Stabilize Shared Contracts

- Publish versioned contract artifacts for independently released consumers.
- Enforce a compatibility matrix for supported API and mobile versions.
- Block breaking changes without an intentional major-version transition.

### Stage 4: Move to Polyrepo Where Justified

- Split repositories by deployable ownership and release cadence.
- Add environment-promotion pipelines and cross-repository integration tests.
- Keep changes atomic through versioned contracts rather than coordinated
  unversioned source edits.

### Stage 5: Add Internal Platform and Agent Surfaces

- Build admin and operations tools over stable, audited APIs.
- Add a CLI for repeatable support, migration, and maintenance workflows.
- Introduce an internal agent only after actions have explicit authorization,
  observability, and audit boundaries.
- Add an MCP server only when agents need deliberately scoped Stead tools or
  resources.

## Reliability and Security Guardrails

- Correlation identifiers across synchronous and asynchronous work.
- Structured logs and latency/error/dead-letter dashboards.
- Idempotency for writes where retries can duplicate effects.
- Least-privilege database and provider credentials.
- Secret scanning and scheduled credential rotation.
- SLOs and rollback evidence before every extraction.

## Open Decisions

- Managed versus self-hosted event transport.
- Contract distribution through a private registry or immutable repository
  releases.
- Timing and responsibilities of an API gateway.
- Multi-region and Nigerian data-residency requirements.
- Evidence threshold that justifies extracting the stability engine.

</details>
