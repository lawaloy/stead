#!/usr/bin/env bash
# Prints how long Maestro's iOS XCTest driver took to start in each Maestro
# session of this job: from `xcodebuild test-without-building` launching the
# runner to the first successful /status check. Maestro 2.10 gives up after
# 120s by default ("iOS driver not ready in time"). Informational only.
#
# Usage: report-maestro-ios-driver-startup.sh <marker-file>
# Only sessions whose maestro.log is newer than <marker-file> are reported.
set -uo pipefail

marker="${1:?usage: report-maestro-ios-driver-startup.sh <marker-file>}"
tests_dir="${HOME}/.maestro/tests"

if [[ ! -e "$marker" || ! -d "$tests_dir" ]]; then
  echo "No Maestro sessions to report."
  exit 0
fi

logs="$(find "$tests_dir" -mindepth 2 -maxdepth 2 -name maestro.log -newer "$marker" 2>/dev/null | sort)"
if [[ -z "$logs" ]]; then
  echo "No Maestro sessions to report."
  exit 0
fi

echo "Maestro iOS driver startup (xcodebuild runner launch -> first successful status check):"
while IFS= read -r log; do
  session="$(basename "$(dirname "$log")")"
  awk -v session="$session" '
    function secs(t, a) { split(t, a, ":"); return a[1] * 3600 + a[2] * 60 + a[3] }
    /\[Start\] Running XcUITest with/ && start == "" { start = $1 }
    /UI Test runner already running/ && start == "" { reused = 1 }
    /\[Done\] Perform XCUITest driver status check/ && start != "" && ready == "" { ready = $1 }
    /iOS driver not ready in time/ { timedout = 1 }
    END {
      if (start == "") {
        if (reused) printf "  %s: reused an already running driver\n", session
        else printf "  %s: no driver start found\n", session
        exit
      }
      if (ready != "") {
        d = secs(ready) - secs(start); if (d < 0) d += 86400
        printf "  %s: runner launched %s, ready %s (%.1fs)\n", session, start, ready, d
      } else {
        printf "  %s: runner launched %s, never became ready%s\n", session, start, (timedout ? " (startup timeout)" : "")
      }
    }' "$log"
done <<< "$logs"