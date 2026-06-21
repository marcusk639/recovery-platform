/**
 * One-off NA dataset migration script (NOT a deployed function — deliberately
 * NOT exported from index.ts and never wired into any callable/trigger).
 *
 * NA (Narcotics Anonymous) meetings are NOT fetched from a live API. They live
 * as a PRE-SEEDED `na-meetings` Firestore collection inside the products. This
 * script migrates that dataset into recovery-api's canonical `directoryMeetings`
 * collection as provider 'NA', source 'external'.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * OPS / CREDENTIALS — READ BEFORE RUNNING
 * ──────────────────────────────────────────────────────────────────────────
 * This is a ONE-OFF MIGRATION, not a live cross-project runtime read. Running
 * it is an operations step that requires PER-PROJECT ADMIN CREDENTIALS:
 *   - The SOURCE Firestore (the product's `na-meetings`, e.g. homegroups
 *     `recovery-connect-cad4b` or regroup `phoenix-cleanhouse`) must be reached
 *     with that project's admin service-account credentials.
 *   - The DESTINATION Firestore (`recovery-platform` `directoryMeetings`) is the
 *     default app credentials.
 * A deployed recovery-api function MUST NOT read another product's Firestore at
 * runtime (Firebase Admin credentials are project-scoped; cross-product data
 * flows go through recovery-api service-key APIs, never direct cross-queries).
 * Hence: admin-run script only. The source `db` is INJECTED (see runMigration's
 * `deps`) so the operator wires up the correct source/destination credentials at
 * the entry point and tests can inject mocks with zero network/Firestore.
 *
 * This script does NOT delete the source `na-meetings` data — it is a copy-up
 * migration, leaving a rollback window.
 *
 * Structure (require.main guard, batched writes, progress logging, createdAt-
 * once, app-owned skip-guard) ported from `scripts/seedDirectory.ts` and the
 * upsert path in `lib/meetings/ingest.ts` `ingestGridCell`.
 *
 * Run (from recovery-api/), with admin creds for BOTH projects configured by the
 * operator — illustrative only:
 *   GOOGLE_APPLICATION_CREDENTIALS=... npx ts-node src/scripts/migrateNaMeetings.ts
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import type { DirectoryMeeting } from '../entities/DirectoryMeeting';
import { mapNaMeeting, type NaDatasetDoc } from '../lib/meetings/sources/naDataset';

/** Firestore batch limit. Mirrors lib/meetings/ingest.ts BATCH_SIZE. */
export const BATCH_SIZE = 500;

/** Source collection holding the pre-seeded NA dataset in the product project. */
export const SOURCE_COLLECTION = 'na-meetings';
/** Destination collection — recovery-api's canonical shared directory. */
export const DEST_COLLECTION = 'directoryMeetings';

export interface MigrateDeps {
  /**
   * SOURCE Firestore (the product's project, holding `na-meetings`). Injected so
   * the operator wires the per-project admin credentials at the entry point and
   * tests inject a mock. This is the only place a non-recovery-platform
   * Firestore is read — and only in this one-off admin script.
   */
  sourceDb: FirebaseFirestore.Firestore;
  /**
   * DESTINATION Firestore (`recovery-platform`, holding `directoryMeetings`).
   * Defaults to the same instance as `sourceDb` is NOT assumed — the caller
   * passes both explicitly.
   */
  destDb: FirebaseFirestore.Firestore;
}

export interface MigrateResult {
  /** Total source `na-meetings` docs read. */
  read: number;
  /** Source docs that failed to map (bad day/time/lat/lng) and were skipped. */
  skippedUnmappable: number;
  /** Docs skipped because the existing destination doc is app-owned. */
  skippedAppOwned: number;
  /** Docs written (created or updated) into `directoryMeetings`. */
  upserted: number;
}

/**
 * Build the persisted payload for a mapped NA meeting. Drops `undefined` fields
 * (Firestore rejects them) and strips the in-body `id` (it lives in the doc key).
 * Forces provenance to external/NA. Timestamps are stamped on the upsert path,
 * not here. Mirrors `lib/meetings/ingest.ts` buildExternalPayload.
 */
function buildNaPayload(m: DirectoryMeeting): Record<string, unknown> {
  const { id: _id, ...rest } = m;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) payload[key] = value;
  }
  // Force provenance — this migration only ever writes external NA records.
  payload.source = 'external';
  payload.provider = 'NA';
  return payload;
}

