import * as admin from "firebase-admin";
import * as fs from "fs";
import { CONFIG } from "./shared-types";

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
  meetingId: string;
  groupId: string;
  meetingName: string;
  meetingType: string;
  city?: string;
  state?: string;
  online: boolean;
}

async function analyzeOrphanedMeetings() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  // Ensure log directory exists
  if (!fs.existsSync("./logs")) {
    fs.mkdirSync("./logs", { recursive: true });
  }

  console.log("Starting orphaned meetings analysis...");

  let totalMeetingsChecked = 0;
  let meetingsWithGroupIds = 0;
  let orphanedMeetings: OrphanedMeeting[] = [];
  let groupIdCounts = new Map<string, number>();

  try {
    // Get all meetings with groupIds
    const meetingsSnapshot = await meetingsRef
      .where("groupId", "!=", null)
      .get();

    console.log(`Found ${meetingsSnapshot.docs.length} meetings with groupIds`);
    meetingsWithGroupIds = meetingsSnapshot.docs.length;

    // Process in batches to avoid memory issues
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < meetingsSnapshot.docs.length; i += batchSize) {
      batches.push(meetingsSnapshot.docs.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      console.log(`Processing batch of ${batch.length} meetings...`);

      // Get all groupIds from this batch
      const groupIds = batch.map((doc) => doc.data().groupId).filter(Boolean);

      // Check which groups exist
      const existingGroups = new Set<string>();
      if (groupIds.length > 0) {
        const groupsSnapshot = await groupsRef
          .where(admin.firestore.FieldPath.documentId(), "in", groupIds)
          .get();

        groupsSnapshot.docs.forEach((doc) => {
          existingGroups.add(doc.id);
        });
      }

      // Process each meeting in this batch
      for (const meetingDoc of batch) {
        totalMeetingsChecked++;
        const meetingData = meetingDoc.data();
        const meetingId = meetingDoc.id;
        const groupId = meetingData.groupId;

        if (!groupId) continue;

        // Count groupId occurrences
        groupIdCounts.set(groupId, (groupIdCounts.get(groupId) || 0) + 1);

        if (!existingGroups.has(groupId)) {
          // This meeting has an orphaned groupId
          orphanedMeetings.push({
            meetingId,
            groupId,
            meetingName: meetingData.name || "N/A",
            meetingType: meetingData.type || "Unknown",
            city: meetingData.city,
            state: meetingData.state,
            online: meetingData.online || false,
          });
        }
      }

      // Add a small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Sort orphaned meetings by groupId to see patterns
    orphanedMeetings.sort((a, b) => a.groupId.localeCompare(b.groupId));

    // Find the most common orphaned groupIds
    const orphanedGroupIdCounts = new Map<string, number>();
    orphanedMeetings.forEach((meeting) => {
      orphanedGroupIdCounts.set(
        meeting.groupId,
        (orphanedGroupIdCounts.get(meeting.groupId) || 0) + 1
      );
    });

    const sortedOrphanedGroupIds = Array.from(orphanedGroupIdCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // Top 20 most common orphaned groupIds

    console.log("\n--- Orphaned Meetings Analysis Complete ---");
    console.log(`Total meetings checked: ${totalMeetingsChecked}`);
    console.log(`Meetings with groupIds: ${meetingsWithGroupIds}`);
    console.log(`Orphaned meetings found: ${orphanedMeetings.length}`);
    console.log(
      `Orphaned meetings percentage: ${(
        (orphanedMeetings.length / meetingsWithGroupIds) *
        100
      ).toFixed(2)}%`
    );

    console.log("\nTop 20 most common orphaned groupIds:");
    sortedOrphanedGroupIds.forEach(([groupId, count]) => {
      console.log(`  ${groupId}: ${count} meetings`);
    });

    // Save detailed analysis to file
    const analysisData = {
      summary: {
        totalMeetingsChecked,
        meetingsWithGroupIds,
        orphanedMeetingsCount: orphanedMeetings.length,
        orphanedPercentage:
          (orphanedMeetings.length / meetingsWithGroupIds) * 100,
      },
      topOrphanedGroupIds: sortedOrphanedGroupIds,
      orphanedMeetings: orphanedMeetings.slice(0, 1000), // Limit to first 1000 for file size
    };

    fs.writeFileSync(
      "./logs/orphaned_meetings_analysis.json",
      JSON.stringify(analysisData, null, 2)
    );

    console.log(
      `\nDetailed analysis saved to: ./logs/orphaned_meetings_analysis.json`
    );
    console.log("------------------------------------\n");
  } catch (error) {
    console.error("Error in orphaned meetings analysis:", error);
  }
}

// Execute the script
analyzeOrphanedMeetings()
  .then(() => {
    console.log("Analysis finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Analysis failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
