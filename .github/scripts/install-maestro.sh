#!/usr/bin/env bash
# Ensure Maestro is on PATH; skip download when ~/.maestro/bin/maestro exists.
set -euo pipefail

export PATH="${HOME}/.maestro/bin:${PATH}"

if [[ ! -x "${HOME}/.maestro/bin/maestro" ]]; then
  curl -fsSL https://get.maestro.mobile.dev | bash
fi

echo "${HOME}/.maestro/bin" >> "${GITHUB_PATH:?}"
maestro --version
