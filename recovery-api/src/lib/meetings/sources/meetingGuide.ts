import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeTime, toDayName } from '../identity';

/**
 * AA Meeting Guide source adapter.
 *
 * Endpoint (keyless) copied verbatim from homegroups
 * `functions/src/api/api.ts` (AA_API, line 35):
 *   https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}
 *
 * Response parsing (lat/lng/day/time/name/address) mirrors the homegroups
 * `getAAMeetings` shape (AAMeetingResponse) and the regroup `mapAAMeeting`
 * field reads: `day` is already an integer 0–6, `time` is "HH:mm:ss",
 * `latitude`/`longitude` are strings, address fields are flat.
 */

const AA_API = (lat: number, lng: number): string =>
  `https://api.meetingguide.org/app/v2/request?latitude=${lat}&longitude=${lng}`;

/** A hung request must fail its cell, or it would stall the sweep until the function dies. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Minimal shape of a Meeting Guide meeting record we consume. */
export interface MeetingGuideMeeting {
  id: number;
  country?: string;
  /** Kilometers from the search point. */
  distance?: number | string;
  timezone?: string;
  name: string;
  day: number;
  time: string;
  url?: string;
  types?: string;
  latitude: string;
  longitude: string;
  formatted_address?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  conference_url?: string;
  conference_url_notes?: string;
  conference_phone?: string;
  conference_phone_notes?: string;
}

interface MeetingGuideResponse {
  meetings: MeetingGuideMeeting[];
}

export interface FetchDeps {
  /** Injected fetch so tests need zero network. Defaults to global fetch (Node 18+). */
  fetchFn?: typeof fetch;
}

/**
 * Fetch AA meetings near (lat, lng) from the Meeting Guide API and map them to
 * the canonical DirectoryMeeting shape. Records that fail to map (bad day/time
 * etc.) are skipped rather than aborting the whole batch.
 */
export async function fetchAAMeetings(
  lat: number,
  lng: number,
  deps: FetchDeps = {},
): Promise<DirectoryMeeting[]> {
  const fetchFn = deps.fetchFn ?? fetch;

  const res = await fetchFn(AA_API(lat, lng), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Meeting Guide request failed: ${res.status}`);
  }
  const body = (await res.json()) as MeetingGuideResponse | null;
  // A 200 with the wrong body is a failure, not an empty cell: the prune guard
  // relies on the difference.
  if (!Array.isArray(body?.meetings)) {
    throw new Error('Meeting Guide returned an unexpected response');
  }

  return body.meetings
    .map((m) => mapMeetingGuideMeeting(m))
    .filter((m): m is DirectoryMeeting => m !== null);
}

/**
 * Sites often append " - Online" or similar to a name. Only that kind of suffix goes.
 * Homegroups' scripts cut at any " - ", but here the name is part of the document id, so
 * "Group - Men's" and "Group - Women's" at one time and place would become one meeting.
 */
const MODE_SUFFIX = / - (?:online|virtual|zoom|hybrid)(?: meeting)?\s*$/i;

function cleanMeetingName(name: string): string {
  return name.replace(MODE_SUFFIX, '').trim();
}

/** The directory has no phone field, and both apps already show these notes to people. */
function onlineNotesOf(m: MeetingGuideMeeting): string {
  if (!m.conference_phone) return m.conference_url_notes || m.conference_phone_notes || '';
  const phoneNotes = m.conference_phone_notes ? ` (${m.conference_phone_notes})` : '';
  const dialIn = `Dial-in: ${m.conference_phone}${phoneNotes}`;
  return m.conference_url_notes ? `${m.conference_url_notes}\n${dialIn}` : dialIn;
}

export function mapMeetingGuideMeeting(m: MeetingGuideMeeting): DirectoryMeeting | null {
  try {
    const name = cleanMeetingName(m.name);
    const day = toDayName(m.day);
    // Meeting Guide returns "HH:mm:ss" or "HH:mm"; normalizeTime accepts both.
    const time = normalizeTime(m.time);
    const lat = parseFloat(m.latitude);
    const lng = parseFloat(m.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    const link = m.conference_url ?? '';
    const formattedAddress = m.formatted_address ?? m.address ?? '';
    const id = directoryMeetingId({
      name,
      day,
      time,
      link,
      formattedAddress,
    });

    const meeting: DirectoryMeeting = {
      id,
      source: 'external',
      externalId: String(m.id),
      provider: 'AA',
      name,
      day,
      time,
      location: {
        lat,
        lng,
        geohash: directoryGeohash(lat, lng),
      },
      // Timestamps are owned by the ingestor that writes to Firestore; the
      // fetcher returns the public, source-derived slice only.
    } as DirectoryMeeting;

    if (m.types) {
      meeting.type = m.types;
      meeting.format = m.types;
    }
    if (m.address) meeting.location.address = m.address;
    if (m.city) meeting.location.city = m.city;
    if (m.state) meeting.location.state = m.state;
    if (m.postal_code) meeting.location.zip = m.postal_code;
    if (m.conference_url) {
      meeting.online = true;
      meeting.link = m.conference_url;
    }
    if (m.conference_phone) meeting.online = true;
    const onlineNotes = onlineNotesOf(m);
    if (onlineNotes) meeting.onlineNotes = onlineNotes;
    if (m.timezone) meeting.timezone = m.timezone;

    return meeting;
  } catch {
    // Malformed source record — skip it so one bad row can't drop the batch.
    return null;
  }
}
