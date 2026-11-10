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
CONFIG_DIR="${HOME}/.config/regroup-e2e"

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

for file in stripe-local-secret-key.txt stripe-local-webhook-secret.txt; do
  [[ -f "${CONFIG_DIR}/${file}" ]] || refuse "missing ${CONFIG_DIR}/${file}"
done

SECRET_FILE="${FUNCTIONS_DIR}/.secret.local"
[[ -f "${SECRET_FILE}" ]] || refuse "missing ${SECRET_FILE}"
# The functions emulator charges with these values, not the harness's key files, so they
# must be the regroup-local ones. Maestro testing puts the e2e sandbox's here, whose
# webhooks write to staging. Compared in variables only; nothing is printed.
secret_value() {
  local line
  line="$(grep -m1 "^$1=" "${SECRET_FILE}" || true)"
  [[ -n "${line}" ]] || refuse "${SECRET_FILE} has no $1"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "${line}"
}
config_value() { tr -d '[:space:]' <"${CONFIG_DIR}/$1"; }
[[ "$(secret_value STRIPE_SECRET_KEY)" == "$(config_value stripe-local-secret-key.txt)" ]] ||
  refuse "${SECRET_FILE} STRIPE_SECRET_KEY is not the regroup-local key; set it as in maestro/README.md"
for name in STRIPE_TEST_WEBHOOK_SECRET STRIPE_CONNECT_TEST_WEBHOOK_SECRET; do
  [[ "$(secret_value "${name}")" == "$(config_value stripe-local-webhook-secret.txt)" ]] ||
    refuse "${SECRET_FILE} ${name} is not the regroup-local webhook secret; set it as in maestro/README.md"
done
if grep -Eq '=["'"'"']?SG\.' "${SECRET_FILE}"; then
  refuse "${SECRET_FILE} holds a real SendGrid key; remove it so tests can't send email"
fi

cd "${E2E_DIR}"
# Always: e2e:gen-env rewrites .env.demo-regroup-e2e without prices. Setup is idempotent.
npx ts-node scripts/stripe-local-setup.ts
npx ts-node scripts/stripe-local-setup.ts --sweep-clocks

(cd "${FUNCTIONS_DIR}" && npm run -s build)

# The emulator's firebase-admin wrapper drops admin.firestore.FieldValue; see the file.
export NODE_OPTIONS="--require ${E2E_DIR}/emulator/preserve-admin-statics.js ${NODE_OPTIONS:-}"

JEST_ARGS="$*"
cd "${REGROUP_DIR}"
exec firebase emulators:exec --project demo-regroup-e2e --config firebase.payments.json \
  --only auth,firestore,functions \
  "cd e2e && npx jest --config jest.payments.config.js ${JEST_ARGS}"
