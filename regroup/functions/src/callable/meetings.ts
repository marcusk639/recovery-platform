import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { parseInput } from "../validation";
import { getDistance } from "../util/location";
import { Location } from "../entities/GeocodeResponse";
import { geocodeNAMeeting, getCustomMeetings } from "../util/meetings";
import { mapDirectoryToRats } from "../util/directoryMapping";
import { fetchDirectoryMeetings } from "../api/recoveryApi";
import { MeetingSearchCriteria, RatsMeeting } from "../entities/Meeting";
import { DirectoryProvider } from "../entities/DirectoryMeeting";
import { daysOfWeek } from "../util/date";
import { GOOGLE_MAPS_API_KEY, RECOVERY_PLATFORM_API_KEY } from "../config";

// ── Schemas ────────────────────────────────────────────────────────────────────
const locationSchema = z.object({ lat: z.number(), lng: z.number() });

const findMeetingsSchema = z.object({
  filters: z.object({
    location: locationSchema,
    day: z.string(),
    type: z.enum([
      "AA",
      "NA",
      "AL-ANON",
      "Religious",
      "Custom",
      "all",
      "Celebrate Recovery",
    ]),
  }),
  criteria: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      time: z.string().optional(),
      location: locationSchema.optional(),
      street: z.string().optional(),
    })
    .optional(),
});

const userIsAtMeetingSchema = z.object({
  userLocation: locationSchema.optional(),
  meetingLocation: locationSchema.optional(),
  meetingAddress: z.string().optional(),
});

/**
 * Retrieves all meetings based on the location and filters sent in the request
 * data: {
 *  location: { lat, lng }
 *  filters: type of meeting (AA, NA, etc)
 * }
 */
interface MeetingSearchInput {
  filters: {
    location: Location;
    day: string;
    type: MeetingTypeFilters;
  };
  criteria?: MeetingSearchCriteria;
}

export type MeetingTypeFilters =
  | "AA"
  | "NA"
  | "AL-ANON"
  | "Religious"
  | "Custom"
  | "all"
  | "Celebrate Recovery";

/** Map a client meeting-type filter onto a directory provider, or undefined for "all". */
function providerForType(
  type: MeetingTypeFilters,
): DirectoryProvider | undefined {
  switch (type) {
    case "AA":
      return "AA";
    case "NA":
      return "NA";
    case "Celebrate Recovery":
      return "CELEBRATE_RECOVERY";
    default:
      return undefined;
  }
}

/** Mirror the legacy name-only criteria filter applied to external sources. */
function filterByName(
  meetings: RatsMeeting[],
  criteria?: MeetingSearchCriteria,
): RatsMeeting[] {
  if (!criteria?.name) return meetings;
  const name = criteria.name.toLowerCase();
  return meetings.filter((m) => m.name.toLowerCase().includes(name));
}

/**
 * Discovery is served by recovery-api (the shared cross-product directory) for
 * external 12-step sources, merged with regroup-owned custom house meetings. The
 * `RatsMeeting[]` contract is preserved so mobile/web need no change.
 */
export const findMeetings = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      findMeetingsSchema,
      request.data,
    ) as MeetingSearchInput;
    const start = Date.now();
    const { location, day, type } = data.filters;
    const criteria = data.criteria;
    try {
      // Do not log data.filters — it contains the caller's precise GPS
      // coordinates (PII). Log only non-identifying query dimensions.
      logger.info("FIND MEETING", { day, type });

      // Custom (regroup-owned) house meetings live only in regroup Firestore — not
      // the shared directory — so they are served locally without a directory call.
      if (type === "Custom") {
        return (await getCustomMeetings(location, criteria)) ?? [];
      }

      // AL-ANON / Religious have no shared-directory provider today; preserve the
      // prior empty-result behavior for these filters.
      if (type === "AL-ANON" || type === "Religious") {
        return [];
      }

      const provider = providerForType(type);
      const dayIndex = day ? daysOfWeek.indexOf(day.toLowerCase()) : -1;

      const directory = await fetchDirectoryMeetings(
        { location, day: dayIndex >= 0 ? dayIndex : undefined },
        { uid: request.auth.uid, email: request.auth.token?.email },
      );

      let meetings: RatsMeeting[] = directory
        .filter((m) =>
          provider ? m.provider === provider : m.provider !== "CUSTOM",
        )
        .map(mapDirectoryToRats);

      meetings = filterByName(meetings, criteria);

      // "all" historically merged regroup custom house meetings alongside the
      // external 12-step sources — preserve that.
      if (type === "all") {
        const custom = (await getCustomMeetings(location, criteria)) ?? [];
        meetings = [...meetings, ...custom];
      }

      logger.info(
        "Meeting retrieval took",
        (Date.now() - start) / 1000,
        "seconds",
      );
      return meetings;
    } catch (error) {
      logger.error("SOMETHING WENT WRONG", error);
      return [];
    }
  },
);

/**
 * Determines if a user is at a meeting based on his/her current location
 * Gets all the meetings for the area and compares the user's location against them
 */
export interface MeetingVerificationInput {
  userLocation?: Location;
  meetingLocation?: Location;
  meetingAddress?: string;
}

export const userIsAtMeeting = onCall(
  { secrets: [GOOGLE_MAPS_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      userIsAtMeetingSchema,
      request.data,
    ) as MeetingVerificationInput;
    const ACCEPTABLE_DISTANCE = 200; // quarter of a mile in meters
    const { userLocation, meetingLocation, meetingAddress } = data;
    let locationOfMeeting = meetingLocation;
    if (meetingAddress) {
      // this is a NA meeting, get the location of meeting using the address
      try {
        locationOfMeeting = await geocodeNAMeeting(meetingAddress);
      } catch (error) {
        logger.info("Error geocoding NA meeting", error);
        return false;
      }
    }
    if (!userLocation || !locationOfMeeting) return false;
    const distance = getDistance(userLocation, locationOfMeeting);
    logger.debug("Meeting proximity check", { distanceMeters: distance });
    return distance <= ACCEPTABLE_DISTANCE;
  },
);
