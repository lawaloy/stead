# Project Status

Last reviewed against the repository: 2026-09-19.

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

| Capability                         | API                                                                                                                                                         | Mobile                                                                                                         | Current verification                                                                                                                                                                       | Remaining work                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication countries           | Implemented                                                                                                                                                 | Country selector with offline NG/US/GB fallback                                                                | API and mobile unit tests; generated response schema                                                                                                                                       | Validate country configuration and copy for each launch market                                                                                                                            |
| OTP request and verification       | Implemented with normalized phones, hashed OTPs, resend cooldown, attempt limits, and JWT issuance                                                          | Implemented                                                                                                    | API unit tests; PostgreSQL e2e for the dev provider; auth screen tests; live mobile API-client journey; manual Expo web flow                                                               | Complete a real-provider pass on native Android and iOS                                                                                                                                   |
| Session persistence and logout     | JWT verification implemented                                                                                                                                | Token persistence, restore, 401 clearing, and local logout implemented                                         | Mobile storage/API-client and AuthProvider lifecycle tests; live mobile API-client bearer restore/logout behavior; manual Expo web restore/401 pass                                        | Add full route-level journey coverage; define refresh, expiry UX, revocation, and rotation strategy                                                                                       |
| OTP abuse controls                 | Per-phone, IP, and pseudonymous device limits implemented                                                                                                   | Stable installation UUID is sent                                                                               | API unit and PostgreSQL e2e coverage                                                                                                                                                       | Decide whether native attestation or an edge risk service is required                                                                                                                     |
| Auth and queue inspection          | Allowlisted API endpoints implemented                                                                                                                       | No operator UI                                                                                                 | API unit and PostgreSQL e2e coverage                                                                                                                                                       | Build an operations surface and production alerting/runbooks                                                                                                                              |
| Goals                              | Create, read active/history, update, complete, and cancel implemented; replacement preserves prior state and the database enforces one active goal per user | Create, read, edit, intentionally replace, complete, cancel, and review history                                | API service/controller/DTO and schema-invariant tests; PostgreSQL lifecycle e2e; mobile form, API-client, contract-shape, and screen-journey tests                                         | Run native TalkBack/VoiceOver and mobile-to-API acceptance passes                                                                                                                         |
| Transactions                       | Create, list, update, and delete implemented                                                                                                                | Create, list, filter, edit, relink/unlink, and delete                                                          | API service/controller unit tests; PostgreSQL finance e2e; mobile API-client, presentation-helper, and screen-journey tests covering cached-read failure/retry and accessibility semantics | Run a native TalkBack/VoiceOver pass; decide separately whether durable cold-start history or queued offline writes justify persistence and conflict-resolution complexity                |
| Stability dashboard                | Implemented for an active goal                                                                                                                              | Implemented                                                                                                    | Scoring/service/controller unit tests; populated PostgreSQL finance e2e; mobile response and screen tests; live client-to-API recalculation journey                                        | Validate the scoring model with users and run native-device acceptance                                                                                                                    |
| OTP notification queue             | Encrypted persisted jobs, leases, retry, and dead-letter behavior implemented                                                                               | Not directly user-facing                                                                                       | Extensive unit tests and PostgreSQL e2e coverage                                                                                                                                           | Move the serial in-process worker only when an independent deployment is justified                                                                                                        |
| SMS providers                      | Dev, Twilio, and Termii adapters implemented                                                                                                                | OTP UI is provider-agnostic                                                                                    | Mocked provider unit tests; dev-provider e2e                                                                                                                                               | Live Twilio or Termii delivery has not been production-validated                                                                                                                          |
| Weekly readiness and risk alerts   | Opt-in preferences, timezone-aware weekly generation, material risk/recovery detection, cooldown, encrypted queueing, and SMS delivery implemented          | Preference and schedule controls implemented                                                                   | API rule/service/queue/consumer tests; generated request/response contracts; mobile API-client and screen tests                                                                            | Validate templates and timing with customers; complete live-provider/native-device delivery validation                                                                                    |
| API/mobile contracts               | OpenAPI generation for mobile-consumed routes implemented                                                                                                   | Generated types and Zod response validation used                                                               | CI regeneration/drift check and schema tests                                                                                                                                               | Add every newly consumed route before mobile integration; inspection routes remain intentionally internal                                                                                 |
| User profile and account lifecycle | Profile, append-only optional consent history, sanitized JSON export, and transactional deletion implemented                                                | Account/privacy screen with profile, consent, export/share, configured support, and guarded permanent deletion | API unit and PostgreSQL e2e; generated contracts; mobile API-client and screen journeys                                                                                                    | Configure and staff production support; validate native share/email behavior and enforce backup expiry                                                                                    |
| Automatic financial data           | Canonical CSV preview and idempotent confirmed import implemented                                                                                           | Native/web file picker, row review/selection, optional active-goal linking, and result feedback                | Parser/DTO/service/controller tests; PostgreSQL ownership and deduplication e2e; generated contracts; mobile file, API-client, and screen-journey tests                                    | Validate the format with customers; add adapters for agreed Nigerian bank exports; decide separately whether direct bank connectivity justifies its consent and reconciliation complexity |
| Multiple simultaneous goals        | Intentionally unsupported; only one active goal is allowed                                                                                                  | Not supported                                                                                                  | Unit tests plus a schema/migration invariant test                                                                                                                                          | Revisit the product rule before implementing multi-goal planning                                                                                                                          |

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
  URL selection, session and installation-ID storage, AuthProvider
  login/restore/logout and cache clearing, API-client behavior, session-scoped
  finance caches, transaction money/date/goal-link behavior, finance
  request/response parsing, generated contract shapes, and dependency
  compatibility safeguards.
