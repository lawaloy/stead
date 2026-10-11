# Agents

<details open>
<summary><strong>Show or hide document contents</strong></summary>

This file contains repository-specific instructions for coding agents. Human
onboarding belongs in [CONTRIBUTING.md](CONTRIBUTING.md), and canonical local
command behavior belongs in
[Developer Automation](docs/developer-automation.md). Do not duplicate those
documents here.

## Agent Startup

Read the repository shape and prerequisites in [README.md](README.md), then use
the root commands defined in
[Developer Automation](docs/developer-automation.md). The supported Node range
is machine-enforced by the root `package.json`.

API e2e work must use the dedicated schema supplied by
`npm run test:e2e:local`; never run fixture-cleaning tests against `public`.

## Opening Pull Requests

Open PRs **ready for review by default**. Use draft status only when the user
explicitly requests it or the work is intentionally incomplete.

Use [`.github/pull_request_template.md`](.github/pull_request_template.md):

- fill at least one `## What + Why` bullet;
- report local verification honestly under `## Checks`; and
- retain `<!-- AUTO:START -->` and `<!-- AUTO:END -->` so automation can update
  its section in place.

For ordinary PRs, do not enable auto-merge when creating the PR. Wait until all
workflows and check integrations expected for the PR's event and changed paths
have produced runs for the latest head commit and every resulting run is
terminal, including checks not required by branch protection. Also wait for PR
review automation still running against an earlier commit because it may post
relevant feedback after a push. If an expected run does not appear, investigate
the missing run rather than treating its absence as success. Success is
acceptable; accept a skipped or neutral conclusion only when it is expected and
documented. Failure, cancellation, timeout, or action-required conclusions
block completion.

Then inspect the PR conversation, submitted reviews, and inline review threads.
Address every actionable item, reply with the outcome, and resolve a thread
only after the concern is fixed or answered with documented rationale.

Repeat the complete wait-and-inspect cycle after every push because a new head
commit invalidates the previous check and review assessment. Immediately before
completion, re-check the latest commit, all check and review-automation runs,
and all three feedback surfaces. Merge manually only when nothing is pending,
no expected runs are missing, no unacceptable conclusions remain, and no
actionable feedback is unresolved.

## GitHub Operations

- Use the installed GitHub app connector first for pull requests, issues,
  reviews, checks, workflow runs, labels, and merge operations.
- Do not default to `gh` or treat an expired/missing `gh` token as a blocker
  while the connector exposes the required operation.
- Use `gh` only when the user explicitly requests it or after confirming the
  connector lacks the required operation.
- Continue using local `git` for working-tree inspection, branches, commits, and
  synchronization; `git` and `gh` are separate tools.

## Safety-Critical Local Rules

- Preserve existing `.env` files. `npm run env:init` creates only missing files.
- Keep `JWT_SECRET`, `NOTIFICATION_PAYLOAD_ENCRYPTION_KEY`, and
  `AUTH_DEVICE_IDENTIFIER_SECRET` distinct; the latter two require at least 32
  characters and the JWT secret requires at least 16.
- Keep `AUTH_INSPECTION_OPERATOR_USER_IDS` empty unless authenticated operator
  access is intentionally configured.
- `SMS_PROVIDER=dev` and `DEV_EXPOSE_OTP=true` are local/test settings and are
  rejected in production.
- Restart API or Expo processes after changing their environment files.
- Use `npm run verify:full` for the complete local gate. Native, live-provider,
  physical-device, and production checks remain separate evidence boundaries.

</details>
