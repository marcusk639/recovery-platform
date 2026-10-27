#!/bin/sh
# Xcode build phase "Release guard" (target rats, after "Configure e2e app
# bundle", before the JS bundle is built). Runs for the Release configuration
# only; Debug and the E2E* configurations are not checked.
#
# Runs scripts/release-guard.js on the GoogleService-Info.plist inside the
# built app, which is the one that ships, and on STRIPE_PUBLISHABLE_KEY as the
# bundler resolves it: the build environment plus ios/.xcode.env(.local), which
# with-environment.sh sources for the bundle phase too, then regroup/mobile/.env
# via dotenv from the same working directory Metro uses. Fails the build unless
# the project is phoenix-cleanhouse and the key is pk_live_.
set -e

if [ "$CONFIGURATION" != Release ]; then
  echo "Release guard: not checked for configuration $CONFIGURATION"
  exit 0
fi

for ENV_FILE in "$SRCROOT/.xcode.env" "$SRCROOT/.xcode.env.local"; do
  if [ -f "$ENV_FILE" ]; then
    . "$ENV_FILE"
  fi
done

cd "$SRCROOT/.."
"${NODE_BINARY:-node}" scripts/release-guard.js \
  --config "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/GoogleService-Info.plist"
