import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import * as fs from "fs";
import { CONFIG } from "./shared-types";
import {
  generateMeetingHash,
  normalizeString,
  roundCoordinate,
  sleep,
  cleanMeetingName,
} from "./shared-utils";

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

interface OrphanedMeeting {
  id: string;
  name: string;
  groupId: string;
  lat?: number;
  lng?: number;
  online: boolean;
  link?: string;
  locationName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface ConsolidationResult {
  orphanedMeetingsProcessed: number;
  meetingsConsolidated: number;
  newGroupsCreated: number;
  meetingsRemovedOrphanedId: number;
  errors: number;
  consolidatedGroups: Map<string, string>; // oldGroupId -> newGroupId
}

// Helper functions from the main script
function createGroupCacheKey(meeting: OrphanedMeeting): string | null {
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
    if (!locationIdentifier) return null;
    return `inplace|${roundedLat}|${roundedLng}|${locationIdentifier.substring(
      0,
      50
    )}`;
  }
  return null;
}

function extractGroupName(meetingName: string | undefined): string | null {
  if (!meetingName) return null;

  const stripped = meetingName
    .replace(
      /\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
      ""
    )
    .replace(/\s+(am|pm|noon|morning|evening|night)\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2})\s*$/i, "")
    .replace(/\s+(\d{1,2}:\d{2}\s*(am|pm))\s*$/i, "")
    .replace(/\s+-\s*.*$/, "")
    .replace(/\s+–\s*.*$/, "")
    .replace(/\s+—\s*.*$/, "")
    .replace(/\s+:\s*.*$/, "")
    .trim();

  if (!stripped) return null;

  const normalizedName = normalizeString(stripped);

  const quotedMatch = normalizedName.match(/"([^"]+)"/);
  if (quotedMatch) return quotedMatch[1];

  const groupMatch = normalizedName.match(
    /(.+?)\s+(group|grp|fellowship|meeting|mtg|grapevine)\b/i
  );
  if (groupMatch) return groupMatch[1];

  const dayMatch = normalizedName.match(
    /(.+?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|noon|morning|evening|night)\b/i
  );
  if (dayMatch) return dayMatch[1];

  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
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

    const meaningfulParts = parts.slice(0, Math.min(endIndex, 6));
    if (meaningfulParts.length >= 2) {
      return meaningfulParts.join(" ");
    }
  }

  if (stripped.length >= 3 && stripped.length <= 50) {
    return stripped;
  }

  return null;
}

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
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 100;
  const distance = levenshteinDistance(longer, shorter);
  return Math.round((1 - distance / Math.max(longer.length, 1)) * 100);
}

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

