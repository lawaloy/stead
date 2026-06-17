# Contributing to Stead

## Branching
- Base all work on `main`.
- Use short-lived branches:
  - `feature/<area>-<task>`
  - `fix/<area>-<task>`
  - `chore/<area>-<task>`
  - `hotfix/<area>-<task>`
- Keep one concern per branch.

## Commit Convention
Use Conventional Commits.

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

Use the repo template format (see [`.github/pull_request_template.md`](.github/pull_request_template.md)):

```markdown
## What + Why
- Why this change exists (at least one bullet)

<!-- AUTO:START -->
<!-- AUTO:END -->
```

**Important:**

- Use **`## What + Why`**, not `## Summary` — matches the pull request template.
- Include **`<!-- AUTO:START -->` / `<!-- AUTO:END -->`** markers so the [PR Description workflow](.github/workflows/pr-description.yml) can refresh the file list without overwriting your text.
- Fill in **at least one What + Why bullet** before pushing again; until then, later syncs skip auto-updates so an empty template is not clobbered.
- **Required merge checks** (enforced by GitHub, not the template): **lint**, **build**, **api-test**, **mobile-test**, **CodeQL**.

Example with `gh`:

```bash
gh pr create --title "feat: your change" --body-file .github/pull_request_template.md
```

Local verification (recommended before push):

- API: `npm run lint -- --no-fix`, `npm run test -- --runInBand`, `npm run build`
- Mobile: `npm run lint`, `npm run typecheck`, `npm test -- --runInBand`, `npm run build`

## Local Setup

API:

```bash
cd api
npm ci
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

Mobile:

```bash
cd mobile
npm ci
npm run start
```

## Environment
- Copy `api/.env.example` to `api/.env`.
- Copy `mobile/.env.example` to `mobile/.env`.
- Do not commit secrets.
- Add new required env vars to the matching `.env.example`.

## Definition of Done
- Code is linted, tested, and builds.
- API behavior and contracts are documented when changed.
- Mobile API schema expectations are updated when API response shapes change.
- PR approved and merged via squash.
