// scripts/cleanMeetings.ts
//
// Purpose: Remove duplicate meetings where one has a groupId and one does not.
// When duplicate meetings are found (same name, day, time, and location),
// the meeting WITHOUT a groupId is deleted, preserving the grouped meeting.
//
// Usage:
//   ts-node cleanMeetings.ts           # Live mode - deletes ungrouped duplicates
//   ts-node cleanMeetings.ts --dry-run # Dry run - shows what would be deleted

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json"; // Adjust path relative to script location
const MEETINGS_COLLECTION = "meetings";
const BATCH_DELETE_SIZE = 400; // Firestore batch limit is 500
const COORDINATE_PRECISION = 5; // How many decimal places to match coordinates
const LOG_FILE = "./ungrouped_meetings_deleted.log";

// --- Interfaces ---
// Ensure this matches your Firestore structure accurately
interface Meeting {
  id?: string; // Document ID
  groupId?: string; // If grouped by the previous script
  name: string;
  day?: string | number; // e.g., "monday", "0" etc. Needs normalization
  time?: string; // e.g., "19:00"
  lat?: number;
  lng?: number;
  link?: string | null; // Allow null for link
  address?: string;
  city?: string;
  state?: string;
  // Add any other fields present in your documents
  [key: string]: any; // Allow other fields
}

// --- Helper Functions ---

function initializeFirebaseAdmin(): admin.app.App {
  try {
    console.log("Initializing Firebase Admin SDK...");
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    process.exit(1);
  }
}

function normalizeString(str?: string): string {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim(); // Lowercase, collapse whitespace, trim
}

function roundCoordinate(
  num: number | undefined,
  precision: number
): number | undefined {
  if (num === undefined) return undefined;
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
}

// Normalize day: convert numeric day (0-6, Sun-Sat) or full names to lowercase abbreviation
function normalizeDay(day?: string): string | null {
  if (!day) return null;
  const dayStr = String(day).toLowerCase().trim();
  const dayMap: { [key: string]: string } = {
    "0": "sun",
    sunday: "sun",
    "1": "mon",
    monday: "mon",
    "2": "tue",
    tuesday: "tue",
    "3": "wed",
    wednesday: "wed",
    "4": "thu",
    thursday: "thu",
    "5": "fri",
    friday: "fri",
    "6": "sat",
    saturday: "sat",
  };
  // Also handle abbreviated inputs
  const abbrMap: { [key: string]: string } = {
    sun: "sun",
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
  };
  return dayMap[dayStr] || abbrMap[dayStr] || null; // Return standard abbreviation or null if invalid
}

// Normalize time: Ensure HH:MM format
function normalizeTime(time?: string): string | null {
  if (!time) return null;
  const timeStr = String(time).trim();
  // Basic check for HH:MM format (can be enhanced)
  // should handle format 12:00:00 or 12:00 or 12:00 PM
  if (
    /^\d{1,2}:\d{2}:\d{2}$/.test(timeStr) ||
    /^\d{1,2}:\d{2}$/.test(timeStr) ||
    /^\d{1,2}:\d{2} (AM|PM)$/.test(timeStr)
  ) {
    const parts = timeStr.split(":");
    const hour = parts[0].padStart(2, "0");
    const minute = parts[1];
    return `${hour}:${minute}`;
  }
  // Try to parse less common formats if needed (e.g., "7pm") - requires more complex logic
  // For now, just warn if format is unexpected
  // console.warn(`Unsupported time format encountered: ${timeStr}`);
  return null; // Treat unsupported formats as invalid for key generation
}

/**
 * Generates a canonical key to identify logically duplicate meetings.
 * This key is used to match ungrouped meetings with grouped ones.
 * NOTE: This function does NOT use groupId in the key, as we want to match
 * ungrouped meetings to grouped ones regardless of groupId.
 */
function generateDuplicateCheckKey(meeting: Meeting): string | null {
  const normName = normalizeString(meeting.name);
  const normDay = normalizeDay(
    typeof meeting.day === "string"
      ? meeting.day.toLowerCase()
      : meeting.day?.toString().toLowerCase()
  );
  const normTime = normalizeTime(meeting.time);

  if (!normName || !normDay || !normTime) {
    // Missing essential info to determine uniqueness
    console.warn(
      `Skipping meeting ${meeting.id}: Missing essential data (name, day, or time) for key generation. Name: ${meeting.name}, Day: ${meeting.day}, Time: ${meeting.time}`
    );
    return null;
  }

  // Priority 1: Online meeting link
  if (meeting.link) {
    const normLink = normalizeString(meeting.link)
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    // Include name for online meetings as link might be reused contextually
    return `LINK|${normLink}|${normName}|${normDay}|${normTime}`;
  }

  // Priority 2: In-person location coordinates
  if (meeting.lat !== undefined && meeting.lng !== undefined) {
    const lat = roundCoordinate(meeting.lat, COORDINATE_PRECISION);
    const lng = roundCoordinate(meeting.lng, COORDINATE_PRECISION);
    if (lat !== undefined && lng !== undefined) {
      // Include name for coordinate-based key as multiple groups/meetings might be at same coords
      return `COORD|${lat}|${lng}|${normName}|${normDay}|${normTime}`;
    }
  }

  // Fallback: Address string (least reliable, use as last resort)
  const locationString = normalizeString(
    `${meeting.address || ""}-${meeting.city || ""}-${meeting.state || ""}`
  );
  if (locationString && locationString !== "--") {
    return `ADDR|${locationString}|${normName}|${normDay}|${normTime}`;
  }

  // Cannot determine uniqueness
  return null;
}

