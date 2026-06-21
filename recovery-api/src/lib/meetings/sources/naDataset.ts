import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { directoryGeohash, directoryMeetingId, normalizeDay, normalizeTime } from '../identity';

/**
 * NA (Narcotics Anonymous) dataset source mapper.
 *
 * Unlike AA / Celebrate Recovery, NA meetings are NOT fetched from a live API.
 * They live as a PRE-SEEDED `na-meetings` Firestore collection inside the
 * products (homegroups `recovery-connect-cad4b`, regroup `phoenix-cleanhouse`).
 * The seed itself was produced upstream from an NA World Services SQL export and
 * persisted into `na-meetings` as the homegroups "serialized meeting" shape —
 * NOT the raw NA-API record (`com_name`/`mtg_time`/`mtg_day`).
 *
 * Source shape reconciled from the homegroups read path
 * (`homegroups/functions/src/api/firestore.ts` `getNaMeetings`, which returns
 * raw `d.data()` of `na-meetings` docs) and the persisted-meeting shape those
 * docs conform to (`FuncMeetingDocument` / `SerializedMeeting` in
 * `homegroups/functions/src/utils/meetings.ts` + `callable/findMeetings.ts`):
 *   name, day (weekday STRING e.g. "tuesday"), time ("HH:mm"), lat, lng,
 *   address/city/state/zip, formattedAddress, online (bool), link, onlineNotes,
 *   format, type, geohash, id (NA World Services id).
 * regroup's `getNaMeetings` (`regroup/functions/src/api/firestore.ts`) reads the
 * SAME `na-meetings` collection the SAME way (`d.data()`), so the source shape
 * does NOT differ between products — this one mapper covers both.
 *
 * This module is PURE: it never touches Firestore, process.env, or the network.
 * The migration script (`scripts/migrateNaMeetings.ts`) reads the source docs
 * and owns all Firestore I/O + Timestamp stamping; here we only translate one
 * source doc into the canonical DirectoryMeeting (provider 'NA', source
 * 'external'), routing day/time/id/geohash through the FROZEN identity helpers
 * (`lib/meetings/identity.ts`). There is exactly one hash/geohash recipe
 * repo-wide; do not add another.
 */

/**
 * Minimal shape of a persisted `na-meetings` Firestore document we consume.
 * Every field is optional/loosely-typed because the collection is externally
 * seeded — the mapper validates and skips malformed rows rather than trusting
 * the source. `day` may arrive as a weekday string ("Tuesday") or an integer;
 * `normalizeDay` handles both. `time` may be "HH:mm" / "h:mm AM/PM"; same for
 * `normalizeTime`.
 */
export interface NaDatasetDoc {
  /** NA World Services id for the meeting; becomes DirectoryMeeting.externalId. */
  id?: string | number;
  name?: string;
  day?: string | number;
  time?: string;
  lat?: number;
  lng?: number;
  geohash?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  formattedAddress?: string;
  format?: string;
  type?: string;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
}

/**
 * Map one pre-seeded `na-meetings` Firestore doc to the canonical
 * DirectoryMeeting shape (provider 'NA', source 'external').
 *
 * Returns `null` for malformed rows (missing name/day/time, non-finite lat/lng)
 * so a single bad source doc cannot abort the migration batch — mirrors the
 * skip-on-throw behavior in `sources/meetingGuide.ts` `mapMeetingGuideMeeting`.
 *
 * Timestamps (`lastRefreshedAt`/`lastSeenAt`/`createdAt`/`updatedAt`) are NOT
 * set here — the migration script's upsert path owns them (mirrors the other
 * source adapters, which return the public source-derived slice only).
 */
export function mapNaMeeting(doc: NaDatasetDoc): DirectoryMeeting | null {
  try {
    if (typeof doc.name !== 'string' || doc.name.trim() === '') {
      return null;
    }
    if (doc.day === undefined || doc.day === null) {
      return null;
    }
    if (typeof doc.time !== 'string' || doc.time.trim() === '') {
      return null;
    }

    // Frozen helpers — these throw on bad data, caught below to skip the row.
    const day = normalizeDay(doc.day);
    const time = normalizeTime(doc.time);

    const lat = typeof doc.lat === 'number' ? doc.lat : NaN;
    const lng = typeof doc.lng === 'number' ? doc.lng : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    const link = (doc.link ?? '').trim();
    const formattedAddress = (doc.formattedAddress ?? doc.address ?? '').trim();

    const id = directoryMeetingId({
      name: doc.name,
      day,
      time,
      link,
      formattedAddress,
    });

    const meeting: DirectoryMeeting = {
      id,
      source: 'external',
      provider: 'NA',
      name: doc.name,
      day,
      time,
      location: {
        lat,
        lng,
        // Re-derive the geohash through the frozen helper rather than trusting
        // the source `geohash` (the seed used ngeohash at varying precision).
        geohash: directoryGeohash(lat, lng),
      },
    } as DirectoryMeeting;

    if (doc.id !== undefined && doc.id !== null) {
      meeting.externalId = String(doc.id);
    }
    if (doc.type) meeting.type = doc.type;
    if (doc.format) meeting.format = doc.format;
    if (doc.address) meeting.location.address = doc.address;
    if (doc.city) meeting.location.city = doc.city;
    if (doc.state) meeting.location.state = doc.state;
    if (doc.zip) meeting.location.zip = doc.zip;
    if (doc.online !== undefined) meeting.online = doc.online;
    if (link) meeting.link = link;
    if (doc.onlineNotes) meeting.onlineNotes = doc.onlineNotes;

    return meeting;
  } catch {
    // Malformed source record (bad day/time etc.) — skip it so one bad row
    // can't drop the whole migration batch.
    return null;
  }
}
