import * as admin from "firebase-admin";
import { CONFIG } from "./shared-types";
import {
  createGroupCacheKey,
  createGroupDataFromMeeting,
} from "./completeImprovedSeedingScript";

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

// Test the improved logic with sample meetings
async function testImprovedSeeding() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const meetingsRef = db.collection(CONFIG.MEETINGS_COLLECTION);

  console.log("Testing improved seeding logic...\n");

  // Get a sample of meetings that were failing
  const sampleQuery = meetingsRef.where("type", "==", "AA").limit(10);

  const snapshot = await sampleQuery.get();

  console.log(`Testing ${snapshot.docs.length} sample meetings:\n`);

  for (const meetingDoc of snapshot.docs) {
    const meetingData = meetingDoc.data();
    meetingData.id = meetingDoc.id;

    console.log(`Meeting: "${meetingData.name}"`);
    console.log(`  ID: ${meetingData.id}`);
    console.log(`  Online: ${meetingData.online}`);
    console.log(`  Link: ${meetingData.link || "N/A"}`);
    console.log(
      `  Lat/Lng: ${meetingData.lat || "N/A"}, ${meetingData.lng || "N/A"}`
    );
    console.log(`  Location: ${meetingData.locationName || "N/A"}`);

    // Test cache key generation
    const cacheKey = createGroupCacheKey(meetingData);
    console.log(`  Cache Key: ${cacheKey || "FAILED"}`);

    // Test group data creation
    const groupData = createGroupDataFromMeeting(meetingData);
    console.log(`  Group Creation: ${groupData ? "SUCCESS" : "FAILED"}`);

    if (groupData) {
      console.log(`  Group Name: "${groupData.name}"`);
      console.log(`  Group Online: ${groupData.online}`);
    }

    console.log("---\n");
  }

  console.log("Test complete!");

  try {
    admin.app().delete();
  } catch (e) {
    console.warn("Error cleaning up Firebase app:", e);
  }
}

// Run the test
testImprovedSeeding()
  .then(() => {
    console.log("Test finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
