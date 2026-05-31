import * as admin from "firebase-admin";
import * as path from "path";
import * as fs from "fs";
import { CONFIG } from "./shared-types";

// Add logging configuration
const LOG_DIR = "./logs";
const SET_LOG_FILE = path.join(LOG_DIR, "set_group_ids.log");

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
 * Log set operations to file
 */
interface SetLogEntry {
  meetingId: string;
  meetingName: string;
  previousGroupId: string | null;
  newGroupId: string | null;
  timestamp: string;
}

function logSetToFile(entry: SetLogEntry): void {
  try {
    fs.appendFileSync(SET_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error(`Failed to write set log for meeting ${entry.meetingId}:`, e);
  }
}

/**
 * Set groupId for all meetings
 */
async function setMeetingGroupIds(value: string | null) {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);

  let totalMeetingsProcessed = 0;
  let totalMeetingsSet = 0;
  let totalMeetingsSkipped = 0;
  let failedSets = 0;

  const valueDescription = value === null ? "null" : `"${value}"`;
  console.log(`Starting groupId set process to ${valueDescription}...`);

  try {
    // Clear set log at start
    if (fs.existsSync(SET_LOG_FILE)) {
      fs.unlinkSync(SET_LOG_FILE);
    }

    // Get total count
    let totalMeetings = 0;
    try {
      const totalMeetingsSnapshot = await meetingsRef
        .where("type", "==", "AA")
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
    const pageSize = 100; // Process 100 meetings at a time
    let hasMore = true;

    while (hasMore) {
      try {
        let query = meetingsRef
          .where("type", "==", "AA")
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
            // Add to batch for set operation
            const meetingRef = meetingsRef.doc(meetingId);
            batch.update(meetingRef, {
              groupId: value,
              updatedAt: admin.firestore.Timestamp.now(),
            });
            operationsInBatch++;

            // Log the set operation (will be committed with batch)
            logSetToFile({
              meetingId: meetingId,
              meetingName: meetingData.name || "N/A",
              previousGroupId: meetingData.groupId || null,
              newGroupId: value,
              timestamp: new Date().toISOString(),
            });

            totalMeetingsSet++;

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
                failedSets += operationsInBatch;
                batch = db.batch();
                operationsInBatch = 0;
              }
            }
          } catch (error) {
            failedSets++;
            console.error(
              `Failed to prepare set for meeting ${meetingId}:`,
              error
            );
          }

          // Log progress periodically
          if (totalMeetingsProcessed % 100 === 0) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `| Set: ${totalMeetingsSet}, Failed: ${failedSets}`
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
            failedSets += operationsInBatch;
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

    console.log("\n--- GroupId Set Complete ---");
    console.log(`Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(`Meetings Set to ${valueDescription}: ${totalMeetingsSet}`);
    console.log(`Failed Sets: ${failedSets}`);
    console.log(`Set log saved to: ${SET_LOG_FILE}`);
    console.log("---------------------------\n");
  } catch (error) {
    console.error("Fatal error in set script execution:", error);
  }
}

// Parse command line arguments
function parseCommandLineArgs(): {
  help: boolean;
  value: string | null;
} {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { help: true, value: null };
  }

  // Look for --value argument
  const valueArg = args.find((arg) => arg.startsWith("--value="));
  let value: string | null = null;

  if (valueArg) {
    const valueStr = valueArg.split("=")[1];
    if (valueStr === "null") {
      value = null;
    } else if (valueStr === "empty") {
      value = "";
    } else {
      value = valueStr;
    }
  } else {
    // Default to empty string if no value specified
    value = "";
  }

  return { help: false, value };
}

// Execute the script
const { help, value } = parseCommandLineArgs();

if (help) {
  console.log(`
Usage: npx ts-node setMeetingGroupIds.ts [options]

Options:
  --value=<value>            Set groupId to specific value
  --help, -h                 Show this help message

Value Options:
  --value=null               Set groupId to null
  --value=empty              Set groupId to empty string ""
  --value=specificId         Set groupId to a specific string value
  (default: empty string if no --value specified)

Examples:
  npx ts-node setMeetingGroupIds.ts
  npx ts-node setMeetingGroupIds.ts --value=null
  npx ts-node setMeetingGroupIds.ts --value=empty
  npx ts-node setMeetingGroupIds.ts --value=abc123
  npx ts-node setMeetingGroupIds.ts --help

Warning:
  This will modify ALL meeting groupIds!
  Make sure you have a backup before running this script.
  `);
  process.exit(0);
}

// Confirmation prompt
const valueDescription = value === null ? "null" : `"${value}"`;
console.log(
  `⚠️  WARNING: This will set ALL meeting groupIds to ${valueDescription}!`
);
console.log("This action cannot be undone. Make sure you have a backup.");
console.log("Press Ctrl+C to cancel, or wait 5 seconds to continue...");

// Wait 5 seconds before proceeding
setTimeout(async () => {
  try {
    await setMeetingGroupIds(value);
    console.log("Set script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  } catch (error) {
    console.error("Set script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  }
}, 5000);
