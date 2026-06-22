import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

// Initialize Firebase Admin SDK ONCE.
// Do NOT swallow init failures: if initializeApp() throws, db/auth/messaging
// below would be constructed from an uninitialized app and every downstream
// call would fail with a cryptic runtime error. Let it crash the container so
// the failure surfaces immediately at deploy/cold-start.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Export initialized services
export const db = admin.firestore();
export const auth = admin.auth();
export const messaging = getMessaging(admin.app()); // Use getMessaging