- React Native transaction-screen tests cover create, list/filter, edit, delete
  confirmation, validation, cached activity during refresh failure, retry,
  disconnected-write feedback, and accessible roles, names, states, and live
  announcements.
- React Native goal-screen tests cover empty and populated states, lifecycle
  history, customer-friendly edit values, and confirmation gates for replacing
  or completing an active goal.
- React Native auth-screen tests cover phone validation, OTP request/verify,
  session handoff, and the missing-phone recovery path. Dashboard-screen tests
  cover loading, empty, populated, refresh, and failed-read/retry states.
- A separate CI job runs the actual mobile API client against a running NestJS
  API and PostgreSQL in a dedicated `e2e_mobile` schema. It covers dev OTP,
  goal setup, transaction create/edit/delete, dashboard recalculation, bearer
  restore, and unauthenticated access after local logout. See
  [Critical Mobile Journey](critical-mobile-journey.md).
- Readiness-alert tests cover preference defaults and validation, timezone-aware
  weekly buckets, risk/recovery thresholds, cooldown, deduplicated encrypted
  queueing, generic SMS delivery, mobile response parsing, and accessible
  preference controls.
- CI checks API/mobile lint and builds, API unit/e2e tests, mobile typecheck/unit
  tests, the live mobile API-client journey, contract drift, dependency review,
  dependency audit, and CodeQL.

### Remaining validation

- A Maestro OTP-to-logout native UI journey is configured for Android and iOS
  simulators in `native-ci` (Android on path-filtered PRs plus post-merge /
  scheduled / on demand; iOS post-merge / scheduled / on demand). Until both
  jobs pass on the latest main head, it is not validated coverage.
  Physical-device acceptance remains separate.
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

