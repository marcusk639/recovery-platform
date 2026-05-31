// seed-groups.ts
// COMPLETE WORKING SCRIPT with stronger name accuracy via alias index + robust normalization

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

/* =============================================================================
   Name Matching (NEW): robust normalization + alias index + prior boosting
============================================================================= */

/** A stricter normalizer just for matching/aliasing. */
function normalizeForMatching(s?: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’'`"]/g, "") // quotes/apostrophes
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\b(a\.?a\.?|aa)\b/g, " ")
    .replace(/\b(group|grp|meeting|mtg|fellowship|grapevine)\b/g, " ")
    .replace(/\b(online|virtual|zoom|hybrid)\b/g, " ")
    .replace(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g,
      " "
    )
    .replace(/\b(noon|nooner|morning|evening|night|am|pm)\b/g, " ")
    .replace(
      /\b(step|steps|tradition|speaker|discussion|literature|big\s*book|newcomer|secular)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove weak tail descriptors BEFORE we normalize. */
function stripWeakTails(name: string): string {
  return String(name)
    .replace(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b.*$/i,
      ""
    )
    .replace(/\b(online|virtual|zoom|hybrid)\b.*$/i, "")
    .replace(/\b(group|grp|meeting|mtg|fellowship)\b\s*$/i, "")
    .replace(/[-–—:()\[\]]\s*$/g, "")
    .trim();
}

type AliasIndex = {
  groups: Map<string, string>; // normalized group -> original group
  aliasToGroupCounts: Map<string, Map<string, number>>; // alias -> { gNorm -> count }
};

/** Build an alias index from meetings having both `name` and `group`. */
function buildAliasIndex(
  meetings: Array<{ name?: string; group?: string }>
): AliasIndex {
  const groups = new Map<string, string>();
  const aliasToGroupCounts = new Map<string, Map<string, number>>();

  for (const m of meetings) {
    if (!m?.group || !m?.name) continue;
    const gNorm = normalizeForMatching(m.group);
    if (!groups.has(gNorm)) groups.set(gNorm, m.group);

    const aliases = new Set<string>([
      normalizeForMatching(m.name),
      normalizeForMatching(stripWeakTails(m.name)),
    ]);

    for (const a of aliases) {
      if (!a) continue;
      if (!aliasToGroupCounts.has(a)) aliasToGroupCounts.set(a, new Map());
      const gm = aliasToGroupCounts.get(a)!;
      gm.set(gNorm, (gm.get(gNorm) ?? 0) + 1);
    }
  }
  return { groups, aliasToGroupCounts };
}

function pickMajority(
  counts?: Map<string, number>,
  groups?: Map<string, string>
): string | undefined {
  if (!counts || !counts.size) return undefined;
  let best: { gNorm?: string; count: number } = { count: -1 };
  for (const [gNorm, c] of counts.entries()) {
    if (c > best.count) best = { gNorm, count: c };
  }
  return best.gNorm ? groups!.get(best.gNorm) : undefined;
}

/** Meeting name → prior group guess using aliases. */
function guessGroupNameByAlias(
  meetingName: string,
  index: AliasIndex
): { groupName?: string; confidence: number } {
  const qNorm = normalizeForMatching(meetingName);
  const qLoose = normalizeForMatching(stripWeakTails(meetingName));

  const hit =
    pickMajority(index.aliasToGroupCounts.get(qNorm), index.groups) ??
    pickMajority(index.aliasToGroupCounts.get(qLoose), index.groups);

  if (!hit) return { confidence: 0 };
  const counts =
    index.aliasToGroupCounts.get(qNorm) ?? index.aliasToGroupCounts.get(qLoose);
  const total = [...(counts?.values() ?? [])].reduce((a, b) => a + b, 0) || 1;
  const best = [...(counts?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0];
  const confidence = best ? Math.min(1, best[1] / total) : 0.5;
  return { groupName: hit, confidence };
}

/** Token Jaccard overlap, useful as a stabilizing micro-boost. */
function tokenJaccard(a: string, b: string): number {
  const A = new Set(normalizeForMatching(a).split(" ").filter(Boolean));
  const B = new Set(normalizeForMatching(b).split(" ").filter(Boolean));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/* =============================================================================
   Your Original Helpers (kept)
============================================================================= */

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
 * Stronger extractGroupName using tail-stripping + normalization (REPLACED).
 */
function extractGroupName(meetingName: string | undefined): string | null {
  if (!meetingName) return null;

  const stripped = stripWeakTails(meetingName);

  // Prefer exact quoted names first
  const quoted = stripped.match(/"([^"]+)"/);
  if (quoted?.[1]) return toTitleCase(normalizeString(quoted[1]).trim());

  const n = normalizeForMatching(stripped);

  const m1 = n.match(/(.+?)\s+(group|grp|fellowship|meeting|mtg|grapevine)\b/);
  if (m1?.[1]) return toTitleCase(normalizeString(m1[1]).trim());

  const m2 = stripped.match(/(.+?)\s+[-–—:]/);
  if (m2?.[1]) return toTitleCase(normalizeString(m2[1]).trim());

  const m3 = n.match(
    /(.+?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|am|pm|noon)\b/
  );
  if (m3?.[1]) return toTitleCase(normalizeString(m3[1]).trim());

  const parts = normalizeString(stripped).split(/\s+/).filter(Boolean);
  if (parts.length >= 3)
    return toTitleCase(parts.slice(0, Math.min(4, parts.length)).join(" "));
  return null;
}

/**
 * Creates the data object for a *new* group based on a meeting.
 */
function createGroupDataFromMeeting(meeting: Meeting): Group | null {
  const extractedGroupName = extractGroupName(meeting.name);
  let groupName =
    extractedGroupName ||
    cleanMeetingName(meeting.name) ||
    meeting.locationName; // Removed meeting.locationName from fallback

  if (!groupName) {
    logErrorToFile({
      meetingId: meeting.id || "N/A",
      meetingName: meeting.name || "N/A",
      error:
        "Failed to create group data: Missing name after extraction and cleanup.", // Updated error message
      timestamp: new Date(),
    });
    return null;
  }

  const cleanName = normalizeString(groupName)
    .replace(/\s{2,}/g, " ")
    .trim();
  groupName = toTitleCase(cleanName || groupName);

  const now = admin.firestore.Timestamp.now();

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
  let totalGroupsUpdated = 0;
  let totalFuzzyMatches = 0;
  let skippedMeetings = 0;
  let failedMeetings: FailedMeeting[] = [];

  // Cache: group identity key -> groupId
  const groupCache = new Map<string, string>();

  console.log("Starting group seeding process with fuzzy matching...");

  // ---------- Build Alias Index ONCE (NEW) ----------
  console.log("Building alias index from existing AA meetings...");
  let aliasIndex: AliasIndex = {
    groups: new Map(),
    aliasToGroupCounts: new Map(),
  };
  try {
    const allAa = await meetingsRef.where("type", "==", "AA").get();
    const simple = allAa.docs.map((d) => {
      const data = d.data() as any;
      return { name: data?.name, group: data?.group };
    });
    aliasIndex = buildAliasIndex(simple);
    console.log(
      `Alias index: ${aliasIndex.groups.size} canonical groups; ${aliasIndex.aliasToGroupCounts.size} aliases.`
    );
  } catch (e) {
    console.warn("Failed to build alias index (continuing without it):", e);
  }

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
    }

    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    const pageSize = 100;
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

        for (const meetingDoc of snapshot.docs) {
          totalMeetingsProcessed++;
          const meetingData = meetingDoc.data() as Meeting;
          meetingData.id = meetingDoc.id;

          // 1) Skip if already grouped
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

          // 2) Generate Cache Key
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

          // 3) Cache hit?
          if (groupCache.has(cacheKey)) {
            const cachedGroupId = groupCache.get(cacheKey)!;
            const meetingRef = meetingsRef.doc(meetingData.id!);
            batch.update(meetingRef, {
              groupId: cachedGroupId,
              updatedAt: Timestamp.now(),
              matchingReason: "cache",
            });
            operationsInBatch++;

            const groupRef = groupsRef.doc(cachedGroupId);
            batch.update(groupRef, {
              meetingCount: admin.firestore.FieldValue.increment(1),
            });
            operationsInBatch++;
            totalGroupsUpdated++;

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
                  error: `Batch commit failed: ${errorMsg}`,
                  timestamp: new Date(),
                };
                console.error(
                  `Error committing batch for meeting ${meetingData.id}:`,
                  error
                );
                failedMeetings.push(failure);
                logErrorToFile(failure);
                batch = db.batch();
                operationsInBatch = 0;
              }
            }
            continue;
          }

          // 4) Not cached → look for existing group (online exact, or geo+fuzzy with alias boost)
          let existingGroupId: string | undefined;
          let existingGroupData: Group | undefined;
          let matchReason = "";
          let fuzzyMatchScore = 0;

          try {
            // ONLINE: try alias-name match first (optional) then link exact
            if (meetingData.online && meetingData.link) {
              try {
                // Optional alias name→group doc by name (confidence ≥ 0.7)
                if (aliasIndex.aliasToGroupCounts.size && meetingData.name) {
                  const g = guessGroupNameByAlias(meetingData.name, aliasIndex);
                  if (g.groupName && g.confidence >= 0.7) {
                    const nameQuery = groupsRef
                      .where(
                        "name",
                        "==",
                        toTitleCase(normalizeString(g.groupName))
                      )
                      .limit(1);
                    const nameSnap = await nameQuery.get();
                    if (!nameSnap.empty) {
                      existingGroupId = nameSnap.docs[0].id;
                      existingGroupData = nameSnap.docs[0].data() as Group;
                      matchReason = `alias name match (conf=${Math.round(
                        g.confidence * 100
                      )}%)`;
                    }
                  }
                }
              } catch {}

              if (!existingGroupId) {
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
                }
              }
            }
            // IN-PERSON: geo window + fuzzyCompare + alias boost
            else if (
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

              // Alias prior (NEW)
              let aliasGuess:
                | { groupName?: string; confidence: number }
                | undefined;
              try {
                if (meetingData.name && aliasIndex.aliasToGroupCounts.size) {
                  aliasGuess = guessGroupNameByAlias(
                    meetingData.name,
                    aliasIndex
                  );
                }
              } catch {}

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
                  const snapshot2 = await query.get();

                  let processedDocs = 0;
                  const maxDocsPerQuery = 100;

                  for (const doc of snapshot2.docs) {
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

                      // existing distance penalty combo
                      let combinedScore =
                        score *
                        (1 - (distanceInM / CONFIG.MAX_MATCH_DISTANCE_M) * 0.3);

                      // Alias boost (NEW)
                      if (aliasGuess?.groupName) {
                        const sameGroup =
                          normalizeForMatching(aliasGuess.groupName) ===
                          normalizeForMatching(group.name);
                        if (sameGroup) {
                          const bonus = Math.round(
                            Math.min(10, 10 * aliasGuess.confidence)
                          ); // 0..10
                          combinedScore += bonus;
                        }
                      }

                      // Micro-boost with token Jaccard (NEW)
                      const tj = tokenJaccard(
                        meetingData.name ?? "",
                        group.name ?? ""
                      );
                      combinedScore += Math.round(tj * 5); // 0..5

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
                    }
                  }
                } catch (queryError) {
                  logErrorToFile({
                    meetingId: meetingData.id || "N/A",
                    meetingName: meetingData.name || "N/A",
                    error: `Error executing geohash query for bounds ${b[0]}-${b[1]}: ${queryError}`,
                    timestamp: new Date(),
                  });
                }
              }

              if (
                bestMatchId &&
                bestMatchData &&
                bestMatchScore >= CONFIG.FUZZY_MATCH_THRESHOLD
              ) {
                existingGroupId = bestMatchId;
                existingGroupData = bestMatchData;
                fuzzyMatchScore = bestMatchScore;
                matchReason = `fuzzy+geo candidate (${Math.round(
                  bestMatchScore
                )}) at ${Math.round(bestMatchDistance)}m`;
                totalFuzzyMatches++;
              }
            }

            // 5) Link to existing OR create new group (transaction)
            if (existingGroupId && existingGroupData) {
              totalGroupsFound++;
              console.log(
                `Linking to existing group "${existingGroupData.name}" (${existingGroupId}) for meeting "${meetingData.name}" - ${matchReason}`
              );
              groupCache.set(cacheKey, existingGroupId);

              const meetingRef = meetingsRef.doc(meetingData.id!);
              batch.update(meetingRef, {
                groupId: existingGroupId,
                updatedAt: Timestamp.now(),
                matchingReason: matchReason || "existing match",
              });
              operationsInBatch++;

              const groupRef = groupsRef.doc(existingGroupId);
              batch.update(groupRef, {
                meetingCount: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.Timestamp.now(),
              });
              operationsInBatch++;
              totalGroupsUpdated++;
            } else {
              const newGroupData = createGroupDataFromMeeting(meetingData);

              if (!newGroupData) {
                skippedMeetings++;
                const failure: FailedMeeting = {
                  meetingId: meetingData.id!,
                  meetingName: meetingData.name,
                  error: "Failed to generate group data before transaction",
                  timestamp: new Date(),
                };
                failedMeetings.push(failure);
                logErrorToFile(failure);
                continue;
              }

              // Pre-concurrent check (online/link) or (inplace) to avoid dup in txn
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
                }
              } else if (cacheKey.startsWith("inplace|")) {
                const parts = cacheKey.split("|");
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
                const maxTotalDocs = 50;

                for (const b of bounds) {
                  if (totalDocsProcessed >= maxTotalDocs) break;

                  try {
                    const query2 = groupsRef
                      .where("online", "==", false)
                      .orderBy("geohash")
                      .startAt(b[0])
                      .endAt(b[1])
                      .limit(5);
                    const snapshot3 = await query2.get();

                    for (const doc of snapshot3.docs) {
                      if (totalDocsProcessed >= maxTotalDocs) break;
                      totalDocsProcessed++;

                      try {
                        const group = doc.data() as Partial<Group>;
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
                  }
                }
              }

              try {
                await db.runTransaction(async (transaction) => {
                  if (!finalConcurrentGroupId) {
                    const newGroupRef = groupsRef.doc();
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
                      matchingReason: "created (no prior match)",
                    });
                    groupCache.set(cacheKey, newGroupRef.id);
                    totalGroupsCreated++;
                    logCreatedGroupToFile(completeGroupData as Group);
                  } else {
                    console.log(
                      `TX: Group ${finalConcurrentGroupId} found concurrently, linking meeting ${meetingData.id}`
                    );
                    transaction.update(meetingsRef.doc(meetingData.id!), {
                      groupId: finalConcurrentGroupId,
                      updatedAt: Timestamp.now(),
                      matchingReason: "concurrent-link",
                    });
                    transaction.update(groupsRef.doc(finalConcurrentGroupId), {
                      meetingCount: admin.firestore.FieldValue.increment(1),
                    });
                    groupCache.set(cacheKey, finalConcurrentGroupId);
                    totalGroupsFound++;
                    totalGroupsUpdated++;
                  }
                });
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
                continue;
              }
              operationsInBatch++;
            }

            // 7) Commit main batch if full
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

          // Progress logs
          if (
            totalMeetingsProcessed % 100 === 0 ||
            totalMeetingsProcessed === totalMeetings
          ) {
            console.log(
              `Progress: ${totalMeetingsProcessed}/${totalMeetings} meetings ` +
                `(${
                  totalMeetings
                    ? Math.round((totalMeetingsProcessed / totalMeetings) * 100)
                    : "?"
                }%) ` +
                `| Created: ${totalGroupsCreated}, Found: ${totalGroupsFound} (Fuzzy: ${totalFuzzyMatches}), ` +
                `Skipped: ${skippedMeetings}, Updated: ${totalGroupsUpdated}, Errors: ${failedMeetings.length}`
            );
          }
        } // end for each doc

        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        if (snapshot.docs.length < pageSize) {
          hasMore = false;
        }

        await sleep(100);
      } catch (batchError: any) {
        console.error("Error processing batch:", batchError);

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

    // Commit any remaining operations
    if (operationsInBatch > 0) {
      try {
        await commitBatch(batch, operationsInBatch);
      } catch (error) {
        console.error("Error committing final remaining batch:", error);
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
    console.log(`  - Via Fuzzy/Geo Matches: ${totalFuzzyMatches}`);
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
    throw error;
  }
}

// Execute the script with proper cleanup
seedGroupsWithFuzzyMatching()
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
