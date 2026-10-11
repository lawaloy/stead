# Developer Automation

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Stead keeps repeatable local setup and validation behind repository-root npm
commands. The automation is cross-platform, refuses to overwrite local
environment files, and gives database-backed tests their own schemas.

## Command Matrix

| Command                      | Automated work                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run bootstrap`          | Installs root, API, and mobile dependencies; initializes missing env files; starts and waits for PostgreSQL; applies development migrations.         |
| `npm run env:init`           | Copies both env examples only when the targets are absent and replaces the three API placeholders with independent cryptographically random secrets. |
| `npm run db:start`           | Starts the Compose PostgreSQL service and polls `pg_isready` before returning.                                                                       |
| `npm run db:stop`            | Stops the Compose service without deleting its persistent volume.                                                                                    |
| `npm run dev:prepare`        | Initializes missing env files, starts/waits for PostgreSQL, and applies committed migrations.                                                        |
| `npm run dev:api`            | Starts the watch-mode NestJS API using `api/.env`.                                                                                                   |
| `npm run dev:mobile`         | Starts Expo using `mobile/.env`.                                                                                                                     |
| `npm run verify`             | Runs formatting, workflow contracts, automation tests, lint, generated-contract drift, API/mobile typechecks, unit tests, and builds.                |
| `npm run test:e2e:local`     | Starts/waits for PostgreSQL, migrates the isolated `e2e` schema, supplies safe test settings, and runs API e2e tests.                                |
| `npm run test:journey:local` | Migrates `e2e_mobile`, builds/starts/waits for the API, runs the real mobile API-client journey, and stops the API even when the test fails.         |
| `npm run verify:full`        | Runs `verify`, the API e2e suite, and the live mobile API-client journey in sequence.                                                                |

The lower-level package scripts remain available for focused iteration. Use the
root commands for onboarding and pre-push confidence because they encode the
required ordering and safety settings.

## Safety Properties

- Environment initialization uses exclusive file creation and never prints the
  generated secrets.
- Existing `.env` files are preserved, including deliberate developer changes.
- E2e commands set their database URLs directly and never inherit the
  development `public` schema.
- The journey refuses to start when port 3000 is already serving another
  process, avoiding accidental tests against an unrelated API.
- `db:stop` preserves the database volume. Removing local data remains an
  explicit operator action.

## Intentionally Manual Gates

Automation can prepare evidence, but it cannot truthfully replace these checks:

- Twilio or Termii account enrollment, sender approval, credentials, billing,
  and live carrier delivery on target devices.
- TalkBack and VoiceOver acceptance, physical-device secure-storage behavior,
  and subjective usability review.
- Customer validation of CSV exports, stability thresholds, and alert copy.
- Production infrastructure selection, support staffing, backup restoration,
  deletion-expiry evidence, incident response, and release approval.
- Repository governance decisions such as approval counts, bypass actors,
  merge strategy, and making new checks required.

These remain named release gates in the project documentation so a successful
local command is never mistaken for production validation.

</details>
