# Branch Protection Checklist

Target branch: `main`

Last verified: 2026-08-05 through the GitHub repository ruleset API.

`main` is governed by the active `Stead Rules` repository ruleset. GitHub's
classic branch-protection endpoint reports no classic protection, so the
ruleset—not the classic protection page—is the source of truth for this
checklist.

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
CodeQL findings to stay below the configured threshold, and enables Copilot
code review on pushes.

## Required Status Checks

These are the exact contexts stored in the active ruleset:

- [x] `lint`
- [x] `api-test` — includes API unit and PostgreSQL-backed e2e tests
- [x] `build`
- [x] `mobile-test` — includes mobile typecheck and unit tests
- [x] `CodeQL`
- [x] `dependency-review` — blocks critical runtime dependency findings

The Dependency Review workflow is required and its scan step propagates
failures, so a critical runtime dependency finding blocks a merge.

## Urgent Follow-up

1. If more than one reviewer is available, require one approval, dismiss stale
   approvals, and require conversation resolution.
2. Decide whether squash is the only supported merge strategy and configure
   the ruleset to match `CONTRIBUTING.md`.
3. Review the repository-role bypass actors and retain only intentional
   emergency access.
4. Re-run this audit after each ruleset change and update the verification date.

## Merge Queue (Optional)

- [ ] Enable merge queue if repository traffic makes serialized merging useful

## Release Hygiene

- [ ] Protect tags matching `v*`
- [ ] Use semantic versioning for releases
