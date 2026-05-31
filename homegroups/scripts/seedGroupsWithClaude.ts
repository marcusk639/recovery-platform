import * as admin from "firebase-admin";
import * as geofire from "geofire-common";
import * as path from "path";
import * as fs from "fs";
import { Timestamp } from "firebase-admin/firestore";

// Types
interface Meeting {
  id: string;
  name: string;
  time: string;
  format: string;
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
  day?: string;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  apiId?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  groupId?: string;
  type?: string;
}

interface Group {
  id: string;
  name: string;
  type: string;
  description: string;
  location: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  meetingCount: number;
  isClaimed: boolean;
  admins: string[];
  memberCount: number;
  pendingAdminRequests: any[];
  treasurers: string[];
  treasury: any;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  placeName?: string;
  online?: boolean;
  geohash?: string;
  link?: string;
}

interface ProcessingState {
  lastProcessedId: string;
  totalProcessed: number;
  groupsCreated: number;
  groupsFound: number;
  meetingsSkipped: number;
  errors: number;
  timestamp: Date;
}

interface FailedOperation {
  meetingId: string;
  meetingName: string;
  operation: "group_creation" | "meeting_update" | "group_query" | "validation";
  error: string;
  timestamp: Date;
  retryCount: number;
}

// Configuration
const CONFIG = {
  SERVICE_ACCOUNT_PATH: "./serviceAccountKey.json",
  MEETINGS_COLLECTION: "meetings",
  GROUPS_COLLECTION: "groups",
  BATCH_SIZE: 25, // Reduced for better reliability
  PAGE_SIZE: 50,
  FUZZY_MATCH_THRESHOLD: 75,
  COORDINATE_PRECISION: 4,
  GEOHASH_PRECISION: 8,
  CLOSE_DISTANCE_M: 100,
  MAX_MATCH_DISTANCE_M: 500,
  MAX_RETRY_ATTEMPTS: 3,
  RESUME_CHECKPOINT_INTERVAL: 100,
};

// Logging setup
const LOG_DIR = "./logs";
const ERROR_LOG_FILE = path.join(LOG_DIR, "group_seeding_errors.log");
const CREATED_GROUPS_LOG_FILE = path.join(LOG_DIR, "groups_created.log");
const PROCESSING_STATE_FILE = path.join(LOG_DIR, "processing_state.json");
const FAILED_OPERATIONS_FILE = path.join(LOG_DIR, "failed_operations.json");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

class GroupSeedingService {
  private db: admin.firestore.Firestore;
  private groupCache = new Map<string, string>();
  private failedOperations: FailedOperation[] = [];
  private processingState: ProcessingState;

  constructor() {
    this.initializeFirebase();
    this.db = admin.firestore();
    this.db.settings({ ignoreUndefinedProperties: true });
    this.processingState = this.loadProcessingState();
  }

  private initializeFirebase() {
    try {
      console.log("Initializing Firebase Admin SDK...");
      admin.initializeApp({
        credential: admin.credential.cert(require(CONFIG.SERVICE_ACCOUNT_PATH)),
      });
    } catch (error: any) {
      console.error("Firebase Admin SDK initialization failed:", error);
      process.exit(1);
    }
  }

  private loadProcessingState(): ProcessingState {
    try {
      if (fs.existsSync(PROCESSING_STATE_FILE)) {
        const stateData = JSON.parse(
          fs.readFileSync(PROCESSING_STATE_FILE, "utf8")
        );
        console.log(
          `Resuming from last processed ID: ${stateData.lastProcessedId}`
        );
        return stateData;
      }
    } catch (error) {
      console.warn("Could not load processing state, starting fresh:", error);
    }

    return {
      lastProcessedId: "",
      totalProcessed: 0,
      groupsCreated: 0,
      groupsFound: 0,
      meetingsSkipped: 0,
      errors: 0,
      timestamp: new Date(),
    };
  }

  private saveProcessingState() {
    try {
      this.processingState.timestamp = new Date();
      fs.writeFileSync(
        PROCESSING_STATE_FILE,
        JSON.stringify(this.processingState, null, 2)
      );
    } catch (error) {
      console.error("Failed to save processing state:", error);
    }
  }

  private loadFailedOperations(): FailedOperation[] {
    try {
      if (fs.existsSync(FAILED_OPERATIONS_FILE)) {
        return JSON.parse(fs.readFileSync(FAILED_OPERATIONS_FILE, "utf8"));
      }
    } catch (error) {
      console.warn("Could not load failed operations:", error);
    }
    return [];
  }

