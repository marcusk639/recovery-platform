import { Location } from "../entities/GeocodeResponse";
import { partialGeocode } from "../api/api";
import { getDistance } from "./location";
import { MeetingSearchCriteria, Meeting } from "../entities/Meeting";
import geohash from "ngeohash";
import { logger } from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Query } from "firebase-admin/firestore";
import crypto from "crypto";
import * as geofire from "geofire-common";
import * as functions from "firebase-functions";

const criteriaExists = (criteria: string) => {
  return criteria && criteria.length;
};

const getMeetingsWithinDistance = (
  location: Location,
  meetings: Meeting[],
  distance = 16000,
) => {
  const meetingsWithinDistance: Meeting[] = [];
  meetings.forEach((meeting) => {
    // 10 miles in meters
    if (
      getDistance({ lat: meeting.lat || 0, lng: meeting.lng || 0 }, location) <=
      distance
    ) {
      meetingsWithinDistance.push(meeting);
    }
  });
  return meetingsWithinDistance;
};

export const filterCustomMeetings = (
  meetings: Meeting[],
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
        meeting.city.toLowerCase().includes(criteria.city.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.street)) {
      meetingMeetsCriteria =
        meeting.street.toLowerCase().includes(criteria.street.toLowerCase()) &&
        meetingMeetsCriteria;
    }
    if (criteriaExists(criteria.state)) {
      meetingMeetsCriteria =
        meeting.state.toLowerCase().includes(criteria.state.toLowerCase()) &&
        meetingMeetsCriteria;
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

export async function getCustomMeetings(
  location: { lat: number; lng: number },
  criteria?: MeetingSearchCriteria,
  dayFilter?: string | null,
): Promise<Meeting[]> {
  logger.info("Retrieving custom meetings");
  try {
    const start = Date.now();
    let query: Query = admin
      .firestore()
      .collection("meetings")
      .where("type", "==", "Custom");

    // Apply day filter if provided
    if (dayFilter) {
      query = query.where("day", "==", dayFilter);
    }

    const meetingQuery = await query.limit(100).get();
    let meetings = meetingQuery.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as Meeting,
    );
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
}

/**
 * Returns meetings by location and optionally by other criteria
 * @param location
 * @param meetingName
 */
export async function getAlcoholicsAnonymousMeetings(
  location: { lat: number; lng: number },
  criteria?: MeetingSearchCriteria,
  dayFilter?: string,
): Promise<Meeting[]> {
  const startTime = Date.now();
  functions.logger.info("getAlcoholicsAnonymousMeetings called with:", {
    location,
    criteria,
    dayFilter,
  });

  try {
    // Calculate the radius in meters (default to 10km if not specified)
    const radiusInM = (criteria?.maxDistance || 10) * 1000;

    // Get geohash query bounds for the location and radius
    const bounds = geofire.geohashQueryBounds(
      [location.lat, location.lng],
      radiusInM,
    );
    functions.logger.info("Generated geohash bounds:", { bounds });

    // Create base query
    let baseQuery = admin
      .firestore()
      .collection("meetings")
      .where("type", "==", "AA");

    // Apply day filter if provided
    if (dayFilter) {
      baseQuery = baseQuery.where("day", "==", dayFilter);
      functions.logger.info("Applied day filter:", { dayFilter });
    }

    // Execute queries for each bound
    const promises = bounds.map((bound) => {
      return baseQuery
        .orderBy("geohash")
        .startAt(bound[0])
        .endAt(bound[1])
        .get();
    });

    // Execute all queries in parallel
    const snapshots = await Promise.all(promises);
    const endQueryTime = Date.now();

    functions.logger.info("Queries completed", {
      duration: `${(endQueryTime - startTime) / 1000} seconds`,
      totalQueries: snapshots.length,
      totalDocuments: snapshots.reduce((sum, snap) => sum + snap.size, 0),
    });

    // Process results
    const meetings: Meeting[] = [];
    let filteredCount = 0;

    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        const meeting = doc.data() as Meeting;
        meeting.id = doc.id;

        // Calculate actual distance
        if (meeting.lat && meeting.lng) {
          const distanceInKm = geofire.distanceBetween(
            [meeting.lat, meeting.lng],
            [location.lat, location.lng],
          );
          const distanceInM = distanceInKm * 1000;

          // Filter by actual distance
          if (distanceInM <= radiusInM) {
            meetings.push(meeting);
          } else {
            filteredCount++;
          }
        }
      }
    }

    const endTime = Date.now();
    functions.logger.info("Meetings processing completed", {
      totalDuration: `${(endTime - startTime) / 1000} seconds`,
      totalMeetings: meetings.length,
      filteredOut: filteredCount,
      sampleMeeting: meetings[0]
        ? {
            id: meetings[0].id,
            name: meetings[0].name,
            day: meetings[0].day,
            time: meetings[0].time,
          }
        : null,
    });

    return meetings;
  } catch (error) {
    const errorTime = Date.now();
    functions.logger.error("Error in getAlcoholicsAnonymousMeetings:", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : String(error),
      duration: `${(errorTime - startTime) / 1000} seconds`,
      location,
      criteria,
      dayFilter,
    });
    throw error;
  }
}

