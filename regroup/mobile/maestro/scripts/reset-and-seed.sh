#!/usr/bin/env bash
#
# Reset + seed the Firebase emulator with the canonical E2E fixtures
# (test accounts, houses, activities, disputes) defined under e2e/setup/.
#
# Prerequisite: the Firebase emulator suite must already be running. Start it
# from the regroup/ directory in a separate terminal:
#
#     cd regroup && firebase emulators:start
#
# Then, from regroup/mobile/:
#
#     ./maestro/scripts/reset-and-seed.sh
#
# This intentionally re-uses e2e/setup/seedTestData.js (which targets the
# emulator via FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST). It does
# NOT call scripts/create-e2e-auth-users.js — that one writes to the real
# phoenix-cleanhouse project.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EMULATOR_UI="http://127.0.0.1:4000"

echo "▶ Checking Firebase emulator at ${EMULATOR_UI} ..."
if ! curl -fsS --max-time 3 "${EMULATOR_UI}" >/dev/null 2>&1; then
  echo "✗ Emulator not reachable at ${EMULATOR_UI}." >&2
  echo "  Start it first:  cd regroup && firebase emulators:start" >&2
  exit 1
fi
echo "✓ Emulator is up."

echo "▶ Seeding test data (e2e/setup/seedTestData.js) ..."
cd "${MOBILE_DIR}"
node e2e/setup/seedTestData.js

echo "✓ Seed complete. Test accounts + houses are in the emulator."
