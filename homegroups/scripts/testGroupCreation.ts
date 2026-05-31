import * as admin from "firebase-admin";
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

// Test group creation with minimal meeting data
async function testGroupCreation() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  console.log("Testing group creation with minimal meeting data...\n");

  // Create a minimal meeting object
  const minimalMeeting = {
    id: "test-meeting-123",
    name: "Test Group Meeting",
    type: "AA",
    day: "Monday",
    time: "7:00 PM",
    // No location data, no online data, minimal fields
  };

  console.log("Minimal meeting data:");
  console.log(JSON.stringify(minimalMeeting, null, 2));

  // Test the group creation logic from seedGroupsWithGpt2
  const candidateName = minimalMeeting.name;
  const normName = candidateName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const locKey = "unknown"; // Since no location data
  const groupKey = "test-group-key-123";

  const now = admin.firestore.FieldValue.serverTimestamp();
  const baseGroup = {
    id: groupKey,
    name: candidateName,
    description: `AA Meeting Group that hosts meetings such as "${minimalMeeting.name}".`,
    location: "",
    normalizedName: normName,
    placeName: undefined,
    city: undefined,
    state: undefined,
    country: undefined,
    zip: undefined,
    address: undefined,
    formattedAddress: undefined,
    street: undefined,
    lat: undefined,
    lng: undefined,
    geohash: undefined,
    online: false,
    link: null,
    onlineNotes: null,
    timezone: undefined,
    source: "seedGroupsResumable",
    type: "AA",
    // Required fields with defaults
    meetings: [],
    memberCount: 0,
    admins: [],
    adminUids: [],
    isClaimed: false,
    pendingAdminRequests: [],
    treasurers: [],
    // Optional fields with null defaults
    foundedDate: undefined,
    treasury: undefined,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    subscriptionExpiresAt: null,
    stripeConnectAccountId: null,
    distanceInKm: undefined,
  };

  console.log("\nGenerated group data:");
  console.log(JSON.stringify(baseGroup, null, 2));

  // Check that all required fields are present
  const requiredFields = [
    "id",
    "name",
    "description",
    "location",
    "meetings",
    "memberCount",
    "admins",
    "adminUids",
    "isClaimed",
    "pendingAdminRequests",
    "treasurers",
    "type",
  ];

  console.log("\nRequired fields check:");
  const missingFields = requiredFields.filter((field) => !(field in baseGroup));

  if (missingFields.length === 0) {
    console.log("✅ All required fields are present");
  } else {
    console.log("❌ Missing required fields:", missingFields);
  }

  // Check that arrays are properly initialized
  const arrayFields = [
    "meetings",
    "admins",
    "adminUids",
    "pendingAdminRequests",
    "treasurers",
  ];
  console.log("\nArray fields check:");
  arrayFields.forEach((field) => {
    const value = baseGroup[field as keyof typeof baseGroup];
    if (Array.isArray(value)) {
      console.log(`✅ ${field}: Array with ${value.length} items`);
    } else {
      console.log(`❌ ${field}: Not an array (${typeof value})`);
    }
  });

  console.log("\nTest complete!");

  try {
    admin.app().delete();
  } catch (e) {
    console.warn("Error cleaning up Firebase app:", e);
  }
}

// Run the test
testGroupCreation()
  .then(() => {
    console.log("Test finished successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });

