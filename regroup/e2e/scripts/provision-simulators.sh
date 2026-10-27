#!/usr/bin/env bash
# C4: create the iOS simulator and Android AVD the e2e gate books, if missing.
#
#   scripts/provision-simulators.sh [--dry-run] [--install]
#
#   --dry-run  print what would be done; change nothing.
#   --install  also download a missing iOS runtime or Android system image
#              (several GB). Without it, a missing one is reported and the script fails.
#
# Idempotent: existing devices are left as they are. The pins below must match
# src/preflight/repoChecks.ts (IOS_SIM, ANDROID_AVD); a test checks that they do.
set -euo pipefail

IOS_SIM_NAME="regroup-e2e"
IOS_DEVICE_TYPE="com.apple.CoreSimulator.SimDeviceType.iPhone-17"
IOS_RUNTIME="com.apple.CoreSimulator.SimRuntime.iOS-27-0"
IOS_RUNTIME_BUILD_VERSION="27.0"

AVD_NAME="regroup-e2e"
AVD_IMAGE="system-images;android-34;google_apis;arm64-v8a"
AVD_DEVICE="pixel_7"

DRY_RUN=0
INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --install) INSTALL=1 ;;
    *) echo "unknown argument: $arg (expected --dry-run, --install)" >&2; exit 2 ;;
  esac
done

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/homebrew/share/android-commandlinetools}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$SDK/cmdline-tools/latest/bin/avdmanager"
AVD_HOME="${ANDROID_AVD_HOME:-$HOME/.android/avd}"

run() {
  if [ "$DRY_RUN" = 1 ]; then
    echo "would run: $*"
  else
    echo "running: $*"
    "$@"
  fi
}

status=0

# --- iOS -------------------------------------------------------------------
ios_runtime_ready=1
if ! xcrun simctl list runtimes 2>/dev/null | grep -qF "$IOS_RUNTIME"; then
  if [ "$INSTALL" = 1 ]; then
    run xcodebuild -downloadPlatform iOS -buildVersion "$IOS_RUNTIME_BUILD_VERSION"
  else
    echo "iOS runtime $IOS_RUNTIME is not installed; rerun with --install to download it"
    status=1
    ios_runtime_ready=0
  fi
fi
if xcrun simctl list devices -j 2>/dev/null |
  IOS_SIM_NAME="$IOS_SIM_NAME" IOS_DEVICE_TYPE="$IOS_DEVICE_TYPE" IOS_RUNTIME="$IOS_RUNTIME" node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices[process.env.IOS_RUNTIME] || [];
    process.exit(d.some((x) => x.name === process.env.IOS_SIM_NAME &&
      x.deviceTypeIdentifier === process.env.IOS_DEVICE_TYPE && x.isAvailable !== false) ? 0 : 1);
  '; then
  echo "iOS simulator $IOS_SIM_NAME exists"
elif [ "$ios_runtime_ready" = 1 ]; then
  run xcrun simctl create "$IOS_SIM_NAME" "$IOS_DEVICE_TYPE" "$IOS_RUNTIME"
else
  echo "would create iOS simulator $IOS_SIM_NAME once the runtime is installed"
fi

# --- Android ---------------------------------------------------------------
if [ ! -x "$AVDMANAGER" ]; then
  echo "avdmanager not found at $AVDMANAGER; install the Android command-line tools" >&2
  exit 1
fi
if [ -f "$AVD_HOME/$AVD_NAME.avd/config.ini" ]; then
  echo "Android AVD $AVD_NAME exists"
else
  image_dir="$SDK/$(echo "$AVD_IMAGE" | tr ';' '/')"
  image_ready=1
  if [ ! -d "$image_dir" ]; then
    if [ "$INSTALL" = 1 ]; then
      run "$SDKMANAGER" --install "$AVD_IMAGE"
    else
      echo "system image $AVD_IMAGE is not installed; rerun with --install to download it"
      status=1
      image_ready=0
    fi
  fi
  if [ "$image_ready" = 1 ]; then
    # "no" declines the custom hardware profile prompt.
    if [ "$DRY_RUN" = 1 ]; then
      echo "would run: echo no | $AVDMANAGER create avd --name $AVD_NAME --package $AVD_IMAGE --device $AVD_DEVICE"
    else
      echo no | "$AVDMANAGER" create avd --name "$AVD_NAME" --package "$AVD_IMAGE" --device "$AVD_DEVICE"
    fi
  fi
fi

exit "$status"
