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

Copy `api/.env.example` to `api/.env` first and set at least `DATABASE_URL`, `JWT_SECRET`, and a configured SMS provider. For local Postgres, `api/docker-compose.yml` provides a development database.

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

For the full vision, product strategy, current implementation, remaining gaps, and architecture see [docs/overview.md](docs/overview.md).
