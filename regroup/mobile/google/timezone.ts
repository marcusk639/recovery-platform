import { GOOGLE_API_KEY } from './apikeys';
import { logException } from '../src/util/logging';

const timezoneUrl = (lat: number, lng: number, _time: number) =>
  `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${_time}&key=${GOOGLE_API_KEY()}`;

export const getTimezone = async (lat: number, lng: number, _time?: number) => {
  const time = _time || new Date().getUTCSeconds();
  try {
    const url = timezoneUrl(lat, lng, time);
    const response = await fetch(url);
    const data = await response.json();
    return data.timeZoneId;
  } catch (error) {
    logException(error);
    return 'unknown';
  }
};
