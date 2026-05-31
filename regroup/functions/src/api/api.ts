import { MeetingLocation } from "../entities/MeetingLocation";
import Axios from "axios";
import { GeocodeResponse, Location } from "../entities/GeocodeResponse";

// Google Maps API key is injected at runtime from Secret Manager.
// Every callable that ends up calling one of these URL builders must declare
// `secrets: [GOOGLE_MAPS_API_KEY]` in its options (see callable/meetings.ts).
// We read process.env inside each builder so the value is resolved at call time,
// not at module load (when the secret is not yet available in v2 functions).
const mapsKey = (): string => {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k)
    throw new Error(
      "GOOGLE_MAPS_API_KEY not available — caller must bind the secret",
    );
  return k;
};
const timezoneUrl = (lat: number, lng: number, _time: number) =>
  `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${_time}&key=${mapsKey()}`;
const REVERSE_GEOCODE = (lat: number, lng: number) =>
  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${mapsKey()}`;
const GEOCODE = (street: string, city: string, state: string) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${street},+${city},+${state}&key=${mapsKey()}`;
const PARTIAL_GEOCODE = (query: string) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${mapsKey()}`;
const AA_API = (lat: number, lng: number) =>
  `https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}`;
import { AAMeetingResponse } from "../entities/AAMeetingResponse";
import { getNaMeetings } from "./firestore";
import { RatsMeeting } from "../entities/Meeting";

export const getAreaMeetings = async (areaApi: string) => {
  const meetings = await Axios.get<MeetingLocation[]>(areaApi);
  return meetings.data;
};

export const getAAMeetings = async (lat: number, lng: number) => {
  const meetings = await Axios.get<AAMeetingResponse>(AA_API(lat, lng));
  return meetings.data;
};

export const reverseGeocode = async (
  lat: number,
  lng: number,
): Promise<GeocodeResponse> => {
  const location = await Axios.get<GeocodeResponse>(REVERSE_GEOCODE(lat, lng));
  return location.data;
};

export const geocode = async (street: string, city: string, state: string) => {
  const location = await Axios.get<GeocodeResponse>(
    GEOCODE(street, city, state),
  );
  return location.data;
};

export const partialGeocode = async (query: string) => {
  const location = await Axios.get<GeocodeResponse>(PARTIAL_GEOCODE(query));
  return location.data;
};

/**
 * Returns NA meetings within the distance
 * @param address
 */
export const getNAMeetings = async (
  location: Location,
  distance: number,
  day?: string,
): Promise<RatsMeeting[]> => {
  const results = await getNaMeetings(
    location.lat,
    location.lng,
    distance,
    day,
  );
  return results as RatsMeeting[];
};

export const getTimezone = async (
  lat: number,
  lng: number,
  _time?: number,
): Promise<string> => {
  const time = _time || new Date().getUTCSeconds();
  try {
    const url = timezoneUrl(lat, lng, time);
    const result = await Axios.get<{ timeZoneId: string }>(url);
    return result.data.timeZoneId;
  } catch (error) {
    return "unknown";
  }
};

export const getCelebrateRecoveryMeetings = async (
  lat: number,
  lng: number,
) => {
  // sourced from https://locator.crgroups.info/
  const url = `https://locator.crgroups.info/index.php?option=com_storelocator&view=map&format=raw&searchall=0&Itemid=110&lat=${lat}&lng=${lng}&radius=25&catid=2&tagid=-1&featstate=0&name_search=`;
  const result = await Axios.get(url);
  return result.data as string;
};
