import { parseString } from 'xml2js';
import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeDay, normalizeTime } from '../identity';

/**
 * Celebrate Recovery source adapter.
 *
 * Endpoint copied verbatim from homegroups `functions/src/api/api.ts`
 * (getCelebrateRecoveryMeetings, line 101) — returns XML:
 *   https://locator.crgroups.info/index.php?option=com_storelocator&view=map&format=raw&searchall=0&Itemid=110&lat=${lat}&lng=${lng}&radius=25&catid=2&tagid=-1&featstate=0&name_search=
 *
 * XML parse via xml2js `parseString` mirrors regroup/homegroups
 * `functions/src/util/meetings.ts` (parseXml). Each xml2js field is an array of
 * strings; `custom2[0]._` holds the schedule text e.g. "Friday 5:00 PM".
 * Address shape ("street, city,  STATE ZIP COUNTRY") mirrors regroup `mapCRMeeting`.
 */

const CR_API = (lat: number, lng: number): string =>
  `https://locator.crgroups.info/index.php?option=com_storelocator&view=map&format=raw&searchall=0&Itemid=110&lat=${lat}&lng=${lng}&radius=25&catid=2&tagid=-1&featstate=0&name_search=`;

interface CrCustom {
  _: string;
  $: { name: string };
}

interface CrMarker {
  name: string[];
  address: string[];
  lat: string[];
  lng: string[];
  url?: string[];
  custom2?: CrCustom[];
}

interface CrMarkers {
  marker?: CrMarker[];
}

interface CelebrateRecoveryMeetings {
  markers: CrMarkers;
}

export interface FetchDeps {
  /** Injected fetch so tests need zero network. Defaults to global fetch (Node 18+). */
  fetchFn?: typeof fetch;
}

const parseXml = (xml: string): Promise<CelebrateRecoveryMeetings> =>
  new Promise((resolve, reject) => {
    parseString(xml, (err, result: CelebrateRecoveryMeetings) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

/**
 * Fetch Celebrate Recovery meetings near (lat, lng) and map to DirectoryMeeting.
 * Malformed records are skipped, not thrown.
 */
export async function fetchCelebrateRecoveryMeetings(
  lat: number,
  lng: number,
  deps: FetchDeps = {},
): Promise<DirectoryMeeting[]> {
  const fetchFn = deps.fetchFn ?? fetch;

  const res = await fetchFn(CR_API(lat, lng));
  if (!res.ok) {
    throw new Error(`Celebrate Recovery request failed: ${res.status}`);
  }
  const xml = await res.text();
  const parsed = await parseXml(xml);
  const markers = parsed?.markers?.marker ?? [];

  return markers
    .map((marker) => mapCrMarker(marker))
    .filter((m): m is DirectoryMeeting => m !== null);
}

function mapCrMarker(marker: CrMarker): DirectoryMeeting | null {
  try {
    const name = marker.name?.[0];
    if (!name) return null;

    // Schedule text e.g. "Friday 5:00 PM" → day + 12-hour time. Mirrors regroup
    // mapCRMeeting's read of custom2[0]._, but we keep the AM/PM so normalizeTime
    // can produce a correct 24-hour value.
    const schedule = marker.custom2?.[0]?._ ?? '';
    const firstSpace = schedule.indexOf(' ');
    if (firstSpace === -1) return null;
    const dayRaw = schedule.slice(0, firstSpace).trim();
    const timeRaw = schedule.slice(firstSpace + 1).trim();

    const day = normalizeDay(dayRaw);
    const time = normalizeTime(timeRaw);

    const lat = parseFloat(marker.lat?.[0]);
    const lng = parseFloat(marker.lng?.[0]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    // Address shape: "street, city,  STATE ZIP COUNTRY" (regroup mapCRMeeting).
    const fullAddress = marker.address?.[0] ?? '';
    const addressParts = fullAddress.split(',');
    const street = addressParts[0]?.trim();
    const city = addressParts[1]?.trim();
    let state: string | undefined;
    let zip: string | undefined;
    if (addressParts[2]) {
      const stateZipCountry = addressParts[2].split(' ').filter(Boolean);
      state = stateZipCountry[0];
      zip = stateZipCountry[1];
    }

    const link = marker.url?.[0] ?? '';
    const id = directoryMeetingId({
      name,
      day,
      time,
      link,
      formattedAddress: fullAddress.trim(),
    });

    const meeting: DirectoryMeeting = {
      id,
      source: 'external',
      provider: 'CELEBRATE_RECOVERY',
      name,
      day,
      time,
      location: {
        lat,
        lng,
        geohash: directoryGeohash(lat, lng),
      },
    } as DirectoryMeeting;

    if (street) meeting.location.address = street;
    if (city) meeting.location.city = city;
    if (state) meeting.location.state = state;
    if (zip) meeting.location.zip = zip;
    if (marker.url?.[0]) meeting.link = marker.url[0];

    return meeting;
  } catch {
    return null;
  }
}