/**
 * Migrate the pre-seeded `na-meetings` dataset into `directoryMeetings`.
 *
 * For each source doc: map via the pure `mapNaMeeting` (skip unmappable rows),
 * then upsert into `directoryMeetings/{directoryMeetingId}` with merge:true.
 *
 * Idempotency + createdAt-once: each destination doc is read first. New docs get
 * `createdAt: serverTimestamp()`; existing docs preserve their original. On
 * EVERY write we re-stamp `lastRefreshedAt`/`lastSeenAt`/`updatedAt`.
 *
 * Hard guard: never touch a `source:'app'` doc. The id is content-derived, so an
 * app-created meeting and an NA meeting could collide on id; if the existing doc
 * is app-owned we skip the write entirely (mirrors ingestGridCell).
 *
 * Batched writes flush at BATCH_SIZE. Source data is never deleted.
 */
export async function runMigration(deps: MigrateDeps): Promise<MigrateResult> {
  const { sourceDb, destDb } = deps;

  // Guard the same-instance no-op. A REAL cross-project migration requires the
  // SOURCE (product project, e.g. recovery-connect-cad4b) and DEST
  // (recovery-platform) to be DISTINCT Firestore instances wired with per-project
  // admin credentials. main() currently defaults both to getFirestore(), so an
  // operator who forgets the two-project setup would silently read the wrong
  // project (typically read=0) and think the migration "succeeded". We do NOT
  // hard-throw (single-project emulator/test runs are legitimate) but the warning
  // must be loud and unmissable in the logs.
  if (sourceDb === destDb) {
    console.warn(
      '⚠️  migrateNaMeetings: WARNING — sourceDb and destDb are the SAME Firestore instance. ' +
        'A real cross-project NA migration needs DISTINCT source/destination Firestore ' +
        "instances, each with that project's admin credentials. If you intended a real " +
        'migration, you are almost certainly pointed at the wrong project (expect read=0). ' +
        'Single-project emulator/test runs can ignore this warning.',
    );
  }

  const snapshot = await sourceDb.collection(SOURCE_COLLECTION).get();
  const read = snapshot.size;

  const collection = destDb.collection(DEST_COLLECTION);
  let batch = destDb.batch();
  let opsInBatch = 0;
  let upserted = 0;
  let skippedUnmappable = 0;
  let skippedAppOwned = 0;

  for (const sourceDoc of snapshot.docs) {
    const mapped = mapNaMeeting(sourceDoc.data() as NaDatasetDoc);
    if (!mapped) {
      skippedUnmappable++;
      continue;
    }

    const docRef = collection.doc(mapped.id);
    const snap = await docRef.get();

    if (snap.exists) {
      const existing = snap.data() as Partial<DirectoryMeeting> | undefined;
      // Hard guard: never overwrite or touch an app-owned doc.
      if (existing?.source === 'app') {
        skippedAppOwned++;
        continue;
      }
    }

    const payload = buildNaPayload(mapped);
    payload.lastRefreshedAt = FieldValue.serverTimestamp();
    payload.lastSeenAt = FieldValue.serverTimestamp();
    payload.updatedAt = FieldValue.serverTimestamp();
    // createdAt-once: only stamp on first write so re-runs preserve it.
    if (!snap.exists) {
      payload.createdAt = FieldValue.serverTimestamp();
    }

    batch.set(docRef, payload, { merge: true });
    opsInBatch++;
    upserted++;

    if (opsInBatch >= BATCH_SIZE) {
      await batch.commit();
      batch = destDb.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return { read, skippedUnmappable, skippedAppOwned, upserted };
}

/**
 * Entry point. Initializes the default Firebase app (DESTINATION =
 * `recovery-platform`) and reads the SOURCE from the same default credentials.
 *
 * IMPORTANT for the operator: the source `na-meetings` lives in a DIFFERENT
 * Firebase project than recovery-api. To read it you must point this process at
 * the product project's admin credentials (e.g. a service-account JSON via
 * GOOGLE_APPLICATION_CREDENTIALS, or by initializing a second named app). The
 * default wiring below assumes a single set of credentials; adjust per the
 * two-project setup before running against real data. This is intentionally an
 * ops-time decision, not baked in, because the script is one-off and the source
 * project varies (homegroups vs regroup).
 */
async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp();
  }
  const db = getFirestore();

  console.log(
    `migrateNaMeetings: reading source '${SOURCE_COLLECTION}', writing '${DEST_COLLECTION}'.`,
  );

  const result = await runMigration({ sourceDb: db, destDb: db });

  console.log(
    `migrateNaMeetings: complete. read=${result.read} ` +
      `upserted=${result.upserted} skippedUnmappable=${result.skippedUnmappable} ` +
      `skippedAppOwned=${result.skippedAppOwned}`,
  );
}

// Guard the run-entry so importing this module (e.g. in tests) does not execute
// the migration.
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('migrateNaMeetings: fatal', err);
      process.exit(1);
    });
}
