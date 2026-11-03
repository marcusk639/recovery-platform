#!/usr/bin/env bash
#
# test-prep.sh — bring up the Regroup Firebase emulator suite (auth + firestore +
# storage + functions) and seed the E2E fixtures, then KEEP the emulators running
# so Maestro can drive the E2EEmulator app build against them.
#
#   Usage:  ./scripts/test-prep.sh
#   Stop:   Ctrl-C (also shuts the emulators down).
#
# Notes:
#   * `firebase emulators:start` is a long-running foreground process, so it is
#     backgrounded here; the script waits for the UI to come up, seeds, then
#     `wait`s on the emulator so the suite stays in the foreground.
#   * The emulator config is regroup/firebase.e2e.json: the mobile rules and
#     indexes plus the functions codebase. The app's callables and the seed's
#     Firestore triggers need the functions emulator.
#   * --project demo-regroup-e2e is the project the E2EEmulator build connects to
#     (src/config/firebase-emulator.ts). demo- projects are emulator-only, and the
#     seed refuses anything else. Only that build talks to the emulators: Debug
#     and Release builds use real Firebase, so never point Maestro at them.
#   * Functions are built first (lib/ is what the emulator loads). For callables
#     that reach Stripe (the payment dashboard, the PaymentSheet), put the e2e
#     sandbox's STRIPE_SECRET_KEY in regroup/functions/.secret.local and set
#     E2E_STRIPE_ACCOUNT_ID before seeding; see regroup/mobile/maestro/README.md.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMU_CONFIG="${REPO_ROOT}/regroup/firebase.e2e.json"
FUNCTIONS_DIR="${REPO_ROOT}/regroup/functions"
SEED="${REPO_ROOT}/regroup/mobile/maestro/scripts/reset-and-seed.sh"
UI_URL="http://127.0.0.1:4000"
PROJECT="demo-regroup-e2e"

# firebase-tools >= 15 requires JDK 21+. The system default may be older, so
# select a 21+ runtime for this process if needed (prefer the Homebrew keg).
ensure_jdk21() {
  local cur
  cur="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
  if [[ -n "${cur}" && "${cur}" -ge 21 ]]; then
    return 0
  fi
  # Check both Homebrew prefixes (Apple Silicon /opt/homebrew, Intel /usr/local).
  local hb candidate
  for prefix in /opt/homebrew /usr/local; do
    candidate="${prefix}/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
    [[ -x "${candidate}/bin/java" ]] && { hb="${candidate}"; break; }
  done
  if [[ -n "${hb:-}" ]]; then
    export JAVA_HOME="${hb}"
    export PATH="${JAVA_HOME}/bin:${PATH}"
    echo "▶ Using JDK 21 at ${JAVA_HOME} (system default java was ${cur:-unknown})."
    return 0
  fi
  echo "✗ firebase-tools needs JDK 21+, but none was found." >&2
  echo "  Install one:  brew install openjdk@21" >&2
  return 1
}

wait_for_ui() {
  for _ in $(seq 1 60); do
    curl -fsS --max-time 2 "${UI_URL}" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# If a suite is already up, don't fight over ports — just (re)seed and exit.
if curl -fsS --max-time 2 "${UI_URL}" >/dev/null 2>&1; then
  echo "▶ Emulator already running at ${UI_URL} — seeding only."
  echo "  (It must be the demo-regroup-e2e suite from this script; the seed refuses others.)"
  "${SEED}"
  echo "✅ Seeded. Existing emulators left running."
  exit 0
fi

ensure_jdk21

echo "▶ Building functions (the emulator loads ${FUNCTIONS_DIR}/lib) ..."
npm --prefix "${FUNCTIONS_DIR}" run build

echo "▶ Starting Firebase emulators (auth, firestore, storage, functions) from ${EMU_CONFIG} ..."
firebase emulators:start --config "${EMU_CONFIG}" --only auth,firestore,storage,functions --project "${PROJECT}" &
EMU_PID=$!
trap 'echo; echo "▶ Stopping emulators..."; kill "${EMU_PID}" 2>/dev/null || true' INT TERM EXIT

echo "▶ Waiting for emulator UI at ${UI_URL} ..."
if ! wait_for_ui; then
  echo "✗ Emulators did not come up within 60s." >&2
  exit 1
fi
echo "✓ Emulators up."

# The UI (:4000) can answer before the JVM-backed Firestore/Auth ports finish
# binding; probe them so the seed never races an unbound port (a half-seeded run
# can otherwise look green). The seed targets the emulator hosts unconditionally,
# so this only affects timing, never where data lands.
for probe in "Firestore:8080" "Auth:9099" "Functions:5001"; do
  label="${probe%%:*}"
  port="${probe##*:}"
  ok=0
  for _ in $(seq 1 30); do
    nc -z 127.0.0.1 "${port}" >/dev/null 2>&1 && {
      ok=1
      break
    }
    sleep 1
  done
  [[ ${ok} -eq 1 ]] || echo "⚠ ${label} emulator not listening on :${port} after 30s — seed may fail." >&2
done

"${SEED}"

echo
echo "✅ Emulators running + seeded."
echo "   Storage :9199 · Firestore :8080 · Auth :9099 · Functions :5001 · UI ${UI_URL}"
echo "   Leave this terminal running. In another terminal, with the E2EEmulator build installed:"
echo "     cd regroup/mobile && maestro/scripts/run-flows.sh"
echo "   Ctrl-C here stops the emulators."
wait "${EMU_PID}"
