#!/usr/bin/env bash
# Resets the portal's emulators and loads the mobile e2e fixtures. E2E_TEST_PASSWORD
# must be set. The seed itself refuses non-demo projects and non-loopback hosts.
set -euo pipefail
PORTAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FIRESTORE_EMULATOR_HOST=127.0.0.1:18080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099
export GCLOUD_PROJECT=demo-regroup-e2e
export NODE_PATH="${PORTAL_DIR}/node_modules"
node "${PORTAL_DIR}/../mobile/maestro/scripts/seed/index.js"
