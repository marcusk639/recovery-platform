#!/usr/bin/env bash
#
# rent-reminder.sh — device pass (#160) row 3, the rent reminder, on an Android
# emulator (react-native-notify-kit trigger notification, services/notifications/
# rentReminder.ts). The reminder has no screen: GuestHome schedules it for a
# resident who owes rent and cancels it when they owe nothing.
#   1. guest-a (owes rent) opens home: one AlarmManager alarm for the app's
#      notify-kit receiver, at the coming Friday 09:00.
#   2. With the emulator clock moved past that Friday's delivery window, it
#      fires: a "Rent Reminder" notification on channel default-channel-id.
#      Needs a rootable emulator image (google_apis); skipped otherwise. The
#      clock goes back to automatic time afterwards.
#   3. guest-a's balance set to 0 in the Firestore emulator, home reopened: the
#      alarm is gone.
# iOS has no shell view of pending notifications; the unit tests cover it.
#
# Prerequisites: the e2e emulators up and seeded (./scripts/test-prep.sh from the
# repo root) and the e2eEmulator APK installed on the device.
#
# Usage: maestro/scripts/rent-reminder.sh --device emulator-5554
# Env:   E2E_TEST_PASSWORD (required), E2E_STRIPE_ACCOUNT_ID (for the seed).
set -uo pipefail

cd "$(dirname "$0")/../.."
APP_ID=com.regroup.app.e2e.emu
RECEIVER="$APP_ID/app.notifee.core.NotificationAlarmReceiver"
FIRESTORE='http://127.0.0.1:8080/v1/projects/demo-regroup-e2e/databases/(default)/documents'
DEVICE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    -h|--help) sed -n 2,24p "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
: "${E2E_TEST_PASSWORD:?Set E2E_TEST_PASSWORD (see e2e/SECURITY-test-credentials.md)}"
[[ -n "$DEVICE" ]] || { echo "✗ --device <adb serial> is required" >&2; exit 2; }
node maestro/scripts/e2e-build-guard.js --platform android --app-id "$APP_ID" --device "$DEVICE" || exit 2

open_screen() {
  maestro --device "$DEVICE" test -e APP_ID="$APP_ID" -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" \
    -e SCREEN="$1" maestro/flows/device-open-screen.yaml >/dev/null 2>&1
}
reminder_alarms() {
  adb -s "$DEVICE" shell dumpsys alarm | grep -A2 "tag=\*walarm\*:$RECEIVER" | grep -c 'origWhen='
}
fail=0
check() { if [[ $1 -eq 0 ]]; then echo "  ✓ $2"; else echo "  ✗ $2"; fail=1; fi; }

./maestro/scripts/reset-and-seed.sh >/dev/null || { echo "✗ seed failed" >&2; exit 2; }
echo "▶ rent reminder on $DEVICE"

# 1. Scheduled for the coming Friday 09:00.
open_screen guest-home || { echo "✗ could not open guest-a's home"; exit 1; }
sleep 3
when=$(adb -s "$DEVICE" shell dumpsys alarm | grep -A2 "tag=\*walarm\*:$RECEIVER" | grep -o 'origWhen=[0-9-]* [0-9:]*' | head -1 | cut -d= -f2)
dow=$( [[ -n "$when" ]] && date -j -f '%Y-%m-%d %H:%M:%S' "$when" '+%a %H:%M' 2>/dev/null )
[[ "$dow" == "Fri 09:00" ]]
check $? "scheduled for Friday 09:00 (${when:-none})"

# 2. Fires once its window has passed.
if [[ -n "$when" ]] && adb -s "$DEVICE" root >/dev/null 2>&1; then
  sleep 3
  adb -s "$DEVICE" wait-for-device
  later=$(date -j -v+1H -v+5M -f '%Y-%m-%d %H:%M:%S' "$when" '+%m%d%H%M%Y.%S')
  adb -s "$DEVICE" shell settings put global auto_time 0
  adb -s "$DEVICE" shell date "$later" >/dev/null
  posted=1
  for _ in $(seq 1 15); do
    sleep 2
    n=$(adb -s "$DEVICE" shell dumpsys notification --noredact | grep -A40 "pkg=$APP_ID")
    if grep -q 'channel=default-channel-id' <<<"$n" && grep -q 'android.title=.*Rent Reminder' <<<"$n"; then
      posted=0
      break
    fi
  done
  adb -s "$DEVICE" shell date "$(date '+%m%d%H%M%Y.%S')" >/dev/null
  adb -s "$DEVICE" shell settings put global auto_time 1
  check $posted "fires as \"Rent Reminder\" on default-channel-id"
  adb -s "$DEVICE" shell cmd notification cancel_all "$APP_ID" >/dev/null 2>&1 || true
else
  echo "  - firing not checked (no alarm, or the image isn't rootable)"
fi

# 3. Cancelled once nothing is owed. The fired alarm is gone, so schedule again
#    first, then zero the balance and reopen home.
open_screen guest-home-again || { echo "✗ could not reopen guest-a's home"; exit 1; }
sleep 3
[[ $(reminder_alarms) -ge 1 ]]
check $? "rescheduled on reopening home"
curl -sf -X PATCH -H 'Authorization: Bearer owner' -H 'Content-Type: application/json' \
  "$FIRESTORE/guests/guest-a?updateMask.fieldPaths=rentOwed" \
  -d '{"fields":{"rentOwed":{"integerValue":"0"}}}' >/dev/null || { echo "✗ could not zero guest-a's balance"; exit 1; }
open_screen guest-home-again || { echo "✗ could not reopen guest-a's home"; exit 1; }
sleep 3
[[ $(reminder_alarms) -eq 0 ]]
check $? "cancelled when nothing is owed"

./maestro/scripts/reset-and-seed.sh >/dev/null
echo
if [[ $fail -eq 0 ]]; then echo "✅ rent reminder"; else echo "✗ rent reminder"; exit 1; fi
