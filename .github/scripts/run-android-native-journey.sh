#!/usr/bin/env bash
set -euo pipefail

adb reverse tcp:8081 tcp:8081
adb reverse tcp:3000 tcp:3000
adb install -r .ci/android/stead-debug.apk

for attempt in $(seq 1 180); do
  if test -s "${RUNNER_TEMP}/stead-android.bundle"; then
    break
  fi
  sleep 1
done

if ! test -s "${RUNNER_TEMP}/stead-android.bundle"; then
  cat "${RUNNER_TEMP}/stead-metro-prewarm.log" || true
  exit 1
fi

maestro test -e TEST_PHONE=08030000001 .maestro/critical-native-journey.yaml
