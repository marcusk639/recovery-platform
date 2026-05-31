import { Firestore, FieldValue, Timestamp } from "@google-cloud/firestore";
import axios from "axios";
import * as admin from "firebase-admin";
import * as path from "path";
import * as ngeohash from "ngeohash";
import * as fs from "fs";
import { Meeting, ApiMeeting, CONFIG, daysOfWeek } from "./shared-types";
import {
  generateMeetingHash,
  parseStreetAddress,
  sleep,
  cleanMeetingName,
} from "./shared-utils";

// --- Configuration ---
const MEETING_GUIDE_API_URL = "https://api.meetingguide.org/app/v2/request";

// Keep track of processed *generated* meeting IDs in this run to avoid duplicate batch writes
const processedMeetingHashIds = new Set<string>();

// Map to store existing meetings from Firestore
const existingMeetings = new Map<string, Meeting>();

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

// Function to initialize Firebase Admin SDK
function initializeFirebaseAdmin(): admin.app.App {
  if (!CONFIG.SERVICE_ACCOUNT_PATH) {
    throw new Error("SERVICE_ACCOUNT_PATH is not configured.");
  }
  const serviceAccount = require(path.resolve(CONFIG.SERVICE_ACCOUNT_PATH));
  console.log("Initializing Firebase Admin SDK...");
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Function to fetch meetings from the API with retries
async function fetchMeetingsFromApi(
  lat: number,
  lon: number
): Promise<ApiMeeting[]> {
  const url = `${MEETING_GUIDE_API_URL}?latitude=${lat}&longitude=${lon}`;
  let attempts = 0;
  while (attempts < CONFIG.RETRY_LIMIT) {
    try {
      const response = await axios.get<{ meetings: ApiMeeting[] }>(url, {
        timeout: 10000,
      }); // 10 second timeout

      // Validate API response structure
      if (!response.data || typeof response.data !== "object") {
        logError(
          `Invalid API response structure for ${lat}, ${lon}: ${JSON.stringify(
            response.data
          )}`
        );
        return [];
      }

      if (!Array.isArray(response.data.meetings)) {
        logError(
          `Invalid meetings array for ${lat}, ${lon}: ${JSON.stringify(
            response.data.meetings
          )}`
        );
        return [];
      }

      return response.data.meetings; // Return meetings array
    } catch (error: any) {
      attempts++;
      console.warn(
        `Error fetching meetings for ${lat}, ${lon} (Attempt ${attempts}/${CONFIG.RETRY_LIMIT}): ${error.message}`
      );
      if (axios.isAxiosError(error) && error.response) {
        console.warn(`API Response Status: ${error.response.status}`);
        // Handle specific status codes if needed (e.g., 429 for rate limit)
      }
      if (attempts >= CONFIG.RETRY_LIMIT) {
        console.error(
          `Failed to fetch meetings for ${lat}, ${lon} after ${CONFIG.RETRY_LIMIT} attempts.`
        );
        return []; // Return empty on final failure
      }
      await sleep(CONFIG.RETRY_DELAY_MS * Math.pow(2, attempts - 1)); // Exponential backoff
    }
  }
  return []; // Should not be reached, but satisfies TS
}

// Function to map API data to Firestore Meeting object
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

  // Validate coordinate ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    logError(
      `Skipping meeting due to coordinates out of range: ${apiMeeting.id} (${apiMeeting.name}) - lat: ${latitude}, lon: ${longitude}`
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

  const meeting: Meeting = {
    id: "", // Will be set after hash generation
    name: cleanMeetingName(apiMeeting.name || "Unnamed Meeting"),
    time: "", // Will be set below
    format: apiMeeting.types || "Open",
    type: "AA",
    verified: true,
    addedBy: "system",
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: parsedUpdatedAt,
  };

  // Fix time parsing to handle edge cases
  if (apiMeeting.time) {
    const lastColonIndex = apiMeeting.time.lastIndexOf(":");
    meeting.time =
      lastColonIndex > 0
        ? apiMeeting.time.substring(0, lastColonIndex)
        : apiMeeting.time;
  } else {
    meeting.time = "00:00";
  }

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
  meeting.geohash = ngeohash.encode(
    latitude,
    longitude,
    CONFIG.GEOHASH_PRECISION
  );
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
  try {
    const snapshot = await db.collection(CONFIG.MEETINGS_COLLECTION).get();

    snapshot.forEach((doc) => {
      try {
        const meeting = doc.data() as Meeting;
        if (meeting.id) {
          existingMeetings.set(meeting.id, meeting);
        }
      } catch (docError) {
        logError(`Error processing meeting document ${doc.id}`, docError);
        // Continue processing other documents
      }
    });

    console.log(
      `Fetched ${existingMeetings.size} existing meetings from Firestore`
    );
  } catch (error) {
    logError("Error fetching existing meetings from Firestore", error);
    throw error; // Re-throw as this is critical
  }
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
  try {
    await db
      .collection("script_progress")
      .doc("populateMeetings")
      .set({
        ...progress,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
  } catch (error) {
    logError("Error saving progress", error);
    // Don't throw - progress saving is not critical
  }
}

// Function to load progress
async function loadProgress(
  db: admin.firestore.Firestore
): Promise<Progress | null> {
  try {
    const doc = await db
      .collection("script_progress")
      .doc("populateMeetings")
      .get();
    return doc.exists ? (doc.data() as Progress) : null;
  } catch (error) {
    logError("Error loading progress", error);
    return null; // Return null to start from beginning
  }
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

  // Validate coordinate bounds and step size
  if (
    CONFIG.LAT_MIN < -90 ||
    CONFIG.LAT_MAX > 90 ||
    CONFIG.LON_MIN < -180 ||
    CONFIG.LON_MAX > 180
  ) {
    throw new Error(
      `Invalid coordinate bounds: lat=[${CONFIG.LAT_MIN}, ${CONFIG.LAT_MAX}], lon=[${CONFIG.LON_MIN}, ${CONFIG.LON_MAX}]`
    );
  }

  if (CONFIG.STEP <= 0) {
    throw new Error(`Invalid step size: ${CONFIG.STEP}. Must be positive.`);
  }

  for (let lat = CONFIG.LAT_MIN; lat <= CONFIG.LAT_MAX; lat += CONFIG.STEP) {
    for (let lon = CONFIG.LON_MIN; lon <= CONFIG.LON_MAX; lon += CONFIG.STEP) {
      coordinates.push({ lat, lon });
    }
  }

  logStatus(`Generated ${coordinates.length} coordinates to process`, {
    latRange: [CONFIG.LAT_MIN, CONFIG.LAT_MAX],
    lonRange: [CONFIG.LON_MIN, CONFIG.LON_MAX],
    step: CONFIG.STEP,
  });

  // Load or initialize progress
  const savedProgress = await loadProgress(db);
  const startIndex = savedProgress?.lastProcessedIndex || 0;

  const progress: Progress = {
    lastProcessedIndex: startIndex,
    totalCoordinates: coordinates.length,
    startTime: new Date(),
  };

  const meetingsCollection = db.collection(CONFIG.MEETINGS_COLLECTION);
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
  for (
    let i = startIndex;
    i < coordinates.length;
    i += CONFIG.CONCURRENT_REQUESTS
  ) {
    const batchCoordinates = coordinates.slice(
      i,
      i + CONFIG.CONCURRENT_REQUESTS
    );
    apiCallCount += batchCoordinates.length;

    logStatus(
      `Processing batch ${i + 1}-${Math.min(
        i + CONFIG.CONCURRENT_REQUESTS,
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

                if (meetingsInBatch >= CONFIG.BATCH_SIZE) {
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
      progress.lastProcessedIndex = i + CONFIG.CONCURRENT_REQUESTS;
      try {
        await saveProgress(db, progress);
      } catch (progressError) {
        logError("Error saving progress", progressError);
        // Continue processing - progress saving is not critical
      }

      // Adaptive delay based on API response
      const delay = Math.min(
        1000,
        Math.max(CONFIG.DELAY_MS, apiMeetings.length * 10)
      );
      await sleep(delay);
    } catch (error) {
      logError("Error processing coordinate batch", error);
      errorCount++;
    }
  }

  // Commit any remaining meetings in the final batch
  if (meetingsInBatch > 0) {
    try {
      console.log(`Committing final batch of ${meetingsInBatch} meetings`);
      await batch.commit();
      totalMeetingsProcessed += meetingsInBatch;
      console.log(`Committed final batch of ${meetingsInBatch} meetings`);
    } catch (error) {
      logError("Error committing final batch", error);
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
