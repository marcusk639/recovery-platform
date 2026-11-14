/**
 * The Admin SDK handle for the integration suite: seeding, cleaning up and
 * checking data directly. It bypasses the security rules, so it never stands
 * in for a user: services under test run on the client SDK (rnfb-to-web.ts)
 * as a signed-in user (actors.ts). It reaches the emulators through the
 * *_EMULATOR_HOST variables, which emulator-env.ts checks.
 */
import * as admin from 'firebase-admin';
import { emulatorPort, integrationProjectId } from './emulator-env';

emulatorPort('FIRESTORE_EMULATOR_HOST');
emulatorPort('FIREBASE_AUTH_EMULATOR_HOST');

const app = admin.apps.length
  ? admin.app()
  : admin.initializeApp({ projectId: integrationProjectId() });

export const adminDb = app.firestore();
adminDb.settings({ ignoreUndefinedProperties: true });

export const adminAuth = app.auth();
