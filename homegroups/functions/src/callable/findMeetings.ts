import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  getNarcoticsAnoymousMeetings,
  getAll12StepMeetings,
  getCustomMeetings,
  getAlcoholicsAnonymousMeetings,
} from "../utils/meetings"; // Assuming meetings utils are one level up
import {
  Meeting,
  MeetingSearchCriteria,
  MeetingType,
} from "../entities/Meeting";

// Define input type again for clarity within this file
interface MeetingSearchInput {
  filters?: {
    date: string;
    location: {
      lat: number;
      lng: number;
    };
    day?: string;
    type?: MeetingTypeFilters;
  };
  criteria?: MeetingSearchCriteria;
}

// Define filter type again
export type MeetingTypeFilters =
  | "AA"
  | "NA"
  | "AL-ANON"
  | "Religious"
  | "Custom"
  | "all"
  | "Celebrate Recovery";

const MEETING_TYPE_FILTERS: readonly MeetingTypeFilters[] = [
  "AA",
  "NA",
  "AL-ANON",
  "Religious",
  "Custom",
  "all",
  "Celebrate Recovery",
];

/**
 * Validates and normalizes raw `request.data` for findMeetings. Replaces the
 * prior unchecked `request.data as MeetingSearchInput` cast (B1 hardening).
 * Throws HttpsError("invalid-argument") on malformed input so bad requests fail
 * fast rather than flowing untyped into the handler.
 */
function validateFindMeetingsInput(data: unknown): MeetingSearchInput {
  if (typeof data !== "object" || data === null) {
    throw new HttpsError("invalid-argument", "Request data must be an object.");
  }

  const { filters, criteria } = data as Record<string, unknown>;

  if (typeof filters !== "object" || filters === null) {
    throw new HttpsError(
      "invalid-argument",
      "filters are required for meeting search.",
    );
  }
  const f = filters as Record<string, unknown>;

  if (typeof f.location !== "object" || f.location === null) {
    throw new HttpsError(
      "invalid-argument",
      "filters.location is required and must contain lat and lng.",
    );
  }
  const { lat, lng } = f.location as Record<string, unknown>;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lng !== "number" ||
    !Number.isFinite(lng)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "filters.location.lat and filters.location.lng must be finite numbers.",
    );
  }

  let type: MeetingTypeFilters = "all";
  if (f.type !== undefined) {
    if (
      typeof f.type !== "string" ||
      !MEETING_TYPE_FILTERS.includes(f.type as MeetingTypeFilters)
    ) {
      throw new HttpsError(
        "invalid-argument",
        `filters.type must be one of: ${MEETING_TYPE_FILTERS.join(", ")}.`,
      );
    }
    type = f.type as MeetingTypeFilters;
  }

  if (f.day !== undefined && typeof f.day !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "filters.day must be a string when provided.",
    );
  }

  if (
    criteria !== undefined &&
    (typeof criteria !== "object" || criteria === null)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "criteria must be an object when provided.",
    );
  }

  return {
    filters: {
      date: typeof f.date === "string" ? f.date : "",
      location: { lat, lng },
      day: f.day as string | undefined,
      type,
    },
    criteria: criteria as MeetingSearchCriteria | undefined,
  };
}

// Interface for serialized meeting data
interface SerializedMeeting {
  id: string;
  name: string;
  time: string;
  format: string;
  type: string;
  verified: boolean;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
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
  apiId?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  groupId?: string;
}

