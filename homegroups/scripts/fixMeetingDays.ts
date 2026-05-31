import { Firestore, FieldValue, Timestamp } from "@google-cloud/firestore";
import * as admin from "firebase-admin";
import * as path from "path";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json";
const FIRESTORE_COLLECTION = "meetings";
const BATCH_SIZE = 400;
const DELAY_MS = 500;
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 1000;

// Day mapping
const DAY_MAP: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Saturday", // Some meetings might use 7 for Saturday
};

// Function to initialize Firebase Admin SDK
function initializeFirebaseAdmin(): admin.app.App {
  if (!SERVICE_ACCOUNT_PATH) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set."
    );
  }
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  console.log("Initializing Firebase Admin SDK...");
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Function to check if a value is a number
function isNumber(value: any): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && !isNaN(Number(value)))
  );
}

// Function to convert numeric day to day name
function convertDayToName(day: any): string {
  if (isNumber(day)) {
    const numericDay = Number(day);
    if (numericDay >= 0 && numericDay <= 7) {
      return DAY_MAP[numericDay];
    }
  }
  return day; // Return original value if not a valid number
}

// Main function to fix meeting days
async function fixMeetingDays() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  const meetingsCollection = db.collection(FIRESTORE_COLLECTION);
  let batch = db.batch();
  let meetingsInBatch = 0;
  let totalMeetingsUpdated = 0;
  let totalMeetingsProcessed = 0;

  console.log(`Starting meeting day fix...`);

  try {
    // Get all meetings
    const snapshot = await meetingsCollection.get();
    console.log(`Found ${snapshot.size} meetings to process`);

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const day = data.day;

      // Check if day is a number and needs to be converted
      if (isNumber(day)) {
        const newDay = convertDayToName(day);
        if (newDay !== day) {
          const docRef = meetingsCollection.doc(doc.id);
          batch.update(docRef, { day: newDay });
          meetingsInBatch++;
          totalMeetingsUpdated++;
        }
      }

      totalMeetingsProcessed++;

      // Commit batch if it reaches the batch size
      if (meetingsInBatch >= BATCH_SIZE) {
        try {
          console.log(`Committing batch of ${meetingsInBatch} updates...`);
          await batch.commit();
          console.log("Batch committed successfully.");
        } catch (error) {
          console.error("Error committing batch:", error);
        } finally {
          batch = db.batch();
          meetingsInBatch = 0;
        }
      }

      // Delay between operations
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }

    // Commit any remaining updates in the last batch
    if (meetingsInBatch > 0) {
      try {
        console.log(`Committing final batch of ${meetingsInBatch} updates...`);
        await batch.commit();
        console.log("Final batch committed successfully.");
      } catch (error) {
        console.error("Error committing final batch:", error);
      }
    }

    console.log("\n--- Fix Complete ---");
    console.log(`Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(`Total Meetings Updated: ${totalMeetingsUpdated}`);
    console.log("---------------------------\n");
  } catch (error) {
    console.error("Error processing meetings:", error);
  } finally {
    // Clean up Firebase app instance
    await app.delete();
  }
}

// Execute the script
fixMeetingDays()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    process.exit(1);
  });
