# Dependency maintenance

The September 2026 refresh was checked against registry metadata, clean
installations, dependency audits, Expo validation, and the API/mobile suites.
Use Node.js 24.15 or later on the 24.x line for the full repository: NestJS 12
schematics require that minimum, and Jest 30.5 needs Node 24.9+ and
`--experimental-vm-modules` to load Nest's ESM packages from our CommonJS tests.
The application itself remains CommonJS.

## Version policy

- Keep the NestJS core, adapters, CLI, and companion packages on compatible
  v12 releases. See the [NestJS migration guide](https://docs.nestjs.com/migration-guide).
- Use the current Expo SDK 57 patch and its recommended native package versions.
  React/React DOM, React Native, gesture handler, safe-area context, screens,
  and React types are aligned as one SDK baseline, even when npm offers newer
  standalone versions. This removes the previous platform validation exclusions.
  See [Expo's upgrade instructions](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
- Keep only `@types/jest`, `jest`, and `typescript` in `expo.install.exclude`.
  The mobile suite uses ts-jest directly, not jest-expo; Jest 30.5 is validated
  by that suite, while Expo still recommends Jest 29. The TypeScript alias is
  explained below.
- Axios, Jest, Jest types, and OpenAPI codegen use semver ranges rather than the
  old exact pins or maintenance exclusions. The lockfiles record tested versions.
- Prisma stays on stable 7.10; the registry's newer `latest` tag currently
  points at an 8.0 release candidate, which is not a stable upgrade.
- Prettier remains pinned consistently across root and API for reproducible
  formatting. Do not treat a registry dist-tag that points to an older major
  (such as the current `@types/node` tag) as an upgrade.

## Overrides still required

The removal trial retained only overrides whose removal reintroduced audit
findings after updating parents and running `npm audit fix` without `--force`.

| Project | Override                     | Why it remains                                                                                |
| ------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| API     | `js-yaml` 4.3.2              | OpenAPI codegen's ref parser still pins 4.2.0, below the patched YAML version.                |
| API     | `deepmerge-ts` 8.0.1         | Stable Prisma's config package still selects the vulnerable 7.x line.                         |
| API     | `mysql2` 3.24.3              | Stable Prisma still pins 3.15.3, below the patched MySQL client versions.                     |
| API     | `multer` 2.3.0               | NestJS 12's Express adapter still pins 2.2.0, which has multipart denial-of-service findings. |
| Mobile  | `decode-uri-component` 0.5.0 | Expo Router's query-string dependency still selects a vulnerable decoder version.             |
| Mobile  | `uuid` 14.0.1                | Expo's xcode dependency still selects uuid 7, which has a buffer-bounds advisory.             |

Both full dependency trees audit clean with these overrides. The mobile
`js-yaml` override was removed: its parents now resolve patched YAML normally.
Revisit each remaining override when its parent releases a compatible fix.

## Compatibility code

- Keep `typescript` aliased to `@typescript/typescript6`. The readiness checker
  still reports TypeScript 7.0.2 without the required stable compiler API;
  typescript-eslint supports `<6.1.0` and ts-jest supports `<7`. The build and
  typecheck commands use TypeScript 7 through `@typescript/native` independently.
- Keep `@eslint/compat` around Expo's plugins. Without it, the current React
  plugin crashes on ESLint 10 with `contextOrFilename.getFilename is not a function`.
- Declare `eslint-import-resolver-typescript` directly in mobile. ESLint resolves
  this plugin from the app; relying on Expo's nested copy fails after deduplication.
- The old Jest resolver monkey patch was removed; clean installations load the
  upstream native resolver. Keep optional dependencies enabled during installs.
- The vendored `image-size` adapter and its unused dependency were removed;
  current Metro handles asset dimensions itself. Mobile exports validate assets.
- Axios now supports normal typed imports without the old namespace casts.
  The mock-adapter cast remains: ts-jest's TypeScript 6 compiler still reports
  incompatible ESM/CommonJS Axios instance declarations with Axios 1.20.
