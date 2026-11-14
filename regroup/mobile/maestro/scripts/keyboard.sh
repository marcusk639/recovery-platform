#!/usr/bin/env bash
#
# keyboard.sh — device pass (#160) row 5, keyboard: for each field in
# maestro/flows/device-keyboard-field.yaml, focus it and type, then check with
# check-keyboard.js that the keyboard (and the iOS toolbar) leaves it in view.
#
# Prerequisites: the e2e emulators up and seeded (./scripts/test-prep.sh from the
# repo root) and the e2e build installed on the device.
#
# Usage:
#   maestro/scripts/keyboard.sh --platform ios --device <simulator udid> [--no-seed] [field ...]
#   maestro/scripts/keyboard.sh --platform android --device <adb serial> [--no-seed] [field ...]
#
# Env: E2E_TEST_PASSWORD (required), E2E_STRIPE_ACCOUNT_ID (for the seed's
#      connected house; see maestro/README.md).
set -uo pipefail

cd "$(dirname "$0")/../.."
PLATFORM=""
DEVICE=""
SEED=1
FIELDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --device) DEVICE="$2"; shift 2 ;;
    --no-seed) SEED=0; shift ;;
    -h|--help) sed -n 2,15p "$0"; exit 0 ;;
    *) FIELDS+=("$1"); shift ;;
  esac
done
: "${E2E_TEST_PASSWORD:?Set E2E_TEST_PASSWORD (see e2e/SECURITY-test-credentials.md)}"
case "$PLATFORM" in
  ios) APP_ID=com.rats.dev.e2e.emu ;;
  android) APP_ID=com.regroup.app.e2e.emu ;;
  *) echo "✗ --platform ios|android is required" >&2; exit 2 ;;
esac
[[ -n "$DEVICE" ]] || { echo "✗ --device is required" >&2; exit 2; }
if [[ ${#FIELDS[@]} -eq 0 ]]; then
  FIELDS=(signup-last-name dispute-reason chat-composer payment-amount profile-phone staff-note
    intake-phone manual-payment-amount discharge-notes)
fi

# The field each FIELD leaves the keyboard open on: a testID, or the typed text.
target_args() {
  case "$1" in
    signup-last-name) echo --target-id signup-last-name-input ;;
    dispute-reason) echo --target-text '.*E2E.reason.*' ;;
    chat-composer) echo --target-id chat-composer ;;
    payment-amount) echo --target-id payment-amount-input ;;
    profile-phone) echo --target-id phone-input ;;
    staff-note) echo --target-id staff-note-input ;;
    intake-phone) echo --target-id intake-phone-input ;;
    manual-payment-amount) echo --target-text '33\.33' ;;
    discharge-notes) echo --target-text 'E2E.note' ;;
    *) echo "unknown field $1" >&2; return 1 ;;
  esac
}

node maestro/scripts/e2e-build-guard.js --platform "$PLATFORM" --app-id "$APP_ID" --device "$DEVICE" || exit 2
if [[ $SEED -eq 1 ]]; then
  ./maestro/scripts/reset-and-seed.sh >/dev/null || { echo "✗ seed failed" >&2; exit 2; }
fi

echo "▶ keyboard on $PLATFORM $DEVICE"
failed=()
for f in "${FIELDS[@]}"; do
  # The iOS Keychain keeps the Firebase session across clearState.
  [[ $PLATFORM == ios ]] && xcrun simctl keychain "$DEVICE" reset >/dev/null 2>&1
  if ! maestro --device "$DEVICE" test -e APP_ID="$APP_ID" -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" \
      -e FIELD="$f" maestro/flows/device-keyboard-field.yaml >/dev/null 2>&1; then
    echo "  ✗ $f: could not open the field"
    failed+=("$f")
    continue
  fi
  read -r -a target <<<"$(target_args "$f")" || { failed+=("$f"); continue; }
  if node maestro/scripts/check-keyboard.js --platform "$PLATFORM" --device "$DEVICE" "${target[@]}" --label "$f"; then
    echo "  ✓ $f"
  else
    failed+=("$f")
  fi
done
echo
if [[ ${#failed[@]} -eq 0 ]]; then
  echo "✅ keyboard: ${#FIELDS[@]} fields stay above the keyboard ($PLATFORM)"
else
  echo "✗ keyboard ($PLATFORM): ${failed[*]}"
  exit 1
fi