| Order       | Milestone                          | Customer outcome                                                                                                                                        | Status                           | Remaining scope                                                                                                                                                                                                                                                                                                            |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed   | Transaction history and management | Customers can review and filter activity, see the visible net, correct transaction details or goal links, and delete mistakes                           | Implemented in mobile            | Automated transaction-screen journeys now cover validation, warm-session cached/offline behavior, retry, and accessibility semantics; durable cold-start offline support and native assistive-technology validation remain separate decisions/checks                                                                       |
| Completed   | Goal lifecycle and history         | Customers can correct an active goal, intentionally complete, cancel, or replace it, and understand prior goal state without losing linked transactions | Implemented in API and mobile    | Lifecycle state, authenticated history/end contracts, migration backfill, mobile workflows, and automated API/PostgreSQL/mobile coverage are complete; native and mobile-to-API acceptance remain release checks                                                                                                           |
| Completed   | Weekly readiness and risk alerts   | Customers receive timely progress and risk updates instead of needing to open the dashboard                                                             | Implemented in API and mobile    | SMS-only opt-in preferences, local weekly scheduling, material deterioration/recovery rules, cooldown/deduplication, templates, and automated API/mobile coverage are complete; live-provider/native validation remains release work                                                                                       |
| Completed   | Account and data self-service      | Customers can manage profile/consent, export data, contact configured support, and delete their account                                                 | Implemented in API and mobile    | Profile and optional-consent controls, versioned sanitized JSON export, configured email support, guarded deletion, session cleanup, policy documentation, and automated API/PostgreSQL/mobile coverage are complete; production support and backup expiry remain operational checks                                       |
| In progress | Automatic financial-data ingestion | Customers can reduce manual entry through an agreed bank, import, or other ingestion source                                                             | Canonical CSV import implemented | Preview, correction feedback, selection, optional goal linking, confirmation, and retry-safe deduplication are implemented across API/mobile/PostgreSQL. Validate the template with customers, add adapters for agreed bank exports, and decide whether direct connectivity warrants its consent and reconciliation scope. |

The active product milestone is therefore **Automatic financial-data
ingestion**. Its first bounded slice is the canonical CSV import documented in
[Transaction File Import](transaction-file-import.md). Next, validate that
format with customers and select the first Nigerian bank-export adapter. Direct
bank connectivity remains a separate decision because its consent,
reconciliation, and failure-handling requirements are materially different.
Stability-model and alert-copy user validation should run alongside discovery
before the score or alerts are treated as financial guidance.

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
- Goal lifecycle coverage across unit, contract, screen, and PostgreSQL e2e
  boundaries, including replacement history and preservation of transaction
  links to ended goals.
- Auth/dashboard screen coverage and a live mobile API-client journey against
  PostgreSQL, including goal setup, transaction management, dashboard refresh,
  bearer restore, and unauthenticated access after local logout.

#### Before a production pilot

1. Validate OTP delivery and verification with the chosen live SMS provider on
   real Android and iOS devices.
2. Stabilize and pass the Android/iOS simulator UI jobs covering authentication,
   goal setup, transaction management, dashboard recalculation, session
   restore, and logout; then run physical-device acceptance. The client/API and
   screen boundaries are already covered separately.
3. Define production session behavior: token expiry UX, revocation, rotation,
   and incident response.
4. Establish deployment, monitoring, alerting, and backup/restore; configure
   production support and enforce the documented privacy, deletion, and 30-day
   backup-expiry procedures.
5. Extend screen-level offline, retry, validation, and accessibility
   verification beyond transactions and goals to the other critical mobile flows, then
   run native TalkBack and VoiceOver acceptance checks.

### Later platform expansion

- Bank-specific export adapters and a separate direct-connectivity decision
  after customer validation of the implemented canonical CSV import.
- Multiple concurrent obligations and richer planning scenarios.
- Internal support tooling; customer profile, preferences, consent, export,
  and configured support access are already implemented.
- Marketing website, web product, internal admin tools, and the service
  extractions described in the [Architecture Roadmap](architecture-roadmap.md).

## Keeping This Current

Update this file whenever a capability crosses one of the boundaries above.
When closing a gap, link the implementation and test in the pull request and
change only the claims that the new evidence supports.
