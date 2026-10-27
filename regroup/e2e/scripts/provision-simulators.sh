#!/usr/bin/env bash
# C4: create the iOS simulator and Android AVD the e2e gate books, if missing.
#
#   scripts/provision-simulators.sh [--dry-run] [--install] [--recreate]
#
#   --dry-run   print what would be done; change nothing.
#   --install   also download a missing iOS runtime or Android system image
#               (several GB). Without it, a missing one is reported and the script fails.
#   --recreate  delete and recreate the AVD when it exists with a different system
#               image. Without it, a mis-pinned AVD is reported and the script fails.
#
# Idempotent: devices that match the pins are left alone. A device of the pinned
# name that does not match is never duplicated: it is reported (iOS) or, with
# --recreate, replaced (Android). The pins must match src/preflight/repoChecks.ts
# (IOS_SIM, ANDROID_AVD); a test checks that they do. XCRUN may name a stand-in
# xcrun (tests use one).
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
RECREATE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --install) INSTALL=1 ;;
    --recreate) RECREATE=1 ;;
    *) echo "unknown argument: $arg (expected --dry-run, --install, --recreate)" >&2; exit 2 ;;
  esac
done

XCRUN="${XCRUN:-xcrun}"
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
if ! "$XCRUN" simctl list runtimes 2>/dev/null | grep -qF "$IOS_RUNTIME"; then
  if [ "$INSTALL" = 1 ]; then
    run xcodebuild -downloadPlatform iOS -buildVersion "$IOS_RUNTIME_BUILD_VERSION"
  else
    echo "iOS runtime $IOS_RUNTIME is not installed; rerun with --install to download it"
    status=1
    ios_runtime_ready=0
  fi
fi
# Prints "ok", "missing", "mismatch <what it is>" or "duplicate <count>".
# shellcheck disable=SC2016 # the ${...} below are JavaScript template literals, not shell.
ios_state="$("$XCRUN" simctl list devices -j 2>/dev/null |
  IOS_SIM_NAME="$IOS_SIM_NAME" IOS_DEVICE_TYPE="$IOS_DEVICE_TYPE" IOS_RUNTIME="$IOS_RUNTIME" node -e '
    const e = process.env;
    const devices = JSON.parse(require("fs").readFileSync(0, "utf8")).devices || {};
    const named = Object.entries(devices).flatMap(([runtime, list]) =>
      list.filter((d) => d.name === e.IOS_SIM_NAME).map((d) => ({ ...d, runtime })));
    if (named.length > 1) console.log(`duplicate ${named.length}`);
    else if (!named.length) console.log("missing");
    else if (named[0].deviceTypeIdentifier !== e.IOS_DEVICE_TYPE || named[0].runtime !== e.IOS_RUNTIME)
      console.log(`mismatch ${named[0].udid} is ${named[0].deviceTypeIdentifier} on ${named[0].runtime}`);
    else console.log("ok");
  ')" || ios_state="error"
case "$ios_state" in
  ok) echo "iOS simulator $IOS_SIM_NAME exists" ;;
  missing)
    if [ "$ios_runtime_ready" = 1 ]; then
      run "$XCRUN" simctl create "$IOS_SIM_NAME" "$IOS_DEVICE_TYPE" "$IOS_RUNTIME"
    else
      echo "would create iOS simulator $IOS_SIM_NAME once the runtime is installed"
    fi
    ;;
  duplicate*)
    echo "${ios_state#duplicate } iOS simulators are named $IOS_SIM_NAME; delete the extras (xcrun simctl delete <udid>)" >&2
    status=1
    ;;
  mismatch*)
    echo "iOS simulator $IOS_SIM_NAME exists but ${ios_state#mismatch }, expected $IOS_DEVICE_TYPE on $IOS_RUNTIME; not creating a duplicate. Delete it (xcrun simctl delete <udid>) and rerun" >&2
    status=1
    ;;
  *)
    echo "could not list iOS simulators ($XCRUN simctl list devices -j failed)" >&2
    status=1
    ;;
esac

# --- Android ---------------------------------------------------------------
if [ ! -x "$AVDMANAGER" ]; then
  echo "avdmanager not found at $AVDMANAGER; install the Android command-line tools" >&2
  exit 1
fi
config="$AVD_HOME/$AVD_NAME.avd/config.ini"
expected_sysdir="$(echo "$AVD_IMAGE" | tr ';' '/')/"
action=create
if [ -f "$config" ]; then
  # Same comparison as simulatorsCheck: image.sysdir.1, trimmed.
  actual_sysdir="$(sed -n 's/^image\.sysdir\.1=//p' "$config" | head -n 1 | tr -d '[:space:]')"
  if [ "$actual_sysdir" = "$expected_sysdir" ]; then
    echo "Android AVD $AVD_NAME exists with $AVD_IMAGE"
    action=none
  elif [ "$RECREATE" = 1 ]; then
    echo "Android AVD $AVD_NAME uses ${actual_sysdir:-(no image)}, expected $expected_sysdir; recreating it"
    action=recreate
  else
    echo "Android AVD $AVD_NAME uses ${actual_sysdir:-(no image)}, expected $expected_sysdir; rerun with --recreate to delete and recreate it" >&2
    status=1
    action=none
  fi
fi
if [ "$action" != none ]; then
  # Make sure the image is there before deleting anything.
  image_ready=1
  if [ ! -d "$SDK/$expected_sysdir" ]; then
    if [ "$INSTALL" = 1 ]; then
      run "$SDKMANAGER" --install "$AVD_IMAGE"
    else
      echo "system image $AVD_IMAGE is not installed; rerun with --install to download it"
      status=1
      image_ready=0
    fi
  fi
  if [ "$image_ready" = 1 ]; then
    if [ "$action" = recreate ]; then
      run "$AVDMANAGER" delete avd --name "$AVD_NAME"
    fi
    # "no" declines the custom hardware profile prompt.
    if [ "$DRY_RUN" = 1 ]; then
      echo "would run: echo no | $AVDMANAGER create avd --name $AVD_NAME --package $AVD_IMAGE --device $AVD_DEVICE"
    else
      echo no | "$AVDMANAGER" create avd --name "$AVD_NAME" --package "$AVD_IMAGE" --device "$AVD_DEVICE"
    fi
  fi
fi

exit "$status"
