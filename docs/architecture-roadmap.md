# Architecture Roadmap

## Context

- Product: Stead Financial Stability Layer.
- Current state: one backend API (`api`) and one Expo Router mobile app (`mobile`) in the same repository.
- Constraint: long-term direction is multiple services, without locking into a monorepo as the end state.
- Delivery status and test boundaries are tracked separately in
  [Project Status](project-status.md); roadmap items are not shipped features
  unless that status document says they are implemented.

## v2 Goals

- Preserve shipping speed for MVP.
- Define clear bounded contexts before service extraction.
- Move from "modular monolith" to "multi-service" with low migration risk.
- Standardize contracts, observability, and delivery quality gates.

## Product Surface Sequence

- Core product surfaces first:
  - Mobile application as the primary user product.
  - Website for marketing, onboarding, trust, waitlist/docs, and eventual web access.
- Internal tooling next:
  - Admin and operations surfaces for support, oversight, and manual workflows.
  - Internal CLI for developer, support, and ops automation.
- Agentic infrastructure later:
  - Project-specific internal agent for support, operations, and workflow automation.
  - MCP server only when the agent needs Stead-specific tools, data access, and safe action boundaries.

This sequence is intentional. Stead should prioritize user-facing product surfaces first, then operational leverage, then agent and MCP capabilities once the domain model, workflows, and safety boundaries are mature enough to support them.

## Guiding Principles

- Keep domain boundaries strict before splitting repos.
- Prefer asynchronous integration for non-request-critical workflows.
- Make schema and API contracts versioned, explicit, and test-enforced.
- Require measurable SLOs before and after each extraction.
- No "big bang" rewrite.

## Target Architecture (North Star)

- `api-core` service:
  - Auth, goals, transactions, dashboard read APIs.
- `notification-service`:
  - OTP dispatch, weekly status, risk alerts.
- `stability-engine` package or service:
  - Deterministic scoring logic with versioned inputs/outputs.
- `mobile-app`:
  - Expo client consuming public API contracts.
- Platform components:
  - API gateway/edge, queue/event bus, centralized logging and metrics.

## Domain Boundaries

- Identity & Access:
  - User profile, session tokens, OTP lifecycle.
- Financial Inputs:
  - Transactions and goal contribution mappings.
- Planning & Scoring:
  - Readiness, pace, safe-to-spend, stability score/status.
- Messaging:
  - SMS/notification orchestration and provider abstraction.

## Repository Strategy (End State: Polyrepo)

- Phase-in approach:
  - Keep current repo while boundaries harden.
  - Extract deployables into separate repositories only when interfaces are stable.
- Expected repos at maturity:
  - `stead-api-core`
  - `stead-notification-service`
  - `stead-mobile`
  - `stead-contracts` (versioned schemas/types SDK)

## Data Strategy

- Short term:
  - Single Postgres instance, explicit module ownership of tables.
- Mid term:
  - Outbox pattern from `api-core` for domain events.
  - Read-model projections for dashboard and alerting.
- Long term:
  - Database-per-service only when scaling or ownership pressure requires it.

## Integration Strategy

- Synchronous:
  - Mobile -> API core for user-facing reads/writes.
- Asynchronous:
  - API core emits events (`goal.updated`, `transaction.recorded`, `risk.status.changed`).
  - Notification service consumes events and sends messages.
- Contract governance:
  - `contracts/openapi.yaml` is the authoritative mobile-consumed API contract.
  - API types and mobile types/Zod validators are generated from that contract,
    with deterministic regeneration enforced in CI.
  - A separately versioned shared package remains an option if service
    extraction later requires publishing contracts outside this monorepo.
  - Backward-compatible API changes by default.

## Reliability and Security Baseline

- Reliability:
  - Correlation IDs across services.
  - Structured logs, latency/error dashboards, alert routing.
  - Idempotency keys for write endpoints where retries can duplicate writes.
- Security:
  - Secret scanning in CI.
  - Rotate SMS/provider keys and JWT secret on schedule.
  - Principle of least privilege for DB and provider credentials.

## Delivery Roadmap

### Stage 1: Harden Modular Monolith (now -> short term)

- Lock module boundaries in API (`auth`, `countries`, `goals`, `transactions`, `dashboard`, `notifications`, and provider-specific `sms`).
- Enforce contract tests between API responses and mobile schema decoders.
- Keep key boundary and ownership choices explicit in this roadmap and in
  code-level interfaces.
