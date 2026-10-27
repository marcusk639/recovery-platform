#!/usr/bin/env bash
# Verifies the built iOS simulator apps for the e2e configurations and the
# store Release, from the artifacts and their build logs alone (no simulator,
# no network).
#
#   xcodebuild -workspace ios/rats.xcworkspace -scheme rats-e2e-emulator \
#     -configuration E2EEmulator -sdk iphonesimulator -derivedDataPath "$DD" \
#     CODE_SIGNING_ALLOWED=NO build > "$LOGS/E2EEmulator.log"
#   (likewise rats-e2e-staging / E2EStaging and rats / Release)
#   scripts/verify-ios-variants.sh -d "$DD" -l "$LOGS"              # all three
#   scripts/verify-ios-variants.sh -d "$DD" -l "$LOGS" E2EEmulator  # just one
#
#   -d  the xcodebuild -derivedDataPath; apps are read from
#       <dir>/Build/Products/<Configuration>-iphonesimulator/rats.app
#   -l  a directory holding one xcodebuild log per configuration,
#       named <Configuration>.log
#
# Per app it asserts:
#   - CFBundleIdentifier and CFBundleDisplayName;
#   - main.jsbundle is present (JS bundled, no Metro);
#   - the bundle carries exactly one E2E bundle marker, with the expected value.
#     babel.config.js inlines E2E_BUNDLE_MARKER as one whole string literal
#     ("regroup-e2e-variant=emulator" | "=staging" | "=none"). The bare variant
#     names cannot be grepped for: both are in every bundle as E2E_VARIANTS;
#   - exactly one GoogleService-Info.plist ships, and its PROJECT_ID and
#     BUNDLE_ID are the expected ones;
#   - ATS: only E2EEmulator sets NSAllowsLocalNetworking, and no app sets
#     NSAllowsArbitraryLoads;
#   - react-native-launch-arguments is linked into the e2e apps only;
#   - Crashlytics auto collection: Info.plist sets
#     rnfirebase_crashlytics_auto_collection_enabled to false in the e2e apps
#     only;
#   - e2e builds: the build log shows both Sentry phases skipping for the
#     reason "E2E configuration <configuration>" (not merely skipping, e.g.
#     for want of sentry.properties) and no sentry-cli upload output.
#
# Exits non-zero if any assertion fails or an app or log is missing.
set -uo pipefail

DERIVED_DATA=""
LOG_DIR=""
while getopts "d:l:" opt; do
  case "$opt" in
    d) DERIVED_DATA="$OPTARG" ;;
    l) LOG_DIR="$OPTARG" ;;
    *) echo "usage: $0 -d <derivedDataPath> -l <logDir> [configuration...]" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ -z "$DERIVED_DATA" ] || [ -z "$LOG_DIR" ]; then
  echo "usage: $0 -d <derivedDataPath> -l <logDir> [configuration...]" >&2
  exit 2
fi

PLIST_BUDDY=/usr/libexec/PlistBuddy
FAILURES=0
pass() { echo "  PASS $1"; }
fail() {
  echo "  FAIL $1" >&2
  FAILURES=$((FAILURES + 1))
}

# expect <label> <actual> <expected>
expect() {
  if [ "$2" = "$3" ]; then
    pass "$1: $2"
  else
    fail "$1: expected '$3', got '${2:-<none>}'"
  fi
}

# plist_value <plist> <key path>; empty when the key is absent.
plist_value() {
  "$PLIST_BUDDY" -c "Print :$2" "$1" 2>/dev/null
}

# All distinct E2E bundle markers in the app's JS bundle, comma-separated.
bundle_markers() {
  LC_ALL=C grep -a -o 'regroup-e2e-variant=[a-z]*' "$1/main.jsbundle" | sort -u | paste -sd, -
}

check_bundle() {
  local app="$1" expected_marker="$2"
  if [ -f "$app/main.jsbundle" ]; then
    pass "main.jsbundle present"
  else
    fail "main.jsbundle missing"
    return
  fi
  expect "bundle E2E marker" "$(bundle_markers "$app")" "$expected_marker"
}

check_google_service_info() {
  local app="$1" project="$2" bundle_id="$3" found
  found="$(find "$app" -name 'GoogleService-Info*.plist' | sed "s|^$app/||" | sort | paste -sd, -)"
  expect "GoogleService-Info plists in the app" "$found" "GoogleService-Info.plist"
  [ -f "$app/GoogleService-Info.plist" ] || return
  expect "GoogleService-Info PROJECT_ID" "$(plist_value "$app/GoogleService-Info.plist" PROJECT_ID)" "$project"
  expect "GoogleService-Info BUNDLE_ID" "$(plist_value "$app/GoogleService-Info.plist" BUNDLE_ID)" "$bundle_id"
}

