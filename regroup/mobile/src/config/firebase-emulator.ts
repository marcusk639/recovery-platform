/**
 * Firebase Emulator Configuration for E2E Testing
 *
 * This configures Firebase to use local emulators instead of production
 * when running E2E tests with Detox.
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import { Settings } from 'react-native';

// Use 127.0.0.1 instead of localhost to avoid IPv6 connection issues
const EMULATOR_HOST = '127.0.0.1';

export const connectToEmulators = () => {
  // Check if we're in E2E test mode via launch arg set by Detox
  const isE2ETest = __DEV__ && Settings.get('IS_E2E_TEST') === '1';

  if (!isE2ETest) {
    console.log('[Firebase] Not in E2E mode, using production Firebase');
    return false;
  }

  console.log('[Firebase] E2E mode detected - connecting to emulators');

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
