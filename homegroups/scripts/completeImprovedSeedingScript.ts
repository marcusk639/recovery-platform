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
const ERROR_LOG_FILE = path.join(
  LOG_DIR,
  "complete_improved_seeding_errors.log"
);
const CREATED_GROUPS_LOG_FILE = path.join(
  LOG_DIR,
  "complete_improved_groups_created.log"
);
const PROGRESS_LOG_FILE = path.join(LOG_DIR, "seeding_progress.json");
const FAILED_MEETINGS_LOG_FILE = path.join(LOG_DIR, "failed_meetings.json");

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
 * Save progress to file for resumption
 */
interface ProgressData {
  lastProcessedMeetingId: string;
  totalMeetingsProcessed: number;
  totalGroupsCreated: number;
  totalGroupsFound: number;
  totalGroupsUpdated: number;
  totalFuzzyMatches: number;
  skippedMeetings: number;
  failedMeetingsCount: number;
  timestamp: string;
}

function saveProgress(progressData: ProgressData): void {
  try {
    fs.writeFileSync(PROGRESS_LOG_FILE, JSON.stringify(progressData, null, 2));
  } catch (e) {
    console.error("Failed to save progress:", e);
  }
}

/**
 * Load progress from file
 */
function loadProgress(): ProgressData | null {
  try {
    if (fs.existsSync(PROGRESS_LOG_FILE)) {
      const data = fs.readFileSync(PROGRESS_LOG_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load progress:", e);
  }
  return null;
}

/**
 * Log failed meeting with complete meeting data to JSON file
 */
interface FailedMeetingLogEntry {
  meetingId: string;
  meetingName: string;
  error: string;
  timestamp: string;
  meetingData: Meeting;
}

function logFailedMeetingToFile(
  failedMeeting: FailedMeeting,
  meetingData: Meeting
): void {
  try {
    const logEntry: FailedMeetingLogEntry = {
      meetingId: failedMeeting.meetingId,
      meetingName: failedMeeting.meetingName,
      error: failedMeeting.error,
      timestamp: failedMeeting.timestamp.toISOString(),
      meetingData: meetingData,
    };

    // Append to JSON file (one JSON object per line for easy parsing)
    fs.appendFileSync(
      FAILED_MEETINGS_LOG_FILE,
      JSON.stringify(logEntry) + "\n"
    );
  } catch (e) {
    console.error(
      `Failed to write failed meeting ${failedMeeting.meetingId} to JSON log:`,
      e
    );
  }
}

/**
 * Converts a string to Title Case, handling acronyms and minor words.
 */
function toTitleCase(str: string): string {
  if (!str) return "";

  const minorWords = new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "from",
    "by",
    "in",
    "of",
  ]);
  const acronyms = new Set(["aa", "na", "iop"]); // Add other acronyms as needed

  return str
    .toLowerCase()
    .split(" ")
    .map((word, index, arr) => {
      if (!word) return "";

      // Keep acronyms uppercase
      if (acronyms.has(word)) {
        return word.toUpperCase();
      }

      // Handle possessives like "Men's"
      if (word.includes("'")) {
        const parts = word.split("'");
        return parts
          .map((part, partIndex) =>
            partIndex === 0
              ? part.charAt(0).toUpperCase() + part.slice(1)
              : part
          )
          .join("'");
      }

      // Capitalize if it's the first or last word, or not a minor word
      if (index === 0 || index === arr.length - 1 || !minorWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }

      return word; // Keep minor words lowercase in the middle
    })
    .join(" ");
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-100) between two strings
 */
function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 100;
  const distance = levenshteinDistance(longer, shorter);
  // Fix: Prevent division by zero
  return Math.round((1 - distance / Math.max(longer.length, 1)) * 100);
}

/**
 * Fuzzy compare two strings
 */
