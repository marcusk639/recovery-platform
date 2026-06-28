/**
 * Firebase Emulator Configuration for E2E Testing
 *
 * This configures Firebase to use local emulators instead of production
 * when running E2E tests (Maestro / Detox). In __DEV__ builds the emulator
 * connection is always attempted; if emulators aren't running the try/catch
 * silences the failure and Firebase falls back to production.
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Use 127.0.0.1 instead of localhost to avoid IPv6 connection issues
const EMULATOR_HOST = '127.0.0.1';

export const connectToEmulators = () => {
  // In non-dev builds, never connect to emulators.
  if (!__DEV__) {
    return false;
  }

  console.log('[Firebase] DEV mode — connecting to local emulators');

  try {
    // Connect Auth to emulator
    auth().useEmulator(`http://${EMULATOR_HOST}:9099`);
    console.log('[Firebase] ✓ Auth emulator connected');

    // Connect Firestore to emulator
    firestore().useEmulator(EMULATOR_HOST, 8080);
    console.log('[Firebase] ✓ Firestore emulator connected');

    // Connect Storage to emulator
    storage().useEmulator(EMULATOR_HOST, 9199);
    console.log('[Firebase] ✓ Storage emulator connected');

    console.log('[Firebase] All emulators connected successfully');
    return true;
  } catch (error) {
    console.error('[Firebase] Error connecting to emulators:', error);
    return false;
  }
};

/**
 * Check if emulators are running
 */
export const checkEmulatorsRunning = async () => {
  try {
    const response = await fetch(`http://${EMULATOR_HOST}:4000`);
    return response.ok;
  } catch (error) {
    return false;
  }
};
