# Architecture Roadmap

> Updated roadmap: see `docs/architecture-roadmap-v2.md`.

## Phase 1 (Current)
- Single repository with two deployable apps:
  - `api/src/` for API
  - `mobile/` for Expo app
- Split CI by path:
  - `.github/workflows/ci.yml` for API
  - `.github/workflows/mobile-ci.yml` for mobile
- Runtime guardrails:
  - API env schema validation at startup
  - Request-id propagation and request logs
  - Mobile env schema validation before API usage
- Contract guardrails:
  - Mobile runtime schema validation via zod for API responses
  - API and mobile tests enforced in CI

## Phase 2 (Next)
- Restructure to workspace layout:
  - `api`
  - `mobile`
  - `packages/shared-contracts` (zod schemas and TS types)
- Promote API response schemas to shared package.
- Add contract-compat test:
  - API e2e responses validated against shared schemas.
  - Mobile uses same schemas for decode/parse.
- Add root workspace scripts:
  - `npm run ci:api`
  - `npm run ci:mobile`
  - `npm run ci:contracts`

## Migration Notes
- Do not mix directory move + feature work in one PR.
- Move files first with no behavior changes.
- Update imports and CI paths second.
- Introduce shared-contracts package third.
- Remove duplicated local contract types last.
