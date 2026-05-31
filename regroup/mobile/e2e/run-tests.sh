#!/bin/bash

###############################################################################
# E2E Test Runner Script
#
# Usage:
#   ./e2e/run-tests.sh [options]
#
# Options:
#   --suite <name>     Run specific test suite (dispute, verification, auth, all)
#   --platform <name>  Run on specific platform (ios, android, both)
#   --config <name>    Use specific Detox config (ios.sim.debug, android.emu.debug)
#   --no-build        Skip app build step
#   --cleanup         Clean emulator data before tests
#   --help            Show this help message
#
# Examples:
#   ./e2e/run-tests.sh --suite all --platform ios
#   ./e2e/run-tests.sh --suite dispute --platform android --no-build
#   ./e2e/run-tests.sh --cleanup
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SUITE="all"
PLATFORM="ios"
CONFIG=""
BUILD=true
CLEANUP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --suite)
      SUITE="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --config)
      CONFIG="$2"
      shift 2
      ;;
    --no-build)
      BUILD=false
      shift
      ;;
    --cleanup)
      CLEANUP=true
      shift
      ;;
    --help)
      grep "^#" "$0" | grep -v "#!/bin/bash" | sed 's/^# //g' | sed 's/^#//g'
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run with --help for usage information"
      exit 1
      ;;
  esac
done

# Set config based on platform if not specified
if [ -z "$CONFIG" ]; then
  if [ "$PLATFORM" = "ios" ]; then
    CONFIG="ios.sim.debug"
  elif [ "$PLATFORM" = "android" ]; then
    CONFIG="android.emu.debug"
  else
    echo -e "${RED}Invalid platform: $PLATFORM${NC}"
    echo "Valid options: ios, android, both"
    exit 1
  fi
fi

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}   RATS E2E Test Runner${NC}"
echo -e "${BLUE}=====================================${NC}"
echo -e "Suite:    ${GREEN}$SUITE${NC}"
echo -e "Platform: ${GREEN}$PLATFORM${NC}"
echo -e "Config:   ${GREEN}$CONFIG${NC}"
echo -e "Build:    ${GREEN}$BUILD${NC}"
echo -e "${BLUE}=====================================${NC}\n"

# Check if Firebase Emulator is running
echo -e "${YELLOW}Checking Firebase Emulator...${NC}"
if ! curl -s http://localhost:9099 > /dev/null 2>&1; then
  echo -e "${RED}❌ Firebase Auth Emulator is not running on port 9099${NC}"
  echo -e "${YELLOW}Please start the emulator with: firebase emulators:start${NC}"
  exit 1
fi

if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
  echo -e "${RED}❌ Firestore Emulator is not running on port 8080${NC}"
  echo -e "${YELLOW}Please start the emulator with: firebase emulators:start${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Firebase Emulator is running${NC}\n"

# Cleanup if requested
if [ "$CLEANUP" = true ]; then
  echo -e "${YELLOW}Cleaning emulator data...${NC}"
  # Stop and restart emulator to clear data
  echo -e "${YELLOW}Note: You may need to manually restart the emulator to fully clean data${NC}"
  echo -e "${YELLOW}Run: firebase emulators:start${NC}\n"
fi

# Seed test data
echo -e "${YELLOW}Seeding test data...${NC}"
npm run seed-e2e
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Failed to seed test data${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Test data seeded successfully${NC}\n"

# Build app if needed
if [ "$BUILD" = true ]; then
  echo -e "${YELLOW}Building app for platform: $PLATFORM${NC}"
  npm run test:e2e:build:$(echo $PLATFORM | cut -d. -f1)
  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ App build failed${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ App built successfully${NC}\n"
fi

# Determine which tests to run
TEST_PATH="e2e/tests/"
case $SUITE in
  dispute)
    TEST_PATH="${TEST_PATH}dispute-system.test.js"
    ;;
  verification)
    TEST_PATH="${TEST_PATH}activity-verification.test.js"
    ;;
  auth)
    TEST_PATH="${TEST_PATH}authorization-rbac.test.js"
    ;;
  all)
    TEST_PATH="${TEST_PATH}*.test.js"
    ;;
  *)
    echo -e "${RED}Invalid test suite: $SUITE${NC}"
    echo "Valid options: dispute, verification, auth, all"
    exit 1
    ;;
esac

# Run tests
echo -e "${YELLOW}Running E2E tests...${NC}"
echo -e "Test path: ${BLUE}$TEST_PATH${NC}\n"

if [ "$PLATFORM" = "both" ]; then
  # Run on both platforms
  echo -e "${YELLOW}Running tests on iOS...${NC}"
  detox test --configuration ios.sim.debug "$TEST_PATH"
  IOS_RESULT=$?

  echo -e "\n${YELLOW}Running tests on Android...${NC}"
  detox test --configuration android.emu.debug "$TEST_PATH"
  ANDROID_RESULT=$?

  # Report results
  echo -e "\n${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Test Results${NC}"
  echo -e "${BLUE}=====================================${NC}"

  if [ $IOS_RESULT -eq 0 ]; then
    echo -e "iOS:     ${GREEN}✅ PASSED${NC}"
  else
    echo -e "iOS:     ${RED}❌ FAILED${NC}"
  fi

  if [ $ANDROID_RESULT -eq 0 ]; then
    echo -e "Android: ${GREEN}✅ PASSED${NC}"
  else
    echo -e "Android: ${RED}❌ FAILED${NC}"
  fi

  echo -e "${BLUE}=====================================${NC}\n"

  # Exit with error if either platform failed
  if [ $IOS_RESULT -ne 0 ] || [ $ANDROID_RESULT -ne 0 ]; then
    exit 1
  fi
else
  # Run on single platform
  detox test --configuration "$CONFIG" "$TEST_PATH"
  TEST_RESULT=$?

  # Report results
  echo -e "\n${BLUE}=====================================${NC}"
  echo -e "${BLUE}   Test Results${NC}"
  echo -e "${BLUE}=====================================${NC}"

  if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  else
    echo -e "${RED}❌ TESTS FAILED${NC}"
  fi

  echo -e "${BLUE}=====================================${NC}\n"

  exit $TEST_RESULT
fi

echo -e "${GREEN}✅ E2E test run complete${NC}\n"
