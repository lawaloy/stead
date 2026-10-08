# Dependency security policy

Stead applies compatible dependency updates automatically and blocks pull
requests and scheduled audits on unaddressed high-severity production
vulnerabilities. Overrides must pin a specific patched release and have a test
that keeps the package metadata and lockfile synchronized.

## Temporary upstream exceptions

An exception is permitted only when no patched release exists, the affected
code is not reachable from customer-controlled runtime input, and the exception
has a near-term expiry. The machine-readable allowlist is
`.github/dependency-audit-exceptions.json`; `.github/scripts/audit-npm.mjs`
accepts only the exact advisory, workspace, propagated package names, and date
recorded there. Every other finding at the configured severity still fails CI.

As of October 8, 2026, Expo 57's build toolchain has two temporary exceptions:

| Advisory                                                                 | Package            | Exposure in Stead                                                                                                                                                                                          | Expiry / removal condition                                                                              |
| ------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `braces` 3.0.3     | Used through Metro to match repository/build paths. Stead does not pass customer input to Metro or ship Metro in the native application bundle.                                                            | November 6, 2026; remove immediately when a patched `braces` release is available through Expo/Metro.   |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | `node-forge` 1.4.0 | Used by Expo CLI's code-signing tooling during development/builds. Stead does not use it for API authentication or runtime signature verification, and it is not shipped in the native application bundle. | November 6, 2026; remove immediately when the upstream node-forge fix is released and consumed by Expo. |

The 20 mobile entries reported by npm are propagation through Expo, Metro, and
React Native from these two source advisories; they are not 20 independent
defects. GitHub currently lists no patched release for either source advisory.
Do not run `npm audit fix --force`: its suggested Expo 44 / React Native 0.72
downgrades are incompatible with the supported Expo 57 stack and do not
constitute a safe remediation.

The API's Multer override is pinned to 2.4.0, the first release patched for
[GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34).
