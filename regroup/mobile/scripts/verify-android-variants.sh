#!/usr/bin/env bash
# Verifies the built Android APKs for the e2e build types and the store
# release, from the artifacts alone (no device, no network).
#
#   ./gradlew assembleE2eEmulator assembleE2eStaging assembleRelease
#   scripts/verify-android-variants.sh                 # all three
#   scripts/verify-android-variants.sh e2eEmulator     # just one
#
# Per APK it asserts:
#   - the package name, and that the manifest is not debuggable;
#   - the app label: string/app_name, which the manifest's application label uses;
#   - assets/index.android.bundle is present (JS bundled, no Metro);
#   - the bundle carries exactly one E2E bundle marker, with the expected value.
#     babel.config.js inlines E2E_BUNDLE_MARKER as one whole string literal
#     ("regroup-e2e-variant=emulator" | "=staging" | "=none"), so it survives
#     Hermes compilation intact. The bare variant names cannot be grepped for:
#     "emulator" and "staging" are in every bundle as the E2E_VARIANTS list;
#   - the Firebase project_id the google-services plugin compiled into resources;
#   - cleartext HTTP: only e2eEmulator may allow it, and only to 10.0.2.2.
#
# Exits non-zero if any assertion fails or an APK is missing.
set -uo pipefail

APP_DIR="$(cd "$(dirname "$0")/../android/app" && pwd)"
APK_DIR="$APP_DIR/build/outputs/apk"

if [ -z "${ANDROID_HOME:-}" ]; then
  echo "ANDROID_HOME is not set" >&2
  exit 2
fi
AAPT2="$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
if [ ! -x "$AAPT2" ]; then
  echo "aapt2 not found under $ANDROID_HOME/build-tools" >&2
  exit 2
fi

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

package_name() {
  "$AAPT2" dump badging "$1" 2>/dev/null |
    sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1
}

# All distinct E2E bundle markers in the APK's JS bundle, comma-separated.
bundle_markers() {
  unzip -p "$1" assets/index.android.bundle 2>/dev/null |
    LC_ALL=C grep -a -o 'regroup-e2e-variant=[a-z]*' | sort -u | paste -sd, -
}

# The value of string/project_id in the APK's resource table.
project_id() {
  "$AAPT2" dump resources "$1" 2>/dev/null |
    awk '/ string\/project_id$/ { getline; print; exit }' |
    sed -n 's/.*"\(.*\)".*/\1/p'
}

manifest_tree() {
  "$AAPT2" dump xmltree --file AndroidManifest.xml "$1" 2>/dev/null
}

check_not_debuggable() {
  if grep -q 'debuggable([^)]*)=true' <<<"$(manifest_tree "$1")"; then
    fail "manifest is debuggable"
  else
    pass "manifest is not debuggable"
  fi
}

# Asserts the application label is @string/app_name and that it reads <label>.
check_label() {
  local apk="$1" expected="$2" resources app_name_id label_ref value
  resources="$("$AAPT2" dump resources "$apk" 2>/dev/null)"
  app_name_id="$(awk '$1 == "resource" && $3 == "string/app_name" { print $2; exit }' <<<"$resources")"
  label_ref="$(manifest_tree "$apk" | awk '/E: application/ { app = 1 }
    app && /android:label\(/ { sub(/.*=@/, ""); print; exit }')"
  expect "application label resource" "$label_ref" "${app_name_id:-<no string/app_name>}"
  value="$(awk -v id="$app_name_id" '$1 == "resource" && $2 == id { getline; print; exit }' <<<"$resources" |
    sed -n 's/.*"\(.*\)".*/\1/p')"
  expect "app_name" "$value" "$expected"
}

check_bundle() {
  local apk="$1" expected_marker="$2"
  if unzip -l "$apk" assets/index.android.bundle >/dev/null 2>&1; then
    pass "assets/index.android.bundle present"
  else
    fail "assets/index.android.bundle missing"
    return
  fi
  expect "bundle E2E marker" "$(bundle_markers "$apk")" "$expected_marker"
}

# Asserts no cleartext: no usesCleartextTraffic=true and no network security
# config at all (targetSdk >= 28, so the platform default is cleartext off).
check_no_cleartext() {
  local tree
  tree="$(manifest_tree "$1")"
  if grep -q 'usesCleartextTraffic([^)]*)=true' <<<"$tree"; then
    fail "manifest sets usesCleartextTraffic=true"
  else
    pass "manifest does not set usesCleartextTraffic=true"
  fi
  if grep -q 'networkSecurityConfig' <<<"$tree"; then
    fail "manifest declares a networkSecurityConfig"
  else
    pass "manifest declares no networkSecurityConfig"
  fi
}

