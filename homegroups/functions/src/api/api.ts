import { MeetingLocation } from "../entities/MeetingLocation";
import Axios from "axios";
import { GeocodeResponse, Location } from "../entities/GeocodeResponse";

/**
 * NEW MEETING GUIDE API: https://api.meetingguide.org/app/v2/request?latitude=30.267153&longitude=-97.743057
 * OLD URL: https://meetingguide.org/v2/near?latitude=30.267153&longitude=-97.743057
 */
// Google maps api info — provisioned via Firebase Secret Manager (GOOGLE_MAPS_API_KEY)
// ⚠️ MANUAL STEP REQUIRED: rotate the old key (ending ...l9Q) in Google Cloud Console
//   then store the new key: firebase functions:secrets:set GOOGLE_MAPS_API_KEY
// Read the key lazily at call time, NOT at module load. Firebase's deploy-time
// source-analysis phase imports this module locally without injecting Secret
// Manager secrets, so a top-level read/throw here crashes analysis of the whole
// codebase. At runtime in the deployed container the secret IS injected.
const getApiKey = (): string => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY environment variable is not set");
  }
  return key;
};
const timezoneUrl = (lat: number, lng: number, _time: number) =>
  `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${_time}&key=${getApiKey()}`;
const REVERSE_GEOCODE = (lat: number, lng: number) =>
  `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}+&key=${getApiKey()}`;
const GEOCODE = (street: string, city: string, state: string) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${street},+${city},+${state}&key=${getApiKey()}`;
const PARTIAL_GEOCODE = (query: string) =>
  `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${getApiKey()}`;
// const NA_API = (address: AddressLocation) =>
//   `https://www.na.org/meetingsearch/text-results.php?country=USA&state=${address.state}&city=${address.city}&zip=${address.zipCode}
//   &street=${address.streetNumber + ' ' + address.streetName}&within=10&day=0&lang&orderby=distance`;
const AA_API = (lat: number, lng: number) =>
  `https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}`;
// https://api.meetingguide.org/app/v2/request?latitude=41.6747021&longitude=-74.1344599
// import DEPRECATED_AA_LOCATIONS from '../DEPRECATED_AA_LOCATIONS.json';
import { AAMeetingResponse } from "../entities/AAMeetingResponse";
import { getNaMeetings } from "./firestore";
import { Meeting } from "../entities/Meeting";
// Example: 'https://maps.googleapis.com/maps/api/geocode/json?address=...&key=<GOOGLE_MAPS_API_KEY>'

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
): Promise<Meeting[]> => {
  return getNaMeetings(location.lat, location.lng, distance, day);
};

export const getTimezone = async (lat: number, lng: number, _time?: number) => {
  // Google Timezone API expects a Unix epoch in SECONDS. getUTCSeconds() returns
  // only the seconds component (0-59), which mapped every request to 1970-01-01.
  const time = _time || Math.floor(Date.now() / 1000);
  try {
    const url = timezoneUrl(lat, lng, time);
    const result = await Axios.get(url);
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
