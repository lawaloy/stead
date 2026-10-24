#!/usr/bin/env bash
# Build an iOS Simulator .app. Expects mobile/ios already from expo prebuild.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
DERIVED="${DERIVED_DATA_PATH:-${RUNNER_TEMP:-/tmp}/DerivedData}"
OUT_APP="${OUT_APP:-$MOBILE/.ci/ios/mobile.app}"

test -d "$MOBILE/ios"
cd "$MOBILE/ios"
export BUNDLE_GEMFILE="$MOBILE/Gemfile"
export BUNDLE_FROZEN=true
bundle exec pod install

mkdir -p "$DERIVED"
defaults write com.apple.dt.XCBuild IgnoreFileSystemDeviceInodeChanges -bool YES

# The simulator still enforces keychain entitlements. An unsigned app makes
# SecureStore fail with -34018 and silently leaves sessions process-local.
# Use an ad-hoc simulator identity and a bundle-scoped keychain access group.
SIMULATOR_BUNDLE_ID="$(node -p "JSON.parse(require('node:fs').readFileSync('../app.json', 'utf8')).expo.ios.bundleIdentifier")"
SIMULATOR_ENTITLEMENTS="$DERIVED/SteadSimulator.entitlements"
/usr/libexec/PlistBuddy -c 'Clear dict' "$SIMULATOR_ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :application-identifier string $SIMULATOR_BUNDLE_ID" "$SIMULATOR_ENTITLEMENTS"
/usr/libexec/PlistBuddy -c 'Add :keychain-access-groups array' "$SIMULATOR_ENTITLEMENTS"
/usr/libexec/PlistBuddy -c "Add :keychain-access-groups:0 string $SIMULATOR_BUNDLE_ID" "$SIMULATOR_ENTITLEMENTS"

xcodebuild \
  -workspace mobile.xcworkspace \
  -scheme mobile \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGN_ENTITLEMENTS="$SIMULATOR_ENTITLEMENTS" \
  COMPILER_INDEX_STORE_ENABLE=NO \
  ONLY_ACTIVE_ARCH=YES \
  IgnoreFileSystemDeviceInodeChanges=YES \
  build

APP_PATH="$DERIVED/Build/Products/Release-iphonesimulator/mobile.app"
test -d "$APP_PATH"
# The journey runner must not need Metro. Keeping the JavaScript bundle inside
# the simulator app materially reduces memory pressure on the small hosted Mac.
test -s "$APP_PATH/main.jsbundle"
codesign --verify "$APP_PATH"
# Simulator entitlements live in the Mach-O __TEXT section, separate from
# the macOS ad-hoc signature. Check every architecture in the published app.
SIMULATOR_ARCHS="$(xcrun lipo -archs "$APP_PATH/mobile")"
for SIMULATOR_ARCH in $SIMULATOR_ARCHS; do
  SIMULATOR_BINARY="$APP_PATH/mobile"
  if [[ "$SIMULATOR_ARCHS" != "$SIMULATOR_ARCH" ]]; then
    SIMULATOR_BINARY="$DERIVED/SteadSimulator.$SIMULATOR_ARCH.binary"
    xcrun lipo "$APP_PATH/mobile" -thin "$SIMULATOR_ARCH" -output "$SIMULATOR_BINARY"
  fi
  LOAD_COMMANDS="$DERIVED/SteadSimulator.$SIMULATOR_ARCH.load-commands.txt"
  EMBEDDED_ENTITLEMENTS="$DERIVED/SteadSimulator.$SIMULATOR_ARCH.entitlements.plist"
  xcrun otool -l "$SIMULATOR_BINARY" > "$LOAD_COMMANDS"
  node "$ROOT/scripts/ios-simulator-entitlements.mjs" "$SIMULATOR_BINARY" "$LOAD_COMMANDS" "$EMBEDDED_ENTITLEMENTS"
  test "$(plutil -extract application-identifier raw -o - "$EMBEDDED_ENTITLEMENTS")" = "$SIMULATOR_BUNDLE_ID"
  test "$(plutil -extract keychain-access-groups.0 raw -o - "$EMBEDDED_ENTITLEMENTS")" = "$SIMULATOR_BUNDLE_ID"
done
mkdir -p "$(dirname "$OUT_APP")"
rm -rf "$OUT_APP"
ditto "$APP_PATH" "$OUT_APP"
echo "Built $OUT_APP"
