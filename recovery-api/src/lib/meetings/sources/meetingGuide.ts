import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeDay, normalizeTime } from '../identity';

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

/** Minimal shape of a Meeting Guide meeting record we consume. */
interface MeetingGuideMeeting {
  id: number;
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

  const res = await fetchFn(AA_API(lat, lng));
  if (!res.ok) {
    throw new Error(`Meeting Guide request failed: ${res.status}`);
  }
  const body = (await res.json()) as MeetingGuideResponse;
  const meetings = body?.meetings ?? [];

  return meetings
    .map((m) => mapMeetingGuideMeeting(m))
    .filter((m): m is DirectoryMeeting => m !== null);
}

function mapMeetingGuideMeeting(m: MeetingGuideMeeting): DirectoryMeeting | null {
  try {
    const day = normalizeDay(m.day);
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
      name: m.name,
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
      name: m.name,
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

    if (m.types) meeting.type = m.types;
    if (m.address) meeting.location.address = m.address;
    if (m.city) meeting.location.city = m.city;
    if (m.state) meeting.location.state = m.state;
    if (m.postal_code) meeting.location.zip = m.postal_code;
    if (m.conference_url) {
      meeting.online = true;
      meeting.link = m.conference_url;
    }
    if (m.conference_url_notes) meeting.onlineNotes = m.conference_url_notes;

    return meeting;
  } catch {
    // Malformed source record — skip it so one bad row can't drop the batch.
    return null;
  }
}
