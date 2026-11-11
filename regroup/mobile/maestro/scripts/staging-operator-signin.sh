#!/usr/bin/env bash
#
# staging-operator-signin.sh: make a new subscribed operator on staging
# (regroup-e2e) and check that it signs in on the E2EStaging build and lands on
# OrgSetup with no plan-required panel.
#
# Usage (from regroup/mobile):
#   maestro/scripts/staging-operator-signin.sh --sim <udid> [-- <e2e:staging-operator args>]
#   maestro/scripts/staging-operator-signin.sh --sim "$UDID" -- --house-type oxford --tier plus
#
# The operator args default to --house-type traditional --tier starter.
# Prerequisites: the E2EStaging build installed on that simulator (see
# maestro/README.md), regroup/e2e's npm deps, and ~/.config/regroup-e2e set up for
# `npm run e2e:staging-operator`. Each run makes a new staging account, and
# staging emails admin@regroup-app.com about it.
set -euo pipefail

APP_ID=com.rats.dev.e2e.stg
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
E2E_DIR="$(cd "${MOBILE_DIR}/../e2e" && pwd)"
SIM_UDID=""
OPERATOR_ARGS=(--house-type traditional --tier starter)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sim)
      [[ $# -ge 2 ]] || { echo "Error: --sim requires a UDID" >&2; exit 2; }
      SIM_UDID="$2"; shift 2 ;;
    --) shift; [[ $# -gt 0 ]] && OPERATOR_ARGS=("$@"); break ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Error: unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -n "${SIM_UDID}" ]] || { echo "Error: --sim <udid> is required" >&2; exit 2; }

xcrun simctl listapps "${SIM_UDID}" 2>/dev/null | grep -q "${APP_ID}" || {
  echo "Error: ${APP_ID} is not installed on ${SIM_UDID}. Build and install E2EStaging first (maestro/README.md)." >&2
  exit 1
}
node "${SCRIPT_DIR}/e2e-build-guard.js" --platform ios --app-id "${APP_ID}" --device "${SIM_UDID}"

OUT="$(mktemp)"
trap 'rm -f "${OUT}"' EXIT
npm --prefix "${E2E_DIR}" run -s e2e:staging-operator -- "${OPERATOR_ARGS[@]}" | tee "${OUT}"
EMAIL="$(node "${SCRIPT_DIR}/staging-credentials.js" email < "${OUT}")"
PASSWORD="$(node "${SCRIPT_DIR}/staging-credentials.js" password < "${OUT}")"

# iOS keeps the Firebase session across clearState; start signed out.
xcrun simctl keychain "${SIM_UDID}" reset >/dev/null 2>&1 || true
cd "${MOBILE_DIR}"
maestro --device "${SIM_UDID}" test -e APP_ID="${APP_ID}" -e EMAIL="${EMAIL}" -e PASSWORD="${PASSWORD}" \
  maestro/staging/operator-signin.yaml
