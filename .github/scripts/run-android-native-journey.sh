#!/usr/bin/env bash
# CI and local verification use the same service/fixture/device lifecycle.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
node "$ROOT/scripts/native-workflow.mjs" test --platform android --database-ready --app "$ROOT/mobile/.ci/android/stead-debug.apk"
