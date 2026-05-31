#!/usr/bin/env node
/**
 * Data migration: backfill currentWeekId + currentWeekStartDate on all guest
 * documents and create week-summaries seeded with stats from the legacy
 * embedded currentWeek.days object.
 *
 * Why stats must be migrated:
 *   The legacy model stored per-day stats inside guest.currentWeek.days.
 *   The new model reads from the week-summaries collection. Without this
 *   script, any stats accumulated during the current week would show as 0
 *   the moment the app switches to USE_ACTIVITY_SYSTEM = true.
 *
 * Behavior:
 *   - Guests that already have currentWeekId are skipped (idempotent).
 *   - For each guest without currentWeekId:
 *       1. Tallies stats from legacy currentWeek.days (if present).
 *       2. Writes currentWeekId + currentWeekStartDate to the guest doc.
 *       3. Creates week-summaries/{guestId}_{weekStart} with the tallied stats.
 *          Uses { merge: true } so it never overwrites a doc that already exists.
 *   - Guests with stale currentWeekStartDate (past week) are handled by the
 *     scheduled transferStats Cloud Function on the next scheduled run.
 *
 * Usage:
 *   npm run build
 *   node lib/scripts/migrateGuestWeeks.js --dry-run        # preview
 *   node lib/scripts/migrateGuestWeeks.js                  # live run
 *   node lib/scripts/migrateGuestWeeks.js --limit 10       # test on 10 guests
 */

import { ratsFirestore } from '../api/firestore';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 ? parseInt(args[LIMIT_IDX + 1], 10) : Infinity;

// Each guest requires 2 Firestore ops (update guest + set week-summary).
// Firestore batch limit is 500 ops → max 250 guests per batch. Use 200.
const GUESTS_PER_BATCH = 200;

// ---------------------------------------------------------------------------
// Date utilities
// ---------------------------------------------------------------------------

function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  return monday.toISOString().split('T')[0];
}

