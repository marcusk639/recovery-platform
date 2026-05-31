import * as ngeohash from "ngeohash";
import { logger } from "firebase-functions";

// ---------------------------------------------------------------------------
// Geohash utilities — used by getQueriesForDocumentsAround
// These constants and helpers implement the GeoFire bounding-box algorithm
// for building Firestore range queries from a lat/lng center + radius.
// ---------------------------------------------------------------------------

// Characters used in location geohashes (base-32 encoding)
const g_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// The meridional circumference of the earth in meters
const g_EARTH_MERI_CIRCUMFERENCE = 40007860;

// Length of a degree latitude at the equator
const g_METERS_PER_DEGREE_LATITUDE = 110574;

// Number of bits per geohash character
const g_BITS_PER_CHAR = 5;

// Maximum length of a geohash in bits (22 characters * 5 bits each)
const g_MAXIMUM_BITS_PRECISION = 22 * g_BITS_PER_CHAR;

// Equatorial radius of the earth in meters
const g_EARTH_EQ_RADIUS = 6378137.0;

// First eccentricity squared of the WGS-84 ellipsoid.
// Derived from: (EARTH_EQ_RADIUS^2 - EARTH_POL_RADIUS^2) / EARTH_EQ_RADIUS^2
// where EARTH_POL_RADIUS = 6356752.3. Exact value used to avoid rounding errors.
const g_E2 = 0.00669447819799;

// Cutoff for rounding errors on double calculations
const g_EPSILON = 1e-12;

/**
 * Converts degrees to radians.
 */
const degreesToRadians = (degrees: number): number => {
  if (typeof degrees !== "number" || isNaN(degrees)) {
    throw new Error("Error: degrees must be a number");
  }
  return (degrees * Math.PI) / 180;
};

/**
 * Calculates the number of longitude degrees a given distance spans at the given latitude.
 */
const metersToLongitudeDegrees = (distance: number, latitude: number): number => {
  const radians = degreesToRadians(latitude);
  const num = (Math.cos(radians) * g_EARTH_EQ_RADIUS * Math.PI) / 180;
  const denom = 1 / Math.sqrt(1 - g_E2 * Math.sin(radians) * Math.sin(radians));
  const deltaDeg = num * denom;
  if (deltaDeg < g_EPSILON) {
    return distance > 0 ? 360 : 0;
  }
  return Math.min(360, distance / deltaDeg);
};

/**
 * Calculates the bits necessary to reach a given resolution (in meters) for longitude at a latitude.
 */
const longitudeBitsForResolution = (resolution: number, latitude: number): number => {
  const degs = metersToLongitudeDegrees(resolution, latitude);
  return Math.abs(degs) > 0.000001 ? Math.max(1, Math.log2(360 / degs)) : 1;
};

/**
 * Calculates the bits necessary to reach a given resolution (in meters) for latitude.
 */
const latitudeBitsForResolution = (resolution: number): number => {
  return Math.min(
    Math.log2(g_EARTH_MERI_CIRCUMFERENCE / 2 / resolution),
    g_MAXIMUM_BITS_PRECISION
  );
};

/**
 * Wraps the longitude to [-180, 180].
 */
const wrapLongitude = (longitude: number): number => {
  if (longitude <= 180 && longitude >= -180) {
    return longitude;
  }
  const adjusted = longitude + 180;
  if (adjusted > 0) {
    return (adjusted % 360) - 180;
  }
  return 180 - (-adjusted % 360);
};

/**
 * Calculates the maximum number of bits of a geohash to get a bounding box that is larger than a
 * given size at the given coordinate.
 *
 * @param coordinate - [latitude, longitude] pair
 * @param size - size of the bounding box in meters
 * @returns number of bits necessary for the geohash
 */
