# ADR 0001: API Contract Ownership

- Status: Accepted
- Date: 2026-08-05

## Context

The API previously serialized response objects from inferred NestJS service
return types while mobile maintained independent handwritten Zod schemas. Unit
fixtures could prove that the mobile schemas accepted examples, but could not
detect an API serializer and mobile decoder drifting independently.

The API and mobile projects also have separate package installations and build
pipelines. Importing source files across those project roots would tightly
couple Nest, Expo/Metro, and their dependency resolution.

## Decision

`contracts/openapi.yaml` is the authoritative contract for every API endpoint
consumed by mobile.

Running `npm run contracts:generate` from `api/` deterministically produces:

- API TypeScript types in `api/src/contracts/generated/`.
- Mobile TypeScript types and Zod runtime schemas in
  `mobile/src/contracts/generated/`.

API request DTOs implement generated request types. API service serializers
declare generated response types and explicitly serialize dates to ISO strings.
Mobile request payloads use generated request types, and its response parsing
re-exports generated Zod schemas.

Generated files are committed for reproducible installs but are never edited
manually. CI runs `npm run contracts:check` and fails if regeneration changes
either output directory.

## Consequences

- A contract change starts in one reviewable OpenAPI document.
- Removing or changing a required field breaks API or mobile typechecking.
- Runtime mobile parsing enforces the generated response shapes and formats.
- Backward-compatible additive response fields remain acceptable to mobile
  because Zod object parsing ignores unknown keys by default.
- Generator upgrades are explicit because `@hey-api/openapi-ts` is pinned to an
  exact version.
- Publishing a separately versioned contracts package is deferred until a
  consumer outside this monorepo or service extraction makes it necessary.
