import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import * as path from "path";
import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";
import { Meeting, Group, CONFIG } from "./shared-types";
import {
  generateMeetingHash,
  normalizeString,
  roundCoordinate,
  sleep,
  cleanMeetingName,
} from "./shared-utils";

// Track failed meetings for logging
interface FailedMeeting {
  meetingId: string;
  meetingName: string;
  error: string;
  timestamp: Date;
}

// Add logging configuration
const LOG_DIR = "./logs";
const ERROR_LOG_FILE = path.join(LOG_DIR, "improved_seeding_errors.log");
const CREATED_GROUPS_LOG_FILE = path.join(
  LOG_DIR,
  "improved_groups_created.log"
);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// --- Helper Functions ---

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
 * Log errors to a file for later review
 */
function logErrorToFile(failedMeeting: FailedMeeting): void {
  try {
    const logEntry = `[${failedMeeting.timestamp.toISOString()}] Meeting ID: ${
      failedMeeting.meetingId
    } - Name: "${failedMeeting.meetingName}" - Error: ${failedMeeting.error}\n`;
    fs.appendFileSync(ERROR_LOG_FILE, logEntry);
  } catch (e) {
    console.error("Failed to write to error log:", e);
  }
}

/**
 * Log created group details to a file.
 */
interface CreatedGroupLogEntry {
  id: string;
  name: string;
  description?: string;
  city?: string;
  state?: string;
  address?: string;
  location?: string;
  timestamp: Date;
}

function logCreatedGroupToFile(group: Group): void {
  try {
    const logEntry: CreatedGroupLogEntry = {
      id: group.id,
      name: group.name,
      description: group.description,
      city: group.city,
      state: group.state,
      address: group.address,
      location: group.location,
      timestamp: new Date(),
    };
    fs.appendFileSync(CREATED_GROUPS_LOG_FILE, JSON.stringify(logEntry) + "\n");
  } catch (e) {
    console.error(`Failed to write created group ${group.id} to log:`, e);
  }
}

/**
 * Creates a cache key for grouping meetings.
 */
function createGroupCacheKey(meeting: Meeting): string | null {
  if (meeting.online && meeting.link) {
    const normalizedLink = meeting.link
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    return `online|${normalizeString(normalizedLink)}`;
  } else if (meeting.lat !== undefined && meeting.lng !== undefined) {
    const roundedLat = roundCoordinate(
      meeting.lat,
      CONFIG.COORDINATE_PRECISION
    );
    const roundedLng = roundCoordinate(
      meeting.lng,
      CONFIG.COORDINATE_PRECISION
    );
    const locationIdentifier =
      normalizeString(meeting.locationName) ||
      normalizeString(meeting.address) ||
      normalizeString(meeting.city);
    if (!locationIdentifier) {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error:
          "In-person meeting missing locationName, address, or city for cache key generation.",
        timestamp: new Date(),
      });
      return null;
    }
    return `inplace|${roundedLat}|${roundedLng}|${locationIdentifier.substring(
      0,
      50
    )}`;
  } else {
    logErrorToFile({
      meetingId: meeting.id || "N/A",
      meetingName: meeting.name || "N/A",
      error:
        "Missing required fields (link or lat/lng) for cache key generation.",
      timestamp: new Date(),
    });
    return null;
  }
}

/**
 * Strip weak tails from meeting names (time, day, location info)
 */
function stripWeakTails(name: string): string {
  if (!name) return "";

  let stripped = name
    .replace(
      /\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
      ""
    )
    .replace(/\s+(am|pm|noon|morning|evening|night)\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2})\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2}\s*(am|pm))\s*$/i, "")
    .replace(/\s+-\s*.*$/, "") // Remove everything after " - "
    .replace(/\s+–\s*.*$/, "") // Remove everything after " – "
    .replace(/\s+—\s*.*$/, "") // Remove everything after " — "
    .replace(/\s+:\s*.*$/, "") // Remove everything after " : "
    .trim();

  return stripped;
}

