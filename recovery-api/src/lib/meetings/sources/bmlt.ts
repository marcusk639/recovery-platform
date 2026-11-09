import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeTime } from '../identity';

/**
 * Maps a row from the BMLT aggregator, the directory NA service bodies maintain,
 * into the canonical directory shape. PURE: no Firestore, env or network.
 */

export interface BmltRegion {
  /** The aggregator's id, used to filter requests. */
  id: number;
  /** The regional server's id, which is what gets stored on rows. */
  sourceId: number;
  name: string;
  expectedMeetings: number;
  lastSuccessfulImport: string | null;
}

export type BmltRow = Record<string, unknown>;

/** Only these are requested, so private fields like contact details never arrive. */
export const BMLT_FIELDS: readonly string[] = [
  'source_id',
  'root_server_id',
  'meeting_name',
  'weekday_tinyint',
  'start_time',
  'venue_type',
  'formats',
  'latitude',
  'longitude',
  'virtual_meeting_link',
  'phone_meeting_number',
  'location_street',
  'location_municipality',
  'location_province',
  'location_postal_code_1',
  'time_zone',
  'published',
];

const VENUE_VIRTUAL = '2';
const VENUE_HYBRID = '3';
const SERVICE_NAME = /\b(sub-?committee|committee|area service)\b/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatCodes(row: BmltRow): string[] {
  return text(row.formats)
    .split(',')
    .map((code) => code.trim());
}

/** Service committees are listed beside recovery meetings but aren't open to someone seeking one. */
export function isServiceMeeting(row: BmltRow): boolean {
  return formatCodes(row).includes('ASM') || SERVICE_NAME.test(text(row.meeting_name));
}

/** Apps open this link, so anything but http(s) is dropped. */
function safeLink(value: unknown): string {
  const raw = text(value);
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

/** BMLT numbers weekdays 1 (Sunday) to 7; the directory uses 0 (Sunday) to 6. */
function directoryDay(value: unknown): number | null {
  const weekday = Number(text(value) || value);
  return Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday - 1 : null;
}

export function mapBmltMeeting(row: BmltRow, region: BmltRegion): DirectoryMeeting | null {
  try {
    const name = text(row.meeting_name);
    const day = directoryDay(row.weekday_tinyint);
    if (!name || day === null || text(row.published) === '0' || isServiceMeeting(row)) return null;

    const lat = parseFloat(text(row.latitude));
    const lng = parseFloat(text(row.longitude));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

    const link = safeLink(row.virtual_meeting_link);
    const phone = text(row.phone_meeting_number);
    const canJoin = Boolean(link || phone);
    const venue = text(row.venue_type);
    if (!canJoin && (venue === VENUE_VIRTUAL || formatCodes(row).includes('TC'))) return null;

    const address = text(row.location_street);
    const city = text(row.location_municipality);
    const state = text(row.location_province);
    const zip = text(row.location_postal_code_1);
    const time = normalizeTime(text(row.start_time));

    const meeting = {
      id: directoryMeetingId({
        name,
        day,
        time,
        link,
        formattedAddress: [address, city, state, zip].filter(Boolean).join(', '),
      }),
      source: 'external',
      provider: 'NA',
      type: 'NA',
      name,
      day,
      time,
      online: venue === VENUE_VIRTUAL || venue === VENUE_HYBRID || (venue === '' && canJoin),
      externalId: `${region.sourceId}:${String(row.source_id)}`,
      sourceRegion: String(region.sourceId),
      location: { lat, lng, geohash: directoryGeohash(lat, lng) },
    } as DirectoryMeeting;

    if (address) meeting.location.address = address;
    if (city) meeting.location.city = city;
    if (state) meeting.location.state = state;
    if (zip) meeting.location.zip = zip;
    if (text(row.formats)) meeting.format = text(row.formats);
    if (text(row.time_zone)) meeting.timezone = text(row.time_zone);
    if (link) meeting.link = link;
    if (phone) meeting.onlineNotes = `Dial-in: ${phone}`;

    return meeting;
  } catch {
    // A bad time or out-of-range coordinate: skip the row rather than the region.
    return null;
  }
}
