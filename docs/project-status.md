# Project Status

Last reviewed against the repository: 2026-08-29.

This document separates four states that should not be treated as equivalent:

- **Implemented**: production code exists in this repository.
- **Exposed in mobile**: a user can reach the capability in the Expo app.
- **Automated coverage**: a repeatable automated test exercises the stated
  boundary.
- **Production-validated**: the capability has been exercised with its real
  external dependencies and target device/runtime.

An implemented endpoint is not automatically a finished product feature, and
unit coverage is not the same as a full mobile-to-database acceptance test.

## Capability Matrix

| Capability                         | API                                                                                                | Mobile                                                                 | Current verification                                                                                       | Remaining work                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Authentication countries           | Implemented                                                                                        | Country selector with offline NG/US/GB fallback                        | API and mobile unit tests; generated response schema                                                       | Validate country configuration and copy for each launch market                                            |
| OTP request and verification       | Implemented with normalized phones, hashed OTPs, resend cooldown, attempt limits, and JWT issuance | Implemented                                                            | API unit tests; PostgreSQL e2e for the dev provider; manual Expo web flow                                  | Complete a real-provider pass on native Android and iOS                                                   |
| Session persistence and logout     | JWT verification implemented                                                                       | Token persistence, restore, 401 clearing, and local logout implemented | Mobile storage/API-client unit tests; manual Expo web restore/401 pass                                     | Add automated route/screen coverage; define refresh, expiry UX, revocation, and rotation strategy         |
| OTP abuse controls                 | Per-phone, IP, and pseudonymous device limits implemented                                          | Stable installation UUID is sent                                       | API unit and PostgreSQL e2e coverage                                                                       | Decide whether native attestation or an edge risk service is required                                     |
| Auth and queue inspection          | Allowlisted API endpoints implemented                                                              | No operator UI                                                         | API unit and PostgreSQL e2e coverage                                                                       | Build an operations surface and production alerting/runbooks                                              |
| Goals                              | Create, read active, and update implemented; database enforces one active goal per user            | Read active and create only                                            | API service/controller unit tests; PostgreSQL finance e2e; mobile API-client tests                         | Add mobile edit, deactivation, and history UX                                                             |
| Transactions                       | Create, list, update, and delete implemented                                                       | Create, list, filter, edit, relink/unlink, and delete                  | API service/controller unit tests; PostgreSQL finance e2e; mobile API-client, presentation-helper, and screen-journey tests covering cached-read failure/retry and accessibility semantics | Run a native TalkBack/VoiceOver pass; decide separately whether durable cold-start history or queued offline writes justify persistence and conflict-resolution complexity |
| Stability dashboard                | Implemented for an active goal                                                                     | Implemented                                                            | Scoring/service/controller unit tests; populated PostgreSQL finance e2e; mobile response parsing           | Add screen/journey tests; validate the scoring model with users                                           |
| OTP notification queue             | Encrypted persisted jobs, leases, retry, and dead-letter behavior implemented                      | Not directly user-facing                                               | Extensive unit tests and PostgreSQL e2e coverage                                                           | Move the serial in-process worker only when an independent deployment is justified                        |
| SMS providers                      | Dev, Twilio, and Termii adapters implemented                                                       | OTP UI is provider-agnostic                                            | Mocked provider unit tests; dev-provider e2e                                                               | Live Twilio or Termii delivery has not been production-validated                                          |
| Weekly readiness and risk alerts   | Not implemented                                                                                    | Not implemented                                                        | None                                                                                                       | Define triggers, preferences, templates, delivery channels, and tests                                     |
| API/mobile contracts               | OpenAPI generation for mobile-consumed routes implemented                                          | Generated types and Zod response validation used                       | CI regeneration/drift check and schema tests                                                               | Add every newly consumed route before mobile integration; inspection routes remain intentionally internal |
| User profile and account lifecycle | Not implemented beyond the phone-based user record                                                 | Not implemented                                                        | None                                                                                                       | Define profile, consent, data export, account deletion, and support flows                                 |
| Automatic financial data           | Not implemented                                                                                    | Manual entry only                                                      | None                                                                                                       | Decide whether to integrate bank data, imports, or another ingestion source                               |
| Multiple simultaneous goals        | Intentionally unsupported; only one active goal is allowed                                         | Not supported                                                          | Unit tests plus a schema/migration invariant test                                                          | Revisit the product rule before implementing multi-goal planning                                          |

## Test Coverage Boundaries

### Automated today

- API unit tests cover validation, auth, rate limits, telemetry, operator
  authorization, goals, transactions, dashboard scoring, notification queue
  behavior, SMS adapters, environment validation, and ownership scoping.
- PostgreSQL-backed API e2e tests cover the basic app/CORS boundary and the OTP
  pipeline: persistence, dev delivery, verification, device limits, inspection,
  retries, and dead-lettering. Finance e2e scenarios cover authenticated goal
  lifecycle rules, transaction create/list/filter/update/delete and ownership,
  and populated dashboard recalculation against the real Prisma/PostgreSQL
  boundary.
