# Full User Model Migration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `scripts/migrate-full.ts` — a standalone Firebase Admin SDK script that migrates User role flags, Guest embedded week data, standalone Week documents, and House `houseType` fields to the new data model.

**Architecture:** Single TypeScript file in `scripts/` with a `FullMigrator` class and 4 sequential phases. No imports from `src/` — all types are inlined. Dry-run mode previews all changes; `execute` requires explicit confirmation. `validate` runs post-migration integrity checks.

**Tech Stack:** `firebase-admin` v11+, `ts-node` (already installed in `scripts/`), Node.js built-ins only.

**Design doc:** `docs/plans/2026-02-19-full-migration-design.md`

---

## Task 1: Add `firebase-admin` dependency and add new npm scripts

**Files:**
- Modify: `scripts/package.json`

### Step 1: Add `firebase-admin` to `scripts/package.json`

Open `scripts/package.json` and update it to:

```json
{
  "name": "rats-migration-scripts",
  "version": "1.0.0",
  "description": "Database migration scripts for RATS app",
  "scripts": {
    "migrate:dry-run": "ts-node run-migration.ts dry-run",
    "migrate:execute": "ts-node run-migration.ts execute",
    "migrate:validate": "ts-node run-migration.ts validate",
    "full:dry-run": "ts-node migrate-full.ts dry-run",
    "full:execute": "ts-node migrate-full.ts execute",
    "full:validate": "ts-node migrate-full.ts validate"
  },
  "dependencies": {
    "firebase-admin": "^11.0.0",
    "ts-node": "^10.9.1"
  }
}
```

### Step 2: Install the dependency

```bash
cd scripts && npm install
```

Expected: `firebase-admin` added to `node_modules`, `package-lock.json` updated.

### Step 3: Verify firebase-admin is available

```bash
cd scripts && node -e "const admin = require('firebase-admin'); console.log('ok', admin.SDK_VERSION)"
```

Expected: prints `ok` followed by a version string (e.g. `ok 11.x.x`).

### Step 4: Commit

```bash
git add scripts/package.json scripts/package-lock.json
git commit -m "chore(scripts): add firebase-admin dependency for full migration script"
```

---

## Task 2: Create the script skeleton with types and Firebase init

**Files:**
- Create: `scripts/migrate-full.ts`

### Step 1: Create `scripts/migrate-full.ts` with the full skeleton

```typescript
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

  const serviceAccount = require(resolvedPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  console.log('Firebase initialized.\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function getWeekEnd(startDate: string): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

function parseMeetingTime(dateStr: string, timeStr?: string): Date {
  const date = new Date(dateStr);
  if (!timeStr) { date.setHours(19, 0, 0, 0); return date; }
  const m = timeStr.match(/(\d{1,2}):?(\d{2})?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (timeStr.toLowerCase().includes('pm') && h < 12) h += 12;
    date.setHours(h, min, 0, 0);
    return date;
  }
  date.setHours(19, 0, 0, 0);
  return date;
}

function ts(date: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(date);
}

// ---------------------------------------------------------------------------
// FullMigrator class — STUB (phases implemented in later tasks)
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

  // Stubs — implemented in Tasks 3-6
  private async phase1Users(): Promise<void>  { console.log('[Phase 1] Users — TODO'); }
  private async phase2Guests(): Promise<void> { console.log('[Phase 2] Guests — TODO'); }
  private async phase3Weeks(): Promise<void>  { console.log('[Phase 3] Weeks — TODO'); }
  private async phase4Houses(): Promise<void> { console.log('[Phase 4] Houses — TODO'); }

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
// validate() — STUB (implemented in Task 7)
// ---------------------------------------------------------------------------

async function validate(db: admin.firestore.Firestore): Promise<void> {
  console.log('[Validate] TODO');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'dry-run';
  const phaseArg = args.find(a => a.startsWith('--phase='))?.split('=')[1];
  const credPath = args.find(a => !a.startsWith('--') && a !== command);

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
      const answer = await prompt('Type "EXECUTE" to proceed with live migration: ');
      if (answer !== 'EXECUTE') {
        console.log('Cancelled.');
        process.exit(0);
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
```

### Step 2: Verify the script compiles and runs

