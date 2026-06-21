import { Location } from "../entities/GeocodeResponse";
import { partialGeocode } from "../api/api";
import { getDistance } from "./location";
import { MeetingSearchCriteria, RatsMeeting } from "../entities/Meeting";
import { getMeetings } from "../api/firestore";
import { logger } from "firebase-functions";

/**
 * Regroup-owned meeting helpers.
 *
 * External 12-step discovery (AA/NA/Celebrate Recovery + geocoding) has moved to
 * recovery-api — the shared cross-product directory — and is consumed via
 * `api/recoveryApi.ts`. What remains here is regroup-private: custom house
 * meetings stored in regroup Firestore, plus the NA-address geocode used by
 * `userIsAtMeeting`.
 */

const criteriaExists = (criteria: string | undefined): criteria is string => {
  return !!(criteria && criteria.length);
};

const getMeetingsWithinDistance = (
  location: Location,
  meetings: RatsMeeting[],
  distance: number = 16000,
): RatsMeeting[] => {
  return meetings.filter(
    (meeting) =>
      getDistance({ lat: meeting.lat || 0, lng: meeting.lng || 0 }, location) <=
      distance,
  );
};

export const filterCustomMeetings = (
  meetings: RatsMeeting[],
  criteria: MeetingSearchCriteria,
) => {
  logger.info("Filtering custom meetings by critera", criteria);
  return meetings.filter((meeting) => {
    let meetingMeetsCriteria = true;
    if (criteriaExists(criteria.name)) {
      meetingMeetsCriteria =
        meeting.name.toLowerCase().includes(criteria.name.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.city)) {
      meetingMeetsCriteria =
        (meeting.city ?? "")
          .toLowerCase()
          .includes(criteria.city.toLowerCase()) && meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.street)) {
      meetingMeetsCriteria =
        meeting.street.toLowerCase().includes(criteria.street.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.state)) {
      meetingMeetsCriteria =
        (meeting.state ?? "")
          .toLowerCase()
          .includes(criteria.state.toLowerCase()) && meetingMeetsCriteria;
    }
    if (criteria.location) {
      meetingMeetsCriteria =
        getDistance(
          { lat: meeting.lat || 0, lng: meeting.lng || 0 },
          criteria.location,
        ) <= 500 && meetingMeetsCriteria;
    }
    return meetingMeetsCriteria;
  });
};

export const getCustomMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria,
) => {
  logger.info("Retrieving custom meetings");
  try {
    const start = Date.now();
    const meetingQuery = await getMeetings();
    let meetings = meetingQuery.docs.map((doc) => doc.data() as RatsMeeting);
    meetings = getMeetingsWithinDistance(location, meetings);
    if (criteria) {
      return filterCustomMeetings(meetings, criteria);
    }
    logger.info("Custom meetings in", (Date.now() - start) / 1000, "seconds");
    return meetings;
  } catch (error) {
    logger.info("Error retrieving custom meetings", error);
  }
  return [];
};

/**
 * Geocodes a query string using the NA meeting address format and returns
 * the first matching lat/lng, or undefined if no result has geometry.
 */
export const geocodeNAMeeting = async (
  query: string,
): Promise<Location | undefined> => {
  logger.info("Retrieving geocode for NA meeting", query);
  const geocodeResponse = await partialGeocode(query);
  let location: Location | undefined;
  geocodeResponse.results.some((result) => {
    if (result.geometry && result.geometry.location) {
      location = result.geometry.location;
      logger.info("NA meeting successfully geocoded");
      return true;
    }
    return false;
  });
  return location;
};
