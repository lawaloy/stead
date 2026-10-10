# Stead

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Stead is a Financial Stability Layer that turns cashflow into decision intelligence to help users plan for obligations and spend safely.

Current repository status:

- API: the core auth, goal lifecycle/history, manual-transaction,
  stability-dashboard, account/data self-service, and persisted
  OTP/readiness-notification boundaries are implemented. Authentication uses
  short-lived access tokens and rotating, device-bound refresh-token families.
- Mobile: the core vertical slice supports OTP login, active-goal creation,
  manual transaction creation, transaction history/filtering/edit/delete, and
  dashboard viewing, goal lifecycle/history, and SMS notification preferences.
  Customers can also manage their profile and optional consents, export their
  data, contact configured support, permanently delete their account, and
  preview and confirm bounded CSV transaction imports.
- Verification: auth/notification and finance have PostgreSQL-backed e2e
  coverage. Auth, goal, transaction, and dashboard screens have component
  journeys, and CI exercises the real mobile API client against a running API
  and PostgreSQL. `native-ci` reports on every PR and `main` push, runs the
  Android/iOS Maestro journeys when native-impacting paths change, and runs the
  full suite daily and on demand. Native binaries build once, then Maestro tests
  install them; AVD, Pods, DerivedData, binary, and Metro caches shorten warm
  runs.
- Production readiness: live provider-backed SMS delivery and physical-device
  accessibility/acceptance, deployment and operational monitoring,
  backup/restore enforcement, and customer validation of ingestion and scoring
  remain incomplete.

Weekly summaries and material risk/recovery alerts are opt-in. Customers choose
their local weekly schedule in the mobile app; delivery uses the same encrypted,
retryable SMS queue as OTP. See [docs/readiness-alerts.md](docs/readiness-alerts.md)
for the rules and operational boundaries.

Account export, optional-consent history, deletion behavior, retention policy,
and support configuration are documented in
[docs/account-data-self-service.md](docs/account-data-self-service.md).

Quick links

- Overview: [docs/overview.md](docs/overview.md)
- Product milestones, capability, and test status: [docs/project-status.md](docs/project-status.md)
- Active architecture milestone: [docs/architecture-roadmap.md](docs/architecture-roadmap.md#delivery-roadmap)
- Auth readiness work: [docs/auth-hardening.md](docs/auth-hardening.md)
- Repository rules audit: [docs/branch-protection-checklist.md](docs/branch-protection-checklist.md)
- Local automation and manual boundaries: [docs/developer-automation.md](docs/developer-automation.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- API: [api/](api/)
- Mobile: [mobile/](mobile/)

Prerequisites: Node.js 24.15+ on the 24.x line, plus Docker
for the local PostgreSQL database. Both npm projects enforce the supported
Node.js range during dependency installation.

Both projects use the TypeScript 7 native CLI for typechecking and API builds.
The package named `typescript` remains mapped to Microsoft's TypeScript 6
compatibility package for tools that still require the legacy compiler API.
The scheduled TypeScript 6 Removal Readiness workflow tracks when that
compatibility layer can be removed safely.

## Get Started

From a new clone, run:

```bash
npm run bootstrap
```

This installs all root, API, and mobile dependencies; creates missing local
environment files with three distinct generated API secrets; starts PostgreSQL;
waits for it to accept connections; and applies committed migrations. Existing
`.env` files are never overwritten.

Start the API and mobile app in separate terminals:

```bash
npm run dev:api
npm run dev:mobile
```

The generated API environment uses `SMS_PROVIDER=dev` and
`DEV_EXPOSE_OTP=true`, so local authentication does not need Twilio or Termii.
Edit `mobile/.env` when the API is not available at the default local URL:
Android emulators commonly use `http://10.0.2.2:3000`, while physical devices
need the development machine's reachable LAN address. Set
`EXPO_PUBLIC_SUPPORT_EMAIL` to a staffed address for release builds. Restart a
running API or Expo process after changing its environment file.

## Verification

Run the deterministic checks, unit tests, contract check, typechecks, and builds:

```bash
npm run verify
```

Database-backed suites have safe root commands that start PostgreSQL, wait for
readiness, migrate dedicated schemas, and supply isolated test settings:

```bash
npm run test:e2e:local
npm run test:journey:local
# Or run every local gate:
npm run verify:full
```

The e2e harness still refuses the development `public` schema. Stop the local
database with `npm run db:stop`. See
[Developer Automation](docs/developer-automation.md) for command behavior,
lower-level fallbacks, and the checks that must remain human-led.

For the full vision, product strategy, current implementation, remaining gaps, and architecture see [docs/overview.md](docs/overview.md).

</details>
