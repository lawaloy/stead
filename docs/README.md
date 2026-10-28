# Documentation Guide

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This index defines the purpose and ownership of Stead's documentation. Put new
information in its authoritative document and link to it elsewhere instead of
maintaining multiple copies.

## Start Here

| Need                                      | Authoritative source                            |
| ----------------------------------------- | ----------------------------------------------- |
| Understand the repository and start it    | [`README.md`](../README.md)                     |
| Contribute a change from clone through PR | [`CONTRIBUTING.md`](../CONTRIBUTING.md)         |
| Look up local commands and safety         | [Developer Automation](developer-automation.md) |
| Understand the product and system         | [Product and System Overview](overview.md)      |
| Find current scope, evidence, or priority | [Project Status](project-status.md)             |
| Understand future technical direction     | [Architecture Roadmap](architecture-roadmap.md) |

## Document Ownership

### Product and delivery

- [Product and System Overview](overview.md): stable vision, problem, strategy,
  product shape, and current architectural boundaries. It should summarize,
  not reproduce the live capability matrix.
- [Project Status](project-status.md): the only detailed source for what is
  implemented, exposed in mobile, automatically covered, production-validated,
  currently prioritized, or still blocking a pilot.
- [Architecture Roadmap](architecture-roadmap.md): desired architecture,
  extraction stages, technical exit criteria, and open architecture decisions.
  Current capability evidence and product priority belong in Project Status.

### Feature behavior and policy

- [Account and Data Self-Service](account-data-self-service.md): profile,
  consent, export, deletion, retention, and support policy.
- [Weekly Readiness and Risk Alerts](readiness-alerts.md): customer preferences,
  schedules, trigger rules, cooldown, delivery, and validation boundaries.
- [Transaction File Import](transaction-file-import.md): supported CSV formats,
  customer flow, deduplication, and data boundaries.
- [Auth Hardening](auth-hardening.md): authentication security controls,
  session design, validation evidence, and live-provider acceptance criteria.

### Engineering runbooks and governance

- [Developer Automation](developer-automation.md): canonical root command
  behavior, safety guarantees, and intentionally manual release gates.
- [Critical Mobile Journey](critical-mobile-journey.md): the automated client/API
  and native journey scope, execution, and evidence boundaries.
- [Dependency Security Policy](dependency-policy.md): audit enforcement,
  overrides, temporary exceptions, expiry, and removal conditions.
- [Branch Protection Checklist](branch-protection-checklist.md): observed
  repository rules, required checks, and governance follow-up.
- [Observability and Sensitive-Data Logging](observability.md): structured API
  logs, correlation, mobile error reporting, redaction, and production setup.

Repository-specific agent behavior belongs in [`AGENTS.md`](../AGENTS.md).
Issue and pull-request templates under `.github/` are input forms, not reference
documentation.

## Update Rules

When a change affects:

- customer-visible or API behavior, update the relevant feature document and
  OpenAPI contract;
- implementation, test evidence, milestone state, or next priority, update
  Project Status;
- a local command or its guarantees, update Developer Automation and its tests;
- a future service boundary or architectural decision, update Architecture
  Roadmap;
- contribution or review procedure, update `CONTRIBUTING.md` or `AGENTS.md` as
  appropriate;
- a dependency exception or repository rule, update the corresponding policy
  document and its verification date.

The root README remains a concise entry point. Do not turn it into a second
status report, contributor manual, command reference, or architecture roadmap.

</details>
