#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/.github/ci.env"
INSTALL="$ROOT/.tmp/tools/applesimutils/$APPLESIMUTILS_VERSION"
mkdir -p "$INSTALL"
if [[ ! -x "$INSTALL/applesimutils" ]]; then
  ARCHIVE="$INSTALL/applesimutils.tar.gz"
  curl --fail --location --max-time 60 \
    "https://github.com/wix/AppleSimulatorUtils/releases/download/$APPLESIMUTILS_VERSION/applesimutils-$APPLESIMUTILS_VERSION.big_sur.bottle.tar.gz" \
    --output "$ARCHIVE"
  printf '%s  %s\n' "$APPLESIMUTILS_SHA256" "$ARCHIVE" | shasum -a 256 --check
  tar -xzf "$ARCHIVE" -C "$INSTALL" --strip-components=3 "applesimutils/$APPLESIMUTILS_VERSION/bin/applesimutils"
  rm "$ARCHIVE"
fi
test "$("$INSTALL/applesimutils" --version)" = "applesimutils version $APPLESIMUTILS_VERSION"
echo "AppleSimUtils $APPLESIMUTILS_VERSION ready."
