import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { CONFIG } from "./shared-types";

// Initialize Firebase Admin SDK
function initializeFirebaseAdmin(): admin.app.App {
  try {
    console.log("Initializing Firebase Admin SDK...");
    return admin.initializeApp({
      credential: admin.credential.cert(require(CONFIG.SERVICE_ACCOUNT_PATH)),
    });
  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    process.exit(1);
  }
}

// Log orphaned meetings to a file
function logOrphanedMeeting(
  meetingId: string,
  groupId: string,
  meetingName: string
): void {
  try {
    const logEntry = `Meeting ID: ${meetingId}, Group ID: ${groupId}, Meeting Name: "${meetingName}"\n`;
    fs.appendFileSync("./logs/orphaned_meetings.log", logEntry);
  } catch (e) {
    console.error("Failed to write to orphaned meetings log:", e);
  }
}

async function fixOrphanedMeetings() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  // Ensure log directory exists
  if (!fs.existsSync("./logs")) {
    fs.mkdirSync("./logs", { recursive: true });
  }

  // Clear previous log
  if (fs.existsSync("./logs/orphaned_meetings.log")) {
    fs.unlinkSync("./logs/orphaned_meetings.log");
  }

  console.log("Starting orphaned meetings fix process...");

  let totalMeetingsChecked = 0;
  let orphanedMeetings = 0;
  let fixedMeetings = 0;
  let failedFixes = 0;

  try {
    // Get all meetings with groupIds
    const meetingsSnapshot = await meetingsRef
      .where("groupId", "!=", null)
      .get();

    console.log(`Found ${meetingsSnapshot.docs.length} meetings with groupIds`);

    // Process in batches to avoid memory issues
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < meetingsSnapshot.docs.length; i += batchSize) {
      batches.push(meetingsSnapshot.docs.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      console.log(`Processing batch of ${batch.length} meetings...`);

      // Get all groupIds from this batch
      const groupIds = batch.map((doc) => doc.data().groupId).filter(Boolean);

      // Check which groups exist
      const existingGroups = new Set<string>();
      if (groupIds.length > 0) {
        const groupsSnapshot = await groupsRef
          .where(admin.firestore.FieldPath.documentId(), "in", groupIds)
          .get();

        groupsSnapshot.docs.forEach((doc) => {
          existingGroups.add(doc.id);
        });
      }

      // Process each meeting in this batch
      for (const meetingDoc of batch) {
        totalMeetingsChecked++;
        const meetingData = meetingDoc.data();
        const meetingId = meetingDoc.id;
        const groupId = meetingData.groupId;

        if (!groupId) continue;

        if (!existingGroups.has(groupId)) {
          // This meeting has an orphaned groupId
          orphanedMeetings++;
          console.log(
            `Orphaned meeting: ${meetingId} -> Group: ${groupId} (${meetingData.name})`
          );
          logOrphanedMeeting(meetingId, groupId, meetingData.name || "N/A");

          // Try to fix by removing the groupId
          try {
            await meetingsRef.doc(meetingId).update({
              groupId: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.Timestamp.now(),
            });
            fixedMeetings++;
            console.log(
              `✓ Fixed meeting ${meetingId} by removing orphaned groupId`
            );
          } catch (error) {
            failedFixes++;
            console.error(`✗ Failed to fix meeting ${meetingId}:`, error);
          }
        }
      }

      // Add a small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n--- Orphaned Meetings Fix Complete ---");
    console.log(`Total meetings checked: ${totalMeetingsChecked}`);
    console.log(`Orphaned meetings found: ${orphanedMeetings}`);
    console.log(`Meetings fixed: ${fixedMeetings}`);
    console.log(`Failed fixes: ${failedFixes}`);
    console.log(`Orphaned meetings log: ./logs/orphaned_meetings.log`);
    console.log("------------------------------------\n");
  } catch (error) {
    console.error("Error in orphaned meetings fix process:", error);
  }
}

// Execute the script
fixOrphanedMeetings()
  .then(() => {
    console.log("Script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
