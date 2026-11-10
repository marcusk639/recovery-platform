import { toDayName } from './identity';

/**
 * One-off rewrite of `directoryMeetings.day` from the old integer 0–6 (0 = Sunday)
 * to a lowercase day name. Only `day` changes: timestamps stay as they were, so the
 * syncs see these rows as unchanged afterwards rather than rewriting them.
 *
 * Run it only after both products are deployed with code that reads day names.
 * Older product code reads only an integer and would show these meetings with no day.
 */

/** Firestore's limit for one batch. */
const BATCH_SIZE = 500;

export interface DayNameMigrationDeps {
  db: FirebaseFirestore.Firestore;
  /** False reports what would change and writes nothing. */
  apply: boolean;
}

export interface DayNameMigrationResult {
  scanned: number;
  converted: number;
  alreadyNamed: number;
  /** Rows with no day, or one that isn't a day. Left untouched. */
  unrecognized: number;
}

export async function migrateDayNames(deps: DayNameMigrationDeps): Promise<DayNameMigrationResult> {
  const { db, apply } = deps;
  const collection = db.collection('directoryMeetings');
  const result: DayNameMigrationResult = {
    scanned: 0,
    converted: 0,
    alreadyNamed: 0,
    unrecognized: 0,
  };

  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = collection.limit(BATCH_SIZE);
    const { docs } = await (last ? page.startAfter(last) : page).get();

    const batch = db.batch();
    let writes = 0;
    for (const doc of docs) {
      result.scanned++;
      const current: unknown = doc.data().day;
      let name: string;
      try {
        if (typeof current !== 'number' && typeof current !== 'string') throw new Error();
        name = toDayName(current);
      } catch {
        result.unrecognized++;
        continue;
      }
      if (current === name) {
        result.alreadyNamed++;
        continue;
      }
      result.converted++;
      batch.set(collection.doc(doc.id), { day: name }, { merge: true });
      writes++;
    }
    if (apply && writes > 0) await batch.commit();

    if (docs.length < BATCH_SIZE) return result;
    last = docs[docs.length - 1];
  }
}
