import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { CONFIG } from "./shared-types";

// Add logging configuration
const LOG_DIR = "./logs";
const RESET_LOG_FILE = path.join(LOG_DIR, "reset_group_ids.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Initialize Firebase Admin SDK
 */
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

/**
 * Log reset operations to file
 */
interface ResetLogEntry {
  meetingId: string;
  meetingName: string;
  previousGroupId: string | null;
  timestamp: string;
}

function logResetToFile(entry: ResetLogEntry): void {
  try {
    fs.appendFileSync(RESET_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error(
      `Failed to write reset log for meeting ${entry.meetingId}:`,
      e
    );
  }
}

/**
 * Reset groupId for all meetings
 */
async function resetMeetingGroupIds() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);

  let totalMeetingsProcessed = 0;
  let totalMeetingsReset = 0;
  let totalMeetingsSkipped = 0;
  let failedResets = 0;

  console.log("Starting groupId reset process...");

  try {
    // Clear reset log at start
    if (fs.existsSync(RESET_LOG_FILE)) {
      fs.unlinkSync(RESET_LOG_FILE);
    }

    // Get total count
    let totalMeetings = 0;
    try {
      const totalMeetingsSnapshot = await meetingsRef
        .where("type", "==", "AA")
        .where("groupId", "!=", "")
        .count()
        .get();
      totalMeetings = totalMeetingsSnapshot.data().count;
      console.log(`Found ${totalMeetings} AA meetings to process.`);
    } catch (countError) {
      console.error("Error getting meeting count:", countError);
      console.log("Proceeding without total count...");
    }

    // Process meetings in batches
    let lastDoc = null;
    const pageSize = 1000; // Process 100 meetings at a time
    let hasMore = true;

    while (hasMore) {
      try {
        // Note: When using != operator, Firestore requires ordering by that field first
        let query = meetingsRef
          .where("type", "==", "AA")
          .where("groupId", "!=", "")
          .orderBy("groupId")
          .orderBy("__name__")
          .limit(pageSize);

        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        console.log(`Processing batch of ${snapshot.docs.length} meetings...`);

        // Process meetings in batch
        let batch = db.batch();
        let operationsInBatch = 0;
        const maxBatchSize = 500; // Firestore batch limit

        for (const meetingDoc of snapshot.docs) {
          totalMeetingsProcessed++;
          const meetingData = meetingDoc.data();
          const meetingId = meetingDoc.id;

          try {
            // Check if meeting has a groupId
            if (meetingData.groupId) {
              // Add to batch for reset
              const meetingRef = meetingsRef.doc(meetingId);
              batch.update(meetingRef, {
                groupId: "",
                updatedAt: admin.firestore.Timestamp.now(),
              });
              operationsInBatch++;

              // Log the reset (will be committed with batch)
              logResetToFile({
                meetingId: meetingId,
                meetingName: meetingData.name || "N/A",
                previousGroupId: meetingData.groupId,
                timestamp: new Date().toISOString(),
              });

              totalMeetingsReset++;

              // Commit batch if it's full
              if (operationsInBatch >= maxBatchSize) {
                try {
                  await batch.commit();
                  console.log(
                    `Committed batch of ${operationsInBatch} operations`
                  );
                  batch = db.batch();
                  operationsInBatch = 0;
                } catch (batchError) {
                  console.error("Error committing batch:", batchError);
                  failedResets += operationsInBatch;
                  batch = db.batch();
                  operationsInBatch = 0;
                }
              }
            } else {
              totalMeetingsSkipped++;
            }
          } catch (error) {
            failedResets++;
            console.error(
              `Failed to prepare reset for meeting ${meetingId}:`,
              error
            );
          }

          // Log progress periodically
          if (totalMeetingsProcessed % 100 === 0) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `| Reset: ${totalMeetingsReset}, Skipped: ${totalMeetingsSkipped}, Failed: ${failedResets}`
            );
          }
        }

        // Commit any remaining operations in the batch
        if (operationsInBatch > 0) {
          try {
            await batch.commit();
            console.log(
              `Committed final batch of ${operationsInBatch} operations`
            );
          } catch (batchError) {
            console.error("Error committing final batch:", batchError);
            failedResets += operationsInBatch;
          }
        }

        // Update cursor for next iteration
        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        // If we got fewer documents than requested, we've reached the end
        if (snapshot.docs.length < pageSize) {
          hasMore = false;
        }

        // Add a small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (batchError: any) {
        console.error("Error processing batch:", batchError);
        // Continue with next batch
        if (lastDoc) {
          const continueQuery = meetingsRef
            .where("type", "==", "AA")
            .where("groupId", "!=", "")
            .orderBy("groupId")
            .orderBy("__name__")
            .startAfter(lastDoc)
            .limit(1);
          const continueSnapshot = await continueQuery.get();
          if (!continueSnapshot.empty) {
            lastDoc = continueSnapshot.docs[0];
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    }

    console.log("\n--- GroupId Reset Complete ---");
    console.log(`Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(`Meetings Reset: ${totalMeetingsReset}`);
    console.log(`Meetings Skipped (No groupId): ${totalMeetingsSkipped}`);
    console.log(`Failed Resets: ${failedResets}`);
    console.log(`Reset log saved to: ${RESET_LOG_FILE}`);
    console.log("-----------------------------\n");
  } catch (error) {
    console.error("Fatal error in reset script execution:", error);
  }
}

// Parse command line arguments
function parseCommandLineArgs(): { help: boolean } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  return { help: false };
}

// Execute the script
const { help } = parseCommandLineArgs();

if (help) {
  console.log(`
Usage: npx ts-node resetMeetingGroupIds.ts [options]

Options:
  --help, -h                 Show this help message

Description:
  This script resets the groupId field of all AA meetings to an empty string.
  This is useful for testing or resetting the seeding process.

Examples:
  npx ts-node resetMeetingGroupIds.ts
  npx ts-node resetMeetingGroupIds.ts --help

Warning:
  This will remove all existing group associations from meetings!
  Make sure you have a backup before running this script.
  `);
  process.exit(0);
}

// Confirmation prompt
console.log(
  "⚠️  WARNING: This will reset ALL meeting groupIds to empty strings!"
);
console.log("This action cannot be undone. Make sure you have a backup.");
console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...");

// Wait 5 seconds before proceeding
setTimeout(async () => {
  try {
    await resetMeetingGroupIds();
    console.log("Reset script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  } catch (error) {
    console.error("Reset script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  }
}, 5000);
