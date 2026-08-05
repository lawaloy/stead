# Stead

Stead is a Financial Stability Layer that turns cashflow into decision intelligence to help users plan for obligations and spend safely.

Current repo status:

- API: NestJS, Prisma, Postgres, JWT auth, OTP over SMS, goals, manual transactions, stability dashboard, and persisted notification jobs.
- Mobile: Expo Router app with OTP login, token persistence, active goal setup, manual transaction entry, and stability dashboard screens.
- CI: API/mobile lint, API tests, API/mobile builds, mobile typecheck/tests, Dependency Review, and CodeQL workflows are present.

Quick links

- Overview: [docs/overview.md](docs/overview.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- API: [api/](api/)
- Mobile: [mobile/](mobile/)

Get started

API (from `api/`):

```bash
cd api
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Copy `api/.env.example` to `api/.env` first. Set `DATABASE_URL`, generate independent random values for `JWT_SECRET` (16+ characters) and `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` (32+ characters), and never reuse the checked-in placeholders. Inspection endpoints deny access by default; add trusted user IDs to the comma-separated `AUTH_INSPECTION_OPERATOR_USER_IDS` only when operator access is needed. The example uses `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true` so local OTP requests still create notification jobs without calling Twilio or Termii. Both development-only settings are rejected in production. For local Postgres, `api/docker-compose.yml` provides a development database.

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
run against the development `public` schema. Before the first local e2e run,
apply migrations to a dedicated schema and keep that URL set for the test:

```powershell
cd api
$env:DATABASE_URL = 'postgresql://stead:stead@localhost:5432/stead?schema=e2e'
npx prisma migrate deploy
npm run test:e2e -- --runInBand
```

For the full vision, product strategy, current implementation, remaining gaps, and architecture see [docs/overview.md](docs/overview.md).
