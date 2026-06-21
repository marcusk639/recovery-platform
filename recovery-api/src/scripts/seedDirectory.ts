/**
 * One-off directory seeding script (NOT a deployed function — not exported from
 * index.ts). Sweeps the continental-US grid, ingesting AA + Celebrate Recovery
 * meetings into `directoryMeetings`, with a resumable Firestore cursor so a
 * restart picks up where it left off.
 *
 * Resumable-cursor pattern ported from homegroups
 * `functions/scripts/populateMeetings.ts` (saveProgress/loadProgress, L362-391):
 * a single `script_progress/seedDirectory` doc holding `lastProcessedIndex`.
 *
 * Secrets policy (CLAUDE.md): the GOOGLE_MAPS_API_KEY is read from the
 * environment HERE, at the script entry point only, and passed down. The pure
 * lib functions in ingest.ts never touch process.env.
 *
 * Run (from recovery-api/):
 *   GOOGLE_MAPS_API_KEY=... npx ts-node src/scripts/seedDirectory.ts
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { gridCells, ingestGridCell, GRID_CONFIG } from '../lib/meetings/ingest';

const PROGRESS_COLLECTION = 'script_progress';
const PROGRESS_DOC = 'seedDirectory';

interface SeedProgress {
  lastProcessedIndex: number;
  totalCells: number;
}

async function loadProgress(db: FirebaseFirestore.Firestore): Promise<SeedProgress | null> {
  try {
    const doc = await db.collection(PROGRESS_COLLECTION).doc(PROGRESS_DOC).get();
    return doc.exists ? (doc.data() as SeedProgress) : null;
  } catch (err) {
    console.error('seedDirectory: failed to load progress', err);
    return null; // start from the beginning
  }
}

async function saveProgress(
  db: FirebaseFirestore.Firestore,
  progress: SeedProgress,
): Promise<void> {
  try {
    await db
      .collection(PROGRESS_COLLECTION)
      .doc(PROGRESS_DOC)
      .set({ ...progress, lastUpdated: new Date() }, { merge: true });
  } catch (err) {
    // Non-critical — progress persistence shouldn't abort the sweep.
    console.error('seedDirectory: failed to save progress', err);
  }
}

export async function runSeed(): Promise<void> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }

  if (getApps().length === 0) {
    initializeApp();
  }
  const db = getFirestore();

  // Materialize the grid so we have a stable index for the cursor.
  const cells = [...gridCells()];
  const totalCells = cells.length;

  const saved = await loadProgress(db);
  const startIndex = saved?.lastProcessedIndex ?? 0;

  console.log(
    `seedDirectory: ${totalCells} cells (lat ${GRID_CONFIG.LAT_MIN}→${GRID_CONFIG.LAT_MAX}, ` +
      `lon ${GRID_CONFIG.LON_MIN}→${GRID_CONFIG.LON_MAX}, step ${GRID_CONFIG.STEP}). ` +
      `Resuming from index ${startIndex}.`,
  );

  let totalUpserted = 0;
  let totalSkippedAppOwned = 0;

  for (let i = startIndex; i < totalCells; i++) {
    const { lat, lng } = cells[i];
    try {
      const result = await ingestGridCell(lat, lng, { db });
      totalUpserted += result.upserted;
      totalSkippedAppOwned += result.skippedAppOwned;
      console.log(
        `seedDirectory: cell ${i + 1}/${totalCells} (${lat.toFixed(1)}, ${lng.toFixed(1)}) ` +
          `fetched=${result.fetched} upserted=${result.upserted} skippedApp=${result.skippedAppOwned}`,
      );
    } catch (err) {
      console.error(
        `seedDirectory: cell ${i + 1}/${totalCells} (${lat.toFixed(1)}, ${lng.toFixed(1)}) failed`,
        err,
      );
      // Continue to the next cell; the cursor still advances past failures so a
      // single bad cell can't wedge the sweep. Re-run later to re-attempt.
    }
    await saveProgress(db, { lastProcessedIndex: i + 1, totalCells });
  }

  console.log(
    `seedDirectory: complete. totalUpserted=${totalUpserted} totalSkippedAppOwned=${totalSkippedAppOwned}`,
  );
}

// Guard the run-entry so importing this module (e.g. in tests) does not execute
// the sweep.
if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('seedDirectory: fatal', err);
      process.exit(1);
    });
}
