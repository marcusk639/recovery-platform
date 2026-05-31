import { Location } from "../entities/GeocodeResponse";
import {
  getNAMeetings,
  getAAMeetings,
  partialGeocode,
  getCelebrateRecoveryMeetings,
} from "../api/api";
import { getDistance } from "./location";
import { NAMeeting } from "../entities/NAMeetingResponse";
import {
  MeetingSearchCriteria,
  RatsMeeting,
} from "../entities/Meeting";
import { AAMeeting } from "../entities/AAMeetingResponse";
import { daysOfWeek } from "./date";
import { getMeetings, ratsFirestore } from "../api/firestore";
import { logger } from "firebase-functions";
import { parseString } from "xml2js";
import {
  CelebrateRecoveryMeeting,
  CelebrateRecoveryMeetings,
} from "../entities/CelebrateRecoveryMeeting";
import moment from "moment";

/**
 * Formats an integer in military time notation (e.g. 800, 1930, 2300)
 * into an HH:mm string (e.g. "08:00", "19:30", "23:00").
 *
 * Uses Math.floor to correctly extract the hour component — plain division
 * would produce a decimal (e.g. 1930 / 100 = 19.3 → "19.3:30").
 */
const getMeetingTime = (time: number): string => {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  const paddedHours = hours < 10 ? "0" + hours : String(hours);
  const paddedMinutes = minutes < 10 ? "0" + minutes : String(minutes);
  return paddedHours + ":" + paddedMinutes;
};

/**
 * Maps a raw AA meeting record from the AAWS API response into a RatsMeeting.
 * Returns null and logs an error if mapping fails (e.g. missing or malformed fields).
 */
export const mapAAMeeting = (
  meeting: Pick<
    AAMeeting,
    | "name"
    | "address"
    | "city"
    | "time"
    | "postal_code"
    | "state"
    | "location_name"
    | "types"
    | "latitude"
    | "longitude"
    | "day"
    | "conference_url"
    | "conference_url_notes"
  >
): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.name = meeting.name;
    m.street = meeting.address;
    m.city = meeting.city;
    m.time = meeting.time.substring(0, meeting.time.lastIndexOf(":"));
    m.zip = meeting.postal_code;
    m.state = meeting.state;
    m.locationName = meeting.location_name;
    m.types = meeting.types.split(",");
    m.lat = parseFloat(meeting.latitude);
    m.lng = parseFloat(meeting.longitude);
    m.type = "AA";
    m.day = daysOfWeek[meeting.day];
    m.online = !!meeting.conference_url;
    m.link = meeting.conference_url;
    m.onlineNotes = meeting.conference_url_notes;
    return m;
  } catch (err) {
    logger.error("failed to map AA meeting", meeting, err);
    return null;
  }
};

/**
 * Maps a raw Celebrate Recovery meeting record from the CR XML API into a RatsMeeting.
 * Returns null and logs an error if mapping fails (e.g. malformed address or date fields).
 */
export const mapCRMeeting = (meeting: CelebrateRecoveryMeeting): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.type = "Celebrate Recovery";
    m.name = meeting.name[0];
    const addressParts = meeting.address[0].split(",");
    m.street = addressParts[0];
    m.city = addressParts[1].trim();
    // addressParts[2] is " STATE ZIP COUNTRY" — split on space and skip the
    // leading empty string that results from the leading space character.
    const stateZipCountry = addressParts[2].split(" ").slice(1);
    m.state = stateZipCountry[0];
    m.zip = stateZipCountry[1];
    // TODO: custom2[0]._ is "Friday 5:00 PM" — splitting on space yields ["Friday","5:00","PM"].
    // Destructuring [day, time] discards "PM", so moment receives "5:00" instead of "5:00 PM",
    // producing incorrect 24-hour values (e.g. "05:00" instead of "17:00"). Pre-existing bug.
    const [day, time] = meeting.custom2[0]._.split(" ");
    if (day && time) {
      m.day = day.toLowerCase().trim();
      // Convert 12-hour time (e.g. "5:00 PM") to 24-hour format (e.g. "17:00").
      m.time = moment(time, ["h:mm A"]).format("HH:mm");
    }
    m.lat = parseFloat(meeting.lat[0]);
    m.lng = parseFloat(meeting.lng[0]);
    return m;
  } catch (err) {
    logger.error("failed to map CR meeting", meeting, err);
    return null;
  }
};

/**
 * Maps a raw NA meeting record from the NA API response into a RatsMeeting.
 * Returns null and logs an error if mapping fails (e.g. missing or malformed fields).
 * Note: NA meetings fetched via getNarcoticsAnoymousMeetings come pre-mapped from
 * Firestore and do not use this function in the production call path.
 */
