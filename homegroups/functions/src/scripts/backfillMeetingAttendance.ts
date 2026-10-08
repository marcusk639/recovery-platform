import * as admin from "firebase-admin";
import {
  attendanceDocPath,
  buildAttendanceRecord,
} from "../utils/meetingAttendance";

/**
 * Backfills users/{uid}/meetingAttendance/{instanceId} from the legacy
 * meetingInstances.attendees arrays.
 *
 * Idempotent: the doc id is the instance id, so an existing record is skipped
 * rather than rewritten. Re-run until recordsWritten is 0 before running the
 * contract phase that drops the arrays.
 *
 * Deliberately never writes to the instance document. `attendeeCount` can already
 * sit above `attendees.length` because the old check-in path incremented it outside
 * a transaction; reconciling the two is a product decision, not a migration step.
 */
export async function backfillMeetingAttendance(
  db: admin.firestore.Firestore,
  opts: { pageSize?: number } = {},
): Promise<{
  instancesScanned: number;
  recordsWritten: number;
  recordsSkipped: number;
}> {
  const pageSize = opts.pageSize ?? 200;
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
  let instancesScanned = 0;
  let recordsWritten = 0;
  let recordsSkipped = 0;

  for (;;) {
    let query = db
      .collection("meetingInstances")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (cursor) {
      query = query.startAfter(cursor);
    }
    const page = await query.get();
    if (page.empty) {
      break;
    }

    for (const snap of page.docs) {
      instancesScanned += 1;
      const data = snap.data();
      const attendees: string[] = Array.isArray(data.attendees)
        ? data.attendees
        : [];

      for (const userId of attendees) {
        const ref = db.doc(attendanceDocPath(userId, snap.id));
        const existing = await ref.get();
        if (existing.exists) {
          recordsSkipped += 1;
          continue;
        }
        await ref.set(
          buildAttendanceRecord({
            instanceId: snap.id,
            meetingId: (data.meetingId as string) ?? null,
            groupId: data.groupId as string,
            scheduledAt:
              (data.scheduledAt as admin.firestore.Timestamp) ?? null,
          }),
        );
        recordsWritten += 1;
      }
    }

    cursor = page.docs[page.docs.length - 1];
    if (page.size < pageSize) {
      break;
    }
  }

  return { instancesScanned, recordsWritten, recordsSkipped };
}
