#!/usr/bin/env bash
# The one command that runs browser journeys: rebuilds the server code and the
# bundle, starts the portal's emulators on their own ports, runs Playwright, stops.
#   scripts/e2e.sh [--production] [playwright args...]
set -euo pipefail
PORTAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGROUP_DIR="$(cd "${PORTAL_DIR}/.." && pwd)"

BUILD_ARGS=()
if [ "${1:-}" = "--production" ]; then
  BUILD_ARGS+=(--production)
  shift
fi

# The seed creates the accounts with this password, on demo- emulators only, so
# any value works and a fresh one means nothing to store or leak.
export E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:-$(openssl rand -hex 16)}"

# A stale lib/ would test old server code.
npm --prefix "${REGROUP_DIR}/functions" ci --silent
npm --prefix "${REGROUP_DIR}/functions" run --silent build

cd "${PORTAL_DIR}"
npx playwright install chromium >/dev/null
node build/bundle.mjs ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}

ARGS=""
for arg in "$@"; do ARGS+=" $(printf '%q' "$arg")"; done
cd "${REGROUP_DIR}"
firebase emulators:exec --config firebase.portal.json --project demo-regroup-e2e \
  --only auth,firestore,storage,functions \
  "cd portal && npx playwright test${ARGS}"