/**
 * Commits a batch of delete operations or logs them in dry run mode.
 */
async function commitDeleteBatch(
  batch: admin.firestore.WriteBatch | null, // Batch can be null in dry run
  idsToDelete: string[],
  logStream: fs.WriteStream,
  isDryRun: boolean
): Promise<void> {
  if (idsToDelete.length === 0) return;

  const action = isDryRun ? "WOULD DELETE" : "DELETING";
  console.log(`Batch: ${action} ${idsToDelete.length} duplicate meetings...`);

  // Log IDs that would be/are being deleted
  idsToDelete.forEach((id) =>
    logStream.write(`${new Date().toISOString()} - ${action}: ${id}\n`)
  );

  if (isDryRun || !batch) {
    // console.log(`(Dry Run) Skipped actual deletion of ${idsToDelete.length} documents.`);
    return; // Skip commit in dry run mode or if batch is null
  }

  // --- Actual Deletion ---
  try {
    await batch.commit();
    console.log(`Successfully deleted ${idsToDelete.length} documents.`);
    // Log confirmation (optional)
    // idsToDelete.forEach(id => logStream.write(`${new Date().toISOString()} - CONFIRMED DELETE: ${id}\n`));
  } catch (error) {
    console.error("Error committing delete batch:", error);
    idsToDelete.forEach((id) =>
      logStream.write(
        `${new Date().toISOString()} - FAILED BATCH DELETE for ID: ${id} - Error: ${error}\n`
      )
    );
    // Optionally re-throw or handle more gracefully
  }
}

// --- Main Script Logic ---