- Mobile unit tests cover phone/OTP helpers, auth feedback, environment and base
  URL selection, session and installation-ID storage, API-client behavior,
  session-scoped finance caches, transaction money/date/goal-link behavior,
  finance request/response parsing, generated contract shapes, and dependency
  compatibility safeguards.
- React Native transaction-screen tests cover create, list/filter, edit, delete
  confirmation, validation, cached activity during refresh failure, retry,
  disconnected-write feedback, and accessible roles, names, states, and live
  announcements.
- CI checks API/mobile lint and builds, API unit/e2e tests, mobile typecheck/unit
  tests, contract drift, dependency review, dependency audit, and CodeQL.

### Not automated today

- There are no React Native screen/component tests yet for the auth, goal, or
  dashboard screens; transaction screens have automated component journeys.
- There is no automated mobile-to-API journey test.
- There is no native Android or iOS acceptance suite.
- There is no live Twilio or Termii integration test.
- There are no load, soak, failover, broad accessibility-audit, or
  security-penetration suites, and no enforced code-coverage threshold. The
  transaction tests verify accessibility semantics but are not a native
  TalkBack or VoiceOver acceptance pass.

The recorded manual acceptance pass covers Expo web only. See
[Auth Hardening](auth-hardening.md#validation-record) for its exact scope.

## Milestone Tracking

Stead uses two planning tracks so engineering safeguards are not mistaken for
customer outcomes:

- **Product milestones** deliver a capability or outcome a customer can use.
  This is the default track for deciding what product work comes next.
- **Enabling and release work** reduces delivery, security, operational, or
  quality risk. It can block a release, but it is not presented as customer
  value by itself.

Priority labels apply within a track. A release-blocking engineering item may
need to happen before a product milestone ships, but that does not turn it into
the product milestone.

### Product milestones

| Order                | Milestone                          | Customer outcome                                                                                                                                       | Status                    | Remaining scope                                                                                                                                           |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed            | Transaction history and management | Customers can review and filter activity, see the visible net, correct transaction details or goal links, and delete mistakes                          | Implemented in mobile     | Automated transaction-screen journeys now cover validation, warm-session cached/offline behavior, retry, and accessibility semantics; durable cold-start offline support and native assistive-technology validation remain separate decisions/checks |
| Next                 | Goal lifecycle and history         | Customers can correct an active goal, intentionally deactivate or replace it, and understand prior goal state without creating accidental replacements | Not implemented in mobile | Agree the replacement/history workflow; expose edit, deactivate, and history UX using the existing goal update boundary or an explicit contract extension |
| After goal lifecycle | Weekly readiness and risk alerts   | Customers receive timely progress and risk updates instead of needing to open the dashboard                                                            | Not implemented           | Define triggers, preferences, templates, delivery channels, and opt-out behavior before implementation                                                    |
| Later                | Account and data self-service      | Customers can manage profile/consent, export data, and delete their account                                                                            | Not implemented           | Define policy, API contracts, support path, and mobile UX                                                                                                 |
| Later                | Automatic financial-data ingestion | Customers can reduce manual entry through an agreed bank, import, or other ingestion source                                                            | Not implemented           | Research source, consent, reconciliation, failure handling, and market fit                                                                                |

The next immediate product milestone is therefore **Goal lifecycle and
history**, not another test suite. Stability-model user validation should run
alongside product discovery before the score is treated as financial guidance.

### Enabling and release work

#### Completed safeguards

- PostgreSQL-backed finance e2e coverage for goal rules, transaction CRUD and
  ownership, and populated dashboard recalculation.
- Safe-integer-aware naira-to-kobo conversion and stable date-only transaction
  handling in the mobile transaction workflow.
- Session-scoped finance query caches that are cleared across login changes.
- Transaction-screen journeys covering create/filter/edit/delete, validation,
  warm-session cached activity and retry during refresh failure, disconnected
  writes, and accessibility semantics.

#### Before a production pilot

1. Validate OTP delivery and verification with the chosen live SMS provider on
   real Android and iOS devices.
2. Add an automated critical mobile journey covering authentication, goal
   setup, transaction entry and management, dashboard refresh, session restore,
   and logout.
3. Define production session behavior: token expiry UX, revocation, rotation,
   and incident response.
4. Establish deployment, monitoring, alerting, backup/restore, privacy, data
   retention, and account-deletion procedures.
5. Extend screen-level offline, retry, validation, and accessibility
   verification beyond transactions to the other critical mobile flows, then
   run native TalkBack and VoiceOver acceptance checks.

### Later platform expansion

- Automatic transaction ingestion or bank connectivity.
- Multiple concurrent obligations and richer planning scenarios.
- Customer profile, preferences, consent, export, and support tooling.
- Marketing website, web product, internal admin tools, and the service
  extractions described in the [Architecture Roadmap](architecture-roadmap.md).

## Keeping This Current

Update this file whenever a capability crosses one of the boundaries above.
When closing a gap, link the implementation and test in the pull request and
change only the claims that the new evidence supports.