/**
 * Gets the latitude and longitude from the NA meeting Location property
 * @param query
 */
export const geocodeNAMeeting = async (query: string) => {
  logger.info("Retrieving geocode for NA meeting", query);
  const geocodeResponse = await partialGeocode(query);
  let location: Location;
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

// / geohashUtils.js

// Default geohash length
const g_GEOHASH_PRECISION = 10;

// Characters used in location geohashes
const g_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// The meridional circumference of the earth in meters
const g_EARTH_MERI_CIRCUMFERENCE = 40007860;

// Length of a degree latitude at the equator
const g_METERS_PER_DEGREE_LATITUDE = 110574;

// Number of bits per geohash character
const g_BITS_PER_CHAR = 5;

// Maximum length of a geohash in bits
const g_MAXIMUM_BITS_PRECISION = 22 * g_BITS_PER_CHAR;

// Equatorial radius of the earth in meters
const g_EARTH_EQ_RADIUS = 6378137.0;

// The following value assumes a polar radius of
// var g_EARTH_POL_RADIUS = 6356752.3;
// The formulate to calculate g_E2 is
// g_E2 == (g_EARTH_EQ_RADIUS^2-g_EARTH_POL_RADIUS^2)/(g_EARTH_EQ_RADIUS^2)
// The exact value is used here to avoid rounding errors
const g_E2 = 0.00669447819799;

// Cutoff for rounding errors on double calculations
const g_EPSILON = 1e-12;

Math.log2 =
  Math.log2 ||
  function (x) {
    return Math.log(x) / Math.log(2);
  };

/**
 * Converts degrees to radians.
 *
 * @param {number} degrees The number of degrees to be converted to radians.
 * @return {number} The number of radians equal to the inputted number of degrees.
 */
const degreesToRadians = function (degrees) {
  if (typeof degrees !== "number" || isNaN(degrees)) {
    throw new Error("Error: degrees must be a number");
  }

  return (degrees * Math.PI) / 180;
};

/**
 * Calculates the number of degrees a given distance is at a given latitude.
 *
 * @param {number} distance The distance to convert.
 * @param {number} latitude The latitude at which to calculate.
 * @return {number} The number of degrees the distance corresponds to.
 */
const metersToLongitudeDegrees = function (distance, latitude) {
  const radians = degreesToRadians(latitude);
  const num = (Math.cos(radians) * g_EARTH_EQ_RADIUS * Math.PI) / 180;
  const denom = 1 / Math.sqrt(1 - g_E2 * Math.sin(radians) * Math.sin(radians));
  const deltaDeg = num * denom;
  if (deltaDeg < g_EPSILON) {
    return distance > 0 ? 360 : 0;
  } else {
    return Math.min(360, distance / deltaDeg);
  }
};

/**
 * Calculates the bits necessary to reach a given resolution, in meters, for the longitude at a
 * given latitude.
 *
 * @param {number} resolution The desired resolution.
 * @param {number} latitude The latitude used in the conversion.
 * @return {number} The bits necessary to reach a given resolution, in meters.
 */
const longitudeBitsForResolution = function (resolution, latitude) {
  const degs = metersToLongitudeDegrees(resolution, latitude);
  return Math.abs(degs) > 0.000001 ? Math.max(1, Math.log2(360 / degs)) : 1;
};

/**
 * Calculates the bits necessary to reach a given resolution, in meters, for the latitude.
 *
 * @param {number} resolution The bits necessary to reach a given resolution, in meters.
 */
const latitudeBitsForResolution = function (resolution) {
  return Math.min(
    Math.log2(g_EARTH_MERI_CIRCUMFERENCE / 2 / resolution),
    g_MAXIMUM_BITS_PRECISION,
  );
};

/**
 * Wraps the longitude to [-180,180].
 *
 * @param {number} longitude The longitude to wrap.
 * @return {number} longitude The resulting longitude.
 */
const wrapLongitude = function (longitude) {
  if (longitude <= 180 && longitude >= -180) {
    return longitude;
  }
  const adjusted = longitude + 180;
  if (adjusted > 0) {
    return (adjusted % 360) - 180;
  } else {
    return 180 - (-adjusted % 360);
  }
};

/**
 * Calculates the maximum number of bits of a geohash to get a bounding box that is larger than a
 * given size at the given coordinate.
 *
 * @param {Array.<number>} coordinate The coordinate as a [latitude, longitude] pair.
 * @param {number} size The size of the bounding box.
 * @return {number} The number of bits necessary for the geohash.
 */
const boundingBoxBits = function (coordinate, size) {
  const latDeltaDegrees = size / g_METERS_PER_DEGREE_LATITUDE;
  const latitudeNorth = Math.min(90, coordinate[0] + latDeltaDegrees);
  const latitudeSouth = Math.max(-90, coordinate[0] - latDeltaDegrees);
  const bitsLat = Math.floor(latitudeBitsForResolution(size)) * 2;
  const bitsLongNorth =
    Math.floor(longitudeBitsForResolution(size, latitudeNorth)) * 2 - 1;
  const bitsLongSouth =
    Math.floor(longitudeBitsForResolution(size, latitudeSouth)) * 2 - 1;
  return Math.min(
    bitsLat,
    bitsLongNorth,
    bitsLongSouth,
    g_MAXIMUM_BITS_PRECISION,
  );
};

/**
 * Calculates eight points on the bounding box and the center of a given circle. At least one
 * geohash of these nine coordinates, truncated to a precision of at most radius, are guaranteed
 * to be prefixes of any geohash that lies within the circle.
 *
 * @param {Array.<number>} center The center given as [latitude, longitude].
 * @param {number} radius The radius of the circle.
 * @return {Array.<Array.<number>>} The eight bounding box points.
 */
const boundingBoxCoordinates = function (center, radius) {
  const latDegrees = radius / g_METERS_PER_DEGREE_LATITUDE;
  const latitudeNorth = Math.min(90, center[0] + latDegrees);
  const latitudeSouth = Math.max(-90, center[0] - latDegrees);
  const longDegsNorth = metersToLongitudeDegrees(radius, latitudeNorth);
  const longDegsSouth = metersToLongitudeDegrees(radius, latitudeSouth);
  const longDegs = Math.max(longDegsNorth, longDegsSouth);
  return [
    [center[0], center[1]],
    [center[0], wrapLongitude(center[1] - longDegs)],
    [center[0], wrapLongitude(center[1] + longDegs)],
    [latitudeNorth, center[1]],
    [latitudeNorth, wrapLongitude(center[1] - longDegs)],
    [latitudeNorth, wrapLongitude(center[1] + longDegs)],
    [latitudeSouth, center[1]],
    [latitudeSouth, wrapLongitude(center[1] - longDegs)],
    [latitudeSouth, wrapLongitude(center[1] + longDegs)],
  ];
};

/**
 * Calculates the bounding box query for a geohash with x bits precision.
 *
 * @param {string} geohash The geohash whose bounding box query to generate.
 * @param {number} bits The number of bits of precision.
 * @return {Array.<string>} A [start, end] pair of geohashes.
 */
const geohashQuery = function (geohash, bits) {
  const precision = Math.ceil(bits / g_BITS_PER_CHAR);
  if (geohash.length < precision) {
    console.warn(
      "geohash.length < precision: " +
        geohash.length +
        " < " +
        precision +
        " bits=" +
        bits +
        " g_BITS_PER_CHAR=" +
        g_BITS_PER_CHAR,
    );
    return [geohash, geohash + "~"];
  }
  geohash = geohash.substring(0, precision);
  const base = geohash.substring(0, geohash.length - 1);
  const lastValue = g_BASE32.indexOf(geohash.charAt(geohash.length - 1));
  const significantBits = bits - base.length * g_BITS_PER_CHAR;
  const unusedBits = g_BITS_PER_CHAR - significantBits;
  /* jshint bitwise: false*/
  // delete unused bits
  const startValue = (lastValue >> unusedBits) << unusedBits;
  const endValue = startValue + (1 << unusedBits);
  /* jshint bitwise: true*/
  if (endValue >= g_BASE32.length) {
    console.warn(
      "endValue > 31: endValue=" +
        endValue +
        " < " +
        precision +
        " bits=" +
        bits +
        " g_BITS_PER_CHAR=" +
        g_BITS_PER_CHAR,
    );
    return [base + g_BASE32[startValue], base + "~"];
  } else {
    return [base + g_BASE32[startValue], base + g_BASE32[endValue]];
  }
};

/**
 * Calculates a set of queries to fully contain a given circle. A query is a [start, end] pair
 * where any geohash is guaranteed to be lexiographically larger then start and smaller than end.
 *
 * @param {Array.<number>} center The center given as [latitude, longitude] pair.
 * @param {number} radius The radius of the circle.
 * @return {Array.<Array.<string>>} An array of geohashes containing a [start, end] pair.
 */
const geohashQueries = function (center, radius) {
  const queryBits = Math.max(1, boundingBoxBits(center, radius));
  const geohashPrecision = Math.ceil(queryBits / g_BITS_PER_CHAR);
  const coordinates = boundingBoxCoordinates(center, radius);
  const queries = coordinates.map(function (coordinate) {
    return geohashQuery(
      geohash.encode(coordinate[0], coordinate[1]),
      queryBits,
    );
  });
  // remove duplicates
  return queries.filter(function (query, index) {
    return !queries.some(function (other, otherIndex) {
      return (
        index > otherIndex && query[0] === other[0] && query[1] === other[1]
      );
    });
  });
};

export function getQueriesForDocumentsAround(ref, center, radiusInKm, day) {
  const geohashesToQuery = geohashQueries(
    [center.lat, center.lon],
    radiusInKm * 1000,
  );
  logger.info("geohashes", JSON.stringify(geohashesToQuery));
  return geohashesToQuery.map(function (location) {
    return ref
      .where("geohash", ">=", location[0])
      .where("geohash", "<=", location[1]);
  });
}

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
