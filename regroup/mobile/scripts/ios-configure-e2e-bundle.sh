#!/bin/sh
# Xcode build phase "Configure e2e app bundle" (target rats, right after Copy
# Bundle Resources). Does nothing for Debug and Release, so the store app ships
# exactly what Copy Bundle Resources put in it: ios/GoogleService-Info.plist
# (phoenix-cleanhouse) and rats/Info.plist as processed.
#
# For the e2e configurations it rewrites the built app in place, before the
# RNFB and Crashlytics phases read it and before code signing:
#   - GoogleService-Info.plist is replaced, so the app holds exactly one:
#       E2EEmulator: ios/config/E2EEmulator/GoogleService-Info.plist, committed,
#                    for the emulator-only project demo-regroup-e2e;
#       E2EStaging:  ios/config/E2EStaging/GoogleService-Info.plist, gitignored,
#                    copied first from ~/.config/regroup-e2e (override with
#                    REGROUP_E2E_STAGING_GOOGLE_SERVICE_INFO). The build fails
#                    if it is missing.
#     Either way the plist's PROJECT_ID and BUNDLE_ID are checked, so a wrong
#     file fails the build rather than pointing an e2e app at another project;
#   - CFBundleDisplayName names the variant, so the apps are distinguishable;
#   - rnfirebase_crashlytics_auto_collection_enabled = false: no Crashlytics
#     reports from e2e builds;
#   - E2EEmulator only: ATS NSAllowsLocalNetworking, for cleartext HTTP to the
#     Firebase emulators on 127.0.0.1 (the startup probes and the SDKs).
set -eu

case "$CONFIGURATION" in
  E2EEmulator)
    PROJECT_ID=demo-regroup-e2e
    DISPLAY_NAME="Regroup e2e emu"
    LOCAL_NETWORKING=true ;;
  E2EStaging)
    PROJECT_ID=regroup-e2e
    DISPLAY_NAME="Regroup e2e stg"
    LOCAL_NETWORKING=false ;;
  E2E*)
    echo "error: unknown e2e configuration $CONFIGURATION" >&2
    exit 1 ;;
  *)
    echo "$CONFIGURATION is not an e2e configuration; app bundle left as built"
    exit 0 ;;
esac

PLIST_BUDDY=/usr/libexec/PlistBuddy
SOURCE="$SRCROOT/config/$CONFIGURATION/GoogleService-Info.plist"

if [ "$CONFIGURATION" = E2EStaging ]; then
  STAGING_SOURCE="${REGROUP_E2E_STAGING_GOOGLE_SERVICE_INFO:-$HOME/.config/regroup-e2e/GoogleService-Info.e2e-staging.plist}"
  if [ ! -f "$STAGING_SOURCE" ]; then
    rm -f "$SOURCE"
    echo "error: E2EStaging needs its Firebase config at $STAGING_SOURCE: the GoogleService-Info.plist of the iOS app com.rats.dev.e2e.stg in Firebase project regroup-e2e. It is not committed." >&2
    exit 1
  fi
  mkdir -p "$(dirname "$SOURCE")"
  cp "$STAGING_SOURCE" "$SOURCE"
fi

if [ ! -f "$SOURCE" ]; then
  echo "error: $SOURCE is missing" >&2
  exit 1
fi

check() {
  actual="$("$PLIST_BUDDY" -c "Print :$1" "$SOURCE" 2>/dev/null || true)"
  if [ "$actual" != "$2" ]; then
    echo "error: $SOURCE has $1 '$actual', expected '$2'" >&2
    exit 1
  fi
}
check PROJECT_ID "$PROJECT_ID"
check BUNDLE_ID "$PRODUCT_BUNDLE_IDENTIFIER"

RESOURCES="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
cp "$SOURCE" "$RESOURCES/GoogleService-Info.plist"
echo "Copied $SOURCE ($PROJECT_ID) into the app"

INFO_PLIST="$TARGET_BUILD_DIR/$INFOPLIST_PATH"
"$PLIST_BUDDY" -c "Set :CFBundleDisplayName $DISPLAY_NAME" "$INFO_PLIST"
# No Crashlytics reports from e2e builds: their crashes are often deliberate.
# RNFB reads rnfirebase_-prefixed Info.plist keys (RNFBMeta) when neither
# firebase.json nor a runtime preference sets the value.
"$PLIST_BUDDY" -c "Delete :rnfirebase_crashlytics_auto_collection_enabled" "$INFO_PLIST" 2>/dev/null || true
"$PLIST_BUDDY" -c "Add :rnfirebase_crashlytics_auto_collection_enabled bool false" "$INFO_PLIST"
if [ "$LOCAL_NETWORKING" = true ]; then
  "$PLIST_BUDDY" -c "Delete :NSAppTransportSecurity:NSAllowsLocalNetworking" "$INFO_PLIST" 2>/dev/null || true
  "$PLIST_BUDDY" -c "Add :NSAppTransportSecurity:NSAllowsLocalNetworking bool true" "$INFO_PLIST"
fi
echo "Info.plist: CFBundleDisplayName '$DISPLAY_NAME', Crashlytics auto collection off, NSAllowsLocalNetworking $LOCAL_NETWORKING"
