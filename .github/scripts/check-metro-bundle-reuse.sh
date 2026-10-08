#!/usr/bin/env bash
# Fails the native journey job when Metro rebuilt the app's entry bundle after
# the CI prewarm.
#
# CI prewarms the dev bundle so the app's first launch is served from Metro's
# in-memory graph. Metro logs one "<Platform> Bundled <n>ms <entry>" line per
# entry bundle request: the first is the prewarm, later ones are the app's
# launches and should only re-serialize the cached graph (a few seconds at
# most). A slow later request means the app asked for different transform
# options than the prewarm (a different Metro graph), so Metro transformed every
# module again. On iOS that second build took up to ~128s and the app gave up
# with "Could not connect to development server".
#
# Usage: check-metro-bundle-reuse.sh <iOS|Android> [metro-log]
set -euo pipefail

platform="${1:?usage: check-metro-bundle-reuse.sh <iOS|Android> [metro-log]}"
log="${2:-${RUNNER_TEMP:-/tmp}/stead-metro.log}"
max_ms="${METRO_REUSE_MAX_MS:-10000}"

if [[ ! -s "$log" ]]; then
  echo "No Metro log at $log; nothing to check."
  exit 0
fi

lines="$(perl -pe 's/\e\[[0-9;]*[A-Za-z]//g' "$log" \
  | grep -E "${platform} Bundled [0-9]+ms .*expo-router/entry" || true)"

if [[ -z "$lines" ]]; then
  echo "::warning title=Metro bundle check::No ${platform} entry bundle builds found in $log."
  exit 0
fi

echo "Metro ${platform} entry bundle requests (first one is the CI prewarm):"
printf '%s\n' "$lines"

slow="$(printf '%s\n' "$lines" | tail -n +2 | awk -v max="$max_ms" '{
  for (i = 1; i <= NF; i++) {
    if ($i ~ /^[0-9]+ms$/) { ms = $i; sub(/ms$/, "", ms); if (ms + 0 > max) print; break }
  }
}')"

if [[ -n "$slow" ]]; then
  echo "::error title=Metro rebuilt the ${platform} bundle::The app's bundle request did not reuse the CI prewarm (a request after the prewarm took over ${max_ms}ms). The prewarm URL in .github/workflows/native-ci.yml no longer matches what the app requests; compare it with the app's bundle URL in the simulator/device log."
  printf '%s\n' "$slow"
  exit 1
fi

echo "OK: every ${platform} bundle request after the prewarm reused Metro's cached graph (<= ${max_ms}ms)."