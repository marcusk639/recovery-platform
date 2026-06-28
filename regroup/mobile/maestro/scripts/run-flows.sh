#!/usr/bin/env bash
#
# run-flows.sh — orchestrate the Regroup Maestro E2E flows on the iOS simulator.
#
# Runs flows ONE AT A TIME (Maestro spins a fresh XCUITest driver per invocation,
# which is the configuration that survives this project's driver instability),
# reboots the simulator once up front for a clean driver, optionally re-seeds the
# emulator, retries a flow once if the XCUITest driver connection drops, and
# prints a pass/fail summary.
#
# Prerequisites (this script checks them and tells you what's missing):
#   1. Firebase emulators up + seeded:  ./scripts/test-prep.sh   (from repo root)
#   2. Metro bundler running:           cd regroup/mobile && npx react-native start
#   3. The app installed on the sim:    npx react-native run-ios --simulator="E2E-iPhone"
#
# Usage:
#   maestro/scripts/run-flows.sh                 # run the full suite (all flows)
#   maestro/scripts/run-flows.sh smoke           # run a single flow by name
#   maestro/scripts/run-flows.sh guest-home      # ".yaml" optional
#   maestro/scripts/run-flows.sh all --no-seed   # skip the re-seed step
#   maestro/scripts/run-flows.sh all --no-reboot # skip the up-front sim reboot
#
# Options:
#   --no-seed     Do not re-seed the emulator before running.
#   --no-reboot   Do not reboot the simulator before running.
#   --sim <udid>  Target a specific simulator UDID (default: E2E-iPhone).
#   -h, --help    Show this help.
#
# Env overrides: APP_ID (default com.rats.dev), SIM_UDID.
#
set -uo pipefail # intentionally NOT -e: we continue through individual flow failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="${SCRIPT_DIR}/$(basename "${BASH_SOURCE[0]}")" # absolute — survives the cd below
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${MOBILE_DIR}"

APP_ID="${APP_ID:-com.rats.dev}"
SIM_UDID="${SIM_UDID:-809BD7B9-D9D5-45D2-AEA8-12F885F54407}" # E2E-iPhone
METRO_STATUS="http://localhost:8081/status"
EMU_UI="http://127.0.0.1:4000"
FLOWS_DIR="maestro/flows"
OUT_DIR="maestro/output"

# Ordered suite (mirrors maestro/flows/run-all.yaml). Excludes run-all.yaml and
# debug-*.yaml, which are not standalone scenarios.
SUITE=(
  smoke
  signup
  guest-home
  guest-log-chore
  guest-activity-dispute
  guest-payment-history
  guest-rent-payment
  operator-setup-wizard
  operator-applications
  operator-manage-guests
  operator-house-settings
  operator-disputes
  oxford-dashboard
  oxford-onboarding
)

DO_SEED=1
DO_REBOOT=1
TARGET="all"

# ── arg parsing ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-seed) DO_SEED=0; shift ;;
    --no-reboot) DO_REBOOT=0; shift ;;
    --sim)
      [[ $# -ge 2 ]] || { echo "Error: --sim requires a UDID argument" >&2; exit 2; }
      SIM_UDID="$2"; shift 2 ;;
    -h|--help)
      # Print the leading comment block (after the shebang) until the first code line —
      # robust to the block changing length, unlike a hardcoded sed range.
      awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "${SELF}"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) TARGET="${1%.yaml}"; shift ;;
  esac
done

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
blue()  { printf '\033[0;34m%s\033[0m\n' "$*"; }

# ── preflight ──────────────────────────────────────────────────────────────────
fail() { red "✗ $1"; [[ -n "${2:-}" ]] && echo "  → $2"; exit 1; }

command -v maestro >/dev/null || fail "maestro CLI not found on PATH" \
  "Install: curl -fsSL https://get.maestro.mobile.dev | bash"

xcrun simctl list devices booted 2>/dev/null | grep -q "${SIM_UDID}" || {
  blue "▶ Booting simulator ${SIM_UDID} ..."
  xcrun simctl boot "${SIM_UDID}" 2>/dev/null || true
  sleep 8
}

