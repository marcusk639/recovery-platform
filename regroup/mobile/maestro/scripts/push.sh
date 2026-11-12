#!/usr/bin/env bash
#
# push.sh: device pass (#160) row 3, pushes.
#
# Android (--device <adb serial>): real FCM on the E2EStaging build
# (com.regroup.app.e2e.stg, Firebase project regroup-e2e). Makes a new staging
# operator (or reuses PUSH_EMAIL / PUSH_PASSWORD), signs it in, waits for the app
# to store its FCM token, then sends with the server's message shapes
# (push-fcm.js) and reads what Android posted (check-notifications.js):
#   1. resident push, app in the foreground: shown, on channel `default`;
#   2. data-only push, app in the foreground: the app keeps running, no crash;
#   3. admin push, app in the background: shown, on channel `default`;
#   4. resident push, app in the background: shown, on channel `default`.
# Also reported, not required: an admin push in the foreground (the app shows
# only notifee payloads itself; see services/notifications/remoteMessage.ts).
#
# iOS (--sim <udid>): no FCM. `xcrun simctl push` hands APNs payloads to the
# E2EEmulator build (com.rats.dev.e2e.emu) signed in as guest-a, with the
# emulators up and seeded, as the other device-pass suites:
#   1. resident push (alert + notifee) in the foreground: banner shown;
#   2. admin push (alert) in the foreground: banner shown;
#   3. data-only push in the foreground: the app keeps running;
#   4. resident push with the app in the background: banner shown.
# This proves the app's handling under RN 0.88, not APNs or FCM delivery.
#
# Usage (from regroup/mobile):
#   maestro/scripts/push.sh --device emulator-5554 [-- <e2e:staging-operator args>]
#   maestro/scripts/push.sh --sim "$SIM_UDID"
# A new operator per Android run emails admin@regroup-app.com, as
# staging-operator-signin.sh does; set PUSH_EMAIL and PUSH_PASSWORD to reuse one.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
E2E_DIR="$(cd "${MOBILE_DIR}/../e2e" && pwd)"
DEVICE=""
SIM=""
OPERATOR_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --sim) SIM="$2"; shift 2 ;;
    --) shift; OPERATOR_ARGS=("$@"); break ;;
    *) echo "✗ unknown argument $1" >&2; exit 2 ;;
  esac
done
if [[ -n "${DEVICE}" && -n "${SIM}" || -z "${DEVICE}" && -z "${SIM}" ]]; then
  echo "✗ pass exactly one of --device <adb serial> or --sim <udid>" >&2
  exit 2
fi

RUN="$(date +%s)"
FAILED=0
pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAILED=1; }
info() { echo "  - $1"; }
cd "${MOBILE_DIR}"

