import * as admin from "firebase-admin";
import moment from "moment-timezone";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";

const serviceAccount = require("./recovery-connect.json");

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Types (copied from functions/src/entities/Meeting.ts)
interface MeetingDocument {
  name: string;
  id?: string;
  type: string;
  day: string;
  country?: string;
  time: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  location?: string;
  isOnline: boolean;
  onlineLink?: string;
  onlineNotes?: string;
  verified: boolean;
  addedBy?: string;
  createdAt: AdminTimestamp;
  updatedAt: AdminTimestamp;
  groupId: string;
  format?: string;
  locationName?: string;
  geohash?: string;
  temporaryNotice?: string | null;
  isCancelledTemporarily?: boolean;
}

interface MeetingInstanceDocument {
  meetingId: string;
  groupId: string;
  scheduledAt: AdminTimestamp;
  name: string;
  type: string;
  format?: string | null;
  location?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationName?: string | null;
  isOnline?: boolean;
  link?: string | null;
  onlineNotes?: string | null;
  isCancelled: boolean;
  instanceNotice?: string | null;
  templateUpdatedAt: AdminTimestamp;
  chairpersonId?: string | null;
  chairpersonName?: string | null;
  overriddenFields?: {
    scheduledAt?: boolean;
    location?: boolean;
    address?: boolean;
    city?: boolean;
    state?: boolean;
    zip?: boolean;
    lat?: boolean;
    lng?: boolean;
    locationName?: boolean;
    isOnline?: boolean;
    link?: boolean;
    onlineNotes?: boolean;
  };
  instanceModifiedAt?: AdminTimestamp;
}

// Config for the migration
interface MigrationConfig {
  dryRun?: boolean;
  batchSize?: number;
  logFrequency?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
  daysAhead?: number; // How many days ahead to generate instances (default: 7)
}

/**
 * Helper function to create a meeting timestamp from date and time string
 * Copied from functions/src/utils/meetingUtils.ts
 */
function createMeetingTimestamp(
  date: Date,
  timeString: string,
  timezone: string
): AdminTimestamp | null {
  try {
    const time = timeString.replace(/^0/, ""); // Remove leading zero
    let isPM = false;

    if (time.includes("PM")) {
      isPM = true;
    }

    const timeOnly = time.replace(/[AP]M/i, "").trim();
    const [hours, minutes = "0"] = timeOnly.split(":").map(Number);

    let adjustedHours = hours;
    if (isPM && hours !== 12) {
      adjustedHours = hours + 12;
    } else if (!isPM && hours === 12) {
      adjustedHours = 0;
    }

    const meetingMoment = moment.tz(date, timezone);
    meetingMoment.hour(adjustedHours);
    meetingMoment.minute(Number(minutes));
    meetingMoment.second(0);
    meetingMoment.millisecond(0);

    return AdminTimestamp.fromDate(meetingMoment.toDate());
  } catch (error) {
    console.error("Error creating meeting timestamp:", error);
    return null;
  }
}

/**
 * Generate instances for a meeting within a date range
 * Copied from functions/src/utils/meetingUtils.ts
 */