  private saveFailedOperations() {
    try {
      fs.writeFileSync(
        FAILED_OPERATIONS_FILE,
        JSON.stringify(this.failedOperations, null, 2)
      );
    } catch (error) {
      console.error("Failed to save failed operations:", error);
    }
  }

  private logError(operation: FailedOperation) {
    this.failedOperations.push(operation);
    const logEntry = `[${operation.timestamp.toISOString()}] ${operation.operation.toUpperCase()} - Meeting: ${
      operation.meetingId
    } "${operation.meetingName}" - Error: ${operation.error}\n`;
    try {
      fs.appendFileSync(ERROR_LOG_FILE, logEntry);
    } catch (e) {
      console.error("Failed to write to error log:", e);
    }
  }

  private logCreatedGroup(group: Group) {
    const logEntry = {
      id: group.id,
      name: group.name,
      description: group.description,
      city: group.city,
      state: group.state,
      address: group.address,
      location: group.location,
      timestamp: new Date(),
    };
    try {
      fs.appendFileSync(
        CREATED_GROUPS_LOG_FILE,
        JSON.stringify(logEntry) + "\n"
      );
    } catch (e) {
      console.error(`Failed to write created group ${group.id} to log:`, e);
    }
  }

  // Improved name extraction that preserves full group names
  private extractGroupName(meetingName: string): string | null {
    if (!meetingName) return null;

    // Clean the name first
    let cleanName = meetingName
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^\w\s\-'.,&()]/g, ""); // Keep essential punctuation

    // Remove meeting format indicators (case-insensitive)
    cleanName = cleanName
      .replace(/\b(in[\-\s]*person|in[\-\s]*place)\b/gi, "")
      .replace(/\b(online|virtual|zoom|web|internet)\b/gi, "")
      .replace(/\b(hybrid|mixed|both)\b/gi, "")
      .replace(/\b(face[\-\s]*to[\-\s]*face|f2f)\b/gi, "")
      .replace(/\b(remote|digital)\b/gi, "")
      .trim()
      .replace(/\s+/g, " "); // Clean up extra spaces

    // Remove time patterns at the end
    cleanName = cleanName
      .replace(
        /\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
        ""
      )
      .replace(/\s+(am|pm|noon|morning|evening|night)\s*$/i, "")
      .replace(/\s+(\d{1,2}:\d{2}(\s*(am|pm))?)\s*$/i, "")
      .replace(/\s+(\d{1,2}(:\d{2})?\s*(am|pm))\s*$/i, "")
      .trim();

    // Remove location indicators at the end
    cleanName = cleanName
      .replace(/\s+(at|@)\s+.+$/i, "")
      .replace(/\s+-\s+.+$/i, "")
      .trim();

    // If we have a groupName field, prefer that
    const meeting = meetingName as any;
    if (meeting?.groupName && meeting.groupName.length > 3) {
      return this.toTitleCase(meeting.groupName.trim());
    }

    // Look for quoted group names
    const quotedMatch = cleanName.match(/"([^"]+)"/);
    if (quotedMatch && quotedMatch[1].length > 3) {
      return this.toTitleCase(quotedMatch[1]);
    }

    // Look for group patterns but be more conservative about truncation
    const groupPatterns = [
      /^(.+?)\s+(group|grp)\b/i,
      /^(.+?)\s+(fellowship|meeting|mtg)\b/i,
      /^(.+?)\s+(club|house|center|room)\b/i,
    ];

    for (const pattern of groupPatterns) {
      const match = cleanName.match(pattern);
      if (match && match[1].length > 3) {
        // Ensure we're not cutting off important parts
        const extracted = match[1].trim();
        // Only use if it's not just one short word
        const words = extracted.split(/\s+/);
        if (words.length > 1 || words[0].length > 4) {
          return this.toTitleCase(extracted);
        }
      }
    }

    // For longer names, try to find natural break points
    const words = cleanName.split(/\s+/);
    if (words.length > 3) {
      // Look for common stop words that indicate the end of the group name
      const stopWords = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "morning",
        "evening",
        "night",
        "noon",
        "am",
        "pm",
        "meeting",
        "group",
        "at",
      ];

