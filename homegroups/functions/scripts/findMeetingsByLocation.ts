import * as admin from "firebase-admin";
import * as geohash from "ngeohash";
import * as functions from "firebase-functions";

const serviceAccount = require("./recovery-connect.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Constants
const GEOHASH_PRECISION = 10; // Same precision as in the original function

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

interface Location {
  lat: number;
  lng: number;
}

interface MeetingSearchCriteria {
  maxDistance?: number;
  name?: string;
  city?: string;
  street?: string;
  state?: string;
}

async function findMeetingsByLocation(
  location: Location,
  criteria?: MeetingSearchCriteria,
  dayFilter?: string
): Promise<Meeting[]> {
  const startTime = Date.now();
  functions.logger.info("findMeetingsByLocation called with:", {
    location,
    criteria,
    dayFilter,
  });

  try {
    // Get geohash for the location
    const geohashResult = geohash.encode(
      location.lat,
      location.lng,
      GEOHASH_PRECISION
    );
    functions.logger.info("Generated geohash:", { geohash: geohashResult });

    // Create query
    let query = admin
      .firestore()
      .collection("meetings")
      .where("type", "==", "AA")
      .where("geohash", ">=", geohashResult)
      .where("geohash", "<=", geohashResult + "\uf8ff");

    // Apply day filter if provided
    if (dayFilter) {
      query = query.where("day", "==", dayFilter);
      functions.logger.info("Applied day filter:", { dayFilter });
    }

    // Execute query
    functions.logger.info("Executing Firestore query");
    const snapshot = await query.get();
    const endQueryTime = Date.now();

    functions.logger.info("Query completed", {
      duration: `${(endQueryTime - startTime) / 1000} seconds`,
      totalDocuments: snapshot.size,
    });

    // Process results
    const meetings: Meeting[] = [];
    let filteredCount = 0;

    for (const doc of snapshot.docs) {
      const meeting = doc.data() as Meeting;
      meeting.id = doc.id;

      // Apply distance filter if needed
      if (criteria?.maxDistance) {
        const distance = calculateDistance(
          location.lat,
          location.lng,
          meeting.lat || 0,
          meeting.lng || 0
        );

        if (distance > criteria.maxDistance) {
          filteredCount++;
          continue;
        }
      }

      meetings.push(meeting);
    }

    const endTime = Date.now();
    functions.logger.info("Meetings processing completed", {
      totalDuration: `${(endTime - startTime) / 1000} seconds`,
      totalMeetings: meetings.length,
      filteredOut: filteredCount,
      sampleMeeting: meetings[0]
        ? {
            id: meetings[0].id,
            name: meetings[0].name,
            day: meetings[0].day,
            time: meetings[0].time,
          }
        : null,
    });

    return meetings;
  } catch (error) {
    const errorTime = Date.now();
    functions.logger.error("Error in findMeetingsByLocation:", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : String(error),
      duration: `${(errorTime - startTime) / 1000} seconds`,
      location,
      criteria,
      dayFilter,
    });
    throw error;
  }
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

// Example usage
async function main() {
  try {
    // Example coordinates (San Francisco)
    // const location: Location = {
    //   lat: 37.7749,
    //   lng: -122.4194,
    // };
    const location: Location = {
      lat: 30.267153,
      lng: -97.743057,
    };

    // Example day filter
    const dayFilter = "monday";

    const meetings = await findMeetingsByLocation(
      location,
      undefined,
      undefined
    );

    console.log(`Found ${meetings.length} meetings:`);
    meetings.forEach((meeting) => {
      console.log(`- ${meeting.name} (${meeting.day} at ${meeting.time})`);
      console.log(`  Location: ${meeting.locationName || meeting.address}`);
      console.log(
        `  Distance: ${calculateDistance(
          location.lat,
          location.lng,
          meeting.lat || 0,
          meeting.lng || 0
        ).toFixed(2)} km`
      );
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the script
main();
