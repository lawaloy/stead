# Stead

Stead is a Financial Stability Layer that turns cashflow into decision intelligence to help users plan for obligations and spend safely.

Current repository status:

- API: the core auth, single-active-goal, manual-transaction, stability-dashboard,
  and persisted OTP-notification boundaries are implemented.
- Mobile: the core vertical slice supports OTP login, active-goal creation,
  manual transaction creation, transaction history/filtering/edit/delete, and
  dashboard viewing. Goal maintenance and history remain notable API/mobile
  capability gaps.
- Verification: auth/notification and finance have PostgreSQL-backed e2e
  coverage. The app still has no automated screen or native-device journey
  suite.
- Production readiness: live SMS delivery on real devices, production session
  lifecycle, operations, automated critical mobile journeys, and several
  product workflows remain incomplete.

Quick links

- Overview: [docs/overview.md](docs/overview.md)
- Product milestones, capability, and test status: [docs/project-status.md](docs/project-status.md)
- Active architecture milestone: [docs/architecture-roadmap.md](docs/architecture-roadmap.md#delivery-roadmap)
- Auth readiness work: [docs/auth-hardening.md](docs/auth-hardening.md)
- Repository rules audit: [docs/branch-protection-checklist.md](docs/branch-protection-checklist.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- API: [api/](api/)
- Mobile: [mobile/](mobile/)

Prerequisites: Node.js 22.18+ on the 22.x line or Node.js 24.x, plus Docker
for the local PostgreSQL database. Both npm projects enforce the supported
Node.js range during dependency installation.

Get started

API (from `api/`):

```bash
cd api
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Copy `api/.env.example` to `api/.env` first. Set `DATABASE_URL`; generate independent random values for `JWT_SECRET` (16+ characters), `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` (32+ characters), and `AUTH_DEVICE_IDENTIFIER_SECRET` (32+ characters); and never reuse the checked-in placeholders. The device secret creates non-reversible identifiers for device-aware OTP throttling and must remain stable within an environment. Inspection endpoints deny access by default; add trusted user IDs to the comma-separated `AUTH_INSPECTION_OPERATOR_USER_IDS` only when operator access is needed. The example uses `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true` so local OTP requests still create notification jobs without calling Twilio or Termii. Both development-only settings are rejected in production. For local Postgres, `api/docker-compose.yml` provides a development database.

Mobile (from `mobile/`):

```bash
cd mobile
npm ci
npm run start
```

Copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_URL` when the API is not running on the default local URL.

Useful checks:

```bash
cd api
npm run lint -- --no-fix
npm run test -- --runInBand
npm run build

cd ../mobile
npm run lint
npm run typecheck
npm test -- --runInBand
npm run build
```

The API e2e suite uses PostgreSQL and deletes its own fixtures. It refuses to
run against the development `public` schema. The test harness defaults to the
local `e2e` schema and also accepts an `E2E_DATABASE_URL` override. Before the
first local e2e run, and whenever migrations change, apply migrations to the
dedicated schema:

```powershell
cd api
$env:DATABASE_URL = 'postgresql://stead:stead@localhost:5432/stead?schema=e2e'
npx prisma migrate deploy
npm run test:e2e -- --runInBand
```

The database and schema persist in the Docker volume, so this migration step
does not need to be repeated before every unchanged test run.

For the full vision, product strategy, current implementation, remaining gaps, and architecture see [docs/overview.md](docs/overview.md).
