# Agents

## Cursor Cloud specific instructions

### Overview

Stead is a monorepo with two sub-projects:

- **`api/`** — NestJS REST API (TypeScript, Prisma ORM, PostgreSQL 16, JWT auth with OTP)
- **`mobile/`** — Expo React Native mobile app (TypeScript, React 19, Expo Router)

Standard commands for lint, test, build, and dev are documented in the root `README.md` and `CONTRIBUTING.md`.

### Opening pull requests

Open PRs **ready for review by default**. Use `--draft` only when the user explicitly requests a draft or the work is intentionally incomplete.

When creating PRs, use [`.github/pull_request_template.md`](.github/pull_request_template.md):

- **`## What + Why`** with at least one filled bullet (not `## Summary`)
- **`## Checks`** for local verification before push
- **`<!-- AUTO:START -->` … `<!-- AUTO:END -->`** markers so the PR Description workflow can update the file list in place

Fill in **What + Why** before the next push. Details: [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests).

For ordinary PRs, do not enable auto-merge when creating the PR. Wait until all workflows and check integrations expected for the PR’s event and changed paths have produced runs for the latest head commit and every resulting run is terminal, including checks not required by branch protection. Also wait for any PR review automation still running against an earlier commit, because it may post relevant feedback after a push. If an expected run does not appear, investigate the missing run rather than treating its absence as success. Success is acceptable; accept a skipped or neutral conclusion only when it is expected and documented. Failure, cancellation, timeout, or action-required conclusions block completion.
Then inspect the PR conversation, submitted reviews, and inline review threads. Address every actionable item, reply with the outcome, and resolve a thread only after the concern is fixed or answered with documented rationale.
Repeat the complete wait-and-inspect cycle after every push because a new head commit invalidates the previous check and review assessment. Immediately before completion, re-check the latest commit, all check and review-automation runs, and all three feedback surfaces. Merge manually only when nothing is pending, no expected runs are missing, no unacceptable conclusions remain, and no actionable feedback is unresolved.

### GitHub operations

- Use the installed GitHub app connector first for remote GitHub operations,
  including pull requests, issues, reviews, checks, workflow runs, labels, and
  auto-merge.
- Do not default to the `gh` CLI and do not treat an expired or missing `gh`
  token as a blocker while the GitHub app connector is available.
- Use `gh` only when the user explicitly requests it or after confirming that
  the GitHub app connector does not expose the required operation.
- Continue to use local `git` commands for working-tree inspection, branches,
  commits, and synchronizing the local checkout. `git` and `gh` are separate
  tools; this preference does not prohibit normal local Git workflows.

### Prerequisites

- **Node.js 22.18+ (22.x) or 24.x** (required by the contract generator and TypeScript 7 CLI; TypeScript 6 remains installed only as a compiler-API compatibility layer for supporting tools)
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

API e2e tests delete their fixtures and must use a dedicated schema. Never run
them against the development `public` schema. The test harness defaults to the
local `e2e` schema. Prepare it before the first run and whenever migrations
change:

```powershell
cd api
$env:DATABASE_URL = 'postgresql://stead:stead@localhost:5432/stead?schema=e2e'
npx prisma migrate deploy
npm run test:e2e -- --runInBand
```

The schema persists in the Docker volume, so unchanged test runs do not need a
fresh migration.

### Environment files

Copy `.env.example` to `.env` in both `api/` and `mobile/`. Key gotchas:

- `JWT_SECRET` must be at least **16 characters**.
- `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY` must be at least **32 characters** and must not reuse the JWT secret.
- `AUTH_DEVICE_IDENTIFIER_SECRET` must be at least **32 characters**, must not reuse either secret above, and must remain stable within an environment so device abuse history stays correlated.
- `AUTH_INSPECTION_OPERATOR_USER_IDS` is a comma-separated allowlist; leaving it empty denies inspection access to everyone.
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
