# Contributing to Stead

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This guide owns the contributor lifecycle: preparing a checkout, choosing a
branch, making and validating a focused change, and taking its pull request
through review. Command internals belong in
[Developer Automation](docs/developer-automation.md), while current product
priorities belong in [Project Status](docs/project-status.md).

## New Contributor Workflow

1. Install the [repository prerequisites](README.md#new-contributor-quick-start)
   and start the Docker daemon.
2. Clone and prepare the repository:

   ```bash
   git clone https://github.com/lawaloy/stead.git
   cd stead
   npm run bootstrap
   ```

3. Create a focused branch from the latest remote `main`:

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c feature/<area>-<task>
   ```

   Use `fix/`, `chore/`, or `hotfix/` instead when it better describes the
   change.

4. Review the generated `api/.env` and `mobile/.env`, then start the API and
   mobile app in separate terminals:

   ```bash
   npm run dev:api
   npm run dev:mobile
   ```

5. Make one cohesive change. Add or update tests at the narrowest useful
   boundary, and update the authoritative documentation when behavior, status,
   contracts, or operations change.
6. Apply safe automatic fixes and run the base local gate:

   ```bash
   npm run format
   npm run lint:fix
   npm run verify:full
   ```

   For native-impacting changes, run the explicit `npm run validate` gate
   described in
   [Developer Automation](docs/developer-automation.md#local-validation).
   Report each native platform actually tested; an Android pass does not
   certify iOS.

7. Review the diff and commit it using the
   [commit message convention](.github/commit-convention.md):

   ```bash
   git status --short
   git diff --check
   git add <files>
   git commit -m "feat(area): describe the change"
   ```

8. Push the branch and open a ready-for-review pull request into `main` using
   [the repository template](.github/pull_request_template.md):

   ```bash
   git push -u origin feature/<area>-<task>
   ```

9. Wait for every expected check and review automation run. Address actionable
   conversation comments, submitted reviews, and inline threads; push any fixes;
   and repeat the complete check-and-review cycle for the new commit.
10. After finishing local work, stop PostgreSQL without deleting its volume:

    ```bash
    npm run db:stop
    ```

## Working Agreements

- Keep one concern per branch and avoid unrelated cleanup.
- Never commit secrets or customer-sensitive data.
- Follow the environment-file guarantees in
  [Developer Automation](docs/developer-automation.md#safety-properties).
- Keep `AUTH_INSPECTION_OPERATOR_USER_IDS` empty unless specific authenticated
  users require operator access.
- Set `EXPO_PUBLIC_SUPPORT_EMAIL` to a monitored address for release builds.
- Add every required environment variable to the matching `.env.example`.
- Never run e2e tests against the development `public` schema. Use the root
  database-backed commands, which enforce dedicated schemas.
- Update `contracts/openapi.yaml` before changing a mobile-consumed API request
  or response. Run `npm --prefix api run contracts:generate`, commit the
  generated API/mobile files, and never edit generated files by hand.

## Validation Strategy

Use focused package-level commands while iterating and the appropriate
`verify:full` / `validate` gate before pushing. Git push does not run tests.
The canonical breakdown of automated layers, safety
guarantees, native CI boundaries, and intentionally manual release gates lives
only in [Developer Automation](docs/developer-automation.md).

## Pull Requests

- Open ordinary PRs ready for review; use draft status only for intentionally
  incomplete work.
- Use `## What + Why`, complete the checks section honestly, and retain the
  `<!-- AUTO:START -->` / `<!-- AUTO:END -->` markers. The PR Description
  workflow owns the content between those markers.
- Fill at least one `What + Why` bullet before the next push so automation can
  update the description without replacing an empty template.
- Link related issues and describe relevant validation or intentionally skipped
  checks.
- Do not enable auto-merge for ordinary PRs. Merge only after all expected runs
  for the latest commit are terminal and acceptable and no actionable feedback
  remains unresolved.

Remote repository automation follows the GitHub-app-first policy in
[`AGENTS.md`](AGENTS.md#github-operations). Contributors may use the GitHub web
interface or their preferred authenticated client.

## Definition of Done

- The change is focused, understandable, and contains no unrelated edits.
- Formatting, relevant tests, contracts, typechecks, and builds pass.
- Behavior and operational consequences are tested at appropriate boundaries.
- Authoritative documentation and examples match the implementation.
- No secrets or sensitive customer data are introduced.
- The latest PR commit has no pending or unacceptable checks and no unresolved
  actionable feedback.

</details>
