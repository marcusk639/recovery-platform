import { Firestore, FieldValue, Timestamp } from "@google-cloud/firestore";
import axios from "axios";
import * as admin from "firebase-admin";
import * as path from "path";
import * as ngeohash from "ngeohash"; // Import ngeohash
import * as crypto from "crypto"; // Import crypto module
import * as fs from "fs";

// --- Configuration ---
const SERVICE_ACCOUNT_PATH = "./recovery-connect.json"; // Ensure this env var is set
const FIRESTORE_COLLECTION = "meetings";
const MEETING_GUIDE_API_URL = "https://api.meetingguide.org/app/v2/request"; // Using the correct v2 URL
const BATCH_SIZE = 500; // Increased from 200 to 500
const DELAY_MS = 100; // Reduced from 500 to 100
const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 1000;
const GEOHASH_PRECISION = 8; // Reduced from 9 to 8
const CONCURRENT_REQUESTS = 5; // Number of parallel API requests
const STEP = 0.5; // Increased from 0.25 to 0.5 degrees

// Continental US Bounding Box (approximate)
const LAT_MIN = 24.0;
const LAT_MAX = 49.0;
const LON_MIN = -125.0;
const LON_MAX = -67.0;

// Keep track of processed *generated* meeting IDs in this run to avoid duplicate batch writes
const processedMeetingHashIds = new Set<string>();

// Map to store existing meetings from Firestore
const existingMeetings = new Map<string, Meeting>();

export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// Define the structure expected from the Meeting Guide API
// Based on https://github.com/meeting-guide/api/blob/main/src/sync/sources/app.php
interface ApiMeeting {
  id: string; // API's internal ID, not used for Firestore ID anymore
  name: string;
  slug?: string;
  notes?: string;
  formatted_address?: string;
  updated?: string; // ISO 8601 string e.g. "2024-07-15 18:08:39" - needs parsing
  url?: string;
  time?: string; // "HH:MM"
  end_time?: string; // "HH:MM"
  day?: string; // "0" (Sun) to "6" (Sat)
  types?: string; // e.g., "Closed, Big Book, Step"
  location?: string; // Building name
  address?: string; // Street
  city?: string;
  state?: string; // Abbreviation e.g., "TX"
  postal_code?: string;
  country?: string; // Abbreviation e.g., "US"
  latitude?: string;
  longitude?: string;
  approximate?: boolean;
  location_notes?: string;
  group?: string; // Group name associated with meeting
  district?: string;
  conference_url?: string;
  conference_url_notes?: string;
  conference_phone?: string;
  conference_phone_notes?: string;
  timezone?: string; // e.g., "America/New_York"
  venmo?: string; // Added based on API source exploration
  square?: string; // Added based on API source exploration
  paypal?: string; // Added based on API source exploration
  // Potentially other fields like regions, sub_region etc.
}

// Define the target Firestore Meeting structure using the class
class Meeting {
  // Required fields with default values
  name: string = "";
  time: string = "";
  format: string = "";
  type: string = "AA";
  verified: boolean = false;
  addedBy: string = "script:meeting-guide";
  createdAt: admin.firestore.Timestamp = admin.firestore.Timestamp.now();
  updatedAt: admin.firestore.Timestamp = admin.firestore.Timestamp.now();

  // Optional fields
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
  id?: string;
  apiId?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
}

// Add logging configuration
const LOG_DIR = "./logs";
const ERROR_LOG_FILE = path.join(LOG_DIR, "populate_meetings_errors.log");
const STATUS_LOG_FILE = path.join(LOG_DIR, "populate_meetings_status.log");

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Logging interface
interface LogEntry {
  timestamp: string;
  type: "error" | "info" | "status";
  message: string;
  data?: any;
}

// Function to write to log file
function writeToLog(entry: LogEntry, filePath: string) {
  const logLine =
    JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    }) + "\n";
  fs.appendFileSync(filePath, logLine);
}

