#!/usr/bin/env bash
#
# Reset + seed the Firebase emulators with the E2E fixtures (test accounts,
# houses, activities, disputes, payments): maestro/scripts/seed/index.js, with
# identities from e2e/setup/testAccounts.json.
#
# Prerequisite: the demo-regroup-e2e emulator suite must already be running.
# From the repo root, in a separate terminal:
#
#     ./scripts/test-prep.sh
#
# Then, from regroup/mobile/ (E2E_TEST_PASSWORD set):
#
#     ./maestro/scripts/reset-and-seed.sh
#
# The seed only writes to loopback emulators under a demo- project (see
# maestro/scripts/seed/guard.js). It does NOT call
# scripts/create-e2e-auth-users.js — that one writes to the real
# phoenix-cleanhouse project.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

EMULATOR_UI="http://127.0.0.1:4000"

echo "▶ Checking Firebase emulator at ${EMULATOR_UI} ..."
if ! curl -fsS --max-time 3 "${EMULATOR_UI}" >/dev/null 2>&1; then
  echo "✗ Emulator not reachable at ${EMULATOR_UI}." >&2
  echo "  Start it first, from the repo root:  ./scripts/test-prep.sh" >&2
  exit 1
fi
echo "✓ Emulator is up."

echo "▶ Seeding test data (maestro/scripts/seed/index.js) ..."
cd "${MOBILE_DIR}"
node maestro/scripts/seed/index.js
nc -z 127.0.0.1 8082 >/dev/null 2>&1 && node maestro/scripts/seed/directory.js

echo "✓ Seed complete. Test accounts + houses are in the emulator."
