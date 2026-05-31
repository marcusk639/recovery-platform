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

async function quickOrphanedAnalysis() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);
  const groupsRef = db.collection(CONFIG.GROUPS_COLLECTION);

  console.log("Starting quick orphaned meetings analysis...");

  try {
    // First, get a sample of meetings with groupIds (limit to 1000 for quick analysis)
    console.log("Fetching sample of meetings with groupIds...");
    const meetingsSnapshot = await meetingsRef
      .where("groupId", "!=", null)
      .limit(1000)
      .get();

    console.log(
      `Found ${meetingsSnapshot.docs.length} meetings with groupIds (sample)`
    );

    if (meetingsSnapshot.docs.length === 0) {
      console.log("No meetings with groupIds found.");
      return;
    }

    // Get all unique groupIds from the sample
    const groupIds = [
      ...new Set(
        meetingsSnapshot.docs.map((doc) => doc.data().groupId).filter(Boolean)
      ),
    ];
    console.log(`Found ${groupIds.length} unique groupIds in sample`);

    // Check which groups exist (in batches of 10 due to Firestore 'in' query limit)
    const existingGroups = new Set<string>();
    const batchSize = 10;

    for (let i = 0; i < groupIds.length; i += batchSize) {
      const batch = groupIds.slice(i, i + batchSize);
      console.log(
        `Checking groupIds batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          groupIds.length / batchSize
        )}...`
      );

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

    console.log(
      `Found ${existingGroups.size} existing groups out of ${groupIds.length} checked`
    );

    // Count orphaned meetings in the sample
    let orphanedCount = 0;
    const orphanedGroupIds = new Set<string>();

    meetingsSnapshot.docs.forEach((doc) => {
      const groupId = doc.data().groupId;
      if (groupId && !existingGroups.has(groupId)) {
        orphanedCount++;
        orphanedGroupIds.add(groupId);
      }
    });

    console.log("\n--- Quick Analysis Results ---");
    console.log(`Sample size: ${meetingsSnapshot.docs.length} meetings`);
    console.log(`Orphaned meetings in sample: ${orphanedCount}`);
    console.log(
      `Orphaned percentage: ${(
        (orphanedCount / meetingsSnapshot.docs.length) *
        100
      ).toFixed(2)}%`
    );
    console.log(`Unique orphaned groupIds: ${orphanedGroupIds.size}`);

    if (orphanedGroupIds.size > 0) {
      console.log("\nOrphaned groupIds found:");
      Array.from(orphanedGroupIds)
        .slice(0, 10)
        .forEach((groupId) => {
          console.log(`  ${groupId}`);
        });
      if (orphanedGroupIds.size > 10) {
        console.log(`  ... and ${orphanedGroupIds.size - 10} more`);
      }
    }

    // Save results
    const results = {
      sampleSize: meetingsSnapshot.docs.length,
      orphanedCount,
      orphanedPercentage: (orphanedCount / meetingsSnapshot.docs.length) * 100,
      uniqueOrphanedGroupIds: Array.from(orphanedGroupIds),
      timestamp: new Date().toISOString(),
    };

    if (!fs.existsSync("./logs")) {
      fs.mkdirSync("./logs", { recursive: true });
    }

    fs.writeFileSync(
      "./logs/quick_orphaned_analysis.json",
      JSON.stringify(results, null, 2)
    );

    console.log(`\nResults saved to: ./logs/quick_orphaned_analysis.json`);
  } catch (error) {
    console.error("Error in quick analysis:", error);
  }
}

// Execute the script
quickOrphanedAnalysis()
  .then(() => {
    console.log("Quick analysis finished successfully.");
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error("Quick analysis failed with error:", error);
    try {
      admin.app().delete();
    } catch (e) {
      console.warn("Error cleaning up Firebase app:", e);
    }
    process.exit(1);
  });