export const mapNAMeeting = (
  meeting: Pick<
    NAMeeting,
    | "com_name"
    | "address"
    | "city"
    | "state"
    | "zip"
    | "directions"
    | "mtg_day"
    | "mtg_time"
    | "latitude"
    | "longitude"
    | "online"
    | "password"
    | "link"
  >
): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.type = "NA";
    m.name = meeting.com_name;
    m.day = daysOfWeek[meeting.mtg_day - 1];
    m.Location = [
      meeting.com_name,
      meeting.address,
      `${meeting.city}, ${meeting.state} ${meeting.zip}`,
      meeting.directions,
    ];
    m.time = getMeetingTime(meeting.mtg_time);
    m.lat = meeting.latitude;
    m.lng = meeting.longitude;
    m.online = meeting.online === "Yes";
    m.onlineNotes = meeting.password;
    m.link = meeting.link;
    return m;
  } catch (err) {
    logger.error("failed to map NA meeting", meeting, err);
    return null;
  }
};

const criteriaExists = (criteria: string | undefined): criteria is string => {
  return !!(criteria && criteria.length);
};

const getMeetingsWithinDistance = (
  location: Location,
  meetings: RatsMeeting[],
  distance: number = 16000
): RatsMeeting[] => {
  return meetings.filter((meeting) =>
    getDistance(
      { lat: meeting.lat || 0, lng: meeting.lng || 0 },
      location
    ) <= distance
  );
};

export const filterCustomMeetings = (
  meetings: RatsMeeting[],
  criteria: MeetingSearchCriteria
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
        (meeting.city ?? '').toLowerCase().includes(criteria.city.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.street)) {
      meetingMeetsCriteria =
        meeting.street.toLowerCase().includes(criteria.street.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.state)) {
      meetingMeetsCriteria =
        (meeting.state ?? '').toLowerCase().includes(criteria.state.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteria.location) {
      meetingMeetsCriteria =
        getDistance(
          { lat: meeting.lat || 0, lng: meeting.lng || 0 },
          criteria.location
        ) <= 500 && meetingMeetsCriteria;
    }
    return meetingMeetsCriteria;
  });
};

export const getCustomMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria
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

export const filterMeetingsByCriteria = (
  meetings: RatsMeeting[],
  criteria: MeetingSearchCriteria | undefined
): RatsMeeting[] => {
  if (criteria?.name) {
    const name = criteria.name;
    logger.info("Filtering by criteria", criteria);
    return meetings.filter((meeting) =>
      meeting.name.toLowerCase().includes(name.toLowerCase())
    );
  }
  return meetings.slice();
};

export const getNarcoticsAnoymousMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria,
  day?: string
) => {
  try {
    const start = Date.now();
    const naMeetingList = await getNAMeetings(location, 10, day);
    logger.info("NA meeting list", naMeetingList);
    logger.info("NA meetings in", (Date.now() - start) / 1000, "seconds");
    return filterMeetingsByCriteria(naMeetingList, criteria);
  } catch (error) {
    logger.info("Failed to get NA meetings", error);
    return [];
  }
};

export const getCelebrateMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria
) => {
  logger.info("Retrieving celebrate recovery meetings...");
  try {
    const result = await getCelebrateRecoveryMeetings(location.lat, location.lng);
    const parsed = await parseXml(result);
    const meetings: RatsMeeting[] = parsed.markers.marker
      .map(mapCRMeeting)
      .filter((meeting): meeting is RatsMeeting => meeting !== null);
    logger.info("Retrieved celebrate recovery meetings");
    return filterMeetingsByCriteria(meetings, criteria);
  } catch (err) {
    logger.error("Failed to retrieve celebrate recovery meetings", err);
    return [];
  }
};

const parseXml = (xml: string): Promise<CelebrateRecoveryMeetings> => {
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result: CelebrateRecoveryMeetings) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

/**
 * Returns AA meetings by location and optionally filtered by criteria.
 */
export const getAlcoholicsAnonymousMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria
) => {
  const start = Date.now();
  const meetingsResponse = await getAAMeetings(location.lat, location.lng);
  const meetings: RatsMeeting[] = meetingsResponse.meetings
    .map(mapAAMeeting)
    .filter((meeting): meeting is RatsMeeting => meeting !== null);
  logger.info("AA meetings in", (Date.now() - start) / 1000, "seconds");
  return filterMeetingsByCriteria(meetings, criteria);
};

export const getAll12StepMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria,
  day?: string
) => {
  logger.info("Retrieving all 12 step meetings...");
  const start = Date.now();
  const meetingPromises = [
    getAlcoholicsAnonymousMeetings(location, criteria),
    getNarcoticsAnoymousMeetings(location, criteria, day),
    getCelebrateMeetings(location, criteria),
    getCustomMeetings(location, criteria),
  ];
  const [aaMeetings, naMeetings, crMeetings, customMeetings] = await Promise.all(meetingPromises);
  logger.info("Retrieved all 12 step meetings in ", (Date.now() - start) / 1000);
  // Include all four sources: AA, NA, Celebrate Recovery, and custom house meetings.
  return [...aaMeetings, ...naMeetings, ...crMeetings, ...(customMeetings ?? [])];
};

/**
 * Geocodes a query string using the NA meeting address format and returns
 * the first matching lat/lng, or undefined if no result has geometry.
 */
export const geocodeNAMeeting = async (query: string): Promise<Location | undefined> => {
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
