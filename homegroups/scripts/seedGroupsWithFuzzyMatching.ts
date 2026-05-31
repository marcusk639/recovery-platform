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
const ERROR_LOG_FILE = path.join(LOG_DIR, "group_seeding_errors.log");
const CREATED_GROUPS_LOG_FILE = path.join(LOG_DIR, "groups_created.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// --- Helper Functions ---

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
    // Use absolute path to avoid issues with working directory
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
    // Use locationName primarily, fallback to address or city
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
    )}`; // Truncate identifier for key length
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
 * Strip weak tails from meeting names (time, day, location info)
 */
function stripWeakTails(name: string): string {
  if (!name) return "";

  // Remove common time patterns at the end
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
 * Focuses on essential fields derived from the first meeting encountered for this group.
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
    // Omit 'id' as it's set later
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
    groupData.online = false; // Explicitly set
    try {
      // Validate coordinates before generating geohash
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
        return null; // Don't create group with invalid coordinates
      }
    } catch (e) {
      logErrorToFile({
        meetingId: meeting.id || "N/A",
        meetingName: meeting.name || "N/A",
        error: `Error generating geohash for group at [${meeting.lat}, ${meeting.lng}]: ${e}`,
        timestamp: new Date(),
      });
      return null; // Don't create group without geohash
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
    // It's an in-person meeting but lacks coordinates
    logErrorToFile({
      meetingId: meeting.id || "N/A",
      meetingName: meeting.name || "N/A",
      error: "Creating in-person group without coordinates.",
      timestamp: new Date(),
    });
  }

  // The object `groupData` now conforms to `Omit<Group, 'id'>`
  // We cast to `Group` assuming the calling context handles the `id` assignment.
  return groupData as Group;
}

// --- Main Script Logic ---

async function seedGroupsWithFuzzyMatching() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  let batch = db.batch();
  let operationsInBatch = 0;
  let totalMeetingsProcessed = 0;
  let totalGroupsCreated = 0;
  let totalGroupsFound = 0;
  let totalGroupsUpdated = 0; // Count groups where meetingCount was incremented
  let totalFuzzyMatches = 0;
  let skippedMeetings = 0; // Meetings skipped due to missing data or already having groupId
  let failedMeetings: FailedMeeting[] = []; // Store meetings that caused errors

  // Cache maps group identity key -> groupId
  const groupCache = new Map<string, string>();

  console.log("Starting group seeding process with fuzzy matching...");

  try {
    // Clear error log at start
    const logPath = ERROR_LOG_FILE;
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
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
      // Continue processing without total count
    }

    // Use pagination instead of streaming to avoid "read_time too old" errors
    // let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    let lastDoc = await meetingsRef.doc("3c432cacf5124db2d71ed34b").get();
    const pageSize = 100; // Process 100 meetings at a time
    let hasMore = true;

    while (hasMore) {
      try {
        // Build query with pagination
        let query = meetingsRef
          .where("type", "==", "AA")
          .orderBy("__name__") // Use document ID for consistent ordering
          .limit(pageSize);

        // Add startAfter for pagination (skip first page)
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        console.log(`Processing batch of ${snapshot.docs.length} meetings...`);

        // Process each document in the current batch
        for (const meetingDoc of snapshot.docs) {
          totalMeetingsProcessed++;
          const meetingData = meetingDoc.data() as Meeting;
          meetingData.id = meetingDoc.id;

          // 1. Idempotency Check: Skip if meeting already has a groupId
          if (meetingData.groupId) {
            skippedMeetings++;
            continue;
          }

          if (!meetingData.name) {
            skippedMeetings++;
            const failure: FailedMeeting = {
              meetingId: meetingData.id!,
              meetingName: "N/A",
              error: "Missing name",
              timestamp: new Date(),
            };
            failedMeetings.push(failure);
            logErrorToFile(failure);
            continue;
          }

          // 2. Generate Cache Key
          const cacheKey = createGroupCacheKey(meetingData);
          if (!cacheKey) {
            skippedMeetings++;
            const failure: FailedMeeting = {
              meetingId: meetingData.id!,
              meetingName: meetingData.name,
              error:
                "Cannot generate cache key (missing link or lat/lng/location)",
              timestamp: new Date(),
            };
            failedMeetings.push(failure);
            logErrorToFile(failure);
            continue;
          }

          // 3. Check Cache
          if (groupCache.has(cacheKey)) {
            const cachedGroupId = groupCache.get(cacheKey)!;
            // Link meeting to cached group
            const meetingRef = meetingsRef.doc(meetingData.id!);
            batch.update(meetingRef, {
              groupId: cachedGroupId,
              updatedAt: Timestamp.now(),
            });
            operationsInBatch++;

            // Increment meeting count (best effort)
            const groupRef = groupsRef.doc(cachedGroupId);
            batch.update(groupRef, {
              meetingCount: admin.firestore.FieldValue.increment(1),
            });
            operationsInBatch++;
            totalGroupsUpdated++; // Count as an update

            // Commit batch if full
            if (operationsInBatch >= CONFIG.BATCH_SIZE) {
              try {
                await commitBatch(batch, operationsInBatch); // Pass count for logging
                batch = db.batch();
                operationsInBatch = 0;
              } catch (error) {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                const failure: FailedMeeting = {
                  meetingId: meetingData.id!,
                  meetingName: meetingData.name,
                  error: `Batch commit failed: ${errorMsg}`,
                  timestamp: new Date(),
                };
                console.error(
                  `Error committing batch for meeting ${meetingData.id}:`,
                  error
                );
                failedMeetings.push(failure);
                logErrorToFile(failure);
                // Reset batch to continue processing
                batch = db.batch();
                operationsInBatch = 0;
              }
            }
            continue; // Move to next meeting
          }

          // 4. If not cached, Query Firestore for BEST MATCH *before* transaction
          let existingGroupId: string | undefined;
          let existingGroupData: Group | undefined;
          let matchReason = "";
          let fuzzyMatchScore = 0;

          try {
            // --- Query Logic (Find Best Match Candidate) ---
            if (meetingData.online && meetingData.link) {
              try {
                const normalizedLink = meetingData.link
                  .replace(/^https?:\/\//, "")
                  .replace(/\/$/, "");
                const onlineQuery = groupsRef
                  .where("online", "==", true)
                  .where("link", "==", normalizedLink)
                  .limit(1);
                const onlineSnapshot = await onlineQuery.get();
                if (!onlineSnapshot.empty) {
                  existingGroupId = onlineSnapshot.docs[0].id;
                  existingGroupData = onlineSnapshot.docs[0].data() as Group;
                  matchReason = "exact link match candidate";
                }
              } catch (onlineQueryError) {
                logErrorToFile({
                  meetingId: meetingData.id || "N/A",
                  meetingName: meetingData.name || "N/A",
                  error: `Error executing initial online query: ${onlineQueryError}`,
                  timestamp: new Date(),
                });
                // Continue processing without online match
              }
            } else if (
              meetingData.lat !== undefined &&
              meetingData.lng !== undefined &&
              meetingData.lat >= -90 &&
              meetingData.lat <= 90 &&
              meetingData.lng >= -180 &&
              meetingData.lng <= 180
            ) {
              const center: [number, number] = [
                meetingData.lat,
                meetingData.lng,
              ];
              const radiusInM = CONFIG.CLOSE_DISTANCE_M;
              const bounds = geofire.geohashQueryBounds(center, radiusInM);
              const meetingGroupName =
                extractGroupName(meetingData.name) ||
                cleanMeetingName(meetingData.name);
              let bestMatchId: string | undefined;
              let bestMatchData: Group | undefined;
              let bestMatchScore = 0;
              let bestMatchDistance = Number.MAX_VALUE;
              for (const b of bounds) {
                try {
                  const query = groupsRef
                    .where("online", "==", false)
                    .orderBy("geohash")
                    .startAt(b[0])
                    .endAt(b[1]);
                  const snapshot = await query.get();
                  // Limit processing to prevent infinite loops
                  let processedDocs = 0;
                  const maxDocsPerQuery = 100;
                  for (const doc of snapshot.docs) {
                    if (processedDocs >= maxDocsPerQuery) break;
                    processedDocs++;

                    try {
                      const group = doc.data() as Group;
                      if (!group.lat || !group.lng) continue;
                      const distanceInKm = geofire.distanceBetween(
                        [group.lat, group.lng],
                        center
                      );
                      const distanceInM = distanceInKm * 1000;
                      if (distanceInM > CONFIG.MAX_MATCH_DISTANCE_M) continue;
                      const { score } = fuzzyCompare(
                        meetingGroupName,
                        group.name
                      );
                      const combinedScore =
                        score *
                        (1 - (distanceInM / CONFIG.MAX_MATCH_DISTANCE_M) * 0.3);
                      if (
                        combinedScore > bestMatchScore ||
                        (combinedScore === bestMatchScore &&
                          distanceInM < bestMatchDistance)
                      ) {
                        bestMatchId = doc.id;
                        bestMatchData = group;
                        bestMatchScore = combinedScore;
                        bestMatchDistance = distanceInM;
                      }
                    } catch (docError) {
                      logErrorToFile({
                        meetingId: doc.id,
                        meetingName: (doc.data() as Group)?.name || "N/A",
                        error: `Error processing group document in geohash query: ${docError}`,
                        timestamp: new Date(),
                      });
                      // Continue processing other documents
                    }
                  }
                } catch (queryError) {
                  logErrorToFile({
                    meetingId: meetingData.id || "N/A",
                    meetingName: meetingData.name || "N/A",
                    error: `Error executing geohash query for bounds ${b[0]}-${b[1]}: ${queryError}`,
                    timestamp: new Date(),
                  });
                  // Continue with other bounds
                }
              }
              if (
                bestMatchId &&
                bestMatchData &&
                bestMatchScore >= CONFIG.FUZZY_MATCH_THRESHOLD
              ) {
                existingGroupId = bestMatchId; // Found a candidate
                existingGroupData = bestMatchData;
                fuzzyMatchScore = bestMatchScore;
                matchReason = `fuzzy match candidate (${Math.round(
                  bestMatchScore
                )}) at ${Math.round(bestMatchDistance)}m`;
                totalFuzzyMatches++; // Count potential fuzzy match
              }
            }
            // --- End Query Logic ---

            // 5. Process Results: Link to Existing (if found outside tx) OR Use Transaction to Create/Link
            if (existingGroupId && existingGroupData) {
              // Strong candidate found BEFORE transaction
              totalGroupsFound++;
              console.log(
                `Linking to existing group "${existingGroupData.name}" (${existingGroupId}) for meeting "${meetingData.name}" - ${matchReason}`
              );
              groupCache.set(cacheKey, existingGroupId); // Cache the result

              // Update meeting with groupId (using main batch)
              const meetingRef = meetingsRef.doc(meetingData.id!);
              batch.update(meetingRef, {
                groupId: existingGroupId,
                updatedAt: Timestamp.now(),
              });
              operationsInBatch++;

              // Increment meeting count on the group (using main batch)
              const groupRef = groupsRef.doc(existingGroupId);
              batch.update(groupRef, {
                meetingCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.Timestamp.now(),
              });
              operationsInBatch++;
              totalGroupsUpdated++;
            } else {
              // 6. No strong candidate found. Prepare potential new group data BEFORE the transaction.
              const newGroupData = createGroupDataFromMeeting(meetingData);

              if (!newGroupData) {
                // Was not possible to create group data from this meeting
                skippedMeetings++;
                const failure: FailedMeeting = {
                  meetingId: meetingData.id!,
                  meetingName: meetingData.name,
                  error: "Failed to generate group data before transaction",
                  timestamp: new Date(),
                };
                failedMeetings.push(failure);
                logErrorToFile(failure);
                // Continue to the next meeting, skipping the transaction for this one
                continue;
              }

              // Pre-calculate final check OUTSIDE transaction to avoid timeout
              let finalConcurrentGroupId: string | undefined;

              if (cacheKey.startsWith("online|")) {
                try {
                  const link = cacheKey.split("|")[1];
                  const onlineQuery = groupsRef
                    .where("online", "==", true)
                    .where("link", "==", link)
                    .limit(1);
                  const onlineSnapshot = await onlineQuery.get();
                  if (!onlineSnapshot.empty) {
                    finalConcurrentGroupId = onlineSnapshot.docs[0].id;
                  }
                } catch (concurrentOnlineError) {
                  logErrorToFile({
                    meetingId: meetingData.id || "N/A",
                    meetingName: meetingData.name || "N/A",
                    error: `Error in concurrent online check: ${concurrentOnlineError}`,
                    timestamp: new Date(),
                  });
                  // Continue without concurrent check
                }
              } else if (cacheKey.startsWith("inplace|")) {
                const parts = cacheKey.split("|");
                // Validate cache key format
                if (parts.length < 4) {
                  logErrorToFile({
                    meetingId: meetingData.id || "N/A",
                    meetingName: meetingData.name || "N/A",
                    error: `Invalid cache key format in concurrent check: ${cacheKey}`,
                    timestamp: new Date(),
                  });
                  continue;
                }

                const lat = parseFloat(parts[1]);
                const lng = parseFloat(parts[2]);
                const precalculatedIdentifier = parts[3];

                // Validate parsed coordinates
                if (
                  isNaN(lat) ||
                  isNaN(lng) ||
                  lat < -90 ||
                  lat > 90 ||
                  lng < -180 ||
                  lng > 180
                ) {
                  logErrorToFile({
                    meetingId: meetingData.id || "N/A",
                    meetingName: meetingData.name || "N/A",
                    error: `Invalid coordinates in cache key for concurrent check: ${cacheKey}`,
                    timestamp: new Date(),
                  });
                  continue;
                }

                const bounds = geofire.geohashQueryBounds([lat, lng], 5);
                let totalDocsProcessed = 0;
                const maxTotalDocs = 50; // Limit total docs across all bounds

                for (const b of bounds) {
                  if (totalDocsProcessed >= maxTotalDocs) break;

                  try {
                    const query = groupsRef
                      .where("online", "==", false)
                      .orderBy("geohash")
                      .startAt(b[0])
                      .endAt(b[1])
                      .limit(5);
                    const snapshot = await query.get();

                    for (const doc of snapshot.docs) {
                      if (totalDocsProcessed >= maxTotalDocs) break;
                      totalDocsProcessed++;

                      try {
                        const group = doc.data() as Partial<Group>;
                        // Validate group data structure
                        if (!group || typeof group !== "object") {
                          logErrorToFile({
                            meetingId: doc.id,
                            meetingName:
                              (doc.data() as Partial<Group>)?.name || "N/A",
                            error: `Invalid group data for doc ${doc.id} in concurrent check.`,
                            timestamp: new Date(),
                          });
                          continue;
                        }

                        const groupIdentifier =
                          normalizeString(group.name) ||
                          normalizeString(group.address) ||
                          normalizeString(group.city);
                        if (
                          precalculatedIdentifier &&
                          groupIdentifier &&
                          fuzzyCompare(groupIdentifier, precalculatedIdentifier)
                            .score > 90
                        ) {
                          finalConcurrentGroupId = doc.id;
                          break;
                        }
                      } catch (docError) {
                        logErrorToFile({
                          meetingId: doc.id,
                          meetingName:
                            (doc.data() as Partial<Group>)?.name || "N/A",
                          error: `Error processing concurrent check doc ${doc.id}: ${docError}`,
                          timestamp: new Date(),
                        });
                        // Continue processing other documents
                      }
                    }
                    if (finalConcurrentGroupId) break;
                  } catch (concurrentQueryError) {
                    logErrorToFile({
                      meetingId: meetingData.id || "N/A",
                      meetingName: meetingData.name || "N/A",
                      error: `Error in concurrent geohash query for bounds ${b[0]}-${b[1]}: ${concurrentQueryError}`,
                      timestamp: new Date(),
                    });
                    // Continue with other bounds
                  }
                }
              }

              // Use Transaction ONLY for atomic writes (no complex queries)
              try {
                await db.runTransaction(async (transaction) => {
                  if (!finalConcurrentGroupId) {
                    // Create New Group using pre-calculated data
                    const newGroupRef = groupsRef.doc(); // Auto-generate ID
                    console.log(
                      `TX: Creating new group "${newGroupData.name}" (${newGroupRef.id}) for meeting "${meetingData.name}"`
                    );
                    const completeGroupData = {
                      ...newGroupData,
                      id: newGroupRef.id,
                      meetingCount: 1,
                    };
                    transaction.set(newGroupRef, completeGroupData);
                    transaction.update(meetingsRef.doc(meetingData.id!), {
                      groupId: newGroupRef.id,
                      updatedAt: Timestamp.now(),
                    });
                    groupCache.set(cacheKey, newGroupRef.id);
                    totalGroupsCreated++;
                    logCreatedGroupToFile(completeGroupData as Group); // Log the newly created group
                  } else {
                    // Link to Concurrently Found Group
                    console.log(
                      `TX: Group ${finalConcurrentGroupId} found concurrently, linking meeting ${meetingData.id}`
                    );
                    transaction.update(meetingsRef.doc(meetingData.id!), {
                      groupId: finalConcurrentGroupId,
                      updatedAt: Timestamp.now(),
                    });
                    transaction.update(groupsRef.doc(finalConcurrentGroupId), {
                      meetingCount: admin.firestore.FieldValue.increment(1),
                    });
                    groupCache.set(cacheKey, finalConcurrentGroupId);
                    totalGroupsFound++;
                    totalGroupsUpdated++;
                  }
                }); // End Transaction
              } catch (transactionError) {
                const errorMsg =
                  transactionError instanceof Error
                    ? transactionError.message
                    : String(transactionError);
                const failure: FailedMeeting = {
                  meetingId: meetingData.id!,
                  meetingName: meetingData.name,
                  error: `Transaction failed: ${errorMsg}`,
                  timestamp: new Date(),
                };
                console.error(
                  `Error in transaction for meeting ${meetingData.id}:`,
                  transactionError
                );
                failedMeetings.push(failure);
                logErrorToFile(failure);
                // Continue to next meeting without incrementing operationsInBatch
                continue;
              }
              operationsInBatch++; // Count transaction as one operation for batching
            }

            // 7. Commit main batch if full (outside transaction)
            if (operationsInBatch >= CONFIG.BATCH_SIZE) {
              try {
                await commitBatch(batch, operationsInBatch);
                batch = db.batch();
                operationsInBatch = 0;
              } catch (error) {
                const errorMsg =
                  error instanceof Error ? error.message : String(error);
                const failure: FailedMeeting = {
                  meetingId: meetingData.id!,
                  meetingName: meetingData.name,
                  error: `Final batch commit failed: ${errorMsg}`,
                  timestamp: new Date(),
                };
                console.error(
                  `Error committing final batch for meeting ${meetingData.id}:`,
                  error
                );
                failedMeetings.push(failure);
                logErrorToFile(failure);
                // Reset batch to continue processing
                batch = db.batch();
                operationsInBatch = 0;
              }
            }
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            const failure: FailedMeeting = {
              meetingId: meetingData.id!,
              meetingName: meetingData.name,
              error: errorMsg,
              timestamp: new Date(),
            };
            console.error(
              `Error processing meeting ${failure.meetingId} "${failure.meetingName}": ${errorMsg}`
            );
            failedMeetings.push(failure);
            logErrorToFile(failure);
          }

          // Log progress periodically
          if (
            totalMeetingsProcessed % 100 === 0 ||
            totalMeetingsProcessed === totalMeetings
          ) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `(${Math.round(
                  (totalMeetingsProcessed / totalMeetings) * 100
                )}%) ` +
                `| Created: ${totalGroupsCreated}, Found: ${totalGroupsFound} (Fuzzy: ${totalFuzzyMatches}), ` +
                `Skipped: ${skippedMeetings}, Updated: ${totalGroupsUpdated}, Errors: ${failedMeetings.length}`
            );
          }
        } // Close the for loop

        // Update cursor for next iteration
        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        // If we got fewer documents than requested, we've reached the end
        if (snapshot.docs.length < pageSize) {
          hasMore = false;
        }

        // Add a small delay between batches to avoid overwhelming Firestore
        await sleep(100);
      } catch (batchError: any) {
        console.error("Error processing batch:", batchError);

        // If it's a "read_time too old" error, we can continue with the next batch
        if (
          batchError.code === 9 &&
          batchError.details?.includes("read_time")
        ) {
          console.log(
            "Skipping batch due to read_time error, continuing with next batch..."
          );
          // Update cursor to skip this batch
          if (lastDoc) {
            // Move to next document to skip the problematic batch
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
          // Try to continue from the next document
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

    // Commit any remaining operations
    if (operationsInBatch > 0) {
      try {
        await commitBatch(batch, operationsInBatch);
      } catch (error) {
        console.error("Error committing final remaining batch:", error);
        // Log this as a general error since we don't have specific meeting context
        const failure: FailedMeeting = {
          meetingId: "FINAL_BATCH",
          meetingName: "Final batch commit",
          error: `Final batch commit failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          timestamp: new Date(),
        };
        failedMeetings.push(failure);
        logErrorToFile(failure);
      }
    }

    console.log("\n--- Seeding Complete ---");
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
    }
    console.log("--------------------------\n");
  } catch (error) {
    console.error("Fatal error in script execution:", error);
  }
}

// Helper function to commit batch with logging
async function commitBatch(
  batchToCommit: admin.firestore.WriteBatch,
  count: number
): Promise<void> {
  console.log(`Committing batch of ${count} operations...`);
  try {
    await batchToCommit.commit();
    console.log("Batch committed successfully.");
  } catch (error) {
    console.error("Error committing batch:", error);
    // Log details about the batch failure if possible
    throw error; // Re-throw to be caught by main try/catch
  }
}

// Execute the script with proper cleanup
seedGroupsWithFuzzyMatching()
  .then(() => {
    console.log("Script finished successfully.");
    // Cleanup Firebase app
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    // Cleanup Firebase app even on error
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
