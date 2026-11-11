#!/usr/bin/env bash
#
# edge-to-edge.sh — device pass (#160) row 6 on an Android emulator or device:
# opens each screen in maestro/flows/device-open-screen.yaml and runs
# check-insets.js on it, so no text or tappable view sits under the status or
# navigation bar. Run it on an Android 15+ (API 35+) image and on API 30.
#
# Prerequisites: the e2e emulators up and seeded (./scripts/test-prep.sh from the
# repo root) and the e2eEmulator APK installed on the device.
#
# Usage:
#   maestro/scripts/edge-to-edge.sh --device emulator-5554 [--no-seed] [screen ...]
#
# Env: E2E_TEST_PASSWORD (required), E2E_STRIPE_ACCOUNT_ID (for the seed's
#      connected house; see maestro/README.md).
set -uo pipefail

cd "$(dirname "$0")/../.."
APP_ID=com.regroup.app.e2e.emu
DEVICE=""
SEED=1
SCREENS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --no-seed) SEED=0; shift ;;
    -h|--help) sed -n 2,15p "$0"; exit 0 ;;
    *) SCREENS+=("$1"); shift ;;
  esac
done
: "${E2E_TEST_PASSWORD:?Set E2E_TEST_PASSWORD (see e2e/SECURITY-test-credentials.md)}"
[[ -n "$DEVICE" ]] || { echo "✗ --device <adb serial> is required" >&2; exit 2; }
if [[ ${#SCREENS[@]} -eq 0 ]]; then
  SCREENS=(landing guest-home activities dispute-modal profile my-profile chat stat-summary
    rent-payment manager-house house-settings payment-dashboard)
fi

node maestro/scripts/e2e-build-guard.js --platform android --app-id "$APP_ID" --device "$DEVICE" || exit 2
if [[ $SEED -eq 1 ]]; then
  ./maestro/scripts/reset-and-seed.sh >/dev/null || { echo "✗ seed failed" >&2; exit 2; }
fi

sdk=$(adb -s "$DEVICE" shell getprop ro.build.version.sdk | tr -d '\r')
echo "▶ edge-to-edge on $DEVICE (API $sdk)"
failed=()
for s in "${SCREENS[@]}"; do
  if ! maestro --device "$DEVICE" test -e APP_ID="$APP_ID" -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" \
      -e SCREEN="$s" maestro/flows/device-open-screen.yaml >/dev/null 2>&1; then
    echo "  ✗ $s: could not open the screen"
    failed+=("$s")
    continue
  fi
  if node maestro/scripts/check-insets.js --device "$DEVICE" --app-id "$APP_ID" --label "$s"; then
    echo "  ✓ $s"
  else
    failed+=("$s")
  fi
done
echo
if [[ ${#failed[@]} -eq 0 ]]; then
  echo "✅ edge-to-edge: ${#SCREENS[@]} screens clear of the system bars (API $sdk)"
else
  echo "✗ edge-to-edge (API $sdk): ${failed[*]}"
  exit 1
fi
