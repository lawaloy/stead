#!/usr/bin/env bash
# Reports touches the iOS simulator dropped during this job's Maestro journey.
#
# On iOS 26 simulators backboardd sometimes registers XCTest's per-tap virtual
# digitizer twice, drops the lift-off and cancels the touch, so the app never
# sees a completed tap. These are the backboardd lines for that, from the
# device-simulator.log files Maestro writes for each session.
# Usage: report-ios-dropped-touches.sh <marker created before the journey>
set -euo pipefail

marker="${1:?usage: report-ios-dropped-touches.sh <marker-file>}"
tests_dir="${HOME}/.maestro/tests"
pattern="unknown senderID|unknown digitizer|didn't see a previous touch down|canceling paths"

if [[ ! -f "$marker" ]]; then
  echo "No journey marker at $marker; the iOS journey did not start."
  exit 0
fi

# ~/.maestro is cached between jobs, so only read logs written after the marker.
logs=()
while IFS= read -r -d '' log; do
  logs+=("$log")
done < <(find "$tests_dir" -type f -name device-simulator.log -newer "$marker" -print0 2>/dev/null)

if [[ ${#logs[@]} -eq 0 ]]; then
  echo "::notice title=iOS dropped touches::No Maestro device-simulator.log from this job."
  exit 0
fi

matches="$(mktemp)"
total=0
cancelled=0
for log in "${logs[@]}"; do
  grep -E "$pattern" "$log" > "$matches" || true
  count="$(wc -l < "$matches" | tr -d ' ')"
  log_cancelled="$(grep -c 'canceling paths' "$matches" || true)"
  echo "$log: $count matching line(s), $log_cancelled cancelled touch(es)"
  if [[ "$count" -gt 0 ]]; then
    cut -c1-300 "$matches"
  fi
  total=$((total + count))
  cancelled=$((cancelled + log_cancelled))
done
rm -f "$matches"

echo "Dropped-touch lines: $total; cancelled touches: $cancelled"
if [[ "$total" -gt 0 ]]; then
  echo "::warning title=iOS simulator dropped touch::$total backboardd dropped-touch line(s), $cancelled cancelled touch(es). See this step's log."
fi
