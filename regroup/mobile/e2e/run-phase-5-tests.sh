#!/bin/bash
###############################################################################
# Phase 5 E2E Test Runner
#
# Runs the three critical accountability test suites:
#   - dispute-system.test.js       (8 tests)
#   - activity-verification.test.js (6 tests)
#   - authorization-rbac.test.js   (10 tests)
#
# Usage:
#   ./e2e/run-phase-5-tests.sh [--no-build] [--platform ios|android]
#
# Prerequisites:
#   - Firebase Emulator running: firebase emulators:start
#   - Or use live Firebase (set FIREBASE_ENV=production)
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BUILD=true
PLATFORM="ios"
CONFIG="ios.sim.debug"

while [[ $# -gt 0 ]]; do
  case $1 in
    --no-build) BUILD=false; shift ;;
    --platform) PLATFORM="$2"; CONFIG="${2}.sim.debug"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo -e "${BLUE}====================================="
echo -e "   Phase 5 E2E Tests — RATS v2"
echo -e "=====================================${NC}"

# Seed test data
echo -e "\n${YELLOW}Seeding test data...${NC}"
npm run seed-e2e
echo -e "${GREEN}✅ Test data seeded${NC}"

# Build if needed
if [ "$BUILD" = true ]; then
  echo -e "\n${YELLOW}Building app for ${PLATFORM}...${NC}"
  npx detox build --configuration "$CONFIG"
  echo -e "${GREEN}✅ App built${NC}"
fi

PASS=0
FAIL=0

run_suite() {
  local name="$1"
  local file="$2"
  echo -e "\n${YELLOW}Running: ${name}${NC}"
  if npx detox test --configuration "$CONFIG" "$file" 2>&1; then
    echo -e "${GREEN}✅ ${name} PASSED${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}❌ ${name} FAILED${NC}"
    FAIL=$((FAIL + 1))
  fi
}

run_suite "Dispute System (8 tests)"         "e2e/tests/dispute-system.test.js"
run_suite "Activity Verification (6 tests)"  "e2e/tests/activity-verification.test.js"
run_suite "Authorization / RBAC (10 tests)"  "e2e/tests/authorization-rbac.test.js"

echo -e "\n${BLUE}====================================="
echo -e "   Results"
echo -e "=====================================${NC}"
echo -e "Passed: ${GREEN}${PASS}/3 suites${NC}"
[ $FAIL -gt 0 ] && echo -e "Failed: ${RED}${FAIL}/3 suites${NC}"

[ $FAIL -eq 0 ] && echo -e "\n${GREEN}✅ All Phase 5 tests passed${NC}" || { echo -e "\n${RED}❌ Some suites failed${NC}"; exit 1; }