if [[ -n "${DEVICE}" ]]; then
  APP_ID=com.regroup.app.e2e.stg
  node "${SCRIPT_DIR}/e2e-build-guard.js" --platform android --app-id "${APP_ID}" --device "${DEVICE}"
  if [[ -n "${PUSH_EMAIL:-}" && -n "${PUSH_PASSWORD:-}" ]]; then
    EMAIL="${PUSH_EMAIL}"; PASSWORD="${PUSH_PASSWORD}"
  else
    OUT="$(mktemp)"
    trap 'rm -f "${OUT}"' EXIT
    [[ ${#OPERATOR_ARGS[@]} -gt 0 ]] || OPERATOR_ARGS=(--house-type traditional --tier starter)
    npm --prefix "${E2E_DIR}" run -s e2e:staging-operator -- "${OPERATOR_ARGS[@]}" | tee "${OUT}"
    EMAIL="$(node "${SCRIPT_DIR}/staging-credentials.js" email < "${OUT}")"
    PASSWORD="$(node "${SCRIPT_DIR}/staging-credentials.js" password < "${OUT}")"
  fi
  maestro --device "${DEVICE}" test -e APP_ID="${APP_ID}" -e EMAIL="${EMAIL}" -e PASSWORD="${PASSWORD}" \
    maestro/staging/operator-signin.yaml
  node "${SCRIPT_DIR}/push-fcm.js" wait-token "${EMAIL}" 90

  adb_() { adb -s "${DEVICE}" "$@"; }
  # Waits up to 30s for a notification titled $1; prints its channel.
  posted() {

    for _ in $(seq 1 15); do
      if adb_ shell dumpsys notification --noredact | node "${SCRIPT_DIR}/check-notifications.js" "${APP_ID}" "$1"; then
        return 0
      fi
      sleep 2
    done
    return 1
  }
  send() { node "${SCRIPT_DIR}/push-fcm.js" send "${EMAIL}" "$1" "$2" >/dev/null; }

  echo "Pushes on ${DEVICE} (${APP_ID}):"
  adb_ logcat -c
  PID="$(adb_ shell pidof "${APP_ID}" || true)"
  [[ -n "${PID}" ]] || { echo "✗ ${APP_ID} isn't running after sign-in" >&2; exit 1; }

  m="push-e2e-resident-fg-${RUN}"; send resident "$m"
  if ch="$(posted "$m")"; then
    [[ "$ch" == default ]] && pass "resident push, foreground: shown on default" ||
      fail "resident push, foreground: shown on ${ch}, not default"
  else
    fail "resident push, foreground: not shown"
  fi

  m="push-e2e-data-${RUN}"; send data "$m"
  sleep 8
  if [[ "$(adb_ shell pidof "${APP_ID}" || true)" == "${PID}" ]] &&
    ! adb_ logcat -d -b crash | grep -q "${APP_ID}"; then
    pass "data-only push, foreground: app still running, no crash"
  else
    fail "data-only push, foreground: the app restarted or crashed (adb logcat -b crash)"
  fi

  m="push-e2e-admin-fg-${RUN}"; send admin "$m"
  if ch="$(posted "$m")"; then info "admin push, foreground: shown on ${ch}"; else
    info "admin push, foreground: not shown (the app shows only notifee payloads)"; fi

  adb_ shell input keyevent KEYCODE_HOME
  sleep 3
  m="push-e2e-admin-bg-${RUN}"; send admin "$m"
  if ch="$(posted "$m")"; then
    [[ "$ch" == default ]] && pass "admin push, background: shown on default" ||
      fail "admin push, background: shown on ${ch}, not default"
  else
    fail "admin push, background: not shown"
  fi

  m="push-e2e-resident-bg-${RUN}"; send resident "$m"
  if ch="$(posted "$m")"; then
    [[ "$ch" == default ]] && pass "resident push, background: shown on default" ||
      fail "resident push, background: shown on ${ch}, not default"
  else
    fail "resident push, background: not shown"
  fi

  adb_ shell cmd notification cancel_all "${APP_ID}" >/dev/null 2>&1 || true
else
  APP_ID=com.rats.dev.e2e.emu
  node "${SCRIPT_DIR}/e2e-build-guard.js" --platform ios --app-id "${APP_ID}" --device "${SIM}"
  xcrun simctl keychain "${SIM}" reset >/dev/null 2>&1 || true
  maestro --device "${SIM}" test -e APP_ID="${APP_ID}" -e E2E_TEST_PASSWORD="${E2E_TEST_PASSWORD:?export E2E_TEST_PASSWORD}" \
    -e SCREEN=guest-home maestro/flows/device-open-screen.yaml
  WORK="$(mktemp -d)"
  PAYLOAD="${WORK}/payload.json"
  trap 'rm -rf "${WORK}"' EXIT
  # SpringBoard draws banners outside the app's view hierarchy, where Maestro
  # cannot see them, and hides them after about 5 s. So shoot the screen a few
  # times right after the push and read the shots with macOS Vision.
  swiftc -O -o "${WORK}/ocr" "${SCRIPT_DIR}/ocr-text.swift" 2>"${WORK}/swiftc.err" ||
    { cat "${WORK}/swiftc.err" >&2; echo "✗ could not build ocr-text.swift" >&2; exit 1; }
  alive() { xcrun simctl spawn "${SIM}" launchctl list | grep -q "UIKitApplication:${APP_ID}"; }
  banner() {
    local i
    for i in 1 2 3 4; do
      sleep 0.7
      xcrun simctl io "${SIM}" screenshot "${WORK}/shot-${i}.png" >/dev/null 2>&1 || true
    done
    local found=1
    for i in 1 2 3 4; do
      [[ -f "${WORK}/shot-${i}.png" ]] && "${WORK}/ocr" "${WORK}/shot-${i}.png" | grep -qF "$1" && found=0 && break
    done
    rm -f "${WORK}"/shot-*.png
    # iOS queues banners: let this one go before the next push is sent.
    sleep 5
    return "${found}"
  }
  # Newer simulators refuse a silent (content-available, no alert) push with
  # UNErrorDomain 1401 "no user visible content". Those checks then belong to a
  # real iPhone (2026-11-11 device runbook, step 2), so record them as info.
  simpush() { xcrun simctl push "${SIM}" "${APP_ID}" "${PAYLOAD}" >/dev/null 2>"${PAYLOAD}.err"; }
  refused_silent() { grep -q "no user visible content" "${PAYLOAD}.err"; }
  echo "Pushes on ${SIM} (${APP_ID}, simctl push):"

  # The resident shape as FCM hands it to APNs: sendNotification's notification
  # block becomes aps.alert, its data keys sit beside aps.
  resident_payload() {
    printf '{"aps":{"alert":{"title":"%s","body":"Device pass push check"}},"gcm.message_id":"%s","notifee":"{\\"title\\":\\"%s\\",\\"body\\":\\"Device pass push check\\",\\"data\\":{}}"}' \
      "$1" "$1" "$1" > "${PAYLOAD}"
  }

  m="push-e2e-resident-${RUN}"; resident_payload "$m"
  if simpush; then
    banner "$m" && pass "resident push, foreground: banner shown" || fail "resident push, foreground: no banner"
  else
    fail "resident push: simctl push failed: $(tail -1 "${PAYLOAD}.err")"
  fi

  m="push-e2e-admin-${RUN}"
  printf '{"aps":{"alert":{"title":"%s","body":"Device pass push check"}},"gcm.message_id":"%s"}' "$m" "$m" > "${PAYLOAD}"
  if simpush; then
    banner "$m" && pass "admin push, foreground: banner shown" || fail "admin push, foreground: no banner"
  else
    fail "admin push: simctl push failed: $(tail -1 "${PAYLOAD}.err")"
  fi

  m="push-e2e-data-${RUN}"
  printf '{"aps":{"content-available":1},"gcm.message_id":"%s","e2eProbe":"%s"}' "$m" "$m" > "${PAYLOAD}"
  if simpush; then
    sleep 8
    alive && pass "data-only push, foreground: app still running" || fail "data-only push, foreground: app is gone"
  elif refused_silent; then
    info "data-only push, foreground: the simulator refuses silent pushes; check on a real iPhone"
  else
    fail "data-only push: simctl push failed: $(tail -1 "${PAYLOAD}.err")"
  fi

  # Last, because it leaves Settings in front of the app.
  xcrun simctl launch "${SIM}" com.apple.Preferences >/dev/null
  sleep 2
  m="push-e2e-resident-bg-${RUN}"; resident_payload "$m"
  if simpush; then
    banner "$m" && pass "resident push, background: banner shown" || fail "resident push, background: no banner"
  else
    fail "resident push: simctl push failed: $(tail -1 "${PAYLOAD}.err")"
  fi
fi

[[ "${FAILED}" -eq 0 ]] && echo "✓ pushes" || { echo "✗ pushes"; exit 1; }