async function cleanupDuplicateMeetings() {
  // Check for --dry-run flag
  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log("\n--- RUNNING IN DRY RUN MODE ---");
    console.log("--- No documents will be deleted. ---");
  } else {
    console.log("\n--- RUNNING IN LIVE DELETION MODE ---");
    console.log(
      "--- Ungrouped meetings with grouped duplicates WILL be deleted. ---"
    );
  }

  initializeFirebaseAdmin();
  const db = admin.firestore();
  const meetingsRef = db.collection(MEETINGS_COLLECTION);

  // Map to store grouped meetings by their canonical key
  const groupedMeetings = new Map<string, { id: string; meeting: Meeting }>();
  // Array to store ungrouped meetings for processing
  const ungroupedMeetings: Array<{
    id: string;
    meeting: Meeting;
    key: string | null;
  }> = [];

  let documentsProcessed = 0;
  let groupedCount = 0;
  let ungroupedCount = 0;
  let skippedNoKey = 0;

  // Create/clear log file
  const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
  console.log(`Logging actions to ${LOG_FILE}`);
  logStream.write(
    `--- Ungrouped Meeting Cleanup Started: ${new Date().toISOString()} --- ${
      isDryRun ? "(Dry Run)" : ""
    }\n`
  );
  logStream.write(
    `Purpose: Remove ungrouped meetings that have matching grouped meetings\n`
  );

  console.log("Starting meeting cleanup process...");
  console.log("Step 1: Streaming and categorizing meetings collection...");

  try {
    const meetingStream = meetingsRef.stream();

    // First pass: Separate grouped and ungrouped meetings
    for await (const meetingDoc of meetingStream as AsyncIterable<admin.firestore.QueryDocumentSnapshot>) {
      documentsProcessed++;
      const meetingData = meetingDoc.data() as Meeting;
      meetingData.id = meetingDoc.id; // Store the Firestore ID

      const duplicateKey = generateDuplicateCheckKey(meetingData);

      if (!duplicateKey) {
        skippedNoKey++;
        logStream.write(
          `${new Date().toISOString()} - SKIPPED (No Key): ${
            meetingData.id
          } - ${meetingData.name} (groupId: ${meetingData.groupId || "none"})\n`
        );
        continue;
      }

      if (meetingData.groupId) {
        // This meeting has a groupId - store it for matching
        groupedMeetings.set(duplicateKey, {
          id: meetingData.id,
          meeting: meetingData,
        });
        groupedCount++;
      } else {
        // This meeting does NOT have a groupId - store for later comparison
        ungroupedMeetings.push({
          id: meetingData.id,
          meeting: meetingData,
          key: duplicateKey,
        });
        ungroupedCount++;
      }

      if (documentsProcessed % 1000 === 0) {
        console.log(
          `Processed ${documentsProcessed} documents... Found ${groupedCount} grouped, ${ungroupedCount} ungrouped so far.`
        );
      }
    }

    console.log("\n--- Matching Phase ---");
    console.log(`Finished processing ${documentsProcessed} documents.`);
    console.log(`Found ${groupedCount} meetings with groupId`);
    console.log(`Found ${ungroupedCount} meetings without groupId`);
    console.log(`Skipped ${skippedNoKey} documents due to missing key data.`);

    // Second pass: Find ungrouped meetings that match grouped ones
    const duplicatesToDelete: string[] = [];

    console.log(
      "\nChecking ungrouped meetings for matches with grouped meetings..."
    );
    for (const ungrouped of ungroupedMeetings) {
      if (!ungrouped.key) continue;

      if (groupedMeetings.has(ungrouped.key)) {
        // Found a match! This ungrouped meeting has a grouped duplicate
        const matchedGrouped = groupedMeetings.get(ungrouped.key)!;
        duplicatesToDelete.push(ungrouped.id);
        logStream.write(
          `${new Date().toISOString()} - MARKED FOR DELETION (Ungrouped duplicate): ${
            ungrouped.id
          } - "${ungrouped.meeting.name}" (Key: ${ungrouped.key})\n`
        );
        logStream.write(
          `${new Date().toISOString()} - MATCHED WITH (Grouped): ${
            matchedGrouped.id
          } - "${matchedGrouped.meeting.name}" (groupId: ${
            matchedGrouped.meeting.groupId
          })\n`
        );
      }
    }

    console.log("\n--- Deletion Phase ---");
    console.log(
      `Found ${
        duplicatesToDelete.length
      } ungrouped meetings that match grouped meetings ${
        isDryRun ? "to delete" : "for deletion"
      }.`
    );

    if (duplicatesToDelete.length === 0) {
      console.log("No duplicates found to delete.");
      logStream.write("--- No duplicates found ---\n");
      logStream.end(); // Close the log stream
      return;
    }

    let deleteBatch = isDryRun ? null : db.batch(); // Only create batch if not dry run
    let idsInBatch: string[] = [];
    let totalDeletedCount = 0; // Only count actual deletions if not dry run

    for (let i = 0; i < duplicatesToDelete.length; i++) {
      const docId = duplicatesToDelete[i];
      idsInBatch.push(docId); // Add ID to current batch list (for logging)

      if (!isDryRun && deleteBatch) {
        const docRef = meetingsRef.doc(docId);
        deleteBatch.delete(docRef); // Add delete operation to Firestore batch if not dry run
      }

      // Commit when batch is full OR it's the last item
      if (
        idsInBatch.length >= BATCH_DELETE_SIZE ||
        i === duplicatesToDelete.length - 1
      ) {
        await commitDeleteBatch(deleteBatch, idsInBatch, logStream, isDryRun);
        if (!isDryRun) {
          totalDeletedCount += idsInBatch.length; // Increment actual delete count
        }
        // Reset for next batch
        if (!isDryRun) {
          deleteBatch = db.batch(); // Start a new batch only if not dry run
        }
        idsInBatch = []; // Reset batch list
        // Add delay only if actually deleting and not the last batch
        if (!isDryRun && i < duplicatesToDelete.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 60)); // Slightly longer delay
        }
      }
    }

    console.log(`\n--- Cleanup Complete ${isDryRun ? "(Dry Run)" : ""} ---`);
    console.log(`Total Documents Processed: ${documentsProcessed}`);
    console.log(`Grouped Meetings: ${groupedCount}`);
    console.log(`Ungrouped Meetings: ${ungroupedCount}`);
    console.log(`Documents Skipped (Missing Key Data): ${skippedNoKey}`);
    if (isDryRun) {
      console.log(
        `Ungrouped meetings that WOULD BE Deleted (matched with grouped): ${duplicatesToDelete.length}`
      );
    } else {
      console.log(
        `Ungrouped meetings Deleted (matched with grouped): ${totalDeletedCount}`
      );
    }
    console.log(`See ${LOG_FILE} for details.`);
    logStream.write(
      `--- Ungrouped Meeting Cleanup Finished: ${new Date().toISOString()} --- ${
        isDryRun ? "(Dry Run)" : ""
      }\n`
    );
    logStream.write(
      `Total Processed: ${documentsProcessed}, Grouped: ${groupedCount}, Ungrouped: ${ungroupedCount}, ${
        isDryRun ? "Would Delete" : "Deleted"
      }: ${
        isDryRun ? duplicatesToDelete.length : totalDeletedCount
      }, Skipped (No Key): ${skippedNoKey}\n`
    );
  } catch (error) {
    console.error("Fatal error during script execution:", error);
    logStream.write(`${new Date().toISOString()} - FATAL ERROR: ${error}\n`);
  } finally {
    logStream.end(); // Ensure log stream is closed
  }
}

// Execute the script
cleanupDuplicateMeetings()
  .then(() => {
    console.log("Script finished.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