/**
 * Extract potential group names from meeting names
 */
function extractGroupName(meetingName: string | undefined): string | null {
  if (!meetingName) return null;

  const stripped = stripWeakTails(meetingName);
  if (!stripped) return null;

  const normalizedName = normalizeString(stripped);

  // First, try to extract from quoted text
  const quotedMatch = normalizedName.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];

  // Try to extract group name before common suffixes
  const groupMatch = normalizedName.match(
    /(.+?)\s+(group|grp|fellowship|meeting|mtg|grapevine)\b/i
  );
  if (groupMatch) return groupMatch[1];

  // Try to extract before day/time indicators (more comprehensive)
  const dayMatch = normalizedName.match(
    /(.+?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|noon|morning|evening|night)\b/i
  );
  if (dayMatch) return dayMatch[1];

  // For longer names, try to extract the meaningful part
  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    // Look for common patterns that indicate where the group name ends
    const stopWords = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
      "am",
      "pm",
      "noon",
      "morning",
      "evening",
      "night",
      "group",
      "grp",
      "fellowship",
      "meeting",
      "mtg",
    ];

    let endIndex = parts.length;
    for (let i = 0; i < parts.length; i++) {
      if (stopWords.includes(parts[i].toLowerCase())) {
        endIndex = i;
        break;
      }
    }

    // Return the meaningful part (at least 2 words, up to 6 words)
    const meaningfulParts = parts.slice(0, Math.min(endIndex, 6));
    if (meaningfulParts.length >= 2) {
      return meaningfulParts.join(" ");
    }
  }

  // If we can't extract a meaningful name, return the stripped version if it's reasonable
  if (stripped.length >= 3 && stripped.length <= 50) {
    return stripped;
  }

  return null;
}

/**
 * Creates the data object for a *new* group based on a meeting.
 */
function createGroupDataFromMeeting(meeting: Meeting): Group | null {
  const extractedGroupName = extractGroupName(meeting.name);
  let groupName =
    extractedGroupName || stripWeakTails(meeting.name) || meeting.locationName;

  if (!groupName) {
    logErrorToFile({
      meetingId: meeting.id || "N/A",
      meetingName: meeting.name || "N/A",
      error: "Failed to create group data: Missing name or locationName.",
      timestamp: new Date(),
    });
    return null;
  }

  // Minimal name cleaning
  const cleanName = normalizeString(groupName)
    .replace(/\s{2,}/g, " ")
    .trim();
  groupName = cleanName || groupName;

  const now = admin.firestore.Timestamp.now();

  // Start with a base structure including required fields
  const groupData: Omit<Group, "id"> = {
    name: groupName,
    type: meeting.type === "AA" ? "AA" : "AA",
    description: `AA Meeting Group that hosts meetings such as "${meeting.name}".`,
    location: meeting.locationName || meeting.formattedAddress || "",
    createdAt: now,
    updatedAt: now,
    meetingCount: 1,
    isClaimed: false,
    admins: [],
    memberCount: 0,
    pendingAdminRequests: [],
    treasurers: [],
    treasury: {
      balance: 0,
      prudentReserve: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      transactions: [],
      summary: {
        balance: 0,
        prudentReserve: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        lastUpdated: now.toDate(),
      },
    },
  };

  // Add optional fields based on the meeting
  if (meeting.address || meeting.street)
    groupData.address = meeting.address || meeting.street || "";
  if (meeting.city) groupData.city = meeting.city;
  if (meeting.state) groupData.state = meeting.state;
  if (meeting.zip) groupData.zip = meeting.zip;

  if (
    !meeting.online &&
    meeting.lat !== undefined &&
    meeting.lng !== undefined
  ) {
    groupData.lat = meeting.lat;
    groupData.lng = meeting.lng;
    groupData.placeName = meeting.locationName;
    groupData.online = false;
    try {
      if (
        meeting.lat >= -90 &&
        meeting.lat <= 90 &&
        meeting.lng >= -180 &&
        meeting.lng <= 180
      ) {
        groupData.geohash = geofire.geohashForLocation(
          [meeting.lat, meeting.lng],
          CONFIG.GEOHASH_PRECISION
        );
      } else {
        logErrorToFile({
          meetingId: meeting.id || "N/A",
          meetingName: meeting.name || "N/A",
          error: `Invalid coordinates for group: [${meeting.lat}, ${meeting.lng}]`,
          timestamp: new Date(),
        });
        return null;
      }
    } catch (e) {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error: `Error generating geohash for group at [${meeting.lat}, ${meeting.lng}]: ${e}`,
        timestamp: new Date(),
      });
      return null;
    }
  } else if (meeting.online) {
    groupData.online = true;
    if (meeting.link) {
      groupData.link = meeting.link;
    } else {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error: "Cannot create online group: Missing link.",
        timestamp: new Date(),
      });
      return null;
    }
  } else {
    logErrorToFile({
      meetingId: meeting.id || "N/A",
      meetingName: meeting.name || "N/A",
      error: "Creating in-person group without coordinates.",
      timestamp: new Date(),
    });
  }

  return groupData as Group;
}

