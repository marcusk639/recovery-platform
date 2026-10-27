// React Native CLI configuration, read by autolinking (use_native_modules! in
// ios/Podfile and the Android Gradle plugin).
//
// react-native-launch-arguments is linked on iOS into the e2e configurations
// only. Its JS is required by the emulator variant alone (emulatorPorts() in
// src/config/firebase-emulator.ts), and Debug's Maestro flows pass
// IS_E2E_TEST, which AppDelegate.mm reads itself, so iOS Debug and Release do
// not carry the native module.
//
// The restriction is iOS-only: autolinking has no per-build-type setting on
// Android, so every Android variant links it. That is harmless because nothing
// loads it outside the emulator variant: the require() in emulatorPorts() is
// lazy, and the module's native startup code runs only on first load.
module.exports = {
  dependencies: {
    'react-native-launch-arguments': {
      platforms: {
        ios: { configurations: ['E2EEmulator', 'E2EStaging'] },
      },
    },
  },
};
