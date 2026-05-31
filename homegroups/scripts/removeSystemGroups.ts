import * as admin from "firebase-admin";
import * as path from "path";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json";
const PARALLEL_GROUPS = 20; // Increased from 10 to 20
const CHUNK_SIZE = 2000; // Increased from 1000 to 2000
const BATCH_SIZE = 500; // Maximum batch size for Firestore

// --- Helper Functions ---

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebaseAdmin(): admin.app.App {
  try {
    console.log("Initializing Firebase Admin SDK...");
    return admin.initializeApp({
      credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)),
    });
  } catch (error: any) {
    console.error("Firebase Admin SDK initialization failed:", error);
    process.exit(1);
  }
}

/**
 * Process a batch of groups in parallel
 */
async function processGroupBatch(
  db: admin.firestore.Firestore,
  groupDocs: admin.firestore.QueryDocumentSnapshot[]
): Promise<{
  meetingsUpdated: number;
  membersRemoved: number;
  groupsRemoved: number;
  failedGroups: string[];
}> {
  const meetingsRef = db.collection("meetings");
  const membersRef = db.collection("members");
  let meetingsUpdated = 0;
  let membersRemoved = 0;
  let groupsRemoved = 0;
  const failedGroups: string[] = [];

  // Process groups in parallel with enhanced error handling
  const results = await Promise.all(
    groupDocs.map(async (groupDoc) => {
      const groupId = groupDoc.id;
      try {
        // Create a batch for this group's operations
        const batch = db.batch();

        // Get meetings and members in parallel with error handling
        const [meetingsSnapshot, membersSnapshot] = await Promise.all([
          meetingsRef
            .where("groupId", "==", groupId)
            .get()
            .catch((error) => {
              console.error(
                `Error fetching meetings for group ${groupId}:`,
                error
              );
              return meetingsRef
                .where("groupId", "==", "non-existent-id")
                .get(); // Returns empty snapshot
            }),
          membersRef
            .where("groupId", "==", groupId)
            .get()
            .catch((error) => {
              console.error(
                `Error fetching members for group ${groupId}:`,
                error
              );
              return membersRef.where("groupId", "==", "non-existent-id").get(); // Returns empty snapshot
            }),
        ]);

        // Add all operations to the batch
        meetingsSnapshot.docs.forEach((doc) => {
          try {
            batch.update(doc.ref, {
              groupId: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (error) {
            console.error(
              `Error updating meeting ${doc.id} for group ${groupId}:`,
              error
            );
          }
        });

        membersSnapshot.docs.forEach((doc) => {
          try {
            batch.delete(doc.ref);
          } catch (error) {
            console.error(
              `Error deleting member ${doc.id} for group ${groupId}:`,
              error
            );
          }
        });

        try {
          batch.delete(groupDoc.ref);
        } catch (error) {
          console.error(`Error deleting group ${groupId}:`, error);
          throw error; // Re-throw as this is critical
        }

        // Commit the batch with retry logic
        let retries = 3;
        while (retries > 0) {
          try {
            await batch.commit();
            break;
          } catch (error) {
            retries--;
            if (retries === 0) throw error;
            console.warn(
              `Retrying batch commit for group ${groupId}, ${retries} attempts remaining`
            );
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
          }
        }

        return {
          meetingsUpdated: meetingsSnapshot.size,
          membersRemoved: membersSnapshot.size,
          success: true,
        };
      } catch (error) {
        console.error(`Error processing group ${groupId}:`, error);
        failedGroups.push(groupId);
        return {
          meetingsUpdated: 0,
          membersRemoved: 0,
          success: false,
        };
      }
    })
  );

  // Aggregate results
  results.forEach((result) => {
    if (result.success) {
      meetingsUpdated += result.meetingsUpdated;
      membersRemoved += result.membersRemoved;
      groupsRemoved++;
    }
  });

  return {
    meetingsUpdated,
    membersRemoved,
    groupsRemoved,
    failedGroups,
  };
}

/**
 * Remove system-created groups and their related data
 */
async function removeSystemGroups() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const groupsRef = db.collection("groups");
  let totalGroupsRemoved = 0;
  let totalMeetingsUpdated = 0;
  let totalMembersRemoved = 0;
  let allFailedGroups: string[] = [];
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;

  console.log("Starting removal of system-created groups...");

  try {
    while (true) {
      // Query with pagination
      let query = groupsRef
        .where("city", "!=", "Austin")
        .orderBy("city")
        .limit(CHUNK_SIZE);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      if (snapshot.empty) break;

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
      const groupDocs = snapshot.docs;

      // Process all groups in the chunk in parallel batches
      const batchPromises = [];
      for (let i = 0; i < groupDocs.length; i += PARALLEL_GROUPS) {
        const batch = groupDocs.slice(i, i + PARALLEL_GROUPS);
        batchPromises.push(processGroupBatch(db, batch));
      }

      // Wait for all batches to complete
      const batchResults = await Promise.all(batchPromises);

      // Aggregate results from all batches
      batchResults.forEach((result) => {
        totalGroupsRemoved += result.groupsRemoved;
        totalMeetingsUpdated += result.meetingsUpdated;
        totalMembersRemoved += result.membersRemoved;
        allFailedGroups = allFailedGroups.concat(result.failedGroups);
      });

      console.log(
        `Processed chunk: ${totalGroupsRemoved} groups removed, ${totalMeetingsUpdated} meetings updated, ${totalMembersRemoved} members removed`
      );
    }

    console.log("\n--- Removal Complete ---");
    console.log(`Total Groups Removed: ${totalGroupsRemoved}`);
    console.log(`Total Meetings Updated: ${totalMeetingsUpdated}`);
    console.log(`Total Members Removed: ${totalMembersRemoved}`);
    console.log(`Failed Groups: ${allFailedGroups.length}`);
    if (allFailedGroups.length > 0) {
      console.log("Failed group IDs:", allFailedGroups);
    }
    console.log("--------------------------\n");
  } catch (error) {
    console.error("Fatal error in script execution:", error);
  }
}

// Execute the script
removeSystemGroups()
  .then(() => {
    console.log("Script finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed with error:", error);
    process.exit(1);
  });
