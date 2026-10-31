# Dependency security policy

<details open>
<summary><strong>Show or hide document contents</strong></summary>

Stead applies compatible dependency updates automatically and blocks pull
requests and scheduled audits on unaddressed high-severity production
vulnerabilities. Overrides must pin a specific patched release and have a test
that keeps the package metadata and lockfile synchronized.

Full-tree moderate-or-higher audits are reports rather than release gates. The
audit wrapper's explicit `--report-only` mode still fails on registry,
execution, and malformed-report errors; it only converts successfully parsed
dependency findings into a successful reporting step. Workflows must not use
`continue-on-error` for audit commands.

## Temporary upstream exceptions

An exception is permitted only when no patched release exists, the affected
code is not reachable from customer-controlled runtime input, and the exception
has a near-term expiry. The machine-readable allowlist is
`.github/dependency-audit-exceptions.json`; `.github/scripts/audit-npm.mjs`
accepts only the exact advisory, workspace, propagated package names, and date
recorded there. Every other finding at the configured severity still fails CI.

As of October 31, 2026, Expo 57's build toolchain has one temporary exception:

| Advisory                                                                 | Package        | Exposure in Stead                                                                                                                               | Expiry / removal condition                                                                            |
| ------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` 3.0.3 | Used through Metro to match repository/build paths. Stead does not pass customer input to Metro or ship Metro in the native application bundle. | November 6, 2026; remove immediately when a patched `braces` release is available through Expo/Metro. |

The mobile entries reported by npm are propagation through Expo, Metro, React
Native, and packages that peer on Expo from this source advisory; the count
reflects dependency paths rather than independent defects. GitHub currently
lists no patched release for this source advisory.

Do not run `npm audit fix --force`: its suggested Expo 44 / React Native 0.72
downgrades are incompatible with the supported Expo 57 stack and do not
constitute a safe remediation.

The API's Multer override is pinned to 2.5.0, which includes the fixes for
[GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) and
[GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m).

Mobile pins Expo CLI's compatible Zod alternative to 4.6.7, the first release
patched for
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Expo CLI accepts Zod 4, but npm otherwise selected the vulnerable Zod 3 branch.

Mobile overrides `js-yaml` to 4.3.2 for `@istanbuljs/load-nyc-config` only (test
tooling via `babel-plugin-istanbul`). Its `js-yaml` 3 range pulled in `argparse` 1 and
`sprintf-js`, which has no release patched for
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c);
the package only calls `load()`, which `js-yaml` 4 keeps.

</details>