```bash
cd scripts && ts-node migrate-full.ts dry-run 2>&1 | head -20
```

Expected output (approximately):
```
Firebase initialized.

Running DRY RUN — no changes will be committed.

==============================================================
  RATS Full Migration — DRY RUN
==============================================================

[Phase 1] Users — TODO
[Phase 2] Guests — TODO
[Phase 3] Weeks — TODO
[Phase 4] Houses — TODO
```

> **Note:** If you don't have credentials locally, set `GOOGLE_APPLICATION_CREDENTIALS` to a valid service key path, or the script will exit with an error — that's expected and correct.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): add migrate-full.ts skeleton with 4-phase structure"
```

---

## Task 3: Implement Phase 1 — User role flag normalization

**Files:**
- Modify: `scripts/migrate-full.ts` (replace `phase1Users` stub)

### Step 1: Replace the `phase1Users` stub with the real implementation

Find the line:
```typescript
private async phase1Users(): Promise<void>  { console.log('[Phase 1] Users — TODO'); }
```

Replace it with:

```typescript
private async phase1Users(): Promise<void> {
  console.log('--- Phase 1: User Normalization ---\n');
  const usersSnapshot = await this.db.collection('users').get();
  console.log(`Found ${usersSnapshot.size} users.\n`);

  for (const userDoc of usersSnapshot.docs) {
    const user = userDoc.data();
    const userId = userDoc.id;
    const updates: Record<string, any> = {};

    try {
      // 1a. Ensure uid matches document ID
      if (user.uid && user.uid !== userId) {
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
        }
      }

      this.stats.usersChecked++;

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
```

### Step 2: Test with dry-run

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=users 2>&1 | head -40
```

Expected: Phase 1 runs, shows user counts, lists any inconsistencies found, prints "Phase 1 complete". Other phases show TODO.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): implement phase 1 — user role flag normalization"
```

---

## Task 4: Implement the `migrateWeekData` helper (shared by phases 2 and 3)

**Files:**
- Modify: `scripts/migrate-full.ts` (add helper method to `FullMigrator`)

This helper converts a single Week object + guest context into Activity documents and a WeekSummary. It's called by both Phase 2 (embedded weeks) and Phase 3 (standalone weeks).

### Step 1: Add `migrateWeekData` helper to `FullMigrator`

Add this method inside the `FullMigrator` class (above `printSummary`):

```typescript
private migrateWeekData(
  guest: { id: string; houseId: string; userId: string },
  week: any,
): { activities: any[]; summaryId: string; summary: any } {
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
      loggedAt: ts(new Date(dateStr)),
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
      for (const [jobName, hours] of Object.entries((day as any).hoursWorked) as [string, number][]) {
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
  const BATCH_SIZE = 500;
  for (let i = 0; i < activities.length; i += BATCH_SIZE) {
    const batch = this.db.batch();
    for (const activity of activities.slice(i, i + BATCH_SIZE)) {
      batch.set(this.db.collection('activities').doc(), activity);
    }
    await batch.commit();
  }
  this.stats.activitiesCreated += activities.length;
}

private async writeSummary(summaryId: string, summary: any): Promise<void> {
  await this.db.collection('week-summaries').doc(summaryId).set(summary);
  this.stats.summariesCreated++;
}

private async archiveWeekData(data: any): Promise<void> {
  await this.db.collection('archived-weeks').add({
    ...data,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  this.stats.itemsArchived++;
}
```

### Step 2: Verify the script still compiles

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=users 2>&1 | tail -5
```

Expected: still runs without TypeScript errors.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): add migrateWeekData helper and batch write utilities"
```

---

## Task 5: Implement Phase 2 — Guest embedded week migration

**Files:**
- Modify: `scripts/migrate-full.ts` (replace `phase2Guests` stub)

### Step 1: Replace the `phase2Guests` stub

Find:
```typescript
private async phase2Guests(): Promise<void> { console.log('[Phase 2] Guests — TODO'); }
```

Replace with:

```typescript
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
        console.log(`    → ${weekKey}: ${week.startDate}`);
        const { activities, summaryId, summary } = this.migrateWeekData(guestCtx, week);
        allActivities.push(...activities);
        summaries.set(summaryId, summary);
      }

      console.log(`    → ${allActivities.length} activities, ${summaries.size} summaries`);

      if (!this.dryRun) {
        await this.writeActivitiesInBatches(allActivities);
        for (const [id, summary] of summaries.entries()) {
          await this.writeSummary(id, summary);
        }

        // Archive
        await this.archiveWeekData({
          guestId,
          guestName: `${guest.firstName} ${guest.lastName}`,
          currentWeek: guest.currentWeek || null,
          previousWeek: guest.previousWeek || null,
          nextWeek: guest.nextWeek || null,
          source: 'guest-embedded',
        });

        // Clean embedded weeks from guest doc; set currentWeekId if missing
        const cleanupUpdate: Record<string, any> = {
          currentWeek: admin.firestore.FieldValue.delete(),
          previousWeek: admin.firestore.FieldValue.delete(),
          nextWeek: admin.firestore.FieldValue.delete(),
        };

        if (!guest.currentWeekId && guest.currentWeek?.startDate) {
          cleanupUpdate.currentWeekId = `${guestId}_${getWeekStart(guest.currentWeek.startDate)}`;
          cleanupUpdate.currentWeekStartDate = getWeekStart(guest.currentWeek.startDate);
        }

        await guestDoc.ref.update(cleanupUpdate);
      } else {
        // Dry-run: count but don't write
        this.stats.activitiesCreated += allActivities.length;
        this.stats.summariesCreated += summaries.size;
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
```

### Step 2: Test with dry-run

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=guests 2>&1 | head -50
```

Expected: Phase 2 runs, lists each guest with embedded week data, shows activity/summary counts.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): implement phase 2 — guest embedded week migration"
```

---

## Task 6: Implement Phase 3 — Standalone Weeks collection migration

**Files:**
- Modify: `scripts/migrate-full.ts` (replace `phase3Weeks` stub)

### Step 1: Replace the `phase3Weeks` stub

Find:
```typescript
private async phase3Weeks(): Promise<void>  { console.log('[Phase 3] Weeks — TODO'); }
```

Replace with:

```typescript
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

    try {
      // Idempotency check: look for existing activities for this guest+week window
      const weekStart = getWeekStart(week.startDate);
      const windowStart = admin.firestore.Timestamp.fromDate(new Date(weekStart));
      const windowEnd = admin.firestore.Timestamp.fromDate(new Date(getWeekEnd(weekStart) + 'T23:59:59'));

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
        houseId: guestData.houseId || week.houseId || '',
        userId: guestData.userId || week.userId || guestId,
      };

      console.log(`  [${weekId}] guest=${guestId}, week=${week.startDate}`);
      const { activities, summaryId, summary } = this.migrateWeekData(guestCtx, week);
      console.log(`    → ${activities.length} activities, 1 summary`);

      if (!this.dryRun) {
        await this.writeActivitiesInBatches(activities);
        await this.writeSummary(summaryId, summary);

        await this.archiveWeekData({
          guestId,
          weekDocId: weekId,
          weekData: week,
          source: 'weeks-collection',
        });
      } else {
        this.stats.activitiesCreated += activities.length;
        this.stats.summariesCreated++;
      }

      this.stats.weeksProcessed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.stats.errors.push({ collection: 'weeks', docId: weekId, error: msg });
      console.error(`  [${weekId}] ERROR: ${msg}`);
    }
  }

  console.log(`\nPhase 3 complete: ${this.stats.weeksProcessed} processed, ${this.stats.weeksSkipped} skipped.\n`);
}
```

### Step 2: Test with dry-run

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=weeks 2>&1 | head -40
```