      let endIndex = words.length;
      for (let i = 2; i < words.length; i++) {
        // Start from 2 to ensure at least 2 words
        if (stopWords.includes(words[i].toLowerCase())) {
          endIndex = i;
          break;
        }
      }

      const extracted = words.slice(0, endIndex).join(" ");
      if (extracted.length > 3) {
        return this.toTitleCase(extracted);
      }
    }

    // If all else fails, use the cleaned name if it's reasonable
    if (cleanName.length >= 3 && cleanName.length <= 100) {
      return this.toTitleCase(cleanName);
    }

    return null;
  }

  private toTitleCase(str: string): string {
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
      "with",
    ]);
    const acronyms = new Set(["aa", "na", "ca", "oa", "ga", "sa", "iop"]);

    return str
      .toLowerCase()
      .split(/\s+/)
      .map((word, index, arr) => {
        if (!word) return "";

        // Keep acronyms uppercase
        if (acronyms.has(word)) {
          return word.toUpperCase();
        }

        // Handle possessives
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

        // Capitalize if first/last word or not a minor word
        if (index === 0 || index === arr.length - 1 || !minorWords.has(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }

        return word;
      })
      .join(" ");
  }

  private normalizeString(str?: string): string {
    if (!str) return "";
    return str
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private createCacheKey(meeting: Meeting): string | null {
    try {
      if (meeting.online && meeting.link) {
        const normalizedLink = meeting.link
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")
          .toLowerCase();
        return `online|${normalizedLink}`;
      } else if (meeting.lat !== undefined && meeting.lng !== undefined) {
        // Validate coordinates
        if (
          meeting.lat < -90 ||
          meeting.lat > 90 ||
          meeting.lng < -180 ||
          meeting.lng > 180
        ) {
          return null;
        }

        const roundedLat =
          Math.round(meeting.lat * Math.pow(10, CONFIG.COORDINATE_PRECISION)) /
          Math.pow(10, CONFIG.COORDINATE_PRECISION);
        const roundedLng =
          Math.round(meeting.lng * Math.pow(10, CONFIG.COORDINATE_PRECISION)) /
          Math.pow(10, CONFIG.COORDINATE_PRECISION);

        const locationIdentifier = this.normalizeString(
          meeting.locationName ||
            meeting.address ||
            meeting.street ||
            meeting.city ||
            "unknown"
        ).substring(0, 30);

        return `location|${roundedLat}|${roundedLng}|${locationIdentifier}`;
      }
      return null;
    } catch (error) {
      console.error(
        `Error creating cache key for meeting ${meeting.id}:`,
        error
      );
      return null;
    }
  }

  private calculateStringSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 100;
    if (!s1 || !s2) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 100;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return Math.round((1 - editDistance / longer.length) * 100);
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[s2.length][s1.length];
  }

  private fuzzyMatch(
    s1?: string,
    s2?: string
  ): { score: number; isMatch: boolean } {
    const str1 = this.normalizeString(s1);
    const str2 = this.normalizeString(s2);

    if (!str1 || !str2) return { score: 0, isMatch: false };

    const score = this.calculateStringSimilarity(str1, str2);

    // Also check for substring matches
    let containsBonus = 0;
    if (str1.includes(str2) || str2.includes(str1)) {
      containsBonus = 10;
    }

    const finalScore = Math.min(100, score + containsBonus);
    return {
      score: finalScore,
      isMatch: finalScore >= CONFIG.FUZZY_MATCH_THRESHOLD,
    };
  }

  private async findExistingGroup(
    meeting: Meeting
  ): Promise<{ groupId: string; group: Group } | null> {
    try {
      const extractedName = this.extractGroupName(meeting.name);

      // First try online groups
      if (meeting.online && meeting.link) {
        const normalizedLink = meeting.link
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "");
        const onlineQuery = this.db
          .collection(CONFIG.GROUPS_COLLECTION)
          .where("online", "==", true)
          .where("link", "==", normalizedLink)
          .limit(1);

        const onlineSnapshot = await onlineQuery.get();
        if (!onlineSnapshot.empty) {
          const doc = onlineSnapshot.docs[0];
          return {
            groupId: doc.id,
            group: { ...doc.data(), id: doc.id } as Group,
          };
        }
      }

      // Try location-based search for in-person meetings
      if (!meeting.online && meeting.lat && meeting.lng) {
        const center: [number, number] = [meeting.lat, meeting.lng];
        const bounds = geofire.geohashQueryBounds(
          center,
          CONFIG.CLOSE_DISTANCE_M
        );

        let bestMatch: { groupId: string; group: Group; score: number } | null =
          null;

        for (const bound of bounds) {
          try {
            const query = this.db
              .collection(CONFIG.GROUPS_COLLECTION)
              .where("online", "==", false)
              .orderBy("geohash")
              .startAt(bound[0])
              .endAt(bound[1])
              .limit(20);

            const snapshot = await query.get();

            for (const doc of snapshot.docs) {
              const group = { ...doc.data(), id: doc.id } as Group;

              if (!group.lat || !group.lng) continue;

              const distance =
                geofire.distanceBetween([group.lat, group.lng], center) * 1000;
              if (distance > CONFIG.MAX_MATCH_DISTANCE_M) continue;

              if (extractedName && group.name) {
                const nameMatch = this.fuzzyMatch(extractedName, group.name);
                if (nameMatch.isMatch) {
                  const score =
                    nameMatch.score *
                    (1 - (distance / CONFIG.MAX_MATCH_DISTANCE_M) * 0.2);
                  if (!bestMatch || score > bestMatch.score) {
                    bestMatch = { groupId: doc.id, group, score };
                  }
                }
              }
            }
          } catch (queryError) {
            console.warn(
              `Query error for bound ${bound[0]}-${bound[1]}:`,
              queryError
            );
            continue;
          }
        }

        if (bestMatch) {
          return { groupId: bestMatch.groupId, group: bestMatch.group };
        }
      }

      return null;
    } catch (error) {
      this.logError({
        meetingId: meeting.id,
        meetingName: meeting.name,
        operation: "group_query",
        error: `Error finding existing group: ${error}`,
        timestamp: new Date(),
        retryCount: 0,
      });
      return null;
    }
  }

  private createGroupFromMeeting(meeting: Meeting): Omit<Group, "id"> | null {
    try {
      const groupName = this.extractGroupName(meeting.name);
      if (!groupName) {
        throw new Error("Could not extract group name");
      }

      const now = Timestamp.now();

      const groupData: Omit<Group, "id"> = {
        name: groupName,
        type: "AA",
        description: `AA Meeting Group that hosts meetings such as "${meeting.name}".`,
        location:
          meeting.locationName ||
          meeting.formattedAddress ||
          meeting.address ||
          meeting.city ||
          "",
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

      // Add location-specific fields
      if (meeting.address) groupData.address = meeting.address;
      if (meeting.city) groupData.city = meeting.city;
      if (meeting.state) groupData.state = meeting.state;
      if (meeting.zip) groupData.zip = meeting.zip;

      if (meeting.online && meeting.link) {
        groupData.online = true;
        groupData.link = meeting.link;
      } else if (meeting.lat && meeting.lng) {
        groupData.online = false;
        groupData.lat = meeting.lat;
        groupData.lng = meeting.lng;
        groupData.placeName = meeting.locationName;
        groupData.geohash = geofire.geohashForLocation(
          [meeting.lat, meeting.lng],
          CONFIG.GEOHASH_PRECISION
        );
      } else {
        groupData.online = false; // Default to in-person even without coordinates
      }

      return groupData;
    } catch (error) {
      this.logError({
        meetingId: meeting.id,
        meetingName: meeting.name,
        operation: "group_creation",
        error: `Error creating group data: ${error}`,
        timestamp: new Date(),
        retryCount: 0,
      });
      return null;
    }
  }

  private async processMeetingWithTransaction(
    meeting: Meeting
  ): Promise<boolean> {
    try {
      return await this.db.runTransaction(async (transaction) => {
        // Check cache first
        const cacheKey = this.createCacheKey(meeting);
        if (cacheKey && this.groupCache.has(cacheKey)) {
          const cachedGroupId = this.groupCache.get(cacheKey)!;

          // Verify group exists
          const groupRef = this.db
            .collection(CONFIG.GROUPS_COLLECTION)
            .doc(cachedGroupId);
          const groupDoc = await transaction.get(groupRef);

          if (groupDoc.exists) {
            // Update meeting and increment group meeting count
            const meetingRef = this.db
              .collection(CONFIG.MEETINGS_COLLECTION)
              .doc(meeting.id);
            transaction.update(meetingRef, {
              groupId: cachedGroupId,
              updatedAt: Timestamp.now(),
            });

            transaction.update(groupRef, {
              meetingCount: admin.firestore.FieldValue.increment(1),
              updatedAt: Timestamp.now(),
            });

            this.processingState.groupsFound++;
            return true;
          } else {
            // Remove invalid cache entry
            this.groupCache.delete(cacheKey);
          }
        }

        // Try to find existing group
        const existingGroup = await this.findExistingGroup(meeting);

        if (existingGroup) {
          // Link to existing group
          const meetingRef = this.db
            .collection(CONFIG.MEETINGS_COLLECTION)
            .doc(meeting.id);
          const groupRef = this.db
            .collection(CONFIG.GROUPS_COLLECTION)
            .doc(existingGroup.groupId);

          transaction.update(meetingRef, {
            groupId: existingGroup.groupId,
            updatedAt: Timestamp.now(),
          });

          transaction.update(groupRef, {
            meetingCount: admin.firestore.FieldValue.increment(1),
            updatedAt: Timestamp.now(),
          });

          if (cacheKey) {
            this.groupCache.set(cacheKey, existingGroup.groupId);
          }

          this.processingState.groupsFound++;
          return true;
        } else {
          // Create new group
          const groupData = this.createGroupFromMeeting(meeting);
          if (!groupData) {
            return false;
          }

          const newGroupRef = this.db
            .collection(CONFIG.GROUPS_COLLECTION)
            .doc();
          const completeGroupData = { ...groupData, id: newGroupRef.id };

          // Set group and update meeting in transaction
          transaction.set(newGroupRef, completeGroupData);

          const meetingRef = this.db
            .collection(CONFIG.MEETINGS_COLLECTION)
            .doc(meeting.id);
          transaction.update(meetingRef, {
            groupId: newGroupRef.id,
            updatedAt: Timestamp.now(),
          });

          if (cacheKey) {
            this.groupCache.set(cacheKey, newGroupRef.id);
          }

          this.logCreatedGroup(completeGroupData as Group);
          this.processingState.groupsCreated++;
          return true;
        }
      });
    } catch (error) {
      this.logError({
        meetingId: meeting.id,
        meetingName: meeting.name,
        operation: "meeting_update",
        error: `Transaction failed: ${error}`,
        timestamp: new Date(),
        retryCount: 0,
      });
      return false;
    }
  }

  private async validateGroupIntegrity(): Promise<void> {
    console.log("\nValidating group integrity...");

    // Check for orphaned meetings (have groupId but group doesn't exist)
    let orphanedCount = 0;
    const orphanedMeetings: string[] = [];

    const meetingsQuery = this.db
      .collection(CONFIG.MEETINGS_COLLECTION)
      .where("groupId", "!=", null)
      .limit(1000);

    let lastDoc = null;
    let hasMore = true;

    while (hasMore) {
      let query = meetingsQuery;
      if (lastDoc) {
        query = query.startAfter(lastDoc) as any;
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      for (const meetingDoc of snapshot.docs) {
        const meeting = meetingDoc.data() as Meeting;
        if (meeting.groupId) {
          try {
            const groupDoc = await this.db
              .collection(CONFIG.GROUPS_COLLECTION)
              .doc(meeting.groupId)
              .get();

            if (!groupDoc.exists) {
              orphanedCount++;
              orphanedMeetings.push(meeting.id);
              console.log(
                `Orphaned meeting found: ${meeting.id} -> ${meeting.groupId}`
              );
            }
          } catch (error) {
            console.error(`Error checking group ${meeting.groupId}:`, error);
          }
        }
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      hasMore = snapshot.docs.length === 1000;
    }

    console.log(`Found ${orphanedCount} orphaned meetings`);
    if (orphanedMeetings.length > 0) {
      fs.writeFileSync(
        path.join(LOG_DIR, "orphaned_meetings.json"),
        JSON.stringify(orphanedMeetings, null, 2)
      );
    }
  }

  async processAllMeetings() {
    console.log("Starting robust group seeding process...");

    try {
      // Get total count
      const totalSnapshot = await this.db
        .collection(CONFIG.MEETINGS_COLLECTION)
        .where("type", "==", "AA")
        .count()
        .get();
      const totalMeetings = totalSnapshot.data().count;

      console.log(`Found ${totalMeetings} AA meetings to process`);
      console.log(
        `Resuming from: ${this.processingState.lastProcessedId || "beginning"}`
      );

      let hasMore = true;
      let lastDoc: any = null;

      // If resuming, find the last processed document
      if (this.processingState.lastProcessedId) {
        try {
          lastDoc = await this.db
            .collection(CONFIG.MEETINGS_COLLECTION)
            .doc(this.processingState.lastProcessedId)
            .get();
        } catch (error) {
          console.warn(
            "Could not find last processed document, starting fresh:",
            error
          );
          this.processingState.lastProcessedId = "";
        }
      }

      while (hasMore) {
        try {
          let query = this.db
            .collection(CONFIG.MEETINGS_COLLECTION)
            .where("type", "==", "AA")
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(CONFIG.PAGE_SIZE);

          if (lastDoc && lastDoc.exists) {
            query = query.startAfter(lastDoc);
          }

          const snapshot = await query.get();

          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          console.log(
            `Processing batch of ${snapshot.docs.length} meetings...`
          );

          for (const meetingDoc of snapshot.docs) {
            const meeting = meetingDoc.data() as Meeting;
            meeting.id = meetingDoc.id;

            // Skip if already has groupId (idempotency)
            if (meeting.groupId) {
              this.processingState.meetingsSkipped++;
              continue;
            }

            // Validate meeting has required fields
            if (
              !meeting.name ||
              (!meeting.online && !meeting.lat && !meeting.lng)
            ) {
              this.processingState.meetingsSkipped++;
              this.logError({
                meetingId: meeting.id,
                meetingName: meeting.name || "Unknown",
                operation: "validation",
                error: "Missing required fields (name or location)",
                timestamp: new Date(),
                retryCount: 0,
              });
              continue;
            }

            // Process the meeting
            const success = await this.processMeetingWithTransaction(meeting);

            if (!success) {
              this.processingState.errors++;
            }

            this.processingState.totalProcessed++;
            this.processingState.lastProcessedId = meeting.id;

            // Save state periodically
            if (
              this.processingState.totalProcessed %
                CONFIG.RESUME_CHECKPOINT_INTERVAL ===
              0
            ) {
              this.saveProcessingState();
              this.saveFailedOperations();
              console.log(
                `Progress: ${this.processingState.totalProcessed}/${totalMeetings} ` +
                  `(${Math.round(
                    (this.processingState.totalProcessed / totalMeetings) * 100
                  )}%) ` +
                  `| Created: ${this.processingState.groupsCreated}, Found: ${this.processingState.groupsFound}, ` +
                  `Skipped: ${this.processingState.meetingsSkipped}, Errors: ${this.processingState.errors}`
              );
            }
          }

          lastDoc = snapshot.docs[snapshot.docs.length - 1];
          hasMore = snapshot.docs.length === CONFIG.PAGE_SIZE;

          // Small delay between batches
          await this.sleep(100);
        } catch (batchError) {
          console.error("Error processing batch:", batchError);

          // Try to continue from next document
          if (lastDoc) {
            try {
              const nextQuery = this.db
                .collection(CONFIG.MEETINGS_COLLECTION)
                .where("type", "==", "AA")
                .orderBy(admin.firestore.FieldPath.documentId())
                .startAfter(lastDoc)
                .limit(1);
              const nextSnapshot = await nextQuery.get();
              if (!nextSnapshot.empty) {
                lastDoc = nextSnapshot.docs[0];
              } else {
                hasMore = false;
              }
            } catch (skipError) {
              console.error("Could not skip problematic batch:", skipError);
              hasMore = false;
            }
          } else {
            hasMore = false;
          }

          await this.sleep(1000); // Wait longer after error
        }
      }

      // Final save
      this.saveProcessingState();
      this.saveFailedOperations();

      console.log("\n--- Processing Complete ---");
      console.log(
        `Total Meetings Processed: ${this.processingState.totalProcessed}`
      );
      console.log(`New Groups Created: ${this.processingState.groupsCreated}`);
      console.log(`Existing Groups Found: ${this.processingState.groupsFound}`);
      console.log(`Meetings Skipped: ${this.processingState.meetingsSkipped}`);
      console.log(`Errors: ${this.processingState.errors}`);

      if (this.failedOperations.length > 0) {
        console.log(`Failed operations logged to: ${FAILED_OPERATIONS_FILE}`);
      }

      // Run integrity validation
      await this.validateGroupIntegrity();
    } catch (error) {
      console.error("Fatal error in processing:", error);
      this.saveProcessingState();
      this.saveFailedOperations();
      throw error;
    }
  }

  private async retryFailedOperations() {
    console.log("\nRetrying failed operations...");
    const failedOps = this.loadFailedOperations();
    const retriableOps = failedOps.filter(
      (op) => op.retryCount < CONFIG.MAX_RETRY_ATTEMPTS
    );

    if (retriableOps.length === 0) {
      console.log("No failed operations to retry");
      return;
    }

    console.log(`Retrying ${retriableOps.length} failed operations`);

    for (const failedOp of retriableOps) {
      try {
        // Get the meeting data
        const meetingDoc = await this.db
          .collection(CONFIG.MEETINGS_COLLECTION)
          .doc(failedOp.meetingId)
          .get();

        if (!meetingDoc.exists) {
          console.log(
            `Meeting ${failedOp.meetingId} no longer exists, skipping retry`
          );
          continue;
        }

        const meeting = { ...meetingDoc.data(), id: meetingDoc.id } as Meeting;

        // Skip if already has groupId
        if (meeting.groupId) {
          console.log(
            `Meeting ${failedOp.meetingId} already has groupId, skipping retry`
          );
          continue;
        }

        const success = await this.processMeetingWithTransaction(meeting);

        if (success) {
          console.log(`Successfully retried meeting ${failedOp.meetingId}`);
          // Remove from failed operations
          const index = this.failedOperations.findIndex(
            (op) =>
              op.meetingId === failedOp.meetingId &&
              op.timestamp === failedOp.timestamp
          );
          if (index > -1) {
            this.failedOperations.splice(index, 1);
          }
        } else {
          // Increment retry count
          failedOp.retryCount++;
          failedOp.timestamp = new Date();
        }

        await this.sleep(50); // Small delay between retries
      } catch (error) {
        console.error(
          `Error retrying operation for meeting ${failedOp.meetingId}:`,
          error
        );
        failedOp.retryCount++;
        failedOp.timestamp = new Date();
        failedOp.error = `Retry failed: ${error}`;
      }
    }

    this.saveFailedOperations();
    console.log("Retry process complete");
  }

  private async cleanupOrphanedMeetings() {
    console.log("\nCleaning up orphaned meetings...");

    const orphanedFile = path.join(LOG_DIR, "orphaned_meetings.json");
    if (!fs.existsSync(orphanedFile)) {
      console.log("No orphaned meetings file found");
      return;
    }

    const orphanedMeetings: string[] = JSON.parse(
      fs.readFileSync(orphanedFile, "utf8")
    );
    console.log(
      `Found ${orphanedMeetings.length} orphaned meetings to clean up`
    );

    let batch = this.db.batch();
    let operations = 0;
    let cleaned = 0;

    for (const meetingId of orphanedMeetings) {
      try {
        const meetingRef = this.db
          .collection(CONFIG.MEETINGS_COLLECTION)
          .doc(meetingId);
        batch.update(meetingRef, {
          groupId: admin.firestore.FieldValue.delete(),
          updatedAt: Timestamp.now(),
        });

        operations++;

        if (operations >= CONFIG.BATCH_SIZE) {
          await batch.commit();
          cleaned += operations;
          console.log(
            `Cleaned ${cleaned}/${orphanedMeetings.length} orphaned meetings`
          );
          batch = this.db.batch();
          operations = 0;
          await this.sleep(100);
        }
      } catch (error) {
        console.error(`Error cleaning meeting ${meetingId}:`, error);
      }
    }

    if (operations > 0) {
      await batch.commit();
      cleaned += operations;
    }

    console.log(`Cleaned up ${cleaned} orphaned meetings`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async run() {
    try {
      console.log("=== Robust Group Seeding Script ===");
      console.log(`Started at: ${new Date().toISOString()}`);

      // Process all meetings
      await this.processAllMeetings();

      // Retry failed operations
      await this.retryFailedOperations();

      // Clean up any orphaned meetings
      await this.cleanupOrphanedMeetings();

      console.log("\n=== Script completed successfully ===");
    } catch (error) {
      console.error("Script failed:", error);
      throw error;
    } finally {
      // Cleanup
      try {
        await admin.app().delete();
      } catch (e) {
        console.warn("Error cleaning up Firebase app:", e);
      }
    }
  }
}

// Main execution
async function main() {
  const seeder = new GroupSeedingService();

  try {
    await seeder.run();
    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, saving state and exiting...");
  // The service will save state automatically
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, saving state and exiting...");
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}
