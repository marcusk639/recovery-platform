// functions/src/callable/recordCheckIn.ts
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import { requireAuth } from "../utils/callableWrapper";

interface CheckInResult {
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: string;
  isNewDay: boolean;
}

export const recordCheckIn = onCall(
  async (request: CallableRequest): Promise<CheckInResult> => {
    const userId = requireAuth(request);
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD in UTC

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found.");
    }

    const existing = userDoc.data()!.checkInStreak || {
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: "",
    };

    if (existing.lastCheckInDate === today) {
      // Already checked in today — return current values unchanged
      return { ...existing, isNewDay: false };
    }

    // Check if last check-in was yesterday (streak continues)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let newStreak = 1;
    if (existing.lastCheckInDate === yesterdayStr) {
      newStreak = existing.currentStreak + 1;
    }

    const newLongest = Math.max(existing.longestStreak, newStreak);

    const updated = {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastCheckInDate: today,
    };

    await userRef.update({
      checkInStreak: updated,
      lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ...updated, isNewDay: true };
  },
);