- Current status:
  - Core MVP modules exist in the API.
  - The authoritative OpenAPI contract generates API serializer/DTO types and
    mobile Zod response decoders; CI rejects stale generated output.
  - Identity publishes OTP delivery through a narrow notification port; the
    current adapter durably persists encrypted jobs without exposing queue or
    provider details to the auth module.
  - Notification jobs are already persisted in the database, but the worker still runs in-process.
  - PostgreSQL-backed e2e tests cover OTP persistence, dev delivery, verification, retries, and dead-lettering in CI.
  - PostgreSQL-backed finance e2e tests cover goal lifecycle rules, transaction
    CRUD/ownership, and populated dashboard recalculation.
  - Mobile exposes transaction activity, filtering, edit, explicit goal-link
    management, and delete in addition to transaction creation.
- Product delivery priorities (customer value):
  - Completed: transaction history and management, including user-friendly
    naira and calendar-date entry.
  - Next: agree and implement goal editing, intentional deactivation or
    replacement, and goal history in mobile.
  - Then: define weekly readiness/risk-alert preferences and delivery behavior.
  - Detailed status and sequencing live in
    [Project Status](project-status.md#milestone-tracking).
- Enabling and architecture priorities:
  - Completed P0: the local mobile auth acceptance pass is recorded and
    Dependency Review is blocking in the active `main` ruleset.
  - Completed P1: authoritative API/mobile contract generation and device-aware
    OTP abuse controls with stronger operator diagnostics.
  - Completed P1: PostgreSQL-backed finance e2e scenarios for goals,
    transactions, and populated dashboard calculations.
  - P1: extend contract enforcement to any new mobile-consumed endpoints as
    they are introduced.
  - P1: validate real-provider OTP delivery and the operator response playbook
    when a paid or verified sender account is available.
  - P1: add an automated critical mobile journey before treating the vertical
    slice as production-ready.
  - Next extraction step: define the cross-process command envelope,
    correlation/idempotency strategy, and queue selection criteria before
    moving the worker out of the API deployment.
- Exit criteria:
  - All boundary contracts versioned.
  - CI green for lint/build/test/contracts.

### Stage 2: Extract Notification Service (short -> mid term)

- Move SMS/alerts logic behind event consumer.
- Keep OTP API surface unchanged from mobile perspective.
- Preserve the existing retry/dead-letter semantics while replacing the in-process worker boundary with an independently deployable consumer.
- Current status:
  - OTP delivery is already behind a notification queue abstraction.
  - API Core reaches Messaging through the `NotificationPublisher` port, which
    is the logical boundary for a future independently deployed consumer.
  - Dead-letter handling and retry policy exist in the database-backed queue.
  - Physical service extraction is not done yet.
- Exit criteria:
  - Notification pipeline observable and independently deployable.
  - No regression in OTP success rate and alert latency.

### Stage 3: Stabilize Shared Contracts (mid term)

- Publish `stead-contracts` package for API and mobile consumption.
- Introduce compatibility matrix in CI for API and mobile versions.
- Exit criteria:
  - Breaking contract changes blocked without major version bump.

### Stage 4: Polyrepo Transition (mid -> long term)

- Split repos by deployable ownership and release cadence.
- Introduce environment promotion pipeline per service.
- Exit criteria:
  - Independent deployment of core API, notifications, and mobile.
  - Cross-repo integration tests passing in release pipeline.

### Stage 5: Internal Platform and Agent Layer (long term)

- Build internal admin and ops tooling on top of stable product and service boundaries.
- Add an internal CLI for recurring support, maintenance, migration, and developer workflows.
- Introduce a Stead-specific internal agent once operational workflows are explicit and auditable.
- Add an MCP server only when agents need structured project context and scoped actions across customer, account, or workflow systems.
- Exit criteria:
  - Internal operations can be executed through stable tooling rather than ad hoc scripts.
  - Agent actions are scoped, observable, and auditable.
  - MCP capabilities expose only intentional, safe tools and resources.

## KPIs and Guardrails

- Product KPIs:
  - OTP completion rate.
  - Goal setup completion.
  - Weekly active users.
- Engineering KPIs:
  - Change failure rate.
  - Mean time to restore.
  - P95 API latency for dashboard endpoint.

## Open Decisions

- Queue technology choice (managed vs self-hosted).
- Contract package distribution method (private npm registry vs git tags).
- API gateway requirement timing.
- Multi-region and data residency requirements for Nigerian users.