async function generateInstancesForMeeting(
  meetingId: string,
  meetingTemplate: MeetingDocument,
  startDate: moment.Moment,
  endDate: moment.Moment,
  groupTimezone: string,
  db: admin.firestore.Firestore
): Promise<number> {
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const templateDayIndex = daysOfWeek.indexOf(
    (meetingTemplate.day || "").toLowerCase()
  );
  const templateTime = meetingTemplate.time;
  const templateUpdatedAt: AdminTimestamp =
    meetingTemplate.updatedAt || AdminTimestamp.now();
  const groupId = meetingTemplate.groupId;

  if (templateDayIndex === -1 || !templateTime || !groupId) {
    console.warn(
      `Cannot generate instances for meeting ${meetingId}: Invalid day, time, or missing groupId.`
    );
    return 0;
  }

  let batch = db.batch();
  let operationsInBatch = 0;
  let createdCount = 0;
  const BATCH_LIMIT = 450;
  const generationPromises: Promise<any>[] = [];

  let currentDate = startDate.clone();
  while (currentDate.isSameOrBefore(endDate)) {
    if (currentDate.day() === templateDayIndex) {
      const scheduledAtTimestamp = createMeetingTimestamp(
        currentDate.toDate(),
        templateTime,
        groupTimezone
      );

      if (scheduledAtTimestamp) {
        // Check if instance already exists for this exact time
        const instanceQuery = db
          .collection("meetingInstances")
          .where("meetingId", "==", meetingId)
          .where("scheduledAt", "==", scheduledAtTimestamp)
          .limit(1);
        const existingInstance = await instanceQuery.get();

        if (existingInstance.empty) {
          const instanceRef = db.collection("meetingInstances").doc();
          const instanceData: any = {
            meetingId: meetingId,
            groupId: groupId,
            scheduledAt: scheduledAtTimestamp,
            templateUpdatedAt: templateUpdatedAt,
            name: meetingTemplate.name,
            type: meetingTemplate.type,
            format: meetingTemplate.format ?? null,
            location: meetingTemplate.location ?? null,
            address: meetingTemplate.address ?? null,
            city: meetingTemplate.city ?? null,
            state: meetingTemplate.state ?? null,
            zip: meetingTemplate.zip ?? null,
            lat: meetingTemplate.lat ?? null,
            lng: meetingTemplate.lng ?? null,
            locationName: meetingTemplate.locationName ?? null,
            isOnline: meetingTemplate.isOnline ?? false,
            link: meetingTemplate.onlineLink ?? null,
            onlineNotes: meetingTemplate.onlineNotes ?? null,
            isCancelled: false,
            instanceNotice: null,
            // Chairperson fields (null for new instances)
            chairpersonId: null,
            chairpersonName: null,
            // Omit overriddenFields and instanceModifiedAt for new instances
            // (they will be added when instances are modified)
          };
          batch.set(instanceRef, instanceData);
          operationsInBatch++;
          createdCount++;

          if (operationsInBatch >= BATCH_LIMIT) {
            generationPromises.push(batch.commit());
            batch = db.batch();
            operationsInBatch = 0;
          }
        }
      }
    }
    currentDate.add(1, "day");
  }

  if (operationsInBatch > 0) {
    generationPromises.push(batch.commit());
  }

  await Promise.all(generationPromises);
  console.log(
    `Generated ${createdCount} instances for meeting ${meetingId} between ${startDate.format(
      "YYYY-MM-DD"
    )} and ${endDate.format("YYYY-MM-DD")}.`
  );
  return createdCount;
}

/**
 * Migration script to generate meeting instances for all existing meetings
 * This ensures that existing meetings have instances available immediately
 * after switching from monthly to daily instance generation
 *
 * @param config Configuration options for the migration
 * @returns Summary statistics for the migration
 */