/**
 * Process a single meeting with improved error handling and consistency
 */
async function processMeeting(
  meeting: Meeting,
  db: admin.firestore.Firestore,
  groupCache: Map<string, string>
): Promise<{ success: boolean; groupId?: string; error?: string }> {
  try {
    // 1. Idempotency Check: Skip if meeting already has a groupId
    if (meeting.groupId) {
      return { success: true, groupId: meeting.groupId };
    }

    if (!meeting.name) {
      return { success: false, error: "Missing name" };
    }

    // 2. Generate Cache Key
    const cacheKey = createGroupCacheKey(meeting);
    if (!cacheKey) {
      return { success: false, error: "Cannot generate cache key" };
    }

    // 3. Check Cache
    if (groupCache.has(cacheKey)) {
      const cachedGroupId = groupCache.get(cacheKey)!;
      return { success: true, groupId: cachedGroupId };
    }

    // 4. Use Transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
      const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

      // Check if group already exists (double-check within transaction)
      let existingGroupId: string | undefined;

      if (cacheKey.startsWith("online|")) {
        const link = cacheKey.split("|")[1];
        const onlineQuery = groupsRef
          .where("online", "==", true)
          .where("link", "==", link)
          .limit(1);
        const onlineSnapshot = await onlineQuery.get();
        if (!onlineSnapshot.empty) {
          existingGroupId = onlineSnapshot.docs[0].id;
        }
      } else if (cacheKey.startsWith("inplace|")) {
        const parts = cacheKey.split("|");
        if (parts.length >= 4) {
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[2]);
          const identifier = parts[3];

          if (!isNaN(lat) && !isNaN(lng)) {
            const center: [number, number] = [lat, lng];
            const radiusInM = CONFIG.CLOSE_DISTANCE_M;
            const bounds = geofire.geohashQueryBounds(center, radiusInM);

            for (const b of bounds) {
              const query = groupsRef
                .where("online", "==", false)
                .orderBy("geohash")
                .startAt(b[0])
                .endAt(b[1])
                .limit(10);
              const snapshot = await query.get();

              for (const doc of snapshot.docs) {
                const group = doc.data();
                if (!group.lat || !group.lng) continue;

                const distanceInKm = geofire.distanceBetween(
                  [group.lat, group.lng],
                  center
                );
                const distanceInM = distanceInKm * 1000;

                if (distanceInM <= CONFIG.MAX_MATCH_DISTANCE_M) {
                  const groupIdentifier =
                    normalizeString(group.name) ||
                    normalizeString(group.address) ||
                    normalizeString(group.city);

                  if (groupIdentifier && groupIdentifier.includes(identifier)) {
                    existingGroupId = doc.id;
                    break;
                  }
                }
              }
              if (existingGroupId) break;
            }
          }
        }
      }

      if (existingGroupId) {
        // Link to existing group
        const meetingRef = meetingsRef.doc(meeting.id!);
        transaction.update(meetingRef, {
          groupId: existingGroupId,
          updatedAt: Timestamp.now(),
        });

        const groupRef = groupsRef.doc(existingGroupId);
        transaction.update(groupRef, {
          meetingCount: admin.firestore.FieldValue.increment(1),
          updatedAt: Timestamp.now(),
        });

        return { success: true, groupId: existingGroupId };
      } else {
        // Create new group
        const newGroupData = createGroupDataFromMeeting(meeting);
        if (!newGroupData) {
          throw new Error("Failed to create group data");
        }

        const newGroupRef = groupsRef.doc();
        const completeGroupData = {
          ...newGroupData,
          id: newGroupRef.id,
        };

        transaction.set(newGroupRef, completeGroupData);

        const meetingRef = meetingsRef.doc(meeting.id!);
        transaction.update(meetingRef, {
          groupId: newGroupRef.id,
          updatedAt: Timestamp.now(),
        });

        return { success: true, groupId: newGroupRef.id };
      }
    });

    if (result.success && result.groupId) {
      groupCache.set(cacheKey, result.groupId);
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
  }
}

