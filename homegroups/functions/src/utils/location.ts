import {LatitudeLongitude} from "../entities/LocationsApiResponse";
import {GeocodeResponse} from "../entities/GeocodeResponse";
import geohash from "ngeohash";
// @ts-ignore
const haversine = require("haversine-distance");
// @ts-ignore
const robustPointInPolygon = require("robust-point-in-polygon");

/**
 * For some stupid reason, pointInPolygon returns 0 or -1 if the point is inside the polygon
 * @param areaPolygon
 * @param userLocation
 */
export const locationIsInArea = (areaPolygon: number[][], userLocation: number[]) => {
  return robustPointInPolygon(areaPolygon, userLocation) <= 0;
};

/**
 * Transforms latitude and longitude coordinates to an array of X, Y coordinates
 * Longitude: X
 * Latitude: Y
 * @param coords
 */

export const getXYvalues = (coords: LatitudeLongitude) => {
  return [coords.lng, coords.lat];
};

/**
 * Gets the polygon for an area given an array of lats and longs
 * @param points
 */
export const getAreaPolygon = (points: LatitudeLongitude[]) => {
  return points.map((point) => getXYvalues(point));
};

/**
 * Gets the haversine distance between coordinates
 * @param start
 * @param end
 */
export const getDistance = (start: LatitudeLongitude, end: LatitudeLongitude): number => {
  return haversine(start, end);
};

export interface AddressLocation {
  streetNumber: string;
  streetName: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Returns the city, state, and zip given the geocode response from Google Maps API
 * @param geocode
 */
export const getAddressFromGeocode = (geocode: GeocodeResponse): AddressLocation => {
  const {results} = geocode;
  const address: AddressLocation = {streetNumber: "", streetName: "", city: "", state: "", zipCode: ""};
  results[1].address_components.some((addressComponent) => {
    if (address.city && address.state && address.zipCode) {
      return true;
    }
    if (addressComponent.types.includes("locality")) {
      address.city = addressComponent.long_name;
    }
    if (addressComponent.types.includes("administrative_area_level_1")) {
      address.state = addressComponent.short_name;
    }
    if (addressComponent.types.includes("postal_code")) {
      address.zipCode = addressComponent.short_name;
    }
    if (addressComponent.types.includes("street_number")) {
      address.streetNumber = addressComponent.long_name;
    }
    if (addressComponent.types.includes("route")) {
      address.streetName = addressComponent.long_name;
    }
    return false;
  });
  return address;
};

export const getMilesAsMeters = (miles: number) => miles / 0.00062137;

// Calculate the upper and lower boundary geohashes for
// a given latitude, longitude, and distance in miles
export const getGeohashRange = (
    latitude: number,
    longitude: number,
    distance: number, // miles
) => {
  const lat = 0.0144927536231884; // degrees latitude per mile
  const lon = 0.0181818181818182; // degrees longitude per mile

  const lowerLat = latitude - lat * distance;
  const lowerLon = longitude - lon * distance;

  const upperLat = latitude + lat * distance;
  const upperLon = longitude + lon * distance;

  const lower = geohash.encode(lowerLat, lowerLon);
  const upper = geohash.encode(upperLat, upperLon);

  return {
    lower,
    upper,
  };
};