# Asserts cleartext is allowed to 10.0.2.2 and nowhere else.
check_emulator_cleartext() {
  local apk="$1" tree res_id nsc_file nsc permitted domains
  tree="$(manifest_tree "$apk")"
  if grep -q 'networkSecurityConfig' <<<"$tree"; then
    pass "manifest declares a networkSecurityConfig"
  else
    fail "manifest declares no networkSecurityConfig"
    return
  fi
  if grep -q 'usesCleartextTraffic([^)]*)=true' <<<"$tree"; then
    fail "manifest sets usesCleartextTraffic=true (app-wide cleartext)"
  fi
  # Follow the manifest's reference to the file actually packaged: release
  # resource optimisation renames res/ paths (e.g. res/8G.xml).
  res_id="$(sed -n 's/.*networkSecurityConfig([^)]*)=@\(0x[0-9a-f]*\).*/\1/p' <<<"$tree" | head -1)"
  nsc_file="$("$AAPT2" dump resources "$apk" 2>/dev/null |
    awk -v id="$res_id" '$1 == "resource" && $2 == id { getline; print $3; exit }')"
  nsc="$("$AAPT2" dump xmltree --file "$nsc_file" "$apk" 2>/dev/null)"
  if [ -z "$nsc" ]; then
    fail "network security config ${res_id:-<no id>} (${nsc_file:-<no file>}) unreadable"
    return
  fi
  # base-config must deny cleartext; exactly one domain-config may allow it.
  if grep -A1 'E: base-config' <<<"$nsc" | grep 'cleartextTrafficPermitted[^=]*="\{0,1\}false' >/dev/null; then
    pass "network security base-config denies cleartext"
  else
    fail "network security base-config does not deny cleartext"
  fi
  permitted="$(grep -c 'cleartextTrafficPermitted[^=]*="\{0,1\}true' <<<"$nsc")"
  expect "cleartext-permitting configs" "$permitted" "1"
  domains="$(sed -n 's/^ *T: .\(.*\).$/\1/p' <<<"$nsc" | tr -d '[:space:]' | sort -u | paste -sd, -)"
  expect "cleartext domains" "$domains" "10.0.2.2"
}

# verify <variant> <package> <label> <project_id> <marker> <cleartext: emulator|none>
verify() {
  local variant="$1" package="$2" label="$3" project="$4" marker="$5" cleartext="$6"
  local apk
  apk="$APK_DIR/$variant/app-$variant.apk"
  echo "$variant ($apk)"
  if [ ! -f "$apk" ]; then
    fail "APK not found; build it with ./gradlew assemble$(printf %s "${variant:0:1}" | tr a-z A-Z)${variant:1}"
    return
  fi
  expect "package" "$(package_name "$apk")" "$package"
  check_not_debuggable "$apk"
  check_label "$apk" "$label"
  check_bundle "$apk" "$marker"
  expect "google-services project_id" "$(project_id "$apk")" "$project"
  if [ "$cleartext" = emulator ]; then
    check_emulator_cleartext "$apk"
  else
    check_no_cleartext "$apk"
  fi
}

VARIANTS=("$@")
[ ${#VARIANTS[@]} -eq 0 ] && VARIANTS=(e2eEmulator e2eStaging release)

for v in "${VARIANTS[@]}"; do
  case "$v" in
    e2eEmulator)
      verify e2eEmulator com.regroup.app.e2e.emu "Regroup e2e emu" demo-regroup-e2e \
        regroup-e2e-variant=emulator emulator ;;
    e2eStaging)
      verify e2eStaging com.regroup.app.e2e.stg "Regroup e2e stg" regroup-e2e \
        regroup-e2e-variant=staging none ;;
    release)
      verify release com.regroup.app rats phoenix-cleanhouse \
        regroup-e2e-variant=none none ;;
    *)
      echo "unknown variant: $v (expected e2eEmulator, e2eStaging or release)" >&2
      exit 2 ;;
  esac
done

if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: $FAILURES assertion(s)" >&2
  exit 1
fi
echo "OK: all assertions passed"
