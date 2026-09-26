#!/usr/bin/env bash
# Build an iOS Simulator .app. Expects mobile/ios already from expo prebuild.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
DERIVED="${DERIVED_DATA_PATH:-${RUNNER_TEMP:-/tmp}/DerivedData}"
OUT_APP="${OUT_APP:-$MOBILE/.ci/ios/mobile.app}"

test -d "$MOBILE/ios"
cd "$MOBILE/ios"
pod install

mkdir -p "$DERIVED"
defaults write com.apple.dt.XCBuild IgnoreFileSystemDeviceInodeChanges -bool YES

xcodebuild \
  -workspace mobile.xcworkspace \
  -scheme mobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  ONLY_ACTIVE_ARCH=YES \
  IgnoreFileSystemDeviceInodeChanges=YES \
  build

APP_PATH="$DERIVED/Build/Products/Debug-iphonesimulator/mobile.app"
test -d "$APP_PATH"
mkdir -p "$(dirname "$OUT_APP")"
rm -rf "$OUT_APP"
ditto "$APP_PATH" "$OUT_APP"
echo "Built $OUT_APP"
