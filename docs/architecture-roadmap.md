# Architecture Roadmap

## Context
- Product: Stead Financial Stability Layer.
- Current state: one backend API (`api`) and one Expo Router mobile app (`mobile`) in the same repository.
- Constraint: long-term direction is multiple services, without locking into a monorepo as the end state.

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
  - Shared schema package with semantic versioning.
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
- Lock module boundaries in API (`auth`, `goals`, `transactions`, `dashboard`, `sms`).
- Enforce contract tests between API responses and mobile schema decoders.
- Add architecture decision records (ADRs) for key boundary choices.
- Current status:
  - Core MVP modules exist in the API.
  - Mobile Zod schemas parse current API responses.
  - Notification jobs are already persisted in the database, but the worker still runs in-process.
- Exit criteria:
  - All boundary contracts versioned.
  - CI green for lint/build/test/contracts.

### Stage 2: Extract Notification Service (short -> mid term)
- Move SMS/alerts logic behind event consumer.
- Keep OTP API surface unchanged from mobile perspective.
- Add queue with dead-letter handling and retry policy.
- Current status:
  - OTP delivery is already behind a notification queue abstraction.
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