curl -fsS --max-time 3 "${EMU_UI}" >/dev/null 2>&1 || fail \
  "Firebase emulator not reachable at ${EMU_UI}" \
  "Start it from the repo root:  ./scripts/test-prep.sh"

curl -fsS --max-time 3 "${METRO_STATUS}" 2>/dev/null | grep -q "packager-status:running" || fail \
  "Metro bundler not running on :8081" \
  "Start it:  cd regroup/mobile && npx react-native start"

xcrun simctl listapps "${SIM_UDID}" 2>/dev/null | grep -q "${APP_ID}" || fail \
  "App ${APP_ID} is not installed on the simulator" \
  "Build + install:  npx react-native run-ios --simulator=\"E2E-iPhone\"  (first build 5–10 min)"

# ── resolve the run list ───────────────────────────────────────────────────────
declare -a RUN_LIST
if [[ "${TARGET}" == "all" ]]; then
  RUN_LIST=("${SUITE[@]}")
else
  [[ -f "${FLOWS_DIR}/${TARGET}.yaml" ]] || fail "No such flow: ${FLOWS_DIR}/${TARGET}.yaml"
  RUN_LIST=("${TARGET}")
fi

mkdir -p "${OUT_DIR}"

boot_and_wait() {
  xcrun simctl boot "${SIM_UDID}" >/dev/null 2>&1 || true
  # bootstatus blocks until the device is fully booted (Xcode 14+); fall back to a sleep.
  xcrun simctl bootstatus "${SIM_UDID}" >/dev/null 2>&1 || sleep 8
}

reboot_sim() {
  blue "  ↻ rebooting simulator for a clean XCUITest driver ..."
  xcrun simctl shutdown "${SIM_UDID}" >/dev/null 2>&1 || true
  sleep 2
  boot_and_wait
}

# A failure whose log matches these is a driver/harness drop, not an app failure —
# worth one reboot + retry.
DRIVER_ERR_RE="Failed to connect to /127\.0\.0\.1|xcTestDriverStatusCheck|kAXError|Unable to set permissions"

run_flow() {
  local name="$1" log="${OUT_DIR}/${1}.log" rc
  : >"${log}" # truncate once; attempts are appended so a driver-drop trace survives a retry
  for attempt in 1 2; do
    maestro test -e APP_ID="${APP_ID}" "${FLOWS_DIR}/${name}.yaml" 2>&1 | tee -a "${log}"
    rc=${PIPESTATUS[0]}
    [[ ${rc} -eq 0 ]] && return 0
    if [[ ${attempt} -eq 1 ]] && grep -qE "${DRIVER_ERR_RE}" "${log}"; then
      red "  driver dropped on '${name}' — retrying once after reboot"
      reboot_sim
      continue
    fi
    return "${rc}"
  done
}

# ── up-front clean driver + fresh data ─────────────────────────────────────────
[[ ${DO_REBOOT} -eq 1 ]] && reboot_sim
if [[ ${DO_SEED} -eq 1 ]]; then
  blue "▶ Re-seeding emulator ..."
  "${SCRIPT_DIR}/reset-and-seed.sh" || fail "Seed failed"
fi

# ── run ────────────────────────────────────────────────────────────────────────
declare -a PASSED=() FAILED=()
blue "▶ Running ${#RUN_LIST[@]} flow(s) on ${APP_ID} @ ${SIM_UDID}"
for flow in "${RUN_LIST[@]}"; do
  echo; blue "──── ${flow} ────"
  if run_flow "${flow}"; then
    green "  ✓ ${flow}"; PASSED+=("${flow}")
  else
    red "  ✗ ${flow}"; FAILED+=("${flow}")
  fi
done

# ── summary ────────────────────────────────────────────────────────────────────
echo
blue "════════ E2E SUMMARY ════════"
green "  PASS (${#PASSED[@]}): ${PASSED[*]:-—}"
red   "  FAIL (${#FAILED[@]}): ${FAILED[*]:-—}"
echo "  Logs: ${OUT_DIR}/<flow>.log   Maestro artifacts: ~/.maestro/tests/"
[[ ${#FAILED[@]} -eq 0 ]] && { green "All flows passed."; exit 0; }
exit 1
