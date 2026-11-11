import { FieldValue } from 'firebase-admin/firestore';
import type { DirectoryMeeting } from '../../entities/DirectoryMeeting';

/**
 * Copies a frozen snapshot of meetings into `directoryMeetings`, marking each row
 * with the date its data dates from so clients can show how old it is.
 *
 * A row a live source has confirmed is never overwritten, and neither is an
 * app-owned one, so this is safe to re-run at any time.
 */

export interface SnapshotDoc {
  data: Record<string, unknown>;
  /** When the source last confirmed this row. */
  asOf: Date;
}

export interface SnapshotImportDeps {
  /** Pages of at most 500 docs, because each page is written as one batch. */
  pages: AsyncIterable<SnapshotDoc[]>;
  map: (data: Record<string, unknown>) => DirectoryMeeting | null;
  destDb: FirebaseFirestore.Firestore;
  /** False reads and reports only. */
  apply: boolean;
}

export interface SnapshotImportResult {
  applied: boolean;
  read: number;
  skippedUnmappable: number;
  /** Source rows resolving to a directory id already seen in this run. */
  duplicates: number;
  skippedAppOwned: number;
  /** Existing rows confirmed by a live source, which are fresher than a snapshot. */
  skippedLive: number;
  /** Rows written, or that would be written in a dry run. */
  upserted: number;
  oldestDataAsOf?: string;
  newestDataAsOf?: string;
}

function buildPayload(
  meeting: DirectoryMeeting,
  dataAsOf: string,
  isNew: boolean,
): Record<string, unknown> {
  const { id: _id, ...rest } = meeting;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) payload[key] = value;
  }
  payload.source = 'external';
  payload.dataAsOf = dataAsOf;
  payload.lastRefreshedAt = FieldValue.serverTimestamp();
  payload.lastSeenAt = FieldValue.serverTimestamp();
  payload.updatedAt = FieldValue.serverTimestamp();
  if (isNew) payload.createdAt = FieldValue.serverTimestamp();
  return payload;
}

export async function runSnapshotImport(deps: SnapshotImportDeps): Promise<SnapshotImportResult> {
  const { pages, map, destDb, apply } = deps;
  const result: SnapshotImportResult = {
    applied: apply,
    read: 0,
    skippedUnmappable: 0,
    duplicates: 0,
    skippedAppOwned: 0,
    skippedLive: 0,
    upserted: 0,
  };
  const seen = new Set<string>();
  const collection = destDb.collection('directoryMeetings');

  for await (const page of pages) {
    const candidates: Array<{ meeting: DirectoryMeeting; dataAsOf: string }> = [];

    for (const doc of page) {
      result.read++;
      const meeting = map(doc.data);
      if (!meeting) {
        result.skippedUnmappable++;
        continue;
      }
      if (seen.has(meeting.id)) {
        result.duplicates++;
        continue;
      }
      seen.add(meeting.id);

      const dataAsOf = doc.asOf.toISOString().slice(0, 10);
      if (!result.oldestDataAsOf || dataAsOf < result.oldestDataAsOf) {
        result.oldestDataAsOf = dataAsOf;
      }
      if (!result.newestDataAsOf || dataAsOf > result.newestDataAsOf) {
        result.newestDataAsOf = dataAsOf;
      }
      candidates.push({ meeting, dataAsOf });
    }

    if (candidates.length === 0) continue;

    const refs = candidates.map(({ meeting }) => collection.doc(meeting.id));
    const existing = await destDb.getAll(...refs);
    const batch = destDb.batch();
    let writes = 0;

    candidates.forEach(({ meeting, dataAsOf }, i) => {
      const snap = existing[i];
      const current = snap.exists ? (snap.data() as Partial<DirectoryMeeting>) : undefined;
      if (current?.source === 'app') {
        result.skippedAppOwned++;
        return;
      }
      if (current && !current.dataAsOf) {
        result.skippedLive++;
        return;
      }
      result.upserted++;
      if (!apply) return;
      batch.set(refs[i], buildPayload(meeting, dataAsOf, !current), { merge: true });
      writes++;
    });

    if (writes > 0) await batch.commit();
  }

  return result;
}
