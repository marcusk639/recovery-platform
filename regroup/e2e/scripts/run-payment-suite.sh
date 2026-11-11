#!/usr/bin/env bash
#
# Runs the payment suite: server tests against its own emulators (offset ports, so
# manual-testing emulators can stay up) and the regroup-local Stripe sandbox.
#
#   npm run test:payments              everything
#   npm run test:payments -- harness   files matching "harness"
#
# Never prints a secret value. See regroup/mobile/maestro/README.md.
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGROUP_DIR="$(cd "${E2E_DIR}/.." && pwd)"
FUNCTIONS_DIR="${REGROUP_DIR}/functions"

refuse() {
  echo "payment suite: $1" >&2
  exit 1
}

command -v lsof >/dev/null || refuse "lsof is needed to check the emulator ports are free"
for port in 5101 8180 9160 9399 4410 4510 9310 9510; do
  if lsof -iTCP:"${port}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    refuse "port ${port} is in use; another payment suite run may still be going"
  fi
done

# The Stripe key and webhook secrets in functions/.secret.local, which the emulator charges
# with, are checked by stripe-local-setup.ts below (assertEmulatorSecrets), and again by
# every Stripe suite (assertSafeTarget), so running Jest directly can't skip the check.

cd "${E2E_DIR}"
# Setup is idempotent. It writes the suite's own .env.demo-regroup-payments, never the
# manual emulators' .env.demo-regroup-e2e.
npx ts-node scripts/stripe-local-setup.ts
npx ts-node scripts/stripe-local-setup.ts --sweep-clocks

(cd "${FUNCTIONS_DIR}" && npm run -s build)

# The emulator's firebase-admin wrapper drops admin.firestore.FieldValue; see the file.
export NODE_OPTIONS="--require ${E2E_DIR}/emulator/preserve-admin-statics.js ${NODE_OPTIONS:-}"

# Quoted per argument, so a -t filter with spaces reaches Jest as one argument.
JEST_ARGS="$(printf '%q ' "$@")"
cd "${REGROUP_DIR}"
exec firebase emulators:exec --project demo-regroup-payments --config firebase.payments.json \
  --only auth,firestore,functions \
  "cd e2e && npx jest --config jest.payments.config.js ${JEST_ARGS}"
