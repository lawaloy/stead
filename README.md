# Stead

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Stead is a financial stability layer that turns cash flow into decision
intelligence, helping customers plan for obligations and spend safely.

The repository is a TypeScript monorepo containing:

- `api/`: NestJS REST API, Prisma, and PostgreSQL 16.
- `mobile/`: Expo React Native application using Expo Router.
- `contracts/`: authoritative OpenAPI contract for mobile-consumed endpoints.

Read the [Product and System Overview](docs/overview.md) for the stable product
model. What is currently delivered, validated, prioritized, or still blocking
a pilot is maintained only in [Project Status](docs/project-status.md).

## New Contributor Quick Start

Prerequisites:

- Git
- Node.js and npm at the exact versions in [`.github/ci.env`](.github/ci.env)
- Docker with its daemon running

```bash
git clone https://github.com/lawaloy/stead.git
cd stead
npm run bootstrap
```

See [Developer Automation](docs/developer-automation.md) for exactly what
`bootstrap` does and its safety guarantees.

Start the API and mobile app in separate terminals:

```bash
npm run dev:api
npm run dev:mobile
```

Local authentication uses the development SMS provider and does not require a
Twilio or Termii account. Follow the ordered
[contributor workflow](CONTRIBUTING.md#new-contributor-workflow) before making a
change.

## Common Verification

```bash
npm run verify
npm run verify:full
npm run validate -- --platform android
```

`validate` adds dependency audits, CodeQL and actual native builds/UI tests to
the base gate. Run it explicitly before pushing; Git push does not run tests.
Select `--platform all` on a Mac configured for both platforms. Platform
selection reports only the platforms executed.

Native-impacting pull requests run the complete customer journey on Android and
iOS. From a clean committed checkout, `npm run native -- remote-ios` validates
the exact current commit on GitHub-hosted macOS before a PR is opened.

The command behavior, individual test commands, environment safety, and manual
release gates are documented in
[Developer Automation](docs/developer-automation.md).

## Documentation

Use the [Documentation Guide](docs/README.md) to find the authoritative document
for product scope, delivery status, architecture, feature behavior, validation,
security, and repository governance.

For contribution rules, start with [CONTRIBUTING.md](CONTRIBUTING.md). For the
API and mobile source, see [`api/`](api/) and [`mobile/`](mobile/).

</details>