Expected: Phase 3 runs, lists week documents, shows skipped (already migrated) vs. processed.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): implement phase 3 — standalone weeks collection migration"
```

---

## Task 7: Implement Phase 4 — Houses houseType backfill

**Files:**
- Modify: `scripts/migrate-full.ts` (replace `phase4Houses` stub)

### Step 1: Replace the `phase4Houses` stub

Find:
```typescript
private async phase4Houses(): Promise<void> { console.log('[Phase 4] Houses — TODO'); }
```

Replace with:

```typescript
private async phase4Houses(): Promise<void> {
  console.log('--- Phase 4: Houses houseType Backfill ---\n');

  const snapshot = await this.db.collection('houses').get();
  console.log(`Found ${snapshot.size} houses.\n`);

  const BATCH_SIZE = 500;
  let batch = this.db.batch();
  let count = 0;
  let updated = 0;

  for (const houseDoc of snapshot.docs) {
    const house = houseDoc.data();

    if (house.houseType !== undefined) continue; // already has field

    console.log(`  [${houseDoc.id}] ${house.name || '(unnamed)'} — backfilling houseType: 'traditional'`);

    if (!this.dryRun) {
      batch.update(houseDoc.ref, { houseType: 'traditional' });
      count++;

      if (count >= BATCH_SIZE) {
        await batch.commit();
        batch = this.db.batch();
        count = 0;
      }
    }

    updated++;
    this.stats.housesUpdated++;
  }

  if (!this.dryRun && count > 0) {
    await batch.commit();
  }

  console.log(`\nPhase 4 complete: ${updated} houses updated.\n`);
}
```

### Step 2: Test with dry-run

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=houses 2>&1
```

