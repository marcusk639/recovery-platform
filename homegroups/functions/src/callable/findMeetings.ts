import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {
  getCustomMeetings,
  getAlcoholicsAnonymousMeetings,
} from "../utils/meetings"; // Assuming meetings utils are one level up
import { Meeting, MeetingSearchCriteria } from "../entities/Meeting";
import { fetchDirectoryMeetings } from "../api/recoveryApi";
import { mapDirectoryToSerialized } from "../utils/directoryMapping";
import { daysOfWeek } from "../utils/date";

// recovery-api service key. The non-secret base URL is read from the
// RECOVERY_API_BASE_URL env var inside the recoveryApi client.
const RECOVERY_PLATFORM_API_KEY = defineSecret("RECOVERY_PLATFORM_API_KEY");

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
export interface SerializedMeeting {
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

/**
 * Resolve the client-supplied `day` filter (a lowercase weekday string like
 * "monday", or a numeric "0".."6" string) to the directory's integer day index
 * (0 = Sunday). Returns undefined when the day cannot be resolved so the
 * directory request omits `day` and searches all days.
 */
function resolveDirectoryDay(dayFilter?: string): number | undefined {
  if (!dayFilter) return undefined;
  const index = daysOfWeek.indexOf(dayFilter);
  if (index !== -1) return index;
  if (/^[0-6]$/.test(dayFilter)) return Number(dayFilter);
  return undefined;
}

export const findMeetings = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
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
      const dayFilter = meetingInput.filters?.day?.toLowerCase();
      const type = meetingInput.filters?.type ?? "all";
      const location = meetingInput.filters!.location;
      const directoryDay = resolveDirectoryDay(dayFilter);

      logger.info("Processing meeting search with:", {
        type,
        dayFilter,
        location,
        criteria: meetingInput.criteria,
      });

      // Firestore-backed (homegroups-owned) promises, keyed by source. AA and
      // Custom remain native Firestore reads; NA and CR now route through the
      // recovery-api shared directory.
      const firestorePromises: Promise<Meeting[]>[] = [];

      // Provider set requested from the directory (single call, filtered client-side).
      let directoryProviders: ReadonlyArray<string> | null = null;

      if (type === "AA") {
        firestorePromises.push(
          getAlcoholicsAnonymousMeetings(
            location,
            meetingInput.criteria,
            dayFilter,
          ),
        );
      } else if (type === "NA") {
        directoryProviders = ["NA"];
      } else if (type === "Custom") {
        firestorePromises.push(
          getCustomMeetings(location, meetingInput.criteria, dayFilter),
        );
      } else if (type === "AL-ANON" || type === "Religious") {
        // Parity: no source — returns empty.
      } else if (type === "Celebrate Recovery") {
        // Parity: standalone "Celebrate Recovery" type currently returns empty.
      } else {
        // type === "all": Firestore AA + Custom, plus directory NA + CR.
        firestorePromises.push(
          getAlcoholicsAnonymousMeetings(
            location,
            meetingInput.criteria,
            dayFilter,
          ),
          getCustomMeetings(location, meetingInput.criteria, dayFilter),
        );
        directoryProviders = ["NA", "CELEBRATE_RECOVERY"];
      }

      // Make at most ONE directory call (no type filter — filter by provider
      // client-side). On failure the client returns [] so discovery degrades.
      const directoryPromise = directoryProviders
        ? fetchDirectoryMeetings(
            {
              location: { lat: location.lat, lng: location.lng },
              ...(directoryDay !== undefined ? { day: directoryDay } : {}),
            },
            {
              uid: request.auth.uid,
              email: request.auth.token?.email,
            },
            { apiKey: RECOVERY_PLATFORM_API_KEY.value() },
          )
        : Promise.resolve([]);

      logger.info(
        `Starting to fetch ${firestorePromises.length} Firestore meeting set(s)` +
          `${directoryProviders ? " + directory" : ""}`,
      );
      const [firestoreResults, directoryResults] = await Promise.all([
        Promise.all(firestorePromises),
        directoryPromise,
      ]);

      const serializedMeetings: SerializedMeeting[] = [];
      for (const meetingSet of firestoreResults) {
        for (const meeting of meetingSet) {
          serializedMeetings.push(serializeMeeting(meeting));
        }
      }
      if (directoryProviders) {
        const allowed = new Set(directoryProviders);
        for (const dirMeeting of directoryResults) {
          if (allowed.has(dirMeeting.provider)) {
            serializedMeetings.push(mapDirectoryToSerialized(dirMeeting));
          }
        }
      }

      logger.info("Meetings fetched successfully", {
        totalMeetings: serializedMeetings.length,
        meetingTypes: serializedMeetings
          .map((m) => m.type)
          .filter((v, i, a) => a.indexOf(v) === i),
      });

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
  },
);