// --- Main Script Logic ---

async function improvedSeedingScript() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);

  let totalMeetingsProcessed = 0;
  let totalGroupsCreated = 0;
  let totalGroupsFound = 0;
  let skippedMeetings = 0;
  let failedMeetings: FailedMeeting[] = [];

  // Cache maps group identity key -> groupId
  const groupCache = new Map<string, string>();

  console.log("Starting improved group seeding process...");

  try {
    // Clear error log at start
    if (fs.existsSync(ERROR_LOG_FILE)) {
      fs.unlinkSync(ERROR_LOG_FILE);
    }

    let totalMeetings = 0;
    try {
      let totalMeetingsSnapshot = await meetingsRef
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
    const pageSize = 50; // Smaller batches for better error handling
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

        // Process each meeting individually for better error handling
        for (const meetingDoc of snapshot.docs) {
          totalMeetingsProcessed++;
          const meetingData = meetingDoc.data() as Meeting;
          meetingData.id = meetingDoc.id;

          const result = await processMeeting(meetingData, db, groupCache);

          if (result.success) {
            if (result.groupId) {
              // Check if this was a new group or existing group
              // (This is a simplified check - in practice you'd track this better)
              totalGroupsFound++;
            }
          } else {
            skippedMeetings++;
            const failure: FailedMeeting = {
              meetingId: meetingData.id!,
              meetingName: meetingData.name || "N/A",
              error: result.error || "Unknown error",
              timestamp: new Date(),
            };
            failedMeetings.push(failure);
            logErrorToFile(failure);
          }

          // Log progress periodically
          if (totalMeetingsProcessed % 100 === 0) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `| Found: ${totalGroupsFound}, Skipped: ${skippedMeetings}, Errors: ${failedMeetings.length}`
            );
          }
        }

        // Update cursor for next iteration
        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        // If we got fewer documents than requested, we've reached the end
        if (snapshot.docs.length < pageSize) {
          hasMore = false;
        }

        // Add a small delay between batches
        await sleep(200);
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

    console.log("\n--- Improved Seeding Complete ---");
    console.log(`Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(`Meetings Skipped: ${skippedMeetings}`);
    console.log(`Groups Found/Linked: ${totalGroupsFound}`);
    console.log(`Meetings Failed Processing: ${failedMeetings.length}`);
    if (failedMeetings.length > 0) {
      console.log(`Error details logged to: ${ERROR_LOG_FILE}`);
    }
    console.log("--------------------------------\n");
  } catch (error) {
    console.error("Fatal error in improved script execution:", error);
  }
}

// Execute the script
improvedSeedingScript()
  .then(() => {
    console.log("Improved seeding script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Improved seeding script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