// Function to log errors
function logError(message: string, error?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: "error",
    message,
    data: error
      ? {
          message: error.message,
          stack: error.stack,
          ...(error.response ? { response: error.response.data } : {}),
        }
      : undefined,
  };
  console.error(`[ERROR] ${message}`, error || "");
  writeToLog(entry, ERROR_LOG_FILE);
}

// Function to log status
function logStatus(message: string, data?: any) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    type: "status",
    message,
    data,
  };
  console.log(`[STATUS] ${message}`);
  writeToLog(entry, STATUS_LOG_FILE);
}

// --- Helper Functions ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to initialize Firebase Admin SDK
function initializeFirebaseAdmin(): admin.app.App {
  if (!SERVICE_ACCOUNT_PATH) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set."
    );
  }
  const serviceAccount = require(path.resolve(SERVICE_ACCOUNT_PATH));
  console.log("Initializing Firebase Admin SDK...");
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/**
 * Generates a unique hash ID for a meeting based on key properties using SHA-1.
 * @param meeting The meeting object to generate a hash for.
 * @returns A 24-character hexadecimal string hash.
 */
export function generateMeetingHash(meeting: Meeting): string {
  // Create a consistent string representation including all unique identifiers
  const meetingString = [
    meeting.name?.trim() || "",
    meeting.day || "", // CRITICAL: Include the day
    meeting.time || "",
    meeting.link || "",
    meeting.formattedAddress?.trim() || "", // Use full address string for location part
    // Optional: Add more fields ONLY if they are consistently available and define uniqueness
    // meeting.locationName?.trim() || "",
    // meeting.link?.trim() || "",
  ].join("|");

  // Generate SHA-1 hash
  const hash = crypto.createHash("sha1").update(meetingString).digest("hex");

  // Return a significant portion (e.g., first 24 chars) for practical uniqueness
  return hash.substring(0, 24);
}

/**
 * Parses the street address from a formatted address string.
 * Handles various formats and edge cases.
 * @param formattedAddress The full formatted address string
 * @returns The parsed street address or undefined if parsing fails
 */
function parseStreetAddress(formattedAddress?: string): string | undefined {
  if (!formattedAddress) return undefined;

  try {
    // Remove country if present (e.g., ", USA")
    const addressWithoutCountry = formattedAddress.replace(
      /,?\s*[A-Z]{2,3}$/,
      ""
    );

    // Split by commas and trim whitespace
    const parts = addressWithoutCountry.split(",").map((part) => part.trim());

    // The street address is typically the first part
    // But we need to handle cases where it might be empty or malformed
    if (parts.length > 0) {
      const streetPart = parts[0];

      // Validate that this looks like a street address
      // Should contain at least one number and some text
      if (/^\d+\s+[A-Za-z\s]+$/.test(streetPart)) {
        return streetPart;
      }

      // If the first part doesn't look like a street address,
      // try to find a part that does
      for (const part of parts) {
        if (/^\d+\s+[A-Za-z\s]+$/.test(part)) {
          return part;
        }
      }
    }

    // If we couldn't find a valid street address, return the first part
    // This handles cases where the address might be in a different format
    return parts[0] || undefined;
  } catch (error) {
    console.warn(
      `Error parsing street address from "${formattedAddress}":`,
      error
    );
    return undefined;
  }
}

// Function to fetch meetings from the API with retries
async function fetchMeetingsFromApi(
  lat: number,
  lon: number
): Promise<ApiMeeting[]> {
  const url = `${MEETING_GUIDE_API_URL}?latitude=${lat}&longitude=${lon}`;
  let attempts = 0;
  while (attempts < RETRY_LIMIT) {
    try {
      const response = await axios.get<{ meetings: ApiMeeting[] }>(url, {
        timeout: 10000,
      }); // 10 second timeout
      return response.data.meetings || []; // Return empty array if data is null/undefined
    } catch (error: any) {
      attempts++;
      console.warn(
        `Error fetching meetings for ${lat}, ${lon} (Attempt ${attempts}/${RETRY_LIMIT}): ${error.message}`
      );
      if (axios.isAxiosError(error) && error.response) {
        console.warn(`API Response Status: ${error.response.status}`);
        // Handle specific status codes if needed (e.g., 429 for rate limit)
      }
      if (attempts >= RETRY_LIMIT) {
        console.error(
          `Failed to fetch meetings for ${lat}, ${lon} after ${RETRY_LIMIT} attempts.`
        );
        return []; // Return empty on final failure
      }
      await sleep(RETRY_DELAY_MS * Math.pow(2, attempts - 1)); // Exponential backoff
    }
  }
  return []; // Should not be reached, but satisfies TS
}

