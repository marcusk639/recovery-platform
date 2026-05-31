/**
 * Represents the location sent from the client
 */
export interface RatsLocation {
  timestamp: number;
  coords: {
    accuracy: number;
    altitude: number;
    altitudeAccuracy: number;
    heading: number;
    latitude: number;
    longitude: number;
    speed: number;
  };
}
