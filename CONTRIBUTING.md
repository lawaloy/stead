# Contributing to Stead

<details open>
<summary><strong>Show or hide document contents</strong></summary>

## Branching

- Base all work on `main`.
- Use short-lived branches:
  - `feature/<area>-<task>`
  - `fix/<area>-<task>`
  - `chore/<area>-<task>`
  - `hotfix/<area>-<task>`
- Keep one concern per branch.

## Commit Convention

Use Conventional Commits. The canonical type definitions and examples are in
the [commit message convention](.github/commit-convention.md).

Format:
`<type>(<scope>): <summary>`

Examples:

- `feat(auth): add refresh token rotation`
- `fix(api): handle null amount in transaction mapper`
- `feat(mobile): add goal setup screen`
- `chore(ci): add npm cache to workflow`

Common types:

- `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

## Pull Requests

- Open PRs into `main`.
- Keep PRs focused and small.
- Include clear testing notes.
- Link related issue(s).
- Wait for every expected check on the latest commit and address conversation,
  review, and inline-thread feedback before merging.

Use the repo template format (see [`.github/pull_request_template.md`](.github/pull_request_template.md)):

The template is the single source of truth for its exact headings, local-check
list, and automation markers; do not copy a second version into documentation.
It currently records `npm run verify`, `npm run test:e2e:local`, and `npm run
test:journey:local`.

**Important:**

- Use **`## What + Why`**, not `## Summary` — matches the pull request template.
- Include **`<!-- AUTO:START -->` / `<!-- AUTO:END -->`** markers so the [PR Description workflow](.github/workflows/pr-description.yml) can refresh the file list without overwriting your text.
- Fill in **at least one What + Why bullet** before pushing again; until then, later syncs skip auto-updates so an empty template is not clobbered.

Create the PR with the GitHub web interface or the installed GitHub integration.
Repository automation must follow the GitHub-app-first policy in
[`AGENTS.md`](AGENTS.md#github-operations) instead of assuming a local CLI token.

Local verification before push:

- New clone: `npm run bootstrap` from the repository root
- Deterministic checks, unit tests, contracts, typechecks, and builds:
  `npm run verify`
- PostgreSQL API e2e suite: `npm run test:e2e:local`
- Live mobile API-client journey: `npm run test:journey:local`
- Every local gate in sequence: `npm run verify:full`

Run `npm run format` or `npm run lint:fix` from the repository root to apply
automatic formatting or lint corrections. CI runs the non-mutating checks and
rejects formatting drift.

The single `.github/workflows/ci.yml` build/test workflow runs independent
format, lint, API, and mobile jobs in parallel on pull requests. Native
Android/iOS simulator journeys live in `.github/workflows/native-ci.yml`. Its
configuration job reports on every pull request and `main` push; expensive
native jobs run only when the shared native path policy matches. Scheduled
16:00 UTC and manual runs execute the full suite. The daily run follows morning
Dependabot, Dependency Maintenance, and Dependency Audit activity so automated
dependency PRs have time to land.
Native binaries are built in dedicated jobs and passed to Maestro jobs as
artifacts. Warm Android runs use cached AVD boot snapshots; iOS miss builds use
mtime/inode-aware DerivedData plus Pods caches; both platforms cache installable
binaries, Maestro CLI, and Metro transforms. Shared non-secret CI toolchain
versions are kept in `.github/ci.env`; update that file when changing Node, npm,
the Android API level, or the macOS runner. New pushes cancel superseded CI runs.

The database-backed root commands start PostgreSQL, wait for readiness, migrate
dedicated schemas, and provide safe test settings. The API e2e harness also
refuses to clean the development `public` schema.

## Local Setup

Use Node.js 24.15+ on the 24.x line for the complete repository. See
[dependency maintenance](docs/dependency-policy.md) for supported version
baselines and the overrides that still require upstream fixes.

API and mobile scripts invoke the TypeScript 7 CLI through
`@typescript/native`. Keep the `typescript` dependency mapped to
`@typescript/typescript6` until the TypeScript 6 Removal Readiness workflow
reports that a fully tested removal trial is eligible.

Prepare a new clone:

```bash
npm run bootstrap
```

Then start the API and mobile app in separate terminals:

```bash
npm run dev:api
npm run dev:mobile
```

`npm run bootstrap` installs all three dependency trees, creates only missing
environment files, generates distinct local API secrets, starts PostgreSQL,
waits for readiness, and applies committed migrations. Use `npm run
dev:prepare` to repeat only the environment/database preparation, or `npm run
db:stop` to stop PostgreSQL without deleting its volume.

## Environment

- `npm run env:init` creates missing `api/.env` and `mobile/.env` files and
  never overwrites existing files.
- Do not commit secrets.
- Generate independent random values for `JWT_SECRET`, `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY`, and `AUTH_DEVICE_IDENTIFIER_SECRET`; do not reuse secrets or use the example placeholders.
- Leave `AUTH_INSPECTION_OPERATOR_USER_IDS` empty unless specific authenticated user IDs need operator access.
- Set `EXPO_PUBLIC_SUPPORT_EMAIL` to a monitored address for release builds so
  customers can reach support from the account screen.
- Add new required env vars to the matching `.env.example`.

See [Developer Automation](docs/developer-automation.md) for the command matrix
and the release checks that intentionally remain manual.

## Definition of Done

- Code is linted, tested, and builds.
- API behavior and contracts are documented when changed.
- `contracts/openapi.yaml` is updated before changing a mobile-consumed API
  request or response, and `npm run contracts:generate` is run from `api/`.
- Generated contract files are committed but never edited by hand.
- PR approved and merged via squash.

</details>
