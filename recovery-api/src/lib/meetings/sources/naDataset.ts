import type { DirectoryMeeting } from '../../../entities/DirectoryMeeting';
import { mapSnapshotMeeting, type SnapshotMeetingDoc } from './meetingSnapshot';

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
 * A persisted `na-meetings` Firestore document. Loosely typed because the
 * collection is externally seeded: the mapper validates and skips malformed rows
 * rather than trusting the source.
 */
export type NaDatasetDoc = SnapshotMeetingDoc;

/**
 * Map one pre-seeded `na-meetings` Firestore doc to the canonical
 * DirectoryMeeting shape (provider 'NA', source 'external'). Returns `null` for
 * malformed rows so a single bad source doc cannot abort the import.
 */
export function mapNaMeeting(doc: NaDatasetDoc): DirectoryMeeting | null {
  return mapSnapshotMeeting(doc, 'NA');
}
