#!/usr/bin/env bash
# The same pinned, checksum-verified installer works locally and in CI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$ROOT/scripts/install-maestro.mjs" --directory "${MAESTRO_HOME:-$HOME/.maestro}"
