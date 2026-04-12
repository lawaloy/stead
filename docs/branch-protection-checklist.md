# Branch Protection Checklist

Target branch: `main`

## Required Settings
- [ ] Require a pull request before merging
- [ ] Require at least 1 approving review
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require status checks to pass before merging
- [ ] Require branches to be up to date before merging
- [ ] Require conversation resolution before merging
- [ ] Restrict who can push directly to `main`
- [ ] Include administrators (recommended)
- [ ] Allow only squash merge

## Required Status Checks
- [ ] `ci / lint`
- [ ] `ci / api-test`
- [ ] `ci / build`
- [ ] `mobile-ci / mobile-test`
- [ ] `Dependency review / dependency-review`
- [ ] `CodeQL Advanced / Analyze (javascript-typescript)`

Note: `Dependency review` is currently configured with `continue-on-error: true`; remove that if it should block merges.

## Merge Queue (Optional)
- [ ] Enable merge queue for high-traffic repos

## Release Hygiene
- [ ] Protect tags pattern `v*`
- [ ] Use semantic versioning per release