// Function to map API data to Firestore Meeting class instance
function mapApiToFirestore(apiMeeting: ApiMeeting): Meeting | null {
  if (
    !apiMeeting.id ||
    !apiMeeting.name ||
    !apiMeeting.latitude ||
    !apiMeeting.longitude
  ) {
    logError(
      `Skipping meeting due to missing critical data (id, name, lat, lon): ${JSON.stringify(
        apiMeeting
      )}`
    );
    return null;
  }

  // Basic validation and type conversion
  const latitude = parseFloat(apiMeeting.latitude);
  const longitude = parseFloat(apiMeeting.longitude);
  if (isNaN(latitude) || isNaN(longitude)) {
    logError(
      `Skipping meeting due to invalid lat/lon: ${apiMeeting.id} (${apiMeeting.name})`
    );
    return null;
  }

  // Validate day string
  let validDay: string | undefined = undefined;
  if (apiMeeting.day !== undefined && apiMeeting.day !== null) {
    const dayNum = parseInt(apiMeeting.day, 10);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      validDay = daysOfWeek[dayNum];
    } else {
      logError(
        `Invalid day format for meeting ${apiMeeting.id}: ${apiMeeting.day}`
      );
    }
  }

  // Parse updated date
  let parsedUpdatedAt: admin.firestore.Timestamp =
    admin.firestore.Timestamp.now();
  if (apiMeeting.updated) {
    try {
      const updatedDate = new Date(apiMeeting.updated.replace(" ", "T") + "Z");
      if (!isNaN(updatedDate.getTime())) {
        parsedUpdatedAt = admin.firestore.Timestamp.fromDate(updatedDate);
      }
    } catch (e) {
      logError(
        `Error parsing updated date for meeting ${apiMeeting.id}: ${apiMeeting.updated}`,
        e
      );
    }
  }

  const meeting = new Meeting();

  // Required fields with proper defaults
  meeting.name = apiMeeting.name || "Unnamed Meeting";
  meeting.time =
    apiMeeting.time?.substring(0, apiMeeting.time?.lastIndexOf(":")) || "00:00";
  meeting.format = apiMeeting.types || "Open";
  meeting.type = "AA";
  meeting.verified = true;
  meeting.addedBy = "system";
  meeting.createdAt = admin.firestore.Timestamp.now();
  meeting.updatedAt = parsedUpdatedAt;

  // Optional fields with proper defaults
  const streetAddress = parseStreetAddress(apiMeeting.formatted_address);
  meeting.street = streetAddress || apiMeeting.address || "";
  meeting.address =
    apiMeeting.formatted_address ||
    `${apiMeeting.address || ""}, ${apiMeeting.city || ""}, ${
      apiMeeting.state || ""
    } ${apiMeeting.postal_code || ""}`.trim();
  meeting.city = apiMeeting.city || "";
  meeting.state = apiMeeting.state || "";
  meeting.zip = apiMeeting.postal_code || "";
  meeting.types = apiMeeting.types || "";
  meeting.lat = latitude;
  meeting.lng = longitude;
  meeting.geohash = ngeohash.encode(latitude, longitude, GEOHASH_PRECISION);
  meeting.country = apiMeeting.country || "US";
  meeting.locationName = apiMeeting.location || "";
  meeting.day = validDay;
  meeting.formattedAddress = apiMeeting.formatted_address || "";
  meeting.online = !!(apiMeeting.conference_url || apiMeeting.conference_phone);
  meeting.link = apiMeeting.conference_url || "";
  meeting.onlineNotes =
    apiMeeting.conference_url_notes || apiMeeting.conference_phone_notes || "";
  meeting.apiId = apiMeeting.id;
  meeting.notes = apiMeeting.notes || "";
  meeting.locationNotes = apiMeeting.location_notes || "";
  meeting.groupName = apiMeeting.group || "";
  meeting.district = apiMeeting.district || "";
  meeting.timezone = apiMeeting.timezone || "America/New_York";
  meeting.venmo = apiMeeting.venmo || "";
  meeting.square = apiMeeting.square || "";
  meeting.paypal = apiMeeting.paypal || "";

  // Generate ID after all fields are populated
  meeting.id = generateMeetingHash(meeting);

  return meeting;
}

