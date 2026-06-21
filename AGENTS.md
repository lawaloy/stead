# Agents

## Cursor Cloud specific instructions

### Overview

Stead is a monorepo with two sub-projects:

- **`api/`** — NestJS REST API (TypeScript, Prisma ORM, PostgreSQL 16, JWT auth with OTP)
- **`mobile/`** — Expo React Native mobile app (TypeScript, React 19, Expo Router)

Standard commands for lint, test, build, and dev are documented in the root `README.md` and `CONTRIBUTING.md`.

### Opening pull requests

When creating PRs (including via `gh pr create`), use [`.github/pull_request_template.md`](.github/pull_request_template.md):

- **`## What + Why`** with at least one filled bullet (not `## Summary`)
- **`## Checks`** for local verification before push
- **`<!-- AUTO:START -->` … `<!-- AUTO:END -->`** markers so the PR Description workflow can update the file list in place

```bash
gh pr create --title "..." --body-file .github/pull_request_template.md
```

Fill in **What + Why** before the next push. Details: [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests).

### Prerequisites

- **Node.js 22+** (required by TypeScript ~6.0)
- **Docker** (required for PostgreSQL via `api/docker-compose.yml`)

### Starting the database

```bash
dockerd &>/var/log/dockerd.log &
sleep 3
cd api && docker compose up -d
```

Wait for Postgres to accept connections before running migrations:

```bash
docker exec stead_db pg_isready -U stead
```

### Environment files

Copy `.env.example` to `.env` in both `api/` and `mobile/`. Key gotchas:

- `JWT_SECRET` must be at least **16 characters**.
- Use `SMS_PROVIDER=dev` locally when testing without Twilio or Termii credentials; this provider is rejected in production.
- Set `DEV_EXPOSE_OTP=true` in the API environment (or pass it as env var when starting the server) to have the `/auth/request-otp` response include the OTP in plaintext — useful for testing auth flows without an SMS provider.

### Running the API

```bash
cd api
npx prisma migrate dev   # apply pending migrations
SMS_PROVIDER=dev DEV_EXPOSE_OTP=true npm run start:dev   # dev server on port 3000
```

The dev server watches source files but **does not restart on `.env` changes**; restart the process manually if you edit `.env`.

### Running mobile

```bash
cd mobile
npm run start   # Expo dev server
```

The mobile app reads `EXPO_PUBLIC_API_URL` from `mobile/.env` (defaults to `http://localhost:3000`).
