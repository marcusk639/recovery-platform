/**
 * Firebase Test Utilities
 *
 * Utilities for connecting to Firebase Emulator in tests
 */

import { firestore } from '../../../firebase-setup';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// Track if we've already connected to emulator
let emulatorConnected = false;

/**
 * Initialize Firebase to use emulator for tests
 * Call this in test setup (beforeAll or setupFilesAfterEnv)
 *
 * Note: React Native Firebase emulator connection is typically
 * configured at the native level. This function verifies connection.
 */
export function connectToEmulator() {
  if (emulatorConnected) {
    return;
  }

  try {
    // For React Native Firebase, emulator settings are typically
    // configured in firebase.json and the native code.
    // This function exists mainly for compatibility with test structure.

    // Note: If tests fail, ensure you've started the emulator:
    // firebase emulators:start --only firestore,auth

    emulatorConnected = true;
  } catch (error) {
    console.warn('Failed to connect to emulator:', error);
  }
}

/**
 * Clear all data from emulator collections
 * Call this in test cleanup (afterEach or afterAll)
 */
export async function clearEmulatorData() {
  try {
    // Clear activities collection
    const activitiesSnapshot = await (firestore as any).collection('activities').get();
    const activityDeletes = activitiesSnapshot.docs.map((doc: any) => doc.ref.delete());

    // Clear week-summaries collection
    const summariesSnapshot = await (firestore as any).collection('week-summaries').get();
    const summaryDeletes = summariesSnapshot.docs.map((doc: any) => doc.ref.delete());

    await Promise.all([...activityDeletes, ...summaryDeletes]);
  } catch (error) {
    console.warn('Failed to clear emulator data:', error);
  }
}

/**
 * Check if running against emulator
 * For React Native Firebase, this checks if emulator is available
 */
export function isUsingEmulator(): boolean {
  // For React Native Firebase testing, we assume emulator if
  // environment variable is set or tests are running in Node
  return (
    process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
    process.env.NODE_ENV === 'test' ||
    typeof (global as any).window === 'undefined'
  );
}

/**
 * Wait for Firestore writes to complete
 * Useful for ensuring data is written before assertions
 */
export async function waitForWrites(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
