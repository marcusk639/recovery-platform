#!/usr/bin/env ts-node
/**
 * Full User Model Migration Script
 *
 * Uses Firebase Admin SDK to migrate all user-related data to the new architecture.
 *
 * Phases:
 *   1. Users    — normalize role flags (cross-reference Guest/Admin docs)
 *   2. Guests   — migrate embedded currentWeek/previousWeek/nextWeek → activities + week-summaries
 *   3. Weeks    — migrate standalone 'weeks' collection → activities + week-summaries
 *   4. Houses   — backfill houseType: 'traditional' on docs missing the field
 *
 * Usage:
 *   ts-node migrate-full.ts dry-run [--phase=users|guests|weeks|houses]
 *   ts-node migrate-full.ts execute
 *   ts-node migrate-full.ts validate
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

enum ActivityType {
  CHORE = 'chore',
  MEETING = 'meeting',
  WORK = 'work',
  MEDICATION = 'medication',
  PRIMARY_SUPPORTER = 'primary_supporter',
}

interface MigrationStats {
  // Phase 1
  usersChecked: number;
  usersUpdated: number;
  // Phase 2
  guestsProcessed: number;
  guestsSkipped: number;
  // Phase 3
  weeksProcessed: number;
  weeksSkipped: number;
  // Shared activity/summary counters
  activitiesCreated: number;
  summariesCreated: number;
  itemsArchived: number;
  // Phase 4
  housesUpdated: number;
  // Errors
  errors: Array<{ collection: string; docId: string; error: string }>;
  // Timing
  startTime: Date;
  endTime?: Date;
  durationSeconds?: number;
}

function emptyStats(): MigrationStats {
  return {
    usersChecked: 0,
    usersUpdated: 0,
    guestsProcessed: 0,
    guestsSkipped: 0,
    weeksProcessed: 0,
    weeksSkipped: 0,
    activitiesCreated: 0,
    summariesCreated: 0,
    itemsArchived: 0,
    housesUpdated: 0,
    errors: [],
    startTime: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Firebase initialisation
// ---------------------------------------------------------------------------

function initFirebase(credPath?: string): void {
  if (admin.apps.length > 0) return;

  const resolvedPath =
    credPath ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    `${__dirname}/service-key.json`;

  if (!fs.existsSync(resolvedPath)) {
    console.error('ERROR: Firebase credentials not found at:', resolvedPath);
    console.error('\nSet GOOGLE_APPLICATION_CREDENTIALS or pass path as argument.');
    process.exit(1);
  }

  const serviceAccount = require(resolvedPath) as admin.ServiceAccount;
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase initialized.\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  return d.toISOString().split('T')[0];
}

function getWeekEnd(startDate: string): string {
  const d = new Date(startDate.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

function parseMeetingTime(dateStr: string, timeStr?: string): Date {
  const date = new Date(dateStr);
  if (!timeStr) { date.setHours(19, 0, 0, 0); return date; }
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const period = (m[3] || '').toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    date.setHours(h, min, 0, 0);
    return date;
  }
  // Fallback: try bare hour like "7" or "19"
  const bareHour = timeStr.match(/^(\d{1,2})$/);
  if (bareHour) {
    date.setHours(parseInt(bareHour[1], 10), 0, 0, 0);
    return date;
  }
  date.setHours(19, 0, 0, 0);
  return date;
}

function ts(date: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(date);
}

// ---------------------------------------------------------------------------
// FullMigrator class — phases implemented in Tasks 3-7
// ---------------------------------------------------------------------------

class FullMigrator {
  private db: admin.firestore.Firestore;
  private dryRun: boolean;
  private stats: MigrationStats;

  constructor(dryRun: boolean) {
    this.db = admin.firestore();
    this.dryRun = dryRun;
    this.stats = emptyStats();
  }

  async run(phase?: string): Promise<MigrationStats> {
    this.stats.startTime = new Date();
    const modeLabel = this.dryRun ? 'DRY RUN' : 'LIVE MIGRATION';
    console.log('='.repeat(62));
    console.log(`  RATS Full Migration — ${modeLabel}`);
    console.log('='.repeat(62) + '\n');

    if (!phase || phase === 'users')  await this.phase1Users();
    if (!phase || phase === 'guests') await this.phase2Guests();
    if (!phase || phase === 'weeks')  await this.phase3Weeks();
    if (!phase || phase === 'houses') await this.phase4Houses();

    this.stats.endTime = new Date();
    this.stats.durationSeconds =
      (this.stats.endTime.getTime() - this.stats.startTime.getTime()) / 1000;

    this.printSummary();
    return this.stats;
  }

  // Stubs — implemented in Tasks 3-7
  private async phase1Users(): Promise<void> {
    console.log('--- Phase 1: User Normalization ---\n');
    const usersSnapshot = await this.db.collection('users').get();
    console.log(`Found ${usersSnapshot.size} users.\n`);

    for (const userDoc of usersSnapshot.docs) {
      const user = userDoc.data();
      const userId = userDoc.id;
      const updates: Record<string, any> = {};

      try {
        this.stats.usersChecked++;

        // 1a. Ensure uid matches document ID
        if (user.uid !== userId) {
          console.log(`  [${userId}] uid mismatch: "${user.uid}" → "${userId}"`);
          updates.uid = userId;
        }

        // 1b. Verify guestId if isGuest is set
        if (user.isGuest) {
          if (user.guestId) {
            const guestDoc = await this.db.collection('guests').doc(user.guestId).get();
            if (!guestDoc.exists) {
              console.log(`  [${userId}] isGuest=true but guest "${user.guestId}" not found — clearing`);
              updates.isGuest = false;
              updates.guestId = '';
              updates.houseId = '';
              updates.potentialGuest = false;
            }
          } else {
            // isGuest but no guestId — try to find by userId
            const q = await this.db.collection('guests').where('userId', '==', userId).limit(1).get();
            if (q.empty) {
              console.log(`  [${userId}] isGuest=true but no guestId and no guest found — clearing`);
              updates.isGuest = false;
              updates.potentialGuest = false;
            } else {
              console.log(`  [${userId}] isGuest=true with no guestId — found guest, backfilling guestId`);
              updates.guestId = q.docs[0].id;
            }
          }
        }

        // 1c. Verify adminId if isAdmin is set
        if (user.isAdmin) {
          if (user.adminId) {
            const adminDoc = await this.db.collection('admins').doc(user.adminId).get();
            if (!adminDoc.exists) {
              console.log(`  [${userId}] isAdmin=true but admin "${user.adminId}" not found — clearing`);
              updates.isAdmin = false;
              updates.adminId = '';
            }
          } else {
            console.log(`  [${userId}] WARN: isAdmin=true but no adminId — unable to verify (skipping)`);
          }
        }

        if (Object.keys(updates).length > 0) {
          this.stats.usersUpdated++;
          if (!this.dryRun) {
            await userDoc.ref.update(updates);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.stats.errors.push({ collection: 'users', docId: userId, error: msg });
        console.error(`  [${userId}] ERROR: ${msg}`);
      }
    }

    console.log(`\nPhase 1 complete: ${this.stats.usersChecked} checked, ${this.stats.usersUpdated} updated.\n`);
  }

  private async phase2Guests(): Promise<void> {
    console.log('--- Phase 2: Guest Embedded Week Migration ---\n');

    const snapshot = await this.db.collection('guests').get();
    console.log(`Found ${snapshot.size} guests.\n`);

    for (const guestDoc of snapshot.docs) {
      const guest = guestDoc.data();
      const guestId = guestDoc.id;

      if (!guest.currentWeek && !guest.previousWeek && !guest.nextWeek) {
        this.stats.guestsSkipped++;
        continue;
      }

      try {
        console.log(`  [${guestId}] ${guest.firstName} ${guest.lastName}`);
        const guestCtx = { id: guestId, houseId: guest.houseId || '', userId: guest.userId || guestId };
        const allActivities: any[] = [];
        const summaries = new Map<string, any>();

        for (const weekKey of ['currentWeek', 'previousWeek', 'nextWeek']) {
          const week = (guest as any)[weekKey];
          if (!week) continue;
          if (!week.startDate) {
            console.log(`    → ${weekKey}: missing startDate — skipping`);
            this.stats.errors.push({ collection: 'guests', docId: guestId,
              error: `${weekKey} missing startDate` });
            continue;
          }
          console.log(`    → ${weekKey}: ${week.startDate}`);
          const { activities, summaryId, summary } = this.migrateWeekData(guestCtx, week);
          allActivities.push(...activities);
          summaries.set(summaryId, summary);
        }

        console.log(`    → ${allActivities.length} activities, ${summaries.size} summaries`);

        await this.writeActivitiesInBatches(allActivities);
        for (const [id, summary] of summaries.entries()) {
          await this.writeSummary(id, summary);
        }

        await this.archiveWeekData({
          guestId,
          guestName: `${guest.firstName} ${guest.lastName}`,
          currentWeek: guest.currentWeek || null,
          previousWeek: guest.previousWeek || null,
          nextWeek: guest.nextWeek || null,
          source: 'guest-embedded',
        });

        if (!this.dryRun) {
          // Clean embedded weeks from guest doc; backfill currentWeekId if missing
          const cleanupUpdate: Record<string, any> = {
            currentWeek: admin.firestore.FieldValue.delete(),
            previousWeek: admin.firestore.FieldValue.delete(),
            nextWeek: admin.firestore.FieldValue.delete(),
          };

          if (!guest.currentWeekId && guest.currentWeek?.startDate) {
            const weekStart = getWeekStart(guest.currentWeek.startDate);
            cleanupUpdate.currentWeekId = `${guestId}_${weekStart}`;
            cleanupUpdate.currentWeekStartDate = weekStart;
          }

          await guestDoc.ref.update(cleanupUpdate);
        }

        this.stats.guestsProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.stats.errors.push({ collection: 'guests', docId: guestId, error: msg });
        console.error(`  [${guestId}] ERROR: ${msg}`);
      }
    }

    console.log(`\nPhase 2 complete: ${this.stats.guestsProcessed} processed, ${this.stats.guestsSkipped} skipped.\n`);
  }

  private async phase3Weeks(): Promise<void> {
    console.log('--- Phase 3: Standalone Weeks Collection Migration ---\n');

    const snapshot = await this.db.collection('weeks').get();
    console.log(`Found ${snapshot.size} week documents.\n`);

    for (const weekDoc of snapshot.docs) {
      const week = weekDoc.data();
      const weekId = weekDoc.id;
      const guestId = week.guestId;

      if (!guestId) {
        console.log(`  [${weekId}] No guestId — skipping`);
        this.stats.weeksSkipped++;
        continue;
      }

      if (!week.startDate) {
        console.log(`  [${weekId}] No startDate — skipping`);
        this.stats.weeksSkipped++;
        continue;
      }

      try {
        // Idempotency check: look for existing activities for this guest+week window
        const weekStart = getWeekStart(week.startDate);
        const windowStart = admin.firestore.Timestamp.fromDate(new Date(weekStart));
        const windowEnd = admin.firestore.Timestamp.fromDate(new Date(getWeekEnd(weekStart) + 'T23:59:59Z'));

        const existing = await this.db.collection('activities')
          .where('guestId', '==', guestId)
          .where('timestamp', '>=', windowStart)
          .where('timestamp', '<=', windowEnd)
          .limit(1)
          .get();

        if (!existing.empty) {
          console.log(`  [${weekId}] Already migrated — skipping`);
          this.stats.weeksSkipped++;
          continue;
        }

        // Get guest doc for context
        const guestDoc = await this.db.collection('guests').doc(guestId).get();
        const guestData = guestDoc.exists ? guestDoc.data()! : {};
        const guestCtx = {
          id: guestId,
          houseId: (guestData as any).houseId || week.houseId || '',
          userId: (guestData as any).userId || week.userId || guestId,
        };

        console.log(`  [${weekId}] guest=${guestId}, week=${week.startDate}`);
        const { activities, summaryId, summary } = this.migrateWeekData(guestCtx, week);
        console.log(`    → ${activities.length} activities, 1 summary`);

        await this.writeActivitiesInBatches(activities);
        await this.writeSummary(summaryId, summary);

        await this.archiveWeekData({
          guestId,
          weekDocId: weekId,
          weekData: week,
          source: 'weeks-collection',
        });

        this.stats.weeksProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.stats.errors.push({ collection: 'weeks', docId: weekId, error: msg });
        console.error(`  [${weekId}] ERROR: ${msg}`);
      }
    }

    console.log(`\nPhase 3 complete: ${this.stats.weeksProcessed} processed, ${this.stats.weeksSkipped} skipped.\n`);
  }

  private async phase4Houses(): Promise<void> {
    console.log('--- Phase 4: Houses houseType Backfill ---\n');

    const snapshot = await this.db.collection('houses').get();
    console.log(`Found ${snapshot.size} houses.\n`);

    let batch = this.db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;

    for (const houseDoc of snapshot.docs) {
      const house = houseDoc.data();

      if (house.houseType !== undefined) continue;

      console.log(`  [${houseDoc.id}] ${house.name || '(unnamed)'} — backfilling houseType: 'traditional'`);
      this.stats.housesUpdated++;

      if (!this.dryRun) {
        batch.update(houseDoc.ref, { houseType: 'traditional' });
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = this.db.batch();
          batchCount = 0;
        }
      }
    }

    if (!this.dryRun && batchCount > 0) {
      await batch.commit();
    }

    console.log(`\nPhase 4 complete: ${this.stats.housesUpdated} houses updated.\n`);
  }

  private migrateWeekData(
    guest: { id: string; houseId: string; userId: string },
    week: any,
  ): { activities: any[]; summaryId: string; summary: any } {
    if (!week.startDate) {
      throw new Error(`Week is missing startDate for guest ${guest.id}`);
    }
    const weekStart = getWeekStart(week.startDate);
    const weekEnd = getWeekEnd(weekStart);
    const summaryId = `${guest.id}_${weekStart}`;

    const summary: any = {
      guestId: guest.id,
      houseId: guest.houseId || '',
      startDate: weekStart,
      endDate: weekEnd,
      stats: {
        choresCompleted: 0,
        meetingsAttended: 0,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
      dailyStats: {},
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      activityCount: 0,
    };

    const activities: any[] = [];
    const days: Record<string, any> = week.days || {};

  const migrationTime = new Date();
    for (const [dateStr, day] of Object.entries(days)) {
      if (!day || typeof day !== 'object') continue;

      if (!summary.dailyStats[dateStr]) {
        summary.dailyStats[dateStr] = {
          date: dateStr,
          choresCompleted: 0,
          meetingsAttended: 0,
          hoursWorked: 0,
          medicationTaken: 0,
          primarySupporterMet: 0,
        };
      }
      const ds = summary.dailyStats[dateStr];

      const base = {
        guestId: guest.id,
        houseId: guest.houseId || '',
        loggedBy: guest.userId || guest.id,
        loggedAt: ts(migrationTime),
        verified: true,
        status: 'active',
      };

      // Chore
      if ((day as any).choreCompleted) {
        const d = new Date(dateStr); d.setHours(12, 0, 0, 0);
        activities.push({ ...base, type: ActivityType.CHORE, timestamp: ts(d),
          data: { type: 'chore', choreType: 'daily', choreName: week.chore?.name || 'House Chore' } });
        summary.stats.choresCompleted++; ds.choresCompleted++; summary.activityCount++;
      }

      // Meetings
      if (Array.isArray((day as any).meeting)) {
        for (const meeting of (day as any).meeting) {
          const mt = parseMeetingTime(dateStr, meeting.time);
          activities.push({ ...base, type: ActivityType.MEETING, timestamp: ts(mt),
            data: { type: 'meeting', meetingName: meeting.name || 'Meeting',
              meetingType: meeting.type || 'General', duration: 60,
              meetingId: meeting.id || null, location: meeting.locationName || null } });
          summary.stats.meetingsAttended++; ds.meetingsAttended++; summary.activityCount++;
        }
      }

      // Work hours
      if ((day as any).hoursWorked && typeof (day as any).hoursWorked === 'object') {
        for (const [jobName, rawHours] of Object.entries((day as any).hoursWorked)) {
          const hours = Number(rawHours);
          if (hours > 0) {
            const d = new Date(dateStr); d.setHours(17, 0, 0, 0);
            activities.push({ ...base, type: ActivityType.WORK, timestamp: ts(d),
              data: { type: 'work', jobName, hoursWorked: hours } });
            summary.stats.hoursWorked += hours; ds.hoursWorked += hours; summary.activityCount++;
          }
        }
      }

      // Medication
      if ((day as any).medication) {
        const d = new Date(dateStr); d.setHours(8, 0, 0, 0);
        activities.push({ ...base, type: ActivityType.MEDICATION, timestamp: ts(d),
          data: { type: 'medication' } });
        summary.stats.medicationTaken++; ds.medicationTaken++; summary.activityCount++;
      }

      // Primary supporter
      if ((day as any).metPrimarySupporter) {
        const d = new Date(dateStr); d.setHours(15, 0, 0, 0);
        activities.push({ ...base, type: ActivityType.PRIMARY_SUPPORTER, timestamp: ts(d),
          data: { type: 'primary_supporter',
            supporterId: week.primarySupporterId || '',
            supporterName: week.primarySupporterName || 'Primary Supporter' } });
        summary.stats.primarySupporterMet++; ds.primarySupporterMet++; summary.activityCount++;
      }
    }

    return { activities, summaryId, summary };
  }

  private async writeActivitiesInBatches(activities: any[]): Promise<void> {
    this.stats.activitiesCreated += activities.length;
    if (this.dryRun) return;
    const BATCH_SIZE = 500;
    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = this.db.batch();
      for (const activity of activities.slice(i, i + BATCH_SIZE)) {
        batch.set(this.db.collection('activities').doc(), activity);
      }
      await batch.commit();
    }
  }

  private async writeSummary(summaryId: string, summary: any): Promise<void> {
    this.stats.summariesCreated++;
    if (this.dryRun) return;
    await this.db.collection('week-summaries').doc(summaryId).set(summary);
  }

  private async archiveWeekData(data: any): Promise<void> {
    this.stats.itemsArchived++;
    if (this.dryRun) return;
    await this.db.collection('archived-weeks').add({
      ...data,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(62));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(62));
    if (this.dryRun) console.log('(DRY RUN — no changes committed)\n');
    console.log(`Users checked:       ${this.stats.usersChecked}`);
    console.log(`Users updated:       ${this.stats.usersUpdated}`);
    console.log(`Guests processed:    ${this.stats.guestsProcessed}`);
    console.log(`Guests skipped:      ${this.stats.guestsSkipped}`);
    console.log(`Weeks processed:     ${this.stats.weeksProcessed}`);
    console.log(`Weeks skipped:       ${this.stats.weeksSkipped}`);
    console.log(`Activities created:  ${this.stats.activitiesCreated}`);
    console.log(`Summaries created:   ${this.stats.summariesCreated}`);
    console.log(`Items archived:      ${this.stats.itemsArchived}`);
    console.log(`Houses updated:      ${this.stats.housesUpdated}`);
    if (this.stats.errors.length > 0) {
      console.log(`\nErrors: ${this.stats.errors.length}`);
      this.stats.errors.forEach(({ collection, docId, error }) => {
        console.log(`  [${collection}/${docId}] ${error}`);
      });
    }
    if (this.stats.durationSeconds !== undefined) {
      console.log(`\nDuration: ${this.stats.durationSeconds.toFixed(2)}s`);
    }
    console.log('='.repeat(62));
  }
}

// ---------------------------------------------------------------------------
// validate() — implemented in Task 8
// ---------------------------------------------------------------------------

async function validate(db: admin.firestore.Firestore): Promise<void> {
  console.log('='.repeat(62));
  console.log('  Post-Migration Validation');
  console.log('='.repeat(62) + '\n');

  let passed = 0;
  let failed = 0;

  // Check 1: No guest docs with embedded weeks
  {
    const guestsWithWeeks = await db.collection('guests')
      .where('currentWeek', '!=', null)
      .get();
    if (guestsWithWeeks.empty) {
      console.log('PASS  No guests with embedded currentWeek');
      passed++;
    } else {
      console.log(`FAIL  ${guestsWithWeeks.size} guests still have embedded currentWeek`);
      guestsWithWeeks.docs.forEach(d => console.log(`        - ${d.id}`));
      failed++;
    }
  }

  // Check 2: All active guests have at least one activity record
  {
    const guestsSnapshot = await db.collection('guests').where('status', '==', 'active').get();
    let missingActivities = 0;
    for (const guestDoc of guestsSnapshot.docs) {
      const act = await db.collection('activities').where('guestId', '==', guestDoc.id).limit(1).get();
      if (act.empty) missingActivities++;
    }
    if (missingActivities === 0) {
      console.log(`PASS  All ${guestsSnapshot.size} active guests have activity records`);
      passed++;
    } else {
      console.log(`WARN  ${missingActivities} of ${guestsSnapshot.size} active guests have no activities (may be new users)`);
    }
  }

  // Check 3: All houses have houseType field
  {
    const housesSnapshot = await db.collection('houses').get();
    const missing = housesSnapshot.docs.filter(d => d.data().houseType === undefined);
    if (missing.length === 0) {
      console.log(`PASS  All ${housesSnapshot.size} houses have houseType field`);
      passed++;
    } else {
      console.log(`FAIL  ${missing.length} houses still missing houseType`);
      missing.forEach(d => console.log(`        - ${d.id}`));
      failed++;
    }
  }

  // Check 4: archived-weeks collection has records (confirms archival ran)
  {
    const archiveSnapshot = await db.collection('archived-weeks').limit(1).get();
    if (!archiveSnapshot.empty) {
      console.log('PASS  archived-weeks collection has records');
      passed++;
    } else {
      console.log('WARN  archived-weeks is empty (ok if no embedded weeks existed)');
    }
  }

  console.log('\n' + '='.repeat(62));
  console.log(`Result: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(62));

  if (failed > 0) {
    console.log('\nValidation FAILED — review errors above.');
    process.exit(1);
  } else {
    console.log('\nValidation PASSED.');
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    rl.on('error', (err) => { rl.close(); reject(err); });
    rl.on('close', () => reject(new Error('stdin closed before answer received')));
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'dry-run';
  const phaseArg = args.find(a => a.startsWith('--phase='))?.split('=')[1];
  const credPath = args.find(a => !a.startsWith('--') && a !== command);

  const yesFlag = args.includes('--yes');

  const VALID_PHASES = ['users', 'guests', 'weeks', 'houses'] as const;
  if (phaseArg && !(VALID_PHASES as readonly string[]).includes(phaseArg)) {
    console.error(`ERROR: Unknown phase "${phaseArg}". Valid phases: ${VALID_PHASES.join(', ')}`);
    process.exit(1);
  }

  initFirebase(credPath);

  switch (command) {
    case 'dry-run': {
      console.log('Running DRY RUN — no changes will be committed.\n');
      const migrator = new FullMigrator(true);
      await migrator.run(phaseArg);
      console.log('\nRun "execute" to commit changes.');
      break;
    }

    case 'execute': {
      if (!yesFlag) {
        const answer = await prompt('Type "EXECUTE" to proceed with live migration: ');
        if (answer !== 'EXECUTE') {
          console.log('Cancelled.');
          process.exit(0);
        }
      } else {
        console.log('--yes flag set, skipping confirmation.\n');
      }
      console.log('\nRunning live migration...\n');
      const migrator = new FullMigrator(false);
      await migrator.run(phaseArg);
      console.log('\nRun "validate" to verify results.');
      break;
    }

    case 'validate': {
      const db = admin.firestore();
      await validate(db);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: ts-node migrate-full.ts [dry-run|execute|validate] [--phase=users|guests|weeks|houses]');
      process.exit(1);
  }

  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
