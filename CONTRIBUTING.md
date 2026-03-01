# Contributing to Stead API

## Branching
- Base all work on `main`.
- Use short-lived branches:
  - `feature/<service>-<task>`
  - `fix/<service>-<task>`
  - `chore/<service>-<task>`
  - `hotfix/<service>-<task>`
- Keep one concern per branch.

## Commit Convention
Use Conventional Commits.

Format:
`<type>(<scope>): <summary>`

Examples:
- `feat(auth): add refresh token rotation`
- `fix(api): handle null amount in transaction mapper`
- `chore(ci): add npm cache to workflow`

Common types:
- `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

## Pull Requests
- Open PRs into `main`.
- Keep PRs focused and small.
- Include clear testing notes.
- Link related issue(s).

PRs should pass:
- `npm run lint`
- `npm run test`
- `npm run build`

## Local Setup
```bash
npm install
npm run start:dev
```

## Environment
- Copy `.env.example` to `.env`.
- Do not commit secrets.
- Add new required env vars to `.env.example`.

## Definition of Done
- Code is linted, tested, and builds.
- API behavior and contracts are documented when changed.
- PR approved and merged via squash.