/**
 * Removes properties with undefined values from an object.
 * @param obj The object to clean.
 * @returns A new object with undefined properties removed.
 */
function removeUndefinedProperties(
  obj: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Fetches all existing meetings from Firestore and stores them in a map
 * @param db Firestore database instance
 * @returns Promise that resolves when all meetings are fetched
 */
async function fetchExistingMeetings(
  db: admin.firestore.Firestore
): Promise<void> {
  console.log("Fetching existing meetings from Firestore...");
  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();

  snapshot.forEach((doc) => {
    const meeting = doc.data() as Meeting;
    if (meeting.id) {
      existingMeetings.set(meeting.id, meeting);
    }
  });

  console.log(
    `Fetched ${existingMeetings.size} existing meetings from Firestore`
  );
}

// Function to process a batch of coordinates in parallel
async function processCoordinateBatch(
  coordinates: { lat: number; lon: number }[]
) {
  const promises = coordinates.map(async ({ lat, lon }) => {
    try {
      return await fetchMeetingsFromApi(lat, lon);
    } catch (error) {
      logError(`Error fetching meetings for lat: ${lat}, lon: ${lon}`, error);
      return [];
    }
  });

  const results = await Promise.allSettled(promises);
  return results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      logError("Promise rejected in batch processing", result.reason);
      return [];
    }
  });
}

// Add progress tracking interface
interface Progress {
  lastProcessedIndex: number;
  totalCoordinates: number;
  startTime: Date;
}

