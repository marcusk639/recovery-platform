import { Firestore } from "@google-cloud/firestore";
import * as admin from "firebase-admin";
import * as path from "path";
import * as ngeohash from "ngeohash"; // Import ngeohash
import * as crypto from "crypto"; // Import crypto module

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json"; // Ensure this file exists
const FIRESTORE_COLLECTION = "meetings";
const BATCH_SIZE = 400; // Firestore batch write limit is 500, stay below it
const GEOHASH_PRECISION = 9; // Geohash precision level

// Days of week mapping for validation/normalization
export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Meeting class definition mirroring the expected data model
class Meeting {
  name = "";
  time = "";
  address?: string;
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
  formattedAddress?: string;
  types?: string;
  lat?: number;
  lng?: number;
  geohash?: string;
  country?: string;
  locationName?: string;
  type?: "AA" | "NA";
  day?: string;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  format: string = "";
  id?: string;
  apiId?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  verified?: boolean;
  addedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// --- Helper Functions ---

/**
 * Initializes Firebase Admin SDK
 */
function initializeFirebaseAdmin(): admin.app.App {
  if (!SERVICE_ACCOUNT_PATH) {
    throw new Error("Service account file path is not set.");
  }
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  console.log("Initializing Firebase Admin SDK...");
  try {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    // If already initialized
    return admin.app();
  }
}

/**
 * Generates a unique hash ID for a meeting based on key properties using SHA-1.
 */
export function generateMeetingHash(meeting: Meeting): string {
  // Create a consistent string representation including all unique identifiers
  const meetingString = [
    meeting.name?.trim() || "",
    meeting.day || "",
    meeting.time || "",
    meeting.link || "",
    meeting.formattedAddress?.trim() || "",
  ].join("|");

  // Generate SHA-1 hash
  const hash = crypto.createHash("sha1").update(meetingString).digest("hex");
  return hash.substring(0, 24);
}

/**
 * Removes properties with undefined values from an object.
 */
function removeUndefinedProperties(
  obj: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Validates and normalizes meeting data
 */
function validateAndNormalizeMeeting(meeting: any): {
  meeting: Meeting;
  changes: string[];
  hasChanges: boolean;
} {
  const validatedMeeting = new Meeting();
  const changes: string[] = [];

  // Process each field with proper type conversion and validation
  validatedMeeting.apiId = meeting.apiId || undefined;
  validatedMeeting.name = meeting.name || "";

  // Time validation
  if (meeting.time) {
    // Ensure time is in correct format (HH:MM)
    const timeMatch = meeting.time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      validatedMeeting.time = `${timeMatch[1]}:${timeMatch[2]}`;
      if (meeting.time !== validatedMeeting.time) {
        changes.push(
          `Time changed from ${meeting.time} to ${validatedMeeting.time}`
        );
      }
    } else {
      validatedMeeting.time = meeting.time;
      changes.push(`Invalid time format: ${meeting.time}`);
    }
  }

  // Day validation
  if (meeting.day !== undefined) {
    const numericDay = parseInt(meeting.day);
    if (!isNaN(numericDay) && numericDay >= 0 && numericDay <= 6) {
      // If it's a number string, convert to day name
      validatedMeeting.day = daysOfWeek[numericDay];
      if (meeting.day !== validatedMeeting.day) {
        changes.push(
          `Day changed from ${meeting.day} to ${validatedMeeting.day}`
        );
      }
    } else if (
      typeof meeting.day === "string" &&
      daysOfWeek.includes(meeting.day.toLowerCase())
    ) {
      // If it's already a day name, normalize to lowercase
      validatedMeeting.day = meeting.day.toLowerCase();
      if (meeting.day !== validatedMeeting.day) {
        changes.push(`Day normalized to ${validatedMeeting.day}`);
      }
    } else {
      changes.push(`Invalid day: ${meeting.day}`);
      validatedMeeting.day = undefined;
    }
  }

  // Lat/Lng validation and geohash generation
  let latChanged = false;
  let lngChanged = false;

  if (meeting.lat !== undefined) {
    const lat =
      typeof meeting.lat === "string" ? parseFloat(meeting.lat) : meeting.lat;
    if (!isNaN(lat)) {
      validatedMeeting.lat = lat;
      if (meeting.lat !== lat) {
        changes.push(`Latitude converted from ${meeting.lat} to ${lat}`);
        latChanged = true;
      }
    } else {
      changes.push(`Invalid latitude: ${meeting.lat}`);
    }
  }

  if (meeting.lng !== undefined) {
    const lng =
      typeof meeting.lng === "string" ? parseFloat(meeting.lng) : meeting.lng;
    if (!isNaN(lng)) {
      validatedMeeting.lng = lng;
      if (meeting.lng !== lng) {
        changes.push(`Longitude converted from ${meeting.lng} to ${lng}`);
        lngChanged = true;
      }
    } else {
      changes.push(`Invalid longitude: ${meeting.lng}`);
    }
  }

  // Regenerate geohash if lat/lng are valid
  if (
    validatedMeeting.lat !== undefined &&
    validatedMeeting.lng !== undefined
  ) {
    const newGeohash = ngeohash.encode(
      validatedMeeting.lat,
      validatedMeeting.lng,
      GEOHASH_PRECISION
    );

    if (meeting.geohash !== newGeohash) {
      validatedMeeting.geohash = newGeohash;
      changes.push(
        `Geohash ${meeting.geohash || "missing"} updated to ${newGeohash}`
      );
    } else {
      validatedMeeting.geohash = meeting.geohash;
    }
  }

  // Address and location fields
  validatedMeeting.address = meeting.address || undefined;
  validatedMeeting.city = meeting.city || undefined;
  validatedMeeting.state = meeting.state || undefined;
  validatedMeeting.street = meeting.street || undefined;
  validatedMeeting.zip = meeting.zip || undefined;
  validatedMeeting.formattedAddress = meeting.formattedAddress || undefined;
  validatedMeeting.locationName = meeting.locationName || undefined;
  validatedMeeting.country = meeting.country || undefined;

  // Basic fields
  validatedMeeting.id = meeting.id || generateMeetingHash(meeting);

  // Type validation
  if (meeting.type) {
    validatedMeeting.type =
      meeting.type === "AA" || meeting.type === "NA" ? meeting.type : "AA"; // Default to AA if invalid

    if (meeting.type !== validatedMeeting.type) {
      changes.push(
        `Type changed from ${meeting.type} to ${validatedMeeting.type}`
      );
    }
  } else {
    validatedMeeting.type = "AA"; // Default
    changes.push(`Missing type, defaulted to AA`);
  }

  // Boolean validation
  validatedMeeting.online =
    typeof meeting.online === "boolean" ? meeting.online : !!meeting.link;

  if (meeting.online !== validatedMeeting.online) {
    changes.push(`Online flag updated to ${validatedMeeting.online}`);
  }

  validatedMeeting.verified =
    typeof meeting.verified === "boolean" ? meeting.verified : true;

  // Online meeting details
  validatedMeeting.link = meeting.link || undefined;
  validatedMeeting.onlineNotes = meeting.onlineNotes || undefined;

  // Format/types
  validatedMeeting.format = meeting.format || meeting.types || "";
  validatedMeeting.types = meeting.types || meeting.format || undefined;

  // Additional metadata
  validatedMeeting.notes = meeting.notes || undefined;
  validatedMeeting.locationNotes = meeting.locationNotes || undefined;
  validatedMeeting.groupName = meeting.groupName || undefined;
  validatedMeeting.district = meeting.district || undefined;
  validatedMeeting.timezone = meeting.timezone || undefined;

  // Payment info
  validatedMeeting.venmo = meeting.venmo || undefined;
  validatedMeeting.square = meeting.square || undefined;
  validatedMeeting.paypal = meeting.paypal || undefined;

  // Timestamps - ensure proper Date objects
  if (meeting.createdAt) {
    if (meeting.createdAt instanceof Date) {
      validatedMeeting.createdAt = meeting.createdAt;
    } else if (meeting.createdAt._seconds !== undefined) {
      // Firestore Timestamp object
      validatedMeeting.createdAt = new Date(meeting.createdAt._seconds * 1000);
      changes.push(`Converted createdAt from Timestamp to Date`);
    } else if (typeof meeting.createdAt === "string") {
      validatedMeeting.createdAt = new Date(meeting.createdAt);
      changes.push(`Converted createdAt from string to Date`);
    }
  } else {
    validatedMeeting.createdAt = new Date();
    changes.push(`Added missing createdAt timestamp`);
  }

  if (meeting.updatedAt) {
    if (meeting.updatedAt instanceof Date) {
      validatedMeeting.updatedAt = meeting.updatedAt;
    } else if (meeting.updatedAt._seconds !== undefined) {
      // Firestore Timestamp object
      validatedMeeting.updatedAt = new Date(meeting.updatedAt._seconds * 1000);
      changes.push(`Converted updatedAt from Timestamp to Date`);
    } else if (typeof meeting.updatedAt === "string") {
      validatedMeeting.updatedAt = new Date(meeting.updatedAt);
      changes.push(`Converted updatedAt from string to Date`);
    }
  } else {
    validatedMeeting.updatedAt = new Date();
    changes.push(`Added missing updatedAt timestamp`);
  }

  // Added by
  validatedMeeting.addedBy = meeting.addedBy || "script:data-cleaning";

  return {
    meeting: validatedMeeting,
    changes,
    hasChanges: changes.length > 0,
  };
}

// --- Main Script Logic ---

async function cleanMeetings() {
  // Initialize Firebase admin
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  const meetingsCollection = db.collection(FIRESTORE_COLLECTION);

  let createBatch = db.batch();
  let deleteBatch = db.batch();
  let batchCount = 0;
  let meetingsInCreateBatch = 0;
  let meetingsInDeleteBatch = 0;
  let meetingsProcessed = 0;
  let meetingsUpdated = 0;
  let meetingsHashChanged = 0;
  let meetingsWithErrors = 0;

  // Track mapping of old IDs to new IDs for deletion after confirmation
  const idMapping: Record<string, string> = {};

  console.log("Starting meeting data cleanup with hash regeneration...");

  try {
    // Get all AA meetings
    const meetingsSnapshot = await meetingsCollection
      .where("type", "==", "AA")
      .stream();

    let totalMeetingsSnapshot = await meetingsCollection
      .where("type", "==", "AA")
      .count()
      .get();

    let totalMeetings = totalMeetingsSnapshot.data().count;

    console.log(`Found ${totalMeetings} AA meetings to process.`);
    let oldId = "";
    let meeting = {};

    // Process each meeting
    for await (const doc of meetingsSnapshot) {
      try {
        meetingsProcessed++;
        oldId = (doc as any).id;
        meeting = (doc as any).data();

        // Validate and normalize meeting data
        const {
          meeting: validatedMeeting,
          changes,
          hasChanges,
        } = validateAndNormalizeMeeting(meeting);

        // Generate a new hash ID for the meeting
        const newHashId = generateMeetingHash(validatedMeeting);

        // Check if the hash ID changed
        const hashChanged = oldId !== newHashId;

        if (hashChanged) {
          meetingsHashChanged++;
          changes.push(`Hash ID changed from ${oldId} to ${newHashId}`);
          validatedMeeting.id = newHashId;

          // Store the mapping for later deletion
          idMapping[oldId] = newHashId;
        } else {
          validatedMeeting.id = oldId; // Keep the same ID
        }

        // If there are changes or the hash changed, update the document
        if (hasChanges || hashChanged) {
          meetingsUpdated++;
          console.log(
            `[${meetingsProcessed}/${totalMeetings}] Processing meeting ${oldId}:`
          );
          changes.forEach((change) => console.log(`  - ${change}`));

          // Clean object and add to creation batch
          const cleanedMeeting = removeUndefinedProperties(validatedMeeting);
          const newDocRef = meetingsCollection.doc(validatedMeeting.id!);
          createBatch.set(newDocRef, cleanedMeeting);
          meetingsInCreateBatch++;

          // If the ID changed, queue the old document for deletion
          if (hashChanged) {
            console.log(
              `  - Will delete old document ${oldId} after creating ${newHashId}`
            );
          }

          // Commit creation batch when it reaches the size limit
          if (meetingsInCreateBatch >= BATCH_SIZE) {
            console.log(
              `Committing creation batch #${
                batchCount + 1
              } with ${meetingsInCreateBatch} meetings...`
            );
            await createBatch.commit();
            console.log(`Creation batch committed successfully.`);

            // Now that documents are created, we can queue their old versions for deletion
            for (const [oldDocId, newDocId] of Object.entries(idMapping)) {
              const oldDocRef = meetingsCollection.doc(oldDocId);
              deleteBatch.delete(oldDocRef);
              meetingsInDeleteBatch++;

              // Commit delete batch when it reaches the size limit
              if (meetingsInDeleteBatch >= BATCH_SIZE) {
                console.log(
                  `Committing deletion batch with ${meetingsInDeleteBatch} meetings...`
                );
                await deleteBatch.commit();
                console.log(`Deletion batch committed successfully.`);
                deleteBatch = db.batch();
                meetingsInDeleteBatch = 0;
              }
            }

            // Reset for next batch
            batchCount++;
            createBatch = db.batch();
            meetingsInCreateBatch = 0;

            // Clear the ID mapping as we've processed those deletions
            Object.keys(idMapping).forEach((key) => delete idMapping[key]);
          }
        } else {
          console.log(
            `[${meetingsProcessed}/${totalMeetings}] No changes needed for meeting ${oldId}.`
          );
        }
      } catch (error) {
        meetingsWithErrors++;
        console.error(`Error processing meeting ${oldId}:`, error);
      }

      // Log progress every 100 meetings
      if (meetingsProcessed % 100 === 0) {
        console.log(
          `Progress: ${meetingsProcessed}/${totalMeetings} meetings processed.`
        );
      }
    }

    // Commit any remaining meetings in the final creation batch
    if (meetingsInCreateBatch > 0) {
      console.log(
        `Committing final creation batch with ${meetingsInCreateBatch} meetings...`
      );
      await createBatch.commit();
      console.log(`Final creation batch committed successfully.`);

      // Process any remaining deletions
      if (Object.keys(idMapping).length > 0) {
        for (const [oldDocId, newDocId] of Object.entries(idMapping)) {
          const oldDocRef = meetingsCollection.doc(oldDocId);
          deleteBatch.delete(oldDocRef);
          meetingsInDeleteBatch++;
        }
      }
    }

    // Commit any remaining deletions
    if (meetingsInDeleteBatch > 0) {
      console.log(
        `Committing final deletion batch with ${meetingsInDeleteBatch} meetings...`
      );
      await deleteBatch.commit();
      console.log(`Final deletion batch committed successfully.`);
    }

    console.log("\n--- Cleanup Complete ---");
    console.log(`Total Meetings Processed: ${meetingsProcessed}`);
    console.log(`Meetings Updated: ${meetingsUpdated}`);
    console.log(`Meetings with Hash Changes: ${meetingsHashChanged}`);
    console.log(`Meetings With Errors: ${meetingsWithErrors}`);
    console.log(`Total Batches Committed: ${batchCount}`);
    console.log("------------------------\n");
  } catch (error) {
    console.error("Error in script execution:", error);
  }
}

// Execute the script
cleanMeetings()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    process.exit(1);
  });
