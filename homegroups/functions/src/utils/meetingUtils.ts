import * as admin from "firebase-admin";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import moment from "moment-timezone";
import * as functions from "firebase-functions"; // Needed for logger
import {
  Meeting,
  MeetingDocument,
  MeetingGuideMeeting,
  MeetingInstanceDocument,
} from "../entities/Meeting";
import * as geofire from "geofire-common"; // Import geofire
import ngeohash from "ngeohash";
import { generateMeetingHash } from "./meetings";

const GEOHASH_PRECISION = 9;

// --- Helper Functions Moved Here ---

/**
 * Helper function to format a meeting from the Meeting Guide API into a Firestore document
 */
export function formatMeetingForFirestore(
  apiMeeting: MeetingGuideMeeting,
): Meeting {
  // Extract the relevant fields from the Meeting Guide API response
  // and format them for storage in Firestore
  // Return type excludes fields set by the calling function
  const meeting: Partial<Meeting> = {};
  let day = meeting.day || "";
  if (typeof day === "number") {
    day = moment.weekdays(day);
  }

  meeting.name = apiMeeting.name;
  meeting.time =
    apiMeeting.time?.substring(0, apiMeeting.time?.lastIndexOf(":")) || "";
  meeting.street = apiMeeting.address;
  meeting.address = `${apiMeeting.address}, ${apiMeeting.city}, ${apiMeeting.state} ${apiMeeting.postal_code}`;
  meeting.city = apiMeeting.city;
  meeting.state = apiMeeting.state;
  meeting.zip = apiMeeting.postal_code;
  meeting.types = apiMeeting.types || "";
  meeting.lat = parseFloat(apiMeeting.latitude);
  meeting.lng = parseFloat(apiMeeting.longitude);
  meeting.geohash = ngeohash.encode(
    apiMeeting.latitude,
    apiMeeting.longitude,
    GEOHASH_PRECISION,
  ); // Add geohash
  meeting.country = apiMeeting.country || "USA";
  meeting.locationName = apiMeeting.location;
  meeting.type = "AA";
  meeting.day = day;
  meeting.formattedAddress = apiMeeting.formatted_address;
  meeting.online = !!(
    apiMeeting.conference_url ||
    apiMeeting.conference_phone ||
    apiMeeting.types?.includes("ONL") ||
    apiMeeting.types?.includes("HYB")
  );
  meeting.link = apiMeeting.conference_url;
  meeting.onlineNotes =
    apiMeeting.conference_url_notes || apiMeeting.conference_phone_notes;
  meeting.format = apiMeeting.types || "";
  meeting.notes = apiMeeting.notes;
  meeting.locationNotes = apiMeeting.location_notes;
  meeting.groupName = apiMeeting.group;
  meeting.timezone = apiMeeting.timezone;
  meeting.venmo = apiMeeting.venmo;
  meeting.square = apiMeeting.square;
  meeting.paypal = apiMeeting.paypal;
  // Fields set by script
  meeting.verified = true;
  meeting.addedBy = "system";
  meeting.createdAt = new Date();
  meeting.updatedAt = new Date();

  // Now generate the hash ID *from* the populated meeting object
  meeting.id = generateMeetingHash(meeting as Meeting);

  return meeting as Omit<Meeting, "groupId">;
}

export function hasNameOverlap(meeting: any, groupName: string): boolean {
  const groupNameWords = groupName.toLowerCase().split(/\s+/);

  if (groupNameWords.length > 0) {
    const meetingNameWords = (meeting.name || "").toLowerCase().split(/\s+/);
    const hasOverlap = groupNameWords.some(
      (word) => word.length > 3 && meetingNameWords.includes(word),
    );
    return hasOverlap;
  }
  return false;
}

/**
 * Helper function to find meetings that are likely associated with a group
 * (This might need refinement based on actual data patterns)
 */
export function findRelevantMeetings(meetings: any[], groupData: any): any[] {
  const MAX_DISTANCE_METERS = 500;
  const groupLocation: [number, number] = [
    Number(groupData.lat),
    Number(groupData.lng),
  ];

  return meetings.filter((meeting) => {
    let nameMatch = false;
    let locationMatch = false;

    // Check name overlap first
    if (hasNameOverlap(meeting, groupData.name)) {
      nameMatch = true;
    }

    // Check proximity if coordinates exist
    if (meeting.latitude && meeting.longitude) {
      const meetingLocation: [number, number] = [
        parseFloat(meeting.latitude),
        parseFloat(meeting.longitude),
      ];
      try {
        const distance = geofire.distanceBetween(
          groupLocation,
          meetingLocation,
        );
        if (distance <= MAX_DISTANCE_METERS) {
          locationMatch = true;
        }
      } catch (e) {
        // Ignore geofire errors if coordinates are invalid
      }
    }

    // Keep if either name overlaps OR location is very close
    return nameMatch || locationMatch;
  });
}

/**
 * Combines a specific date with a time string (HH:MM) and timezone
 * to create an accurate Firestore Timestamp.
 */
export function createMeetingTimestamp(
  date: Date | string,
  time: string,
  timezone: string,
): AdminTimestamp | null {
  try {
    if (!moment.tz.zone(timezone)) {
      functions.logger.warn(
        `Invalid timezone provided: ${timezone}. Falling back to UTC.`,
      );
      timezone = "UTC";
    }
    const dateString =
      typeof date === "string" ? date : moment(date).format("YYYY-MM-DD");
    const dateTimeString = `${dateString} ${time}`;
    const meetingMoment = moment.tz(
      dateTimeString,
      "YYYY-MM-DD HH:mm",
      timezone,
    );

    if (!meetingMoment.isValid()) {
      functions.logger.error(
        `Failed to parse combined date/time: ${dateTimeString} in timezone ${timezone}`,
      );
      return null;
    }
    return AdminTimestamp.fromDate(meetingMoment.toDate());
  } catch (error) {
    functions.logger.error(
      `Error creating meeting timestamp for ${date} ${time} [${timezone}]:`,
      error,
    );
    return null;
  }
}

/**
 * Helper function to generate meeting instances for a single meeting template
 * within a given date range.
 * Returns the number of instances created.
 */
export async function generateInstancesForMeeting(
  meetingId: string,
  meetingTemplate: MeetingDocument,
  startDate: moment.Moment,
  endDate: moment.Moment,
  groupTimezone: string,
  db: admin.firestore.Firestore, // Pass Firestore instance
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
    (meetingTemplate.day || "").toLowerCase(),
  );
  const templateTime = meetingTemplate.time;
  const templateUpdatedAt: AdminTimestamp =
    meetingTemplate.updatedAt || AdminTimestamp.now();
  const groupId = meetingTemplate.groupId;

  if (templateDayIndex === -1 || !templateTime || !groupId) {
    functions.logger.warn(
      `Cannot generate instances for meeting ${meetingId}: Invalid day, time, or missing groupId.`,
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
        groupTimezone,
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
          const instanceData: MeetingInstanceDocument = {
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
            // No overrides for newly generated instances
            overriddenFields: undefined,
            instanceModifiedAt: undefined,
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
  functions.logger.info(
    `Generated ${createdCount} instances for meeting ${meetingId} between ${startDate.format(
      "YYYY-MM-DD",
    )} and ${endDate.format("YYYY-MM-DD")}.`,
  );
  return createdCount;
}
