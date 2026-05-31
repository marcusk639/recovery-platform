import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

// Initialize Firebase Admin SDK ONCE
if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    console.log("Firebase Admin SDK Initialized.");
  } catch (error) {
    console.error("Firebase Admin SDK initialization failed:", error);
    // Decide how to handle initialization failure - maybe throw?
  }
}

// Export initialized services
export const db = admin.firestore();
export const auth = admin.auth();
export const messaging = getMessaging(admin.app()); // Use getMessaging