Expected: Lists each house missing `houseType`, shows count. No writes.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): implement phase 4 — houses houseType backfill"
```

---

## Task 8: Implement `validate` command

**Files:**
- Modify: `scripts/migrate-full.ts` (replace `validate` stub)

### Step 1: Replace the `validate` stub

Find:
```typescript
async function validate(db: admin.firestore.Firestore): Promise<void> {
  console.log('[Validate] TODO');
}
```

Replace with:

```typescript
async function validate(db: admin.firestore.Firestore): Promise<void> {
  console.log('='.repeat(62));
  console.log('  Post-Migration Validation');
  console.log('='.repeat(62) + '\n');

  let passed = 0;
  let failed = 0;

  // --- Check 1: No guest docs with embedded weeks ---
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

  // --- Check 2: All guests have activities (basic check — only active guests) ---
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
      console.log(`WARN  ${missingActivities} active guests have no activities (may be new users)`);
    }
  }

  // --- Check 3: All houses have houseType ---
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

  // --- Check 4: archived-weeks exists ---
  {
    const archiveSnapshot = await db.collection('archived-weeks').limit(1).get();
    if (!archiveSnapshot.empty) {
      console.log('PASS  archived-weeks collection has records');
      passed++;
    } else {
      console.log('WARN  archived-weeks collection is empty (ok if no weeks were migrated)');
    }
  }

  // --- Summary ---
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
```

### Step 2: Test validate command

```bash
cd scripts && ts-node migrate-full.ts validate 2>&1
```

Expected: Runs 4 checks, prints PASS/FAIL/WARN for each, prints final result.

### Step 3: Commit

```bash
git add scripts/migrate-full.ts
git commit -m "feat(migration): implement validate command with 4 post-migration checks"
```

---

## Task 9: Add `full:*` scripts to `scripts/package.json` and do final dry-run

**Files:**
- Modify: `scripts/package.json` (already done in Task 1 — verify it's correct)

### Step 1: Run complete dry-run across all phases

```bash
cd scripts && ts-node migrate-full.ts dry-run 2>&1
```

Expected:
- All 4 phases run
- Counts shown for each phase
- No TypeScript errors
- Summary table at end

### Step 2: Verify phase flag works

```bash
cd scripts && ts-node migrate-full.ts dry-run --phase=houses 2>&1
```

Expected: Only Phase 4 runs.

### Step 3: Commit final state

```bash
git add scripts/migrate-full.ts scripts/package.json
git commit -m "feat(migration): complete migrate-full.ts — 4-phase Firebase Admin SDK migration"
```

---

## Running the Migration (Checklist)

Before running `execute`:

1. Create a Firestore backup in the Firebase console
2. Run `ts-node migrate-full.ts dry-run` and review output carefully
3. Confirm counts look reasonable (# guests, # weeks, etc.)
4. Run `ts-node migrate-full.ts execute` — type `EXECUTE` when prompted
5. Run `ts-node migrate-full.ts validate` — should show all PASS
6. Verify in Firebase console: check `activities`, `week-summaries`, `archived-weeks` collections
7. Test the app manually

---

## Credentials

The script looks for credentials in this order:
1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable
2. `scripts/service-key.json` (already exists in the repo)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-key.json"
# or just ensure scripts/service-key.json is present
```