function getWeekEnd(weekStart: string): string {
  const date = new Date(weekStart + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().split('T')[0];
}

function buildWeekId(guestId: string, weekStart: string): string {
  return `${guestId}_${weekStart}`;
}

// ---------------------------------------------------------------------------
// Legacy stat extraction
//
// Legacy Day shape (from entities/Day.ts):
//   meeting: RatsMeeting[]    — array of meetings attended that day
//   choreCompleted: boolean   — chore done that day
//   hoursWorked: { [job]: number } — hours per job
//   metPrimarySupporter: boolean  — met supporter that day
//   medication: boolean       — took medication that day
// ---------------------------------------------------------------------------

interface WeekStats {
  meetingsAttended: number;
  choresCompleted: number;
  hoursWorked: number;
  primarySupporterMet: number;
  medicationTaken: number;
}

function extractStatsFromLegacyWeek(currentWeek: any): WeekStats {
  const stats: WeekStats = {
    meetingsAttended: 0,
    choresCompleted: 0,
    hoursWorked: 0,
    primarySupporterMet: 0,
    medicationTaken: 0,
  };

  if (!currentWeek || typeof currentWeek !== 'object') return stats;

  const days = currentWeek.days;
  if (!days || typeof days !== 'object') return stats;

  for (const dateKey of Object.keys(days)) {
    const day = days[dateKey];
    if (!day || typeof day !== 'object') continue;

    // Meetings: array of RatsMeeting objects
    if (Array.isArray(day.meeting)) {
      stats.meetingsAttended += day.meeting.length;
    }

    // Chore: boolean per day
    if (day.choreCompleted === true) {
      stats.choresCompleted += 1;
    }

    // Hours worked: { [jobName]: number }
    if (day.hoursWorked && typeof day.hoursWorked === 'object') {
      for (const hours of Object.values(day.hoursWorked)) {
        if (typeof hours === 'number' && hours > 0) {
          stats.hoursWorked += hours;
        }
      }
    }

    // Met primary supporter: boolean per day
    if (day.metPrimarySupporter === true) {
      stats.primarySupporterMet += 1;
    }

    // Medication: boolean per day
    if (day.medication === true) {
      stats.medicationTaken += 1;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

interface GuestDoc {
  id: string;
  houseId: string;
  firstName?: string;
  lastName?: string;
  currentWeekId?: string;
  currentWeekStartDate?: string;
  // legacy embedded week (may or may not exist)
  currentWeek?: any;
}

async function migrate(): Promise<void> {
  const currentWeekStart = getCurrentWeekStart();
  const currentWeekEnd = getWeekEnd(currentWeekStart);

  console.log('');
  console.log('=== Guest Week Migration ===');
  console.log(`Current week: ${currentWeekStart} → ${currentWeekEnd}`);
  console.log(DRY_RUN ? '  Mode: DRY RUN (no writes)' : '  Mode: LIVE (writing to Firestore)');
  if (LIMIT !== Infinity) console.log(`  Limit: ${LIMIT} guests`);
  console.log('');

  console.log('Fetching all guest documents...');
  const guestsSnap = await ratsFirestore.collection('guests').get();
  console.log(`  Total guests in Firestore: ${guestsSnap.size}`);

  // Classify
  const toProcess: GuestDoc[] = [];
  let alreadyMigrated = 0;
  let hasLegacyStats = 0;

  for (const doc of guestsSnap.docs) {
    const data = doc.data() as GuestDoc;
    if (data.currentWeekId && data.currentWeekStartDate) {
      alreadyMigrated++;
    } else {
      const guest: GuestDoc = {
        id: doc.id,
        houseId: data.houseId || '',
        firstName: data.firstName,
        lastName: data.lastName,
        currentWeek: data.currentWeek,
      };
      toProcess.push(guest);
      if (data.currentWeek?.days) hasLegacyStats++;
    }
  }

  console.log(`  Already migrated:          ${alreadyMigrated}`);
  console.log(`  Needs migration:           ${toProcess.length}`);
  console.log(`    └─ with legacy week data: ${hasLegacyStats}`);
  console.log(`    └─ no embedded week:      ${toProcess.length - hasLegacyStats}`);
  console.log('');

  if (toProcess.length === 0) {
    console.log('Nothing to migrate — all guests already have week references.');
    return;
  }

  // Apply --limit
  const limited = toProcess.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  if (limited.length < toProcess.length) {
    console.log(`  (Processing first ${limited.length} of ${toProcess.length} due to --limit)\n`);
  }

  let totalProcessed = 0;
  let totalErrors = 0;
  const batchCount = Math.ceil(limited.length / GUESTS_PER_BATCH);

  for (let i = 0; i < limited.length; i += GUESTS_PER_BATCH) {
    const chunk = limited.slice(i, i + GUESTS_PER_BATCH);
    const batchNum = Math.floor(i / GUESTS_PER_BATCH) + 1;
    console.log(`Batch ${batchNum}/${batchCount} — ${chunk.length} guests`);

    const batch = DRY_RUN ? null : ratsFirestore.batch();

    for (const guest of chunk) {
      const weekId = buildWeekId(guest.id, currentWeekStart);
      const name = [guest.firstName, guest.lastName].filter(Boolean).join(' ') || guest.id;
      const stats = extractStatsFromLegacyWeek(guest.currentWeek);
      const hasStats = Object.values(stats).some(v => v > 0);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] ${name}`);
        console.log(`            currentWeekId = ${weekId}`);
        if (hasStats) {
          console.log(`            stats from legacy week:`);
          console.log(`              meetings:  ${stats.meetingsAttended}`);
          console.log(`              chores:    ${stats.choresCompleted}`);
          console.log(`              hours:     ${stats.hoursWorked}`);
          console.log(`              supporter: ${stats.primarySupporterMet}`);
          console.log(`              meds:      ${stats.medicationTaken}`);
        } else {
          console.log(`            stats: all zeros (no legacy week data)`);
        }
        continue;
      }

      // 1. Update the guest document
      batch!.update(ratsFirestore.collection('guests').doc(guest.id), {
        currentWeekId: weekId,
        currentWeekStartDate: currentWeekStart,
        lastUpdated: new Date().toISOString(),
      });

      // 2. Create week-summary seeded with migrated stats.
      //    merge:true means we never overwrite a doc that already exists.
      batch!.set(
        ratsFirestore.collection('week-summaries').doc(weekId),
        {
          id: weekId,
          guestId: guest.id,
          houseId: guest.houseId,
          startDate: currentWeekStart,
          endDate: currentWeekEnd,
          stats,
          dailyStats: {},
          lastUpdated: new Date().toISOString(),
          activityCount: 0,
        },
        { merge: true },
      );

      console.log(`  Queued: ${name} → ${weekId}${hasStats ? ' (with migrated stats)' : ''}`);
    }

    if (DRY_RUN) {
      totalProcessed += chunk.length;
      console.log('');
      continue;
    }

    try {
      await batch!.commit();
      totalProcessed += chunk.length;
      console.log(`  Committed batch ${batchNum} — ${chunk.length} guests`);
    } catch (err: any) {
      totalErrors += chunk.length;
      console.error(`  ERROR in batch ${batchNum}: ${err.message}`);
      console.error('  Affected guest IDs:', chunk.map(g => g.id).join(', '));
    }

    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Total guests:          ${guestsSnap.size}`);
  console.log(`Already had week refs: ${alreadyMigrated}`);
  console.log(`Processed this run:    ${totalProcessed}`);
  if (totalErrors > 0) {
    console.log(`Errors:                ${totalErrors} — re-run to retry`);
  }
  console.log('');
  if (DRY_RUN) {
    console.log('Dry run complete. Re-run without --dry-run to apply.');
  } else {
    console.log(totalErrors === 0 ? 'Migration complete.' : 'Migration finished with errors (see above).');
  }
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