// Helper function to serialize Firestore data
function serializeMeeting(meeting: Meeting): SerializedMeeting {
  const serialized: SerializedMeeting = {
    id: meeting.id || "",
    name: meeting.name || "",
    time: meeting.time || "",
    format: meeting.format || "",
    type: meeting.type || "",
    verified: meeting.verified || false,
    addedBy: meeting.addedBy || "",
    createdAt: "",
    updatedAt: "",
    address: meeting.address,
    city: meeting.city,
    state: meeting.state,
    street: meeting.street,
    zip: meeting.zip,
    formattedAddress: meeting.formattedAddress,
    types: meeting.types,
    lat: meeting.lat,
    lng: meeting.lng,
    geohash: meeting.geohash,
    country: meeting.country,
    locationName: meeting.locationName,
    day: meeting.day,
    online: meeting.online,
    link: meeting.link,
    onlineNotes: meeting.onlineNotes,
    apiId: meeting.apiId,
    notes: meeting.notes,
    locationNotes: meeting.locationNotes,
    groupName: meeting.groupName,
    district: meeting.district,
    timezone: meeting.timezone,
    venmo: meeting.venmo,
    square: meeting.square,
    paypal: meeting.paypal,
    groupId: meeting.groupId,
  };

  // Handle timestamps
  try {
    if (meeting.createdAt instanceof Date) {
      serialized.createdAt = meeting.createdAt.toISOString();
    } else if (meeting.createdAt && "toDate" in meeting.createdAt) {
      serialized.createdAt = (meeting.createdAt as any).toDate().toISOString();
    } else {
      serialized.createdAt = new Date().toISOString();
    }

    if (meeting.updatedAt instanceof Date) {
      serialized.updatedAt = meeting.updatedAt.toISOString();
    } else if (meeting.updatedAt && "toDate" in meeting.updatedAt) {
      serialized.updatedAt = (meeting.updatedAt as any).toDate().toISOString();
    } else {
      serialized.updatedAt = new Date().toISOString();
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error("Error serializing timestamps:", error);
    serialized.createdAt = new Date().toISOString();
    serialized.updatedAt = new Date().toISOString();
  }

  return serialized;
}

export const findMeetings = onCall(async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  // Validate before the try block so invalid-argument is not rewrapped as internal.
  const meetingInput = validateFindMeetingsInput(request.data);

  const startTime = Date.now();
  logger.info("findMeetings called with request:", {
    filters: request.data?.filters,
    criteria: request.data?.criteria,
  });

  try {
    const meetingPromises: Promise<Meeting[]>[] = [];
    const dayFilter = meetingInput.filters?.day?.toLowerCase();

    logger.info("Processing meeting search with:", {
      type: meetingInput.filters?.type || "all",
      dayFilter,
      location: meetingInput.filters?.location,
      criteria: meetingInput.criteria,
    });

    if (
      meetingInput.filters &&
      meetingInput.filters.type &&
      meetingInput.filters.type !== "all"
    ) {
      if (meetingInput.filters.type === "AA") {
        logger.info("Fetching AA meetings");
        const aaMeetings = getAlcoholicsAnonymousMeetings(
          meetingInput.filters.location,
          meetingInput.criteria,
          dayFilter,
        );
        meetingPromises.push(aaMeetings);
      }
      if (meetingInput.filters.type === "NA") {
        logger.info("Fetching NA meetings");
        const naMeetings = getNarcoticsAnoymousMeetings(
          meetingInput.filters.location,
          meetingInput.criteria,
          dayFilter,
        );
        meetingPromises.push(naMeetings);
      }
      if (meetingInput.filters.type === "Custom") {
        logger.info("Fetching Custom meetings");
        const customMeetings = getCustomMeetings(
          meetingInput.filters.location,
          meetingInput.criteria,
          dayFilter,
        );
        meetingPromises.push(customMeetings);
      }
    } else if (meetingInput.filters) {
      logger.info("Fetching all 12-step meetings");
      const all12StepMeetings = getAll12StepMeetings(
        meetingInput.filters.location,
        meetingInput.criteria,
        dayFilter,
      );
      meetingPromises.push(all12StepMeetings);
    } else {
      logger.error("Missing required filters for meeting search");
      throw new HttpsError(
        "invalid-argument",
        "Missing required filters for meeting search",
      );
    }

    logger.info(`Starting to fetch ${meetingPromises.length} meeting sets`);
    const results = await Promise.all(meetingPromises);

    const meetings: Meeting[] = [];
    for (const meetingSet of results) {
      meetings.push(...meetingSet);
    }

    logger.info("Meetings fetched successfully", {
      totalMeetings: meetings.length,
      meetingTypes: meetings
        .map((m) => m.type)
        .filter((v, i, a) => a.indexOf(v) === i),
    });

    // Serialize meetings before returning
    const serializedMeetings = meetings.map(serializeMeeting);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    logger.info("Meeting search completed", {
      duration: `${duration} seconds`,
      totalMeetings: serializedMeetings.length,
      firstMeeting: serializedMeetings[0]
        ? {
            id: serializedMeetings[0].id,
            name: serializedMeetings[0].name,
            type: serializedMeetings[0].type,
          }
        : null,
    });

    return serializedMeetings;
  } catch (error) {
    const errorTime = Date.now();
    const errorDuration = (errorTime - startTime) / 1000;

    logger.error("Error in findMeetings:", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : String(error),
      duration: `${errorDuration} seconds`,
      request: {
        filters: request.data?.filters,
        criteria: request.data?.criteria,
      },
    });

    throw new HttpsError(
      "internal",
      "Error retrieving meetings",
      error instanceof Error ? error.message : String(error),
    );
  }
});
