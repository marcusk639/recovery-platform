import * as admin from "firebase-admin";
import * as geohash from "ngeohash";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase Admin
const serviceAccount = require("./recovery-connect.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Constants
const MEETING_GUIDE_API_URL = "https://api.meetingguide.org/app/v2/request";
const TARGET_LOCATION = {
  lat: 30.267153,
  lng: -97.743057,
};
const SEARCH_RADIUS_MILES = 30;
const SEARCH_RADIUS_KM = SEARCH_RADIUS_MILES * 1.60934; // Convert miles to kilometers
const GEOHASH_PRECISION = 8; // Lower precision for wider area search

// Ensure output directory exists
const OUTPUT_DIR = "./meeting_data";
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface Meeting {
  id: string;
  name: string;
  type: string;
  day?: string;
  time?: string;
  lat?: number;
  lng?: number;
  geohash?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  locationName?: string;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  verified?: boolean;
  addedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Helper function to calculate distance between two points
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Function to fetch meetings from Meeting Guide API
async function fetchFromMeetingGuide(): Promise<Meeting[]> {
  console.log("Fetching meetings from Meeting Guide API...");
  try {
    const response = await axios.get(MEETING_GUIDE_API_URL, {
      params: {
        latitude: TARGET_LOCATION.lat,
        longitude: TARGET_LOCATION.lng,
      },
    });

    const meetings = response.data.meetings || [];
    console.log(`Found ${meetings.length} meetings from Meeting Guide API`);
    return meetings;
  } catch (error) {
    console.error("Error fetching from Meeting Guide API:", error);
    return [];
  }
}

// Function to fetch meetings from Firestore
async function fetchFromFirestore(): Promise<Meeting[]> {
  console.log("Fetching meetings from Firestore...");
  try {
    // Get all AA meetings
    const snapshot = await admin
      .firestore()
      .collection("meetings")
      .where("type", "==", "AA")
      .get();

    console.log(`Found ${snapshot.size} total AA meetings in Firestore`);

    // Filter meetings by distance
    const meetings: Meeting[] = [];
    let foundMeetingsNearTarget = false;

    for (const doc of snapshot.docs) {
      const meeting = doc.data() as Meeting;
      meeting.id = doc.id;

      // Check for meetings very close to our target
      if (meeting.lat && meeting.lng) {
        const latDiff = Math.abs(meeting.lat - 30.2301989);
        const lngDiff = Math.abs(meeting.lng - -97.7853737);

        if (latDiff < 0.001 && lngDiff < 0.001) {
          console.log("Found meeting very close to target:", {
            id: meeting.id,
            name: meeting.name,
            address: meeting.address,
            coordinates: {
              lat: meeting.lat,
              lng: meeting.lng,
            },
          });
          foundMeetingsNearTarget = true;
        }
      }

      const distance = calculateDistance(
        TARGET_LOCATION.lat,
        TARGET_LOCATION.lng,
        meeting.lat || 0,
        meeting.lng || 0
      );

      if (distance <= SEARCH_RADIUS_KM) {
        meetings.push(meeting);
      }
    }

    if (!foundMeetingsNearTarget) {
      console.log(
        "No meetings found near the target coordinates (30.2301989, -97.7853737)"
      );
    }

    console.log(
      `Found ${meetings.length} meetings from Firestore within ${SEARCH_RADIUS_MILES} miles`
    );
    return meetings;
  } catch (error) {
    console.error("Error fetching from Firestore:", error);
    return [];
  }
}

// Function to save meetings to a file
function saveMeetingsToFile(meetings: Meeting[], filename: string) {
  const filePath = path.join(OUTPUT_DIR, filename);
  const data = JSON.stringify(meetings, null, 2);
  fs.writeFileSync(filePath, data);
  console.log(`Saved ${meetings.length} meetings to ${filePath}`);
}

// Main function
async function main() {
  try {
    // Fetch meetings from both sources
    const [apiMeetings, firestoreMeetings] = await Promise.all([
      fetchFromMeetingGuide(),
      fetchFromFirestore(),
    ]);

    // Save results to separate files
    saveMeetingsToFile(apiMeetings, "meeting_guide_results.json");
    saveMeetingsToFile(firestoreMeetings, "firestore_results.json");

    // Print summary
    console.log("\nSummary:");
    console.log(`Meeting Guide API: ${apiMeetings.length} meetings`);
    console.log(`Firestore: ${firestoreMeetings.length} meetings`);

    // Find unique meetings in each source
    const apiMeetingIds = new Set(apiMeetings.map((m) => m.id));
    const firestoreMeetingIds = new Set(firestoreMeetings.map((m) => m.id));

    const uniqueToApi = apiMeetings.filter(
      (m) => !firestoreMeetingIds.has(m.id)
    );
    const uniqueToFirestore = firestoreMeetings.filter(
      (m) => !apiMeetingIds.has(m.id)
    );

    console.log(
      `\nUnique to Meeting Guide API: ${uniqueToApi.length} meetings`
    );
    console.log(`Unique to Firestore: ${uniqueToFirestore.length} meetings`);

    // Save unique meetings to separate files
    saveMeetingsToFile(uniqueToApi, "unique_to_api.json");
    saveMeetingsToFile(uniqueToFirestore, "unique_to_firestore.json");
  } catch (error) {
    console.error("Error in main function:", error);
  } finally {
    // Clean up
    await admin.app().delete();
  }
}

// Run the script
main();
