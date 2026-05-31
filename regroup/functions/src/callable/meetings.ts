import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";
import { parseInput } from "../validation";
import { getDistance } from "../util/location";
import { Location } from "../entities/GeocodeResponse";
import {
  getAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings,
  getAll12StepMeetings,
  geocodeNAMeeting,
  getCustomMeetings,
  getCelebrateMeetings,
} from "../util/meetings";
import { MeetingSearchCriteria, RatsMeeting } from "../entities/Meeting";
import { GOOGLE_MAPS_API_KEY } from "../config";

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

export const findMeetings = onCall(
  { secrets: [GOOGLE_MAPS_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      findMeetingsSchema,
      request.data,
    ) as MeetingSearchInput;
    const start = Date.now();
    try {
      logger.info("FIND MEETING Filters", data.filters);
      let meetings: RatsMeeting[];
      if (data.filters?.type && data.filters.type !== "all") {
        if (data.filters.type === "AA") {
          meetings = await getAlcoholicsAnonymousMeetings(
            data.filters.location,
            data.criteria,
          );
        } else if (data.filters.type === "NA") {
          meetings = await getNarcoticsAnoymousMeetings(
            data.filters.location,
            data.criteria,
            data.filters.day,
          );
        } else if (data.filters.type === "Custom") {
          meetings = await getCustomMeetings(
            data.filters.location,
            data.criteria,
          );
        } else if (data.filters.type === "Celebrate Recovery") {
          meetings = await getCelebrateMeetings(
            data.filters.location,
            data.criteria,
          );
        } else {
          meetings = [];
        }
      } else {
        meetings = await getAll12StepMeetings(
          data.filters.location,
          data.criteria,
          data.filters.day,
        );
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
    logger.info(
      "Comparing distance between user at",
      userLocation,
      "and meeting at",
      locationOfMeeting,
    );
    if (!userLocation || !locationOfMeeting) return false;
    const distance = getDistance(userLocation, locationOfMeeting);
    logger.info("Distance is", distance);
    return distance <= ACCEPTABLE_DISTANCE;
  },
);
