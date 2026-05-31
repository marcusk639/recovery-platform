import Geolocation, { GeoPosition, GeoError } from 'react-native-geolocation-service';
import hash from 'ngeohash';

export const getCurrentPosition = (
  onSuccess: (position: GeoPosition) => any,
  onError: (error: GeoError) => any,
) => {
  return Geolocation.getCurrentPosition(onSuccess, onError);
};

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