const boundingBoxBits = (coordinate: number[], size: number): number => {
  const latDeltaDegrees = size / g_METERS_PER_DEGREE_LATITUDE;
  const latitudeNorth = Math.min(90, coordinate[0] + latDeltaDegrees);
  const latitudeSouth = Math.max(-90, coordinate[0] - latDeltaDegrees);
  const bitsLat = Math.floor(latitudeBitsForResolution(size)) * 2;
  const bitsLongNorth = Math.floor(longitudeBitsForResolution(size, latitudeNorth)) * 2 - 1;
  const bitsLongSouth = Math.floor(longitudeBitsForResolution(size, latitudeSouth)) * 2 - 1;
  return Math.min(bitsLat, bitsLongNorth, bitsLongSouth, g_MAXIMUM_BITS_PRECISION);
};

/**
 * Calculates nine points on the bounding box and the center of a given circle. At least one
 * geohash of these nine coordinates, truncated to a precision of at most radius, is guaranteed
 * to be a prefix of any geohash that lies within the circle.
 *
 * @param center - [latitude, longitude]
 * @param radius - radius of the circle in meters
 * @returns nine [lat, lng] coordinate pairs
 */
const boundingBoxCoordinates = (center: number[], radius: number): number[][] => {
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
 * @param geohash - the geohash whose bounding box query to generate
 * @param bits - number of bits of precision
 * @returns a [start, end] pair of geohashes
 */
const geohashQuery = (geohash: string, bits: number): [string, string] => {
  const precision = Math.ceil(bits / g_BITS_PER_CHAR);
  if (geohash.length < precision) {
    logger.warn(
      `geohash.length < precision: ${geohash.length} < ${precision} bits=${bits} g_BITS_PER_CHAR=${g_BITS_PER_CHAR}`
    );
    return [geohash, geohash + "~"];
  }
  const trimmed = geohash.substring(0, precision);
  const base = trimmed.substring(0, trimmed.length - 1);
  const lastValue = g_BASE32.indexOf(trimmed.charAt(trimmed.length - 1));
  const significantBits = bits - base.length * g_BITS_PER_CHAR;
  const unusedBits = g_BITS_PER_CHAR - significantBits;
  // Mask off the unused bits (range start), then advance by one unit for the range end.
  // eslint-disable-next-line no-bitwise
  const startValue = (lastValue >> unusedBits) << unusedBits;
  // eslint-disable-next-line no-bitwise
  const endValue = startValue + (1 << unusedBits);
  if (endValue >= g_BASE32.length) {
    logger.warn(
      `endValue > 31: endValue=${endValue} precision=${precision} bits=${bits} g_BITS_PER_CHAR=${g_BITS_PER_CHAR}`
    );
    return [base + g_BASE32[startValue], base + "~"];
  }
  return [base + g_BASE32[startValue], base + g_BASE32[endValue]];
};

/**
 * Calculates a set of geohash range queries to fully contain a given circle.
 * Each entry is a [start, end] pair where any geohash within the circle is
 * guaranteed to be lexicographically between start and end.
 *
 * @param center - [latitude, longitude] pair
 * @param radius - radius of the circle in meters
 * @returns deduplicated array of [start, end] geohash pairs
 */
const geohashQueries = (center: number[], radius: number): [string, string][] => {
  const queryBits = Math.max(1, boundingBoxBits(center, radius));
  const coordinates = boundingBoxCoordinates(center, radius);
  const queries = coordinates.map((coordinate) =>
    geohashQuery(ngeohash.encode(coordinate[0], coordinate[1]), queryBits)
  );
  // Remove duplicates by discarding entries that match an earlier entry.
  return queries.filter((query, index) =>
    !queries.some(
      (other, otherIndex) =>
        index > otherIndex && query[0] === other[0] && query[1] === other[1]
    )
  );
};

export function getQueriesForDocumentsAround(
  ref: FirebaseFirestore.CollectionReference,
  center: { lat: number; lon: number },
  radiusInKm: number,
  day?: string
): FirebaseFirestore.Query[] {
  const geohashesToQuery = geohashQueries([center.lat, center.lon], radiusInKm * 1000);
  logger.info("geohashes", JSON.stringify(geohashesToQuery));
  return geohashesToQuery.map((location) =>
    ref
      .where("geohash", ">=", location[0])
      .where("geohash", "<=", location[1])
  );
}