// Function to save progress
async function saveProgress(db: admin.firestore.Firestore, progress: Progress) {
  await db
    .collection("script_progress")
    .doc("populateMeetings")
    .set({
      ...progress,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// Function to load progress
async function loadProgress(
  db: admin.firestore.Firestore
): Promise<Progress | null> {
  const doc = await db
    .collection("script_progress")
    .doc("populateMeetings")
    .get();
  return doc.exists ? (doc.data() as Progress) : null;
}

// Modified main population logic
async function populateMeetings() {
  const app = initializeFirebaseAdmin();
  const db = admin.firestore(app);
  db.settings({
    timeoutSeconds: 60,
    ignoreUndefinedProperties: true,
  });

  // Create an array of all coordinates to process
  const coordinates: { lat: number; lon: number }[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) {
    for (let lon = LON_MIN; lon <= LON_MAX; lon += STEP) {
      coordinates.push({ lat, lon });
    }
  }

  // Load or initialize progress
  const savedProgress = await loadProgress(db);
  const startIndex = savedProgress?.lastProcessedIndex || 0;

  const progress: Progress = {
    lastProcessedIndex: startIndex,
    totalCoordinates: coordinates.length,
    startTime: new Date(),
  };

  const meetingsCollection = db.collection(FIRESTORE_COLLECTION);
  let batch = db.batch();
  let meetingsInBatch = 0;
  let totalMeetingsFetched = 0;
  let totalMeetingsProcessed = 0;
  let totalNewMeetingsStored = 0;
  let apiCallCount = 0;
  let errorCount = 0;

  // Fetch existing meetings before starting the population process
  try {
    await fetchExistingMeetings(db);
  } catch (error) {
    logError("Error fetching existing meetings", error);
    throw error; // Critical error, should stop the script
  }

  logStatus("Starting meeting population process", {
    startIndex,
    totalCoordinates: coordinates.length,
    existingMeetingsCount: existingMeetings.size,
  });

  // Process coordinates in batches
  for (let i = startIndex; i < coordinates.length; i += CONCURRENT_REQUESTS) {
    const batchCoordinates = coordinates.slice(i, i + CONCURRENT_REQUESTS);
    apiCallCount += batchCoordinates.length;

    logStatus(
      `Processing batch ${i + 1}-${Math.min(
        i + CONCURRENT_REQUESTS,
        coordinates.length
      )} of ${coordinates.length}`,
      {
        progress: Math.round((i / coordinates.length) * 100),
        totalMeetingsFetched,
        totalNewMeetingsStored,
        errorCount,
      }
    );

    try {
      const apiMeetings = await processCoordinateBatch(batchCoordinates);
      totalMeetingsFetched += apiMeetings.length;

      if (apiMeetings.length > 0) {
        for (const apiMeeting of apiMeetings) {
          try {
            const mappedMeetingData = mapApiToFirestore(apiMeeting);

            if (mappedMeetingData && mappedMeetingData.id) {
              if (!processedMeetingHashIds.has(mappedMeetingData.id)) {
                processedMeetingHashIds.add(mappedMeetingData.id);

                if (existingMeetings.has(mappedMeetingData.id)) {
                  console.log(
                    `Skipping meeting ${mappedMeetingData.id} because it already exists`
                  );
                  continue;
                }

                const cleanedMeetingData =
                  removeUndefinedProperties(mappedMeetingData);
                const docRef = meetingsCollection.doc(mappedMeetingData.id);
                batch.set(docRef, cleanedMeetingData, { merge: true });
                console.log(`Stored meeting ${mappedMeetingData.id} in batch`);
                meetingsInBatch++;
                totalNewMeetingsStored++;

                if (meetingsInBatch >= BATCH_SIZE) {
                  try {
                    console.log(
                      `Committing batch of ${meetingsInBatch} meetings`
                    );
                    await batch.commit();
                    totalMeetingsProcessed += meetingsInBatch;
                    console.log(
                      `Committed batch of ${meetingsInBatch} meetings`
                    );
                  } catch (error) {
                    logError("Error committing batch", error);
                    errorCount++;
                  } finally {
                    batch = db.batch();
                    meetingsInBatch = 0;
                  }
                }
              }
            }
          } catch (error) {
            logError("Error processing meeting", {
              error,
              meeting: apiMeeting,
            });
            errorCount++;
          }
        }
      }

      // Update progress
      progress.lastProcessedIndex = i + CONCURRENT_REQUESTS;
      await saveProgress(db, progress);

      // Adaptive delay based on API response
      const delay = Math.min(1000, Math.max(200, apiMeetings.length * 10));
      await sleep(delay);
    } catch (error) {
      logError("Error processing coordinate batch", error);
      errorCount++;
    }
  }

  // Final status log
  const finalStatus = {
    totalCoordinatesProcessed: coordinates.length,
    totalMeetingsFetched,
    totalNewMeetingsStored,
    totalMeetingsProcessed,
    totalApiCalls: apiCallCount,
    totalErrors: errorCount,
    duration: (new Date().getTime() - progress.startTime.getTime()) / 1000 / 60, // in minutes
    endTime: new Date().toISOString(),
  };

  logStatus("Script completed", finalStatus);

  // Clean up
  try {
    await app.delete();
  } catch (error) {
    logError("Error cleaning up Firebase app", error);
  }
}

// Execute the script
populateMeetings()
  .then(() => {
    logStatus("Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    logError("Script failed with error", error);
    process.exit(1);
  });
