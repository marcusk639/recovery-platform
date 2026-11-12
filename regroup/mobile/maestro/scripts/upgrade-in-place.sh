#!/usr/bin/env bash
# Upgrade in place on the iOS simulator: sign in on the old build, install the new
# build over it (same bundle id keeps the app's data), relaunch without clearing
# state, and require the session to survive.
#
#   maestro/scripts/upgrade-in-place.sh --old <old rats.app> --new <new rats.app> [--sim <udid>]
#
# Both builds must be E2EEmulator (.e2e.emu); the guard refuses anything else.
# Needs the Firebase emulators up and seeded (./scripts/test-prep.sh) and
# E2E_TEST_PASSWORD. Android is not covered: the RN 0.72 Android e2e build can't
# sign in (decision record §7.2), so there is no old session to carry.
set -euo pipefail
cd "$(dirname "$0")/../.."
OLD="" NEW="" SIM="${SIM_UDID:-booted}" APP_ID=com.rats.dev.e2e.emu
while [[ $# -gt 0 ]]; do
  case "$1" in
    --old) OLD="$2"; shift 2 ;;
    --new) NEW="$2"; shift 2 ;;
    --sim) SIM="$2"; shift 2 ;;
    *) echo "unknown argument $1" >&2; exit 2 ;;
  esac
done
[[ -d "$OLD" && -d "$NEW" ]] || { echo "usage: $0 --old <rats.app> --new <rats.app> [--sim <udid>]" >&2; exit 2; }
: "${E2E_TEST_PASSWORD:?set E2E_TEST_PASSWORD}"

xcrun simctl uninstall "$SIM" "$APP_ID" >/dev/null 2>&1 || true
xcrun simctl install "$SIM" "$OLD"
node maestro/scripts/e2e-build-guard.js --platform ios --app-id "$APP_ID" --device "$SIM"
./maestro/scripts/reset-and-seed.sh >/dev/null
maestro --device "$SIM" test -e APP_ID="$APP_ID" -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/upgrade/sign-in.yaml

xcrun simctl terminate "$SIM" "$APP_ID" >/dev/null 2>&1 || true
xcrun simctl install "$SIM" "$NEW"   # over the old build: data container kept
node maestro/scripts/e2e-build-guard.js --platform ios --app-id "$APP_ID" --device "$SIM"
maestro --device "$SIM" test -e APP_ID="$APP_ID" -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/upgrade/still-signed-in.yaml
echo "upgrade-in-place: PASS (session survived $OLD -> $NEW)"
