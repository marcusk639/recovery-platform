// functions/src/triggers/pubsub/scheduledDailyReflection.ts
import * as functionsV1 from "firebase-functions/v1";
import * as functions from "firebase-functions";
import { db, messaging } from "../../utils/firebase";
import { REFLECTIONS_365 } from "../../utils/reflectionsLibrary";

export const DAILY_REFLECTIONS = [
  {
    title: "One Day at a Time",
    body: "Recovery is a journey taken one day at a time. Today is all you need to focus on.",
  },
  {
    title: "Progress, Not Perfection",
    body: "You don't have to be perfect. Progress toward recovery is what matters.",
  },
  {
    title: "Gratitude Opens Doors",
    body: "Start today by naming three things you're grateful for. Gratitude shifts perspective.",
  },
  {
    title: "You Are Not Alone",
    body: "Thousands of others are walking this road with you. Reach out to your group today.",
  },
  {
    title: "Keep It Simple",
    body: "When life feels overwhelming, return to the basics. One breath. One moment. One step.",
  },
  {
    title: "Service Heals",
    body: "Helping someone else today is one of the most powerful tools in recovery.",
  },
  {
    title: "The Present Moment",
    body: "The past is behind you and the future isn't here yet. All you have is now — use it wisely.",
  },
  {
    title: "Ask For Help",
    body: "Strength in recovery means knowing when to ask for help. Reach out to your sponsor today.",
  },
  {
    title: "Your Story Matters",
    body: "Every day you stay in recovery, you write a new chapter. Your story inspires others.",
  },
  {
    title: "Small Steps, Big Change",
    body: "Big changes happen through small daily actions. Keep showing up.",
  },
  {
    title: "Surrender to Win",
    body: "Letting go of what you cannot control is freedom. Trust the process.",
  },
  {
    title: "Honesty Heals",
    body: "Being honest with yourself and others is the foundation of lasting recovery.",
  },
  {
    title: "Community Is Strength",
    body: "No one recovers alone. Lean into your community — they want to support you.",
  },
  {
    title: "Celebrate Today",
    body: "Every sober day is a victory. Acknowledge how far you've come.",
  },
];

export function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function getReflectionForDay(dayOfYear: number): { title: string; body: string } {
  // Use REFLECTIONS_365 if available (index is 0-based, dayOfYear is 1-based)
  const idx = (dayOfYear - 1) % REFLECTIONS_365.length;
  const r365 = REFLECTIONS_365[idx];
  if (r365) {
    return { title: r365.title, body: r365.body };
  }
  // Ultimate fallback to original 14-entry array
  return DAILY_REFLECTIONS[dayOfYear % DAILY_REFLECTIONS.length];
}

/**
 * Runs daily at 09:00 UTC.
 * Sends a daily reflection push to all opted-in users.
 */
export const scheduledDailyReflection = functionsV1.pubsub
  .schedule("0 9 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const dayOfYear = getDayOfYear(new Date());

    // Try to fetch reflection from Firestore first (V4.2.1)
    let reflection: { title: string; body: string };
    try {
      const docId = dayOfYear.toString().padStart(3, "0");
      const firestoreDoc = await db
        .collection("daily_reflections")
        .doc(docId)
        .get();
      if (firestoreDoc.exists) {
        const data = firestoreDoc.data()!;
        reflection = { title: data.title, body: data.body };
        functions.logger.info(
          `Using Firestore reflection for day ${dayOfYear}: "${reflection.title}"`
        );
      } else {
        // Fall back to hardcoded array if collection not yet seeded
        reflection = getReflectionForDay(dayOfYear);
        functions.logger.info(
          `Firestore doc not found for day ${dayOfYear}, using fallback: "${reflection.title}"`
        );
      }
    } catch (err) {
      // Fall back to hardcoded array on any error
      reflection = getReflectionForDay(dayOfYear);
      functions.logger.warn(
        `Error fetching Firestore reflection, using fallback:`,
        err
      );
    }

    // Get all users and filter for those who want daily reflections
    const usersSnap = await db.collection("users").get();

    const tokens: string[] = [];
    usersSnap.docs.forEach((doc) => {
      const data = doc.data();
      const pushEnabled = data.notificationSettings?.allowPushNotifications !== false;
      const wantsReflections = data.notificationSettings?.dailyReflection !== false &&
        data.notificationSettings?.dailyReflections !== false;
      if (pushEnabled && wantsReflections && data.fcmTokens?.length) {
        tokens.push(...data.fcmTokens);
      }
    });

    if (tokens.length === 0) {
      functions.logger.info("No eligible recipients for daily reflection.");
      return null;
    }

    // Send in batches of 500 (FCM multicast limit)
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: reflection.title,
          body: reflection.body,
        },
        data: {
          type: "daily_reflection",
          dayOfYear: String(dayOfYear),
        },
        android: { priority: "normal" },
        apns: { payload: { aps: { sound: "default" } } },
      });
    }

    functions.logger.info(
      `Daily reflection sent to ${tokens.length} tokens: "${reflection.title}"`,
    );
    return null;
  });