async function consolidateOrphanedMeetings() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  // Ensure log directory exists
  if (!fs.existsSync("./logs")) {
    fs.mkdirSync("./logs", { recursive: true });
  }

  console.log("Starting orphaned meetings consolidation...");

  const result: ConsolidationResult = {
    orphanedMeetingsProcessed: 0,
    meetingsConsolidated: 0,
    newGroupsCreated: 0,
    meetingsRemovedOrphanedId: 0,
    errors: 0,
    consolidatedGroups: new Map(),
  };

  try {
    // Step 1: Get all orphaned meetings
    console.log("Step 1: Identifying orphaned meetings...");
    const orphanedMeetings: OrphanedMeeting[] = [];

    // Get all meetings with groupIds
    const meetingsSnapshot = await meetingsRef
      .where("groupId", "!=", null)
      .get();

    console.log(`Found ${meetingsSnapshot.docs.length} meetings with groupIds`);

    // Check which groups exist
    const groupIds = [
      ...new Set(
        meetingsSnapshot.docs.map((doc) => doc.data().groupId).filter(Boolean)
      ),
    ];
    console.log(`Checking ${groupIds.length} unique groupIds...`);

    const existingGroups = new Set<string>();
    const batchSize = 10;

    for (let i = 0; i < groupIds.length; i += batchSize) {
      const batch = groupIds.slice(i, i + batchSize);
      try {
        const groupsSnapshot = await groupsRef
          .where(admin.firestore.FieldPath.documentId(), "in", batch)
          .get();

        groupsSnapshot.docs.forEach((doc) => {
          existingGroups.add(doc.id);
        });
      } catch (error) {
        console.error(`Error checking batch ${i}-${i + batchSize}:`, error);
      }
    }

    console.log(`Found ${existingGroups.size} existing groups`);

    // Identify orphaned meetings
    meetingsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const groupId = data.groupId;
      if (groupId && !existingGroups.has(groupId)) {
        orphanedMeetings.push({
          id: doc.id,
          name: data.name || "N/A",
          groupId,
          lat: data.lat,
          lng: data.lng,
          online: data.online || false,
          link: data.link,
          locationName: data.locationName,
          address: data.address,
          city: data.city,
          state: data.state,
        });
      }
    });

    console.log(`Found ${orphanedMeetings.length} orphaned meetings`);

    if (orphanedMeetings.length === 0) {
      console.log("No orphaned meetings found. Exiting.");
      return;
    }

    // Step 2: Group orphaned meetings by cache key
    console.log("Step 2: Grouping orphaned meetings by location/name...");
    const meetingsByCacheKey = new Map<string, OrphanedMeeting[]>();

    orphanedMeetings.forEach((meeting) => {
      const cacheKey = createGroupCacheKey(meeting);
      if (cacheKey) {
        if (!meetingsByCacheKey.has(cacheKey)) {
          meetingsByCacheKey.set(cacheKey, []);
        }
        meetingsByCacheKey.get(cacheKey)!.push(meeting);
      }
    });

    console.log(`Grouped into ${meetingsByCacheKey.size} logical groups`);

    // Step 3: For each group, find or create a suitable group
    console.log("Step 3: Finding or creating groups for orphaned meetings...");

    let processedGroups = 0;
    for (const [cacheKey, meetings] of meetingsByCacheKey) {
      processedGroups++;
      console.log(
        `Processing group ${processedGroups}/${meetingsByCacheKey.size} (${meetings.length} meetings)`
      );

      try {
        // Find existing group that matches this cache key
        let targetGroupId: string | null = null;

        if (cacheKey.startsWith("online|")) {
          const link = cacheKey.split("|")[1];
          const onlineQuery = groupsRef
            .where("online", "==", true)
            .where("link", "==", link)
            .limit(1);
          const onlineSnapshot = await onlineQuery.get();
          if (!onlineSnapshot.empty) {
            targetGroupId = onlineSnapshot.docs[0].id;
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

              let bestMatchId: string | null = null;
              let bestMatchScore = 0;

              for (const b of bounds) {
                try {
                  const query = groupsRef
                    .where("online", "==", false)
                    .orderBy("geohash")
                    .startAt(b[0])
                    .endAt(b[1]);
                  const snapshot = await query.get();

                  for (const doc of snapshot.docs) {
                    const group = doc.data();
                    if (!group.lat || !group.lng) continue;

                    const distanceInKm = geofire.distanceBetween(
                      [group.lat, group.lng],
                      center
                    );
                    const distanceInM = distanceInKm * 1000;

                    if (distanceInM > CONFIG.MAX_MATCH_DISTANCE_M) continue;

                    const groupIdentifier =
                      normalizeString(group.name) ||
                      normalizeString(group.address) ||
                      normalizeString(group.city);

                    if (groupIdentifier) {
                      const { score } = fuzzyCompare(
                        identifier,
                        groupIdentifier
                      );
                      const combinedScore =
                        score *
                        (1 - (distanceInM / CONFIG.MAX_MATCH_DISTANCE_M) * 0.3);

                      if (combinedScore > bestMatchScore) {
                        bestMatchId = doc.id;
                        bestMatchScore = combinedScore;
                      }
                    }
                  }
                } catch (queryError) {
                  console.error(`Error in geohash query: ${queryError}`);
                }
              }

              if (
                bestMatchId &&
                bestMatchScore >= CONFIG.FUZZY_MATCH_THRESHOLD
              ) {
                targetGroupId = bestMatchId;
              }
            }
          }
        }

        // If no existing group found, create a new one
        if (!targetGroupId) {
          const representativeMeeting = meetings[0];
          const groupName =
            extractGroupName(representativeMeeting.name) ||
            cleanMeetingName(representativeMeeting.name) ||
            representativeMeeting.locationName ||
            "Unknown Group";

          const now = admin.firestore.Timestamp.now();
          const newGroupData: any = {
            name: groupName,
            type: "AA",
            description: `AA Meeting Group that hosts meetings such as "${representativeMeeting.name}".`,
            location:
              representativeMeeting.locationName ||
              representativeMeeting.address ||
              "",
            createdAt: now,
            updatedAt: now,
            meetingCount: meetings.length,
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

          // Add location-specific fields
          if (representativeMeeting.address)
            newGroupData.address = representativeMeeting.address;
          if (representativeMeeting.city)
            newGroupData.city = representativeMeeting.city;
          if (representativeMeeting.state)
            newGroupData.state = representativeMeeting.state;
          if (representativeMeeting.zip)
            newGroupData.zip = representativeMeeting.zip;

          if (representativeMeeting.online && representativeMeeting.link) {
            newGroupData.online = true;
            newGroupData.link = representativeMeeting.link;
          } else if (
            representativeMeeting.lat !== undefined &&
            representativeMeeting.lng !== undefined
          ) {
            newGroupData.lat = representativeMeeting.lat;
            newGroupData.lng = representativeMeeting.lng;
            newGroupData.placeName = representativeMeeting.locationName;
            newGroupData.online = false;

            try {
              if (
                representativeMeeting.lat >= -90 &&
                representativeMeeting.lat <= 90 &&
                representativeMeeting.lng >= -180 &&
                representativeMeeting.lng <= 180
              ) {
                newGroupData.geohash = geofire.geohashForLocation(
                  [representativeMeeting.lat, representativeMeeting.lng],
                  CONFIG.GEOHASH_PRECISION
                );
              }
            } catch (e) {
              console.error(`Error generating geohash: ${e}`);
            }
          }

          const newGroupRef = groupsRef.doc();
          await newGroupRef.set({
            ...newGroupData,
            id: newGroupRef.id,
          });

          targetGroupId = newGroupRef.id;
          result.newGroupsCreated++;
          console.log(`Created new group: ${groupName} (${targetGroupId})`);
        }

        // Update all meetings in this group to point to the target group
        let batch = db.batch();
        let operationsInBatch = 0;

        for (const meeting of meetings) {
          const meetingRef = meetingsRef.doc(meeting.id);
          batch.update(meetingRef, {
            groupId: targetGroupId,
            updatedAt: admin.firestore.Timestamp.now(),
          });
          operationsInBatch++;

          // Update group meeting count
          const groupRef = groupsRef.doc(targetGroupId);
          batch.update(groupRef, {
            meetingCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.Timestamp.now(),
          });
          operationsInBatch++;

          result.consolidatedGroups.set(meeting.groupId, targetGroupId);
          result.meetingsConsolidated++;

          if (operationsInBatch >= 500) {
            await batch.commit();
            batch = db.batch();
            operationsInBatch = 0;
          }
        }

        if (operationsInBatch > 0) {
          await batch.commit();
        }

        result.orphanedMeetingsProcessed += meetings.length;
      } catch (error) {
        console.error(`Error processing group ${cacheKey}:`, error);
        result.errors++;
      }

      // Add delay between groups
      await sleep(100);
    }

    console.log("\n--- Consolidation Complete ---");
    console.log(
      `Orphaned meetings processed: ${result.orphanedMeetingsProcessed}`
    );
    console.log(`Meetings consolidated: ${result.meetingsConsolidated}`);
    console.log(`New groups created: ${result.newGroupsCreated}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Consolidated groups: ${result.consolidatedGroups.size}`);
    console.log("------------------------------\n");

    // Save consolidation results
    const consolidationData = {
      summary: result,
      consolidatedGroups: Array.from(result.consolidatedGroups.entries()),
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(
      "./logs/consolidation_results.json",
      JSON.stringify(consolidationData, null, 2)
    );

    console.log(
      "Consolidation results saved to: ./logs/consolidation_results.json"
    );
  } catch (error) {
    console.error("Error in consolidation process:", error);
  }
}

// Execute the script
consolidateOrphanedMeetings()
  .then(() => {
    console.log("Consolidation script finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Consolidation script failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
