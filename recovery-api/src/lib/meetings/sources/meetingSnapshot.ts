import type { DirectoryMeeting, DirectoryProvider } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeDay, normalizeTime } from '../identity';

/**
 * Maps a meeting doc from a product's Firestore into the canonical directory
 * shape, for one-off snapshot imports. Homegroups `meetings` and the products'
 * `na-meetings` share the "serialized meeting" shape.
 *
 * Only the listed public fields are copied. Everything else in the source
 * (groupId, verified, addedBy, meeting passwords) stays behind.
 *
 * PURE: no Firestore, env or network. Timestamps and dataAsOf belong to the
 * importer. Day, time, id and geohash go through the frozen identity helpers.
 */

export type SnapshotMeetingDoc = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** na-meetings stores "Yes" or "" here, so a plain copy reads "" as a value. */
function readOnline(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  return /^(yes|true)$/i.test(String(value).trim());
}

/** na-meetings stores about 30% of its times as "19.3:30", meaning 19:30. */
function readTime(value: string): string {
  return value.trim().replace(/^(\d{1,2})\.\d+:(\d{2})$/, '$1:$2');
}

/**
 * Returns null for a malformed row, so one bad doc cannot abort an import. That
 * includes (0,0), the placeholder in na-meetings for rows with no location.
 */
export function mapSnapshotMeeting(
  doc: SnapshotMeetingDoc,
  provider: DirectoryProvider,
  externalId: unknown = doc.id,
): DirectoryMeeting | null {
  try {
    const name = text(doc.name);
    const rawTime = text(doc.time);
    const rawDay = doc.day;
    if (name.trim() === '' || rawTime.trim() === '') return null;
    if (typeof rawDay !== 'string' && typeof rawDay !== 'number') return null;

    const day = normalizeDay(rawDay);
    const time = normalizeTime(readTime(rawTime));

    const lat = typeof doc.lat === 'number' ? doc.lat : NaN;
    const lng = typeof doc.lng === 'number' ? doc.lng : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;

    const link = text(doc.link).trim();
    // Homegroups keeps the street in `street` and the formatted address in `address`.
    // Live rows store only the street, so the city and state aren't shown twice.
    const address = text(doc.street) || text(doc.address);
    // Same fallback as the live mapper, so a row a live sweep re-sees usually keeps its id.
    // The live mapper keeps more of a name, so one with a " - " suffix gets a new id, and the
    // sync replaces this row through its upstream id.
    const formattedAddress = text(doc.formattedAddress ?? doc.address).trim();

    const meeting = {
      id: directoryMeetingId({ name, day, time, link, formattedAddress }),
      source: 'external',
      provider,
      name,
      day,
      time,
      location: { lat, lng, geohash: directoryGeohash(lat, lng) },
    } as DirectoryMeeting;

    if (externalId !== undefined && externalId !== null) meeting.externalId = String(externalId);
    // `types` holds the meeting's types, matching live rows. `type` is only "AA" or "NA".
    const type = text(doc.types) || text(doc.type);
    if (type) meeting.type = type;
    if (text(doc.format)) meeting.format = text(doc.format);
    if (text(doc.timezone)) meeting.timezone = text(doc.timezone);
    if (address) meeting.location.address = address;
    if (text(doc.city)) meeting.location.city = text(doc.city);
    if (text(doc.state)) meeting.location.state = text(doc.state);
    if (text(doc.zip)) meeting.location.zip = text(doc.zip);
    if (link) meeting.link = link;
    if (text(doc.onlineNotes)) meeting.onlineNotes = text(doc.onlineNotes);

    const online = readOnline(doc.online);
    if (online !== undefined) meeting.online = online;

    return meeting;
  } catch {
    return null;
  }
}

/**
 * Homegroups `meetings` holds both scraped listings and meetings members added.
 * Only scraped ones (addedBy "system") are public directory data.
 */
export function mapHomegroupsAaMeeting(doc: SnapshotMeetingDoc): DirectoryMeeting | null {
  if (doc.addedBy !== 'system' || doc.type !== 'AA') return null;
  return mapSnapshotMeeting(doc, 'AA', doc.apiId);
}
