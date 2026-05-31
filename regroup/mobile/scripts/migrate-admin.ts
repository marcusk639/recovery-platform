#!/usr/bin/env ts-node
/**
 * Server-Side Database Migration Script
 * Uses Firebase Admin SDK (not React Native Firebase)
 *
 * This script runs in Node.js and can execute independently.
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

// Migration statistics
interface MigrationStats {
  guestsProcessed: number;
  guestsSkipped: number;
  activitiesCreated: number;
  summariesCreated: number;
  guestsArchived: number;
  errors: Array<{ guestId: string; error: string }>;
  startTime: Date;
  endTime?: Date;
  durationSeconds?: number;
}

// Activity types
enum ActivityType {
  CHORE = 'chore',
  MEETING = 'meeting',
  WORK = 'work',
  MEDICATION = 'medication',
  PRIMARY_SUPPORTER = 'primary_supporter',
}

// Initialize Firebase Admin
function initializeFirebase(serviceAccountPath?: string) {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let serviceAccount;

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } else {
    console.error('❌ No Firebase credentials found!');
    console.error('\nPlease either:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.error('  2. Pass credentials path as argument');
    console.error('\nExample:');
    console.error('  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"');
    console.error('  ts-node migrate-admin.ts dry-run\n');
    process.exit(1);
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Helper: Get week start date
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

// Helper: Get week end date
function getWeekEnd(startDate: string): string {
  const d = new Date(startDate);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

// Helper: Parse meeting time
function parseMeetingTime(dateStr: string, timeStr?: string): Date {
  const date = new Date(dateStr);

  if (!timeStr) {
    date.setHours(19, 0, 0, 0);
    return date;
  }

  const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

    if (timeStr.toLowerCase().includes('pm') && hours < 12) {
      hours += 12;
    }

    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  date.setHours(19, 0, 0, 0);
  return date;
}

// Main migration function
async function runMigration(dryRun: boolean = true): Promise<MigrationStats> {
  console.log('═'.repeat(60));
  console.log('  RATS Database Migration: Week/Day → Activity Model');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no commits)' : 'LIVE MIGRATION'}`);
  console.log('═'.repeat(60) + '\n');

  const stats: MigrationStats = {
    guestsProcessed: 0,
    guestsSkipped: 0,
    activitiesCreated: 0,
    summariesCreated: 0,
    guestsArchived: 0,
    errors: [],
    startTime: new Date(),
  };

  const db = admin.firestore();

  try {
    // Get all guests
    const guestsSnapshot = await db.collection('guests').get();
    console.log(`📊 Found ${guestsSnapshot.size} guests to migrate\n`);

    for (const guestDoc of guestsSnapshot.docs) {
      const guest = guestDoc.data();
      const guestId = guestDoc.id;

      try {
        console.log(`\n👤 Processing: ${guest.firstName} ${guest.lastName} (${guestId})`);

        // Skip if no week data
        if (!guest.currentWeek && !guest.previousWeek && !guest.nextWeek) {
          console.log(`   ⏭️  Skipped - No week data`);
          stats.guestsSkipped++;
          continue;
        }

        const activities: any[] = [];
        const weekSummaries: Map<string, any> = new Map();

        // Migrate currentWeek
        if (guest.currentWeek) {
          console.log(`   📅 Migrating currentWeek: ${guest.currentWeek.startDate}`);
          await migrateWeek(guest, guest.currentWeek, activities, weekSummaries, stats);
        }

        // Migrate previousWeek
        if (guest.previousWeek) {
          console.log(`   📅 Migrating previousWeek: ${guest.previousWeek.startDate}`);
          await migrateWeek(guest, guest.previousWeek, activities, weekSummaries, stats);
        }

        // Migrate nextWeek
        if (guest.nextWeek) {
          console.log(`   📅 Migrating nextWeek: ${guest.nextWeek.startDate}`);
          await migrateWeek(guest, guest.nextWeek, activities, weekSummaries, stats);
        }

        if (!dryRun) {
          // Write activities
          const batch = db.batch();
          for (const activity of activities) {
            const ref = db.collection('activities').doc();
            batch.set(ref, activity);
          }
          await batch.commit();

          // Write week summaries
          const summaryBatch = db.batch();
          for (const [id, summary] of weekSummaries.entries()) {
            const ref = db.collection('week-summaries').doc(id);
            summaryBatch.set(ref, summary);
          }
          await summaryBatch.commit();

          // Archive old data
          await db.collection('archived-weeks').add({
            guestId,
            guestName: `${guest.firstName} ${guest.lastName}`,
            currentWeek: guest.currentWeek || null,
            previousWeek: guest.previousWeek || null,
            nextWeek: guest.nextWeek || null,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          stats.guestsArchived++;

          // Clean up guest document
          await db.doc(`guests/${guestId}`).update({
            currentWeek: admin.firestore.FieldValue.delete(),
            previousWeek: admin.firestore.FieldValue.delete(),
            nextWeek: admin.firestore.FieldValue.delete(),
          });
        }

        // Count summaries (even in dry-run)
        stats.summariesCreated += weekSummaries.size;

        console.log(`   ✅ Success: ${activities.length} activities, ${weekSummaries.size} summaries`);
        stats.guestsProcessed++;

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ Failed: ${errorMsg}`);
        stats.errors.push({ guestId, error: errorMsg });
      }
    }

    stats.endTime = new Date();
    stats.durationSeconds = (stats.endTime.getTime() - stats.startTime.getTime()) / 1000;

    printSummary(stats, dryRun);

    return stats;
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Migrate a single week
async function migrateWeek(
  guest: any,
  week: any,
  activities: any[],
  weekSummaries: Map<string, any>,
  stats: MigrationStats
): Promise<void> {
  const weekStart = getWeekStart(week.startDate);
  const weekEnd = getWeekEnd(weekStart);
  const summaryId = `${guest.id}_${weekStart}`;

  // Initialize week summary
  if (!weekSummaries.has(summaryId)) {
    weekSummaries.set(summaryId, {
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
    });
  }

  const summary = weekSummaries.get(summaryId)!;

  // Process each day
  const days = week.days || {};
  for (const [dateStr, day] of Object.entries(days) as [string, any][]) {
    if (!day || typeof day !== 'object') continue;

    const dayDate = new Date(dateStr);

    // Initialize daily stats
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

    const dailyStats = summary.dailyStats[dateStr];

    // 1. Chore completion
    if (day.choreCompleted) {
      activities.push({
        guestId: guest.id,
        houseId: guest.houseId || '',
        type: ActivityType.CHORE,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(dayDate.setHours(12, 0, 0, 0))),
        data: {
          type: 'chore',
          choreType: 'daily',
          choreName: week.chore?.name || 'House Chore',
        },
        loggedBy: guest.userId || guest.id,
        loggedAt: admin.firestore.Timestamp.fromDate(new Date(dateStr)),
        verified: true,
        status: 'active',
      });
      summary.stats.choresCompleted++;
      dailyStats.choresCompleted++;
      summary.activityCount++;
      stats.activitiesCreated++;
    }

    // 2. Meetings
    if (day.meeting && Array.isArray(day.meeting)) {
      for (const meeting of day.meeting) {
        const meetingTime = parseMeetingTime(dateStr, meeting.time);
        activities.push({
          guestId: guest.id,
          houseId: guest.houseId || '',
          type: ActivityType.MEETING,
          timestamp: admin.firestore.Timestamp.fromDate(meetingTime),
          data: {
            type: 'meeting',
            meetingName: meeting.name || 'Meeting',
            meetingType: meeting.type || 'General',
            duration: 60,
            meetingId: meeting.id,
            location: meeting.locationName,
          },
          loggedBy: guest.userId || guest.id,
          loggedAt: admin.firestore.Timestamp.fromDate(new Date(dateStr)),
          verified: true,
          status: 'active',
        });
        summary.stats.meetingsAttended++;
        dailyStats.meetingsAttended++;
        summary.activityCount++;
        stats.activitiesCreated++;
      }
    }

    // 3. Work hours
    if (day.hoursWorked && typeof day.hoursWorked === 'object') {
      for (const [jobName, hours] of Object.entries(day.hoursWorked) as [string, number][]) {
        if (hours > 0) {
          activities.push({
            guestId: guest.id,
            houseId: guest.houseId || '',
            type: ActivityType.WORK,
            timestamp: admin.firestore.Timestamp.fromDate(new Date(dayDate.setHours(17, 0, 0, 0))),
            data: {
              type: 'work',
              jobName,
              hoursWorked: hours,
            },
            loggedBy: guest.userId || guest.id,
            loggedAt: admin.firestore.Timestamp.fromDate(new Date(dateStr)),
            verified: true,
            status: 'active',
          });
          summary.stats.hoursWorked += hours;
          dailyStats.hoursWorked += hours;
          summary.activityCount++;
          stats.activitiesCreated++;
        }
      }
    }

    // 4. Medication
    if (day.medication) {
      activities.push({
        guestId: guest.id,
        houseId: guest.houseId || '',
        type: ActivityType.MEDICATION,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(dayDate.setHours(8, 0, 0, 0))),
        data: {
          type: 'medication',
        },
        loggedBy: guest.userId || guest.id,
        loggedAt: admin.firestore.Timestamp.fromDate(new Date(dateStr)),
        verified: true,
        status: 'active',
      });
      summary.stats.medicationTaken++;
      dailyStats.medicationTaken++;
      summary.activityCount++;
      stats.activitiesCreated++;
    }

    // 5. Primary supporter
    if (day.metPrimarySupporter) {
      activities.push({
        guestId: guest.id,
        houseId: guest.houseId || '',
        type: ActivityType.PRIMARY_SUPPORTER,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(dayDate.setHours(15, 0, 0, 0))),
        data: {
          type: 'primary_supporter',
          supporterId: week.primarySupporterId || '',
          supporterName: week.primarySupporterName || 'Primary Supporter',
        },
        loggedBy: guest.userId || guest.id,
        loggedAt: admin.firestore.Timestamp.fromDate(new Date(dateStr)),
        verified: true,
        status: 'active',
      });
      summary.stats.primarySupporterMet++;
      dailyStats.primarySupporterMet++;
      summary.activityCount++;
      stats.activitiesCreated++;
    }
  }
}

// Print summary
function printSummary(stats: MigrationStats, dryRun: boolean): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 MIGRATION SUMMARY');
  console.log('═'.repeat(60));

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes committed to database');
  }

  console.log(`\n✅ Guests processed:     ${stats.guestsProcessed}`);
  console.log(`⏭️  Guests skipped:       ${stats.guestsSkipped}`);
  console.log(`📝 Activities created:   ${stats.activitiesCreated}`);
  console.log(`📊 Summaries created:    ${stats.summariesCreated}`);
  console.log(`💾 Guests archived:      ${stats.guestsArchived}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors: ${stats.errors.length}`);
    stats.errors.forEach(({ guestId, error }) => {
      console.log(`   - ${guestId}: ${error}`);
    });
  }

  if (stats.durationSeconds) {
    console.log(`\n⏱️  Duration: ${stats.durationSeconds.toFixed(2)}s`);
  }

  console.log('\n' + '═'.repeat(60));

  if (dryRun) {
    console.log('✨ Run with "execute" command to execute migration');
  } else {
    console.log('✨ Migration complete!');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'dry-run';
  const credentialsPath = args[1];

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   RATS Database Migration: Week/Day → Activity Model        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize Firebase
  initializeFirebase(credentialsPath);

  try {
    switch (command) {
      case 'dry-run':
        console.log('Running DRY RUN...\n');
        await runMigration(true);
        console.log('\nTo execute for real, run:');
        console.log('  ts-node migrate-admin.ts execute\n');
        break;

      case 'execute':
        console.log('⚠️  WARNING: This will modify your production database!\n');
        console.log('Are you sure you want to proceed? (yes/no): ');

        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          readline.question('', (ans: string) => {
            readline.close();
            resolve(ans.trim().toLowerCase());
          });
        });

        if (answer !== 'yes') {
          console.log('\n❌ Migration cancelled.\n');
          process.exit(0);
        }

        console.log('\n🚀 Executing migration...\n');
        await runMigration(false);
        break;

      default:
        console.log('Unknown command:', command);
        console.log('\nUsage:');
        console.log('  ts-node migrate-admin.ts dry-run [credentials-path]');
        console.log('  ts-node migrate-admin.ts execute [credentials-path]');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run
main();