# check_ats <app> <local networking: true|absent>
check_ats() {
  local plist="$1/Info.plist" expected="$2" local_networking arbitrary
  local_networking="$(plist_value "$plist" NSAppTransportSecurity:NSAllowsLocalNetworking)"
  expect "ATS NSAllowsLocalNetworking" "${local_networking:-absent}" "$expected"
  arbitrary="$(plist_value "$plist" NSAppTransportSecurity:NSAllowsArbitraryLoads)"
  expect "ATS NSAllowsArbitraryLoads" "${arbitrary:-absent}" "absent"
}

# The module's Objective-C class name is in the binary's class-name section
# whenever the pod is linked (static frameworks link into the main binary).
# check_launch_arguments <app> <linked|absent>
check_launch_arguments() {
  local app="$1" expected="$2" binary state
  binary="$app/$(plist_value "$app/Info.plist" CFBundleExecutable)"
  if [ ! -f "$binary" ]; then
    fail "app binary $binary missing"
    return
  fi
  if LC_ALL=C grep -a -q 'LaunchArguments' "$binary"; then state=linked; else state=absent; fi
  expect "react-native-launch-arguments native module" "$state" "$expected"
}

# The Sentry phases echo these lines when they skip, with the reason in
# parentheses; sentry-cli's own output appears only when it actually runs.
SENTRY_CLI_OUTPUT='Processing react-native sourcemaps|sentry-cli react-native xcode|Found [0-9]+ debug information files?|Uploading debug|> Uploading|sentry-cli.*error'

# check_sentry_skipped <log> <configuration>
check_sentry_skipped() {
  local log="$1" reason="(E2E configuration $2)" bundle_line dsym_line
  bundle_line="Sentry: source map upload skipped $reason"
  dsym_line="Sentry: debug-files upload skipped $reason"
  if [ ! -f "$log" ]; then
    fail "build log $log missing"
    return
  fi
  if grep -F -q "$bundle_line" "$log"; then
    pass "log: $bundle_line"
  else
    fail "log: no '$bundle_line' line"
  fi
  if grep -F -q "$dsym_line" "$log"; then
    pass "log: $dsym_line"
  else
    fail "log: no '$dsym_line' line"
  fi
  # `export` lines are the phase environment dump, not sentry-cli output.
  if grep -v '^ *export ' "$log" | grep -E -q "$SENTRY_CLI_OUTPUT"; then
    fail "log: sentry-cli upload output present"
  else
    pass "log: no sentry-cli upload output"
  fi
}

# verify <configuration> <bundle id> <display name> <project id> <marker>
#        <local networking: true|absent> <launch arguments: linked|absent>
verify() {
  local config="$1" bundle_id="$2" display_name="$3" project="$4" marker="$5"
  local ats="$6" launch_args="$7" app crashlytics actual
  app="$DERIVED_DATA/Build/Products/$config-iphonesimulator/rats.app"
  echo "$config ($app)"
  if [ ! -d "$app" ]; then
    fail "app not found; build configuration $config for the simulator"
    return
  fi
  expect "CFBundleIdentifier" "$(plist_value "$app/Info.plist" CFBundleIdentifier)" "$bundle_id"
  expect "CFBundleDisplayName" "$(plist_value "$app/Info.plist" CFBundleDisplayName)" "$display_name"
  check_bundle "$app" "$marker"
  check_google_service_info "$app" "$project" "$bundle_id"
  check_ats "$app" "$ats"
  check_launch_arguments "$app" "$launch_args"
  case "$config" in
    E2E*) crashlytics=false ;;
    *) crashlytics=absent ;;
  esac
  actual="$(plist_value "$app/Info.plist" rnfirebase_crashlytics_auto_collection_enabled)"
  expect "Info.plist rnfirebase_crashlytics_auto_collection_enabled" "${actual:-absent}" "$crashlytics"
  case "$config" in
    E2E*) check_sentry_skipped "$LOG_DIR/$config.log" "$config" ;;
  esac
}

CONFIGS=("$@")
[ ${#CONFIGS[@]} -eq 0 ] && CONFIGS=(E2EEmulator E2EStaging Release)

for c in "${CONFIGS[@]}"; do
  case "$c" in
    E2EEmulator)
      verify E2EEmulator com.rats.dev.e2e.emu "Regroup e2e emu" demo-regroup-e2e \
        regroup-e2e-variant=emulator true linked ;;
    E2EStaging)
      verify E2EStaging com.rats.dev.e2e.stg "Regroup e2e stg" regroup-e2e \
        regroup-e2e-variant=staging absent linked ;;
    Release)
      verify Release com.rats.dev Regroup phoenix-cleanhouse \
        regroup-e2e-variant=none absent absent ;;
    *)
      echo "unknown configuration: $c (expected E2EEmulator, E2EStaging or Release)" >&2
      exit 2 ;;
  esac
done

if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: $FAILURES assertion(s)" >&2
  exit 1
fi
echo "OK: all assertions passed"
