#!/usr/bin/env bash
#
# test-prep.sh — bring up the Firebase emulator suite (auth + firestore + storage)
# and seed the canonical E2E fixtures, then KEEP the emulators running so Maestro
# can drive the app against them.
#
#   Usage:  ./scripts/test-prep.sh
#   Stop:   Ctrl-C (also shuts the emulators down).
#
# Notes:
#   * `firebase emulators:start` is a long-running foreground process, so it is
#     backgrounded here; the script waits for the UI to come up, seeds, then
#     `wait`s on the emulator so the suite stays in the foreground.
#   * The emulator config that defines storage:9199 lives in
#     regroup/mobile/firebase/firebase.json — NOT regroup/firebase.json (which
#     only configures functions). We start from that directory.
#   * --project phoenix-cleanhouse matches the seed's projectId (seedTestData.js)
#     and the app's Firebase project, so auth users and Firestore docs land in
#     the same store the app reads from. (Was previously demo-rats, which caused
#     EMAIL_NOT_FOUND on every E2E login.)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMU_DIR="${REPO_ROOT}/regroup/mobile/firebase" # firebase.json here defines storage:9199
SEED="${REPO_ROOT}/regroup/mobile/maestro/scripts/reset-and-seed.sh"
UI_URL="http://127.0.0.1:4000"
PROJECT="phoenix-cleanhouse"

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
  echo "  (If you need the storage emulator on :9199, stop the running suite first"
  echo "   and re-run this script so it starts auth+firestore+storage together.)"
  "${SEED}"
  echo "✅ Seeded. Existing emulators left running."
  exit 0
fi

ensure_jdk21

echo "▶ Starting Firebase emulators (auth, firestore, storage) from ${EMU_DIR} ..."
cd "${EMU_DIR}"
firebase emulators:start --only auth,firestore,storage --project "${PROJECT}" &
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
for probe in "Firestore:8080" "Auth:9099"; do
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
echo "   Storage :9199 · Firestore :8080 · Auth :9099 · UI ${UI_URL}"
echo "   Leave this terminal running. In another terminal start Metro + Maestro:"
echo "     cd regroup/mobile && npx react-native start"
echo "     maestro test -e APP_ID=com.rats.dev maestro/flows/smoke.yaml"
echo "   Ctrl-C here stops the emulators."
wait "${EMU_PID}"
