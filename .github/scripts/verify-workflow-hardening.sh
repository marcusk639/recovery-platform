#!/usr/bin/env bash
# Asserts the CI hardening properties for e2e-fix/* agent branches.
# Needs node (the `yaml` package is installed to a temp dir). Runs actionlint if installed.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
here="$(cd "$(dirname "$0")" && pwd)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npm install --silent --no-audit --no-fund --prefix "$tmp" yaml >/dev/null

status=0
NODE_PATH="$tmp/node_modules" node "$here/verify-workflow-hardening.js" "$root/.github/workflows" || status=$?

if command -v actionlint >/dev/null 2>&1; then
  actionlint "$root"/.github/workflows/*.yml || status=$?
else
  echo "actionlint not installed; skipping"
fi

exit "$status"