function fuzzyCompare(
  s1: string | undefined,
  s2: string | undefined
): { score: number; isMatch: boolean } {
  const str1 = normalizeString(s1 || "");
  const str2 = normalizeString(s2 || "");
  if (!str1 || !str2) return { score: 0, isMatch: false };
  if (str1 === str2) return { score: 100, isMatch: true };
  if (str1.length < 4 || str2.length < 4) {
    const directScore = stringSimilarity(str1, str2);
    return {
      score: directScore,
      isMatch: directScore >= CONFIG.FUZZY_MATCH_THRESHOLD,
    };
  }
  const directScore = stringSimilarity(str1, str2);
  if (directScore >= CONFIG.FUZZY_MATCH_THRESHOLD)
    return { score: directScore, isMatch: true };
  if (str1.includes(str2) || str2.includes(str1)) {
    const containsScore = Math.min(90, directScore + 15);
    if (containsScore >= CONFIG.FUZZY_MATCH_THRESHOLD)
      return { score: containsScore, isMatch: true };
  }
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  let wordMatches = 0;
  const totalWords = Math.max(words1.length, words2.length);
  for (const word1 of words1) {
    if (word1.length < 3) continue;
    const wordFound = words2.some((word2) => {
      if (word2.length < 3) return false;
      return stringSimilarity(word1, word2) >= CONFIG.FUZZY_PARTIAL_THRESHOLD;
    });
    if (wordFound) wordMatches++;
  }
  const wordScore = Math.round((wordMatches / totalWords) * 100);
  const finalScore = Math.max(directScore, wordScore);
  return {
    score: finalScore,
    isMatch: finalScore >= CONFIG.FUZZY_MATCH_THRESHOLD,
  };
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
  } else if (meeting.online) {
    // Handle online meetings without links (phone meetings, etc.)
    // Use meeting name as identifier for grouping
    const nameIdentifier = normalizeString(meeting.name || "");
    if (!nameIdentifier) {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error: "Online meeting missing name for cache key generation.",
        timestamp: new Date(),
      });
      return null;
    }
    return `online_no_link|${nameIdentifier.substring(0, 50)}`;
  } else {
    // Handle meetings without coordinates or online status
    // Try to use location information if available
    const locationIdentifier =
      normalizeString(meeting.locationName) ||
      normalizeString(meeting.address) ||
      normalizeString(meeting.city) ||
      normalizeString(meeting.name);

    if (!locationIdentifier) {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error:
          "Meeting missing all location identifiers for cache key generation.",
        timestamp: new Date(),
      });
      return null;
    }

    return `no_location|${locationIdentifier.substring(0, 50)}`;
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
  groupName = toTitleCase(cleanName || groupName); // Apply Title Case

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
    }
    // Don't fail if no link - some online meetings are phone-only
  } else {
    // Handle meetings without coordinates or online status
    // Create a basic group without location data
    groupData.online = false;
    // Don't fail - create the group anyway
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
): Promise<{
  success: boolean;
  groupId?: string;
  error?: string;
  isNewGroup?: boolean;
  isFuzzyMatch?: boolean;
}> {
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
      let isFuzzyMatch = false;

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
            const meetingGroupName =
              extractGroupName(meeting.name) || cleanMeetingName(meeting.name);

            let bestMatchId: string | undefined;
            let bestMatchScore = 0;
            let bestMatchDistance = Number.MAX_VALUE;

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
                  const { score } = fuzzyCompare(meetingGroupName, group.name);
                  const combinedScore =
                    score *
                    (1 - (distanceInM / CONFIG.MAX_MATCH_DISTANCE_M) * 0.3);

                  if (
                    combinedScore > bestMatchScore ||
                    (combinedScore === bestMatchScore &&
                      distanceInM < bestMatchDistance)
                  ) {
                    bestMatchId = doc.id;
                    bestMatchScore = combinedScore;
                    bestMatchDistance = distanceInM;
                  }
                }
              }
            }

            if (bestMatchId && bestMatchScore >= CONFIG.FUZZY_MATCH_THRESHOLD) {
              existingGroupId = bestMatchId;
              isFuzzyMatch = true;
            }
          }
        }
      } else if (cacheKey.startsWith("online_no_link|")) {
        // Handle online meetings without links (phone meetings, etc.)
        const nameIdentifier = cacheKey.split("|")[1];
        const onlineQuery = groupsRef
          .where("online", "==", true)
          .where("name", "==", meeting.name)
          .limit(1);
        const onlineSnapshot = await onlineQuery.get();
        if (!onlineSnapshot.empty) {
          existingGroupId = onlineSnapshot.docs[0].id;
        }
      } else if (cacheKey.startsWith("no_location|")) {
        // Handle meetings without location data
        const nameIdentifier = cacheKey.split("|")[1];
        const nameQuery = groupsRef.where("name", "==", meeting.name).limit(1);
        const nameSnapshot = await nameQuery.get();
        if (!nameSnapshot.empty) {
          existingGroupId = nameSnapshot.docs[0].id;
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

        return { success: true, groupId: existingGroupId, isFuzzyMatch };
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
        logCreatedGroupToFile(completeGroupData as Group);

        const meetingRef = meetingsRef.doc(meeting.id!);
        transaction.update(meetingRef, {
          groupId: newGroupRef.id,
          updatedAt: Timestamp.now(),
        });

        return { success: true, groupId: newGroupRef.id, isNewGroup: true };
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

async function completeImprovedSeedingScript(
  resumeFromMeetingId?: string,
  loadFromProgressFile: boolean = false
) {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);

  let totalMeetingsProcessed = 0;
  let totalGroupsCreated = 0;
  let totalGroupsFound = 0;
  let totalGroupsUpdated = 0;
  let totalFuzzyMatches = 0;
  let skippedMeetings = 0;
  let failedMeetings: FailedMeeting[] = [];
  let lastProcessedMeetingId: string | null = null;
  let lastProcessedMeetingName: string | null = null;

  // Cache maps group identity key -> groupId
  const groupCache = new Map<string, string>();

  // Graceful shutdown handler
  const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
    console.log(`📊 Final Statistics:`);
    console.log(`   Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(`   Groups Created: ${totalGroupsCreated}`);
    console.log(`   Groups Found: ${totalGroupsFound}`);
    console.log(`   Groups Updated: ${totalGroupsUpdated}`);
    console.log(`   Fuzzy Matches: ${totalFuzzyMatches}`);
    console.log(`   Skipped: ${skippedMeetings}`);
    console.log(`   Failed: ${failedMeetings.length}`);

    if (lastProcessedMeetingId) {
      console.log(`\n📍 Last Meeting Processed:`);
      console.log(`   ID: ${lastProcessedMeetingId}`);
      console.log(`   Name: "${lastProcessedMeetingName || "N/A"}"`);
      console.log(`\n💡 To resume from this point, run:`);
      console.log(
        `   npx ts-node completeImprovedSeedingScript.ts --resume-from=${lastProcessedMeetingId}`
      );
    }

    console.log(`\n📁 Logs saved to:`);
    console.log(`   Progress: ${PROGRESS_LOG_FILE}`);
    if (failedMeetings.length > 0) {
      console.log(`   Errors: ${ERROR_LOG_FILE}`);
      console.log(`   Failed Meetings: ${FAILED_MEETINGS_LOG_FILE}`);
    }

    // Save final progress before exit
    if (lastProcessedMeetingId) {
      saveProgress({
        lastProcessedMeetingId: lastProcessedMeetingId,
        totalMeetingsProcessed,
        totalGroupsCreated,
        totalGroupsFound,
        totalGroupsUpdated,
        totalFuzzyMatches,
        skippedMeetings,
        failedMeetingsCount: failedMeetings.length,
        timestamp: new Date().toISOString(),
      });
      console.log(`   Progress saved for resumption`);
    }

    console.log(`\n👋 Goodbye!`);
    process.exit(0);
  };

  // Register signal handlers
  process.on("SIGINT", () => gracefulShutdown("SIGINT (Ctrl+C)"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

  // Load progress from file if requested
  let savedProgress: ProgressData | null = null;
  if (loadFromProgressFile) {
    savedProgress = loadProgress();
    if (savedProgress) {
      console.log("Loaded progress from file:");
      console.log(
        `  Last processed meeting: ${savedProgress.lastProcessedMeetingId}`
      );
      console.log(
        `  Total meetings processed: ${savedProgress.totalMeetingsProcessed}`
      );
      console.log(`  Groups created: ${savedProgress.totalGroupsCreated}`);
      console.log(`  Groups found: ${savedProgress.totalGroupsFound}`);
      console.log(`  Timestamp: ${savedProgress.timestamp}`);

      // Use the saved progress as starting point
      totalMeetingsProcessed = savedProgress.totalMeetingsProcessed;
      totalGroupsCreated = savedProgress.totalGroupsCreated;
      totalGroupsFound = savedProgress.totalGroupsFound;
      totalGroupsUpdated = savedProgress.totalGroupsUpdated;
      totalFuzzyMatches = savedProgress.totalFuzzyMatches;
      skippedMeetings = savedProgress.skippedMeetings;
      failedMeetings = []; // Reset failed meetings for this run
      resumeFromMeetingId = savedProgress.lastProcessedMeetingId;
    }
  }

  console.log("Starting complete improved group seeding process...");
  if (resumeFromMeetingId) {
    console.log(`Resuming from meeting ID: ${resumeFromMeetingId}`);
  }
  console.log(
    "💡 Tip: Press Ctrl+C to gracefully shutdown and save progress for resumption"
  );

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

    // If resuming from a specific meeting ID, start from that document
    if (resumeFromMeetingId) {
      try {
        const resumeDoc = await meetingsRef.doc(resumeFromMeetingId).get();
        if (resumeDoc.exists) {
          lastDoc = resumeDoc;
          console.log(`Found resume document: ${resumeDoc.id}`);
        } else {
          console.log(
            `Resume document ${resumeFromMeetingId} not found, starting from beginning`
          );
        }
      } catch (error) {
        console.error(
          `Error finding resume document ${resumeFromMeetingId}:`,
          error
        );
        console.log("Starting from beginning");
      }
    }

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

          // Track last processed meeting for graceful shutdown
          lastProcessedMeetingId = meetingDoc.id;
          lastProcessedMeetingName = meetingData.name || null;

          const result = await processMeeting(meetingData, db, groupCache);

          if (result.success) {
            if (result.isNewGroup) {
              totalGroupsCreated++;
            } else if (result.groupId) {
              totalGroupsFound++;
              totalGroupsUpdated++;
              if (result.isFuzzyMatch) {
                totalFuzzyMatches++;
              }
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
            logFailedMeetingToFile(failure, meetingData);
          }

          // Log progress periodically and save progress
          if (totalMeetingsProcessed % 100 === 0) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `| Created: ${totalGroupsCreated}, Found: ${totalGroupsFound} (Fuzzy: ${totalFuzzyMatches}), ` +
                `Skipped: ${skippedMeetings}, Updated: ${totalGroupsUpdated}, Errors: ${failedMeetings.length}`
            );

            // Save progress every 100 meetings
            saveProgress({
              lastProcessedMeetingId: lastProcessedMeetingId!,
              totalMeetingsProcessed,
              totalGroupsCreated,
              totalGroupsFound,
              totalGroupsUpdated,
              totalFuzzyMatches,
              skippedMeetings,
              failedMeetingsCount: failedMeetings.length,
              timestamp: new Date().toISOString(),
            });
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

        // Handle specific error types
        if (
          batchError.code === 9 &&
          batchError.details?.includes("read_time")
        ) {
          console.log(
            "Skipping batch due to read_time error, continuing with next batch..."
          );
          if (lastDoc) {
            const skipQuery = meetingsRef
              .where("type", "==", "AA")
              .orderBy("__name__")
              .startAfter(lastDoc)
              .limit(1);
            const skipSnapshot = await skipQuery.get();
            if (!skipSnapshot.empty) {
              lastDoc = skipSnapshot.docs[0];
            } else {
              hasMore = false;
            }
          }
          continue;
        }

        // For other errors, log and continue
        console.error("Batch processing failed, continuing with next batch...");
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

    // Save final progress
    saveProgress({
      lastProcessedMeetingId: lastProcessedMeetingId || "COMPLETED",
      totalMeetingsProcessed,
      totalGroupsCreated,
      totalGroupsFound,
      totalGroupsUpdated,
      totalFuzzyMatches,
      skippedMeetings,
      failedMeetingsCount: failedMeetings.length,
      timestamp: new Date().toISOString(),
    });

    console.log("\n--- Complete Improved Seeding Complete ---");
    console.log(`Total Meetings Processed: ${totalMeetingsProcessed}`);
    console.log(
      `Meetings Skipped (No Key/Already Grouped): ${skippedMeetings}`
    );
    console.log(`Existing Groups Found & Linked: ${totalGroupsFound}`);
    console.log(`  - Via Fuzzy Matching: ${totalFuzzyMatches}`);
    console.log(`New Groups Created: ${totalGroupsCreated}`);
    console.log(
      `Groups Updated (Meeting Count Incremented): ${totalGroupsUpdated}`
    );
    console.log(`Meetings Failed Processing: ${failedMeetings.length}`);
    if (failedMeetings.length > 0) {
      console.log(`Error details logged to: ${ERROR_LOG_FILE}`);
      console.log(
        `Failed meetings with full data logged to: ${FAILED_MEETINGS_LOG_FILE}`
      );
    }
    console.log(`Progress saved to: ${PROGRESS_LOG_FILE}`);
    console.log("----------------------------------------\n");
  } catch (error) {
    console.error("Fatal error in complete improved script execution:", error);
  }
}

process.on("SIGINT", () => {
  process.exit(0);
});

// Parse command line arguments
function parseCommandLineArgs(): {
  resumeFromMeetingId?: string;
  loadFromProgressFile: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    return { help: true, loadFromProgressFile: false };
  }

  const resumeFromMeetingId = args
    .find((arg) => arg.startsWith("--resume-from="))
    ?.split("=")[1];
  const loadFromProgressFile =
    args.includes("--resume") || args.includes("--load-progress");

  return { resumeFromMeetingId, loadFromProgressFile, help: false };
}

// Execute the script
const { resumeFromMeetingId, loadFromProgressFile, help } =
  parseCommandLineArgs();

if (help) {
  console.log(`
Usage: npx ts-node completeImprovedSeedingScript.ts [options]

Options:
  --resume-from=<meetingId>  Resume processing from a specific meeting ID
  --resume, --load-progress  Resume from the last saved progress file
  --help, -h                 Show this help message

Examples:
  npx ts-node completeImprovedSeedingScript.ts
  npx ts-node completeImprovedSeedingScript.ts --resume-from=abc123
  npx ts-node completeImprovedSeedingScript.ts --resume
  `);
  process.exit(0);
}

completeImprovedSeedingScript(resumeFromMeetingId, loadFromProgressFile)
  .then(() => {
    console.log("Complete improved seeding script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Complete improved seeding script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
