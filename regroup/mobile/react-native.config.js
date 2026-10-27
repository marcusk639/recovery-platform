// React Native CLI configuration, read by autolinking (use_native_modules! in
// ios/Podfile and the Android Gradle plugin).
//
// react-native-launch-arguments is linked on iOS into the e2e configurations
// only. Its JS is required by the emulator variant alone (emulatorPorts() in
// src/config/firebase-emulator.ts), and Debug's Maestro flows pass
// IS_E2E_TEST, which AppDelegate.mm reads itself, so Debug and Release do not
// carry the native module.
module.exports = {
  dependencies: {
    'react-native-launch-arguments': {
      platforms: {
        ios: { configurations: ['E2EEmulator', 'E2EStaging'] },
      },
    },
  },
};
