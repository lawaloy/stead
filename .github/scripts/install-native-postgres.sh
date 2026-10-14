#!/usr/bin/env bash
# Exact PostgreSQL source release for macOS CI; local Docker uses the same pin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
source "$ROOT/.github/ci.env"
PREFIX="${STEAD_POSTGRES_PREFIX:-$ROOT/.tmp/tools/postgres/$POSTGRES_VERSION}"

if [[ ! -x "$PREFIX/bin/postgres" ]]; then
  DOWNLOAD="$(mktemp -d)"
  trap 'rm -rf "$DOWNLOAD"' EXIT
  curl -fsSL --retry 3 "https://ftp.postgresql.org/pub/source/v$POSTGRES_VERSION/postgresql-$POSTGRES_VERSION.tar.bz2" -o "$DOWNLOAD/source.tar.bz2"
  printf '%s  %s\n' "$POSTGRES_SHA256" "$DOWNLOAD/source.tar.bz2" | shasum -a 256 -c -
  tar -xjf "$DOWNLOAD/source.tar.bz2" -C "$DOWNLOAD"
  cd "$DOWNLOAD/postgresql-$POSTGRES_VERSION"
  ./configure --prefix="$PREFIX" --without-readline --without-zlib --without-icu
  make -s -j2
  make -s install
fi
test "$("$PREFIX/bin/postgres" --version)" = "postgres (PostgreSQL) $POSTGRES_VERSION"
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$PREFIX/bin" >> "$GITHUB_PATH"
fi
echo "PostgreSQL $POSTGRES_VERSION: $PREFIX/bin"