export async function migrateMeetingInstances(config: MigrationConfig = {}) {
  // Set defaults
  const {
    dryRun = false,
    batchSize = 50, // Smaller batch size since we're creating many instances
    logFrequency = 10,
    logLevel = "info",
    daysAhead = 7,
  } = config;

  // Configure Firestore to ignore undefined properties
  admin.firestore().settings({
    ignoreUndefinedProperties: true,
  });

  const db = admin.firestore();

  // Custom logger that respects log level
  const log = {
    debug: (message: string) => {
      if (logLevel === "debug") {
        console.log(`[DEBUG] ${message}`);
      }
    },
    info: (message: string) => {
      if (logLevel === "debug" || logLevel === "info") {
        console.log(`[INFO] ${message}`);
      }
    },
    warn: (message: string) => {
      if (logLevel === "debug" || logLevel === "info" || logLevel === "warn") {
        console.warn(`[WARN] ${message}`);
      }
    },
    error: (message: string, error?: any) => {
      console.error(`[ERROR] ${message}`);
      if (error) console.error(error);
    },
  };

  log.info(`Starting meeting instance migration${dryRun ? " (DRY RUN)" : ""}`);
  log.info(`Generating instances for next ${daysAhead} days`);

  try {
    // Get all groups from Firestore
    const groupsSnapshot = await db.collection("groups").get();
    log.info(`Found ${groupsSnapshot.size} groups total`);

    // Counters for tracking
    let groupsProcessed = 0;
    let meetingsProcessed = 0;
    let instancesCreated = 0;
    let meetingsSkipped = 0;
    let errors = 0;

    // Process each group
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      const groupTimezone = groupData?.timezone || "UTC";

      try {
        log.debug(
          `Processing group ${groupId} (${groupData?.name || "Unnamed"})`
        );

        // Get all meetings for this group
        const meetingsSnapshot = await db
          .collection("meetings")
          .where("groupId", "==", groupId)
          .get();

        if (meetingsSnapshot.empty) {
          log.debug(`Group ${groupId} has no meetings, skipping`);
          groupsProcessed++;
          continue;
        }

        log.debug(`Group ${groupId} has ${meetingsSnapshot.size} meeting(s)`);

        // Calculate date range in group timezone
        const today = moment.tz(groupTimezone).startOf("day");
        const endDate = moment
          .tz(groupTimezone)
          .add(daysAhead, "days")
          .endOf("day");

        // Process each meeting
        for (const meetingDoc of meetingsSnapshot.docs) {
          const meetingId = meetingDoc.id;
          const meetingData = meetingDoc.data() as MeetingDocument;

          try {
            // Validate meeting has required fields
            if (!meetingData.day || !meetingData.time) {
              log.warn(`Meeting ${meetingId} missing day or time, skipping`);
              meetingsSkipped++;
              continue;
            }

            if (dryRun) {
              log.info(
                `[DRY RUN] Would generate instances for meeting ${meetingId} (${meetingData.name})`
              );
              meetingsProcessed++;
              // Estimate instances (rough calculation)
              const daysInRange = endDate.diff(today, "days");
              const dayOfWeek = meetingData.day.toLowerCase();
              const dayIndex = [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
              ].indexOf(dayOfWeek);
              if (dayIndex !== -1) {
                const estimatedInstances = Math.floor(daysInRange / 7) + 1;
                instancesCreated += estimatedInstances;
              }
            } else {
              // Generate instances using the same utility function
              const count = await generateInstancesForMeeting(
                meetingId,
                meetingData,
                today,
                endDate,
                groupTimezone,
                db
              );

              instancesCreated += count;
              meetingsProcessed++;

              log.debug(
                `Generated ${count} instances for meeting ${meetingId}`
              );
            }

            // Log progress periodically
            if (meetingsProcessed % logFrequency === 0) {
              log.info(
                `Processed ${meetingsProcessed} meetings, created ${instancesCreated} instances`
              );
            }
          } catch (error) {
            log.error(
              `Error processing meeting ${meetingId} in group ${groupId}:`,
              error
            );
            errors++;
          }
        }

        groupsProcessed++;

        // Log group progress
        if (groupsProcessed % 10 === 0) {
          log.info(
            `Processed ${groupsProcessed}/${groupsSnapshot.size} groups`
          );
        }
      } catch (error) {
        log.error(`Error processing group ${groupId}:`, error);
        errors++;
      }
    }

    log.info(
      `Meeting instance migration completed${dryRun ? " (DRY RUN)" : ""}`
    );
    log.info(`Groups processed: ${groupsProcessed}`);
    log.info(`Meetings processed: ${meetingsProcessed}`);
    log.info(`Instances created: ${instancesCreated}`);
    log.info(`Meetings skipped: ${meetingsSkipped}`);
    log.info(`Errors: ${errors}`);

    return {
      success: true,
      groupsProcessed,
      meetingsProcessed,
      instancesCreated,
      meetingsSkipped,
      errors,
      dryRun,
    };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: MigrationConfig = {
    dryRun: args.includes("--dry-run"),
    logLevel: args.includes("--debug") ? "debug" : "info",
  };

  // Parse --days-ahead argument
  const daysAheadArg = args.find((arg) => arg.startsWith("--days-ahead="));
  if (daysAheadArg) {
    const days = parseInt(daysAheadArg.split("=")[1], 10);
    if (!isNaN(days) && days > 0) {
      config.daysAhead = days;
    }
  }

  migrateMeetingInstances(config)
    .then((result) => {
      console.log("Migration completed:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
