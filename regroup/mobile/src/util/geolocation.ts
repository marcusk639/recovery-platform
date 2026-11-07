import Geolocation, {
  type GeolocationError,
  type GeolocationOptions,
  type GeolocationResponse,
} from '@react-native-community/geolocation';
import hash from 'ngeohash';

// The app's only geolocation entry point (React Native 0.88 upgrade, Task 6):
// @react-native-community/geolocation replaces react-native-geolocation-service, and every caller
// imports from here so the configuration below applies everywhere.
//
// Configured once, at load: the fused location provider (Google Play services), as
// react-native-geolocation-service used, and no library permission prompts, because the app asks
// itself (util/permissions checkAndRequestLocationPermissions) before reading the position.
Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'playServices' });

/**
 * react-native-geolocation-service's defaults, made explicit (the new library's differ: on iOS
 * it reads no cached position by default). One exception: the timeout is the new library's 10
 * minutes instead of the old "never" — an infinite value becomes an infinite native timer on iOS,
 * and for an interactive screen ten minutes is no different.
 */
export const LOCATION_OPTIONS: GeolocationOptions = {
  enableHighAccuracy: false,
  maximumAge: Infinity,
  timeout: 10 * 60 * 1000,
};

export type GeoPosition = GeolocationResponse;
export type GeoError = GeolocationError;

export const getCurrentPosition = (
  onSuccess: (position: GeoPosition) => any,
  onError: (error: GeoError) => any,
) => {
  return Geolocation.getCurrentPosition(onSuccess, onError, LOCATION_OPTIONS);
};

/** The configured module, for libraries that read `navigator.geolocation` (Google Places). */
export const configuredGeolocation = Geolocation;

export const geohash = (lat: number, lng: number) => {
  return hash.encode(lat, lng);
};

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

  const lower = geohash(lowerLat, lowerLon);
  const upper = geohash(upperLat, upperLon);

  return {
    lower,
    upper,
  };
};
