# Branch Protection Checklist

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Target branch: `main`

Active ruleset last verified: 2026-10-10 through the GitHub repository ruleset
API.

`main` is governed by the active `Stead Rules` repository ruleset. This
checklist treats that ruleset—not the classic branch-protection page—as the
source of truth.

## Current Ruleset

- [x] Require a pull request before merging
- [ ] Require at least 1 approving review — currently `0`
- [ ] Dismiss stale approvals when new commits are pushed
- [x] Require status checks to pass before merging
- [x] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [x] Restrict direct pushes to `main` — bypass actors can bypass only through a pull request, not by pushing directly
- [ ] Apply the pull-request requirement without an administrator bypass
- [ ] Allow only squash merge — merge, squash, and rebase are currently allowed

The ruleset also blocks branch deletion and non-fast-forward updates, requires
CodeQL findings to stay below the configured threshold, enforces code-quality
errors, and enables Copilot code review on pushes.

## Required Status Checks

These are the exact contexts stored in the active ruleset:

- [x] `format`
- [x] `lint`
- [x] `api-test` — includes API unit and PostgreSQL-backed e2e tests
- [x] `build`
- [x] `mobile-test` — includes mobile typecheck and unit tests
- [x] `mobile-api-journey` — live mobile API client against NestJS + PostgreSQL
- [x] `CodeQL`
- [x] `dependency-review` — blocks high-severity or critical runtime dependency findings

The Dependency Review workflow is required and its scan step propagates
failures, so a newly introduced high-severity or critical runtime dependency
finding blocks a merge. Dependency Audit runs daily and on demand for both
projects, and also runs on pull requests and `main` pushes that change package
metadata or the mobile audit-exception policy. It blocks affected PRs even
though its job contexts are not stored as required ruleset checks.

## Urgent Follow-up

1. If more than one reviewer is available, require one approval, dismiss stale
   approvals, and require conversation resolution.
2. Decide whether squash is the only supported merge strategy and configure
   the ruleset to match `CONTRIBUTING.md`.
3. Review the repository-role bypass actors and retain only intentional
   emergency access.
4. Re-run this audit after each ruleset change and update the verification date.
5. Require `Native Readiness`, the stable aggregate job that depends on the
   conditional Android/iOS jobs. It succeeds when native paths legitimately do
   not apply and fails when an applicable platform is disabled, missing, or
   unsuccessful. Do not require `native-android` or `native-ios` directly;
   unrelated PRs do not run those jobs.

## Merge Queue (Optional)

- [ ] Enable merge queue if repository traffic makes serialized merging useful

## Release Hygiene

- [ ] Protect tags matching `v*`
- [ ] Use semantic versioning for releases

</details>
