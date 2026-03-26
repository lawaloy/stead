# Dependency Upgrade Watchlist

Review these temporary major-version ignores monthly and remove them when the upstream toolchains support the newer version cleanly.

## TypeScript 6

### API

Blocked by:
- `ts-jest` currently requires `typescript < 6`
- `typescript-eslint` currently requires `typescript < 6`

Current policy:
- Dependabot major `typescript` updates are ignored in `/api`

Revisit when:
- `ts-jest` supports TypeScript 6, or API tests are migrated off `ts-jest`
- `typescript-eslint` supports TypeScript 6

### Mobile

Blocked by:
- Expo/mobile lint stack currently requires `typescript < 6`

Current policy:
- Dependabot major `typescript` updates are ignored in `/mobile`

Revisit when:
- Expo lint stack supports TypeScript 6 cleanly

