# Full User Model Migration Design

**Date:** 2026-02-19
**Branch:** v2/clean-architecture
**Status:** Approved

## Overview

A standalone Firebase Admin SDK migration script (`scripts/migrate-full.ts`) that performs a complete migration of all user-related data from the legacy model to the new data architecture.

## Problem

The app is transitioning from an embedded Week/Day model to a normalized Activity-based model:

- **Legacy:** Guest documents contain embedded `currentWeek`/`previousWeek`/`nextWeek` objects with Day-level stats
- **New:** Separate `activities` and `week-summaries` collections; Guest documents hold only a `currentWeekId` reference

In addition, User documents may have stale role flags (e.g., `isGuest: true` but no Guest document), and House documents are missing the new `houseType` field.

The existing `scripts/migrate-admin.ts` handles only Guest embedded weeks, uses React Native Firebase imports in places, and doesn't cover Users, standalone Weeks, or Houses.

## Solution

A new `scripts/migrate-full.ts` — self-contained, uses only `firebase-admin` (no React Native Firebase), and covers 4 phases.

## Architecture

### File Location

```
scripts/
  migrate-full.ts     ← NEW (full migration)
  migrate-admin.ts    ← existing (kept, handles guest weeks only)
  run-migration.ts    ← existing (kept, wraps RN Firebase version)
```

### Class Structure

```typescript
class FullMigrator {
  run(options)          // orchestrate all phases
  runPhase1Users()      // normalize User documents
  runPhase2Guests()     // migrate embedded week data
  runPhase3Weeks()      // migrate standalone weeks collection
  runPhase4Houses()     // backfill houseType field
}
```

### CLI Interface

```
ts-node migrate-full.ts dry-run [--phase=users|guests|weeks|houses]
ts-node migrate-full.ts execute       # requires typing "EXECUTE" to confirm
ts-node migrate-full.ts validate      # post-migration integrity checks
```

## Phase Details

### Phase 1: User Normalization

**Collection:** `users`

For each User document:
- Verify `guestId` exists in `guests` collection
  - If `isGuest: true` but no guest doc → set `isGuest: false, guestId: ''`
- Verify `adminId` exists in `admins` collection
  - If `isAdmin: true` but no admin doc → set `isAdmin: false, adminId: ''`
- Ensure document ID matches `uid` field
- Clean stale `potentialGuest`/`potentialSuperAdmin` flags if already promoted

**Output:** Updated User documents with consistent role flags.

### Phase 2: Guest Embedded Week Migration

**Collection:** `guests` (those with `currentWeek`, `previousWeek`, or `nextWeek` fields)

For each Guest with embedded week data:
1. Convert each Day in each embedded Week into individual Activity documents:
   - `choreCompleted` → `ActivityType.CHORE`
   - `meeting[]` → `ActivityType.MEETING` (one per meeting)
   - `hoursWorked{}` → `ActivityType.WORK` (one per job/day)
   - `medication` → `ActivityType.MEDICATION`
   - `metPrimarySupporter` → `ActivityType.PRIMARY_SUPPORTER`
2. Create/update `WeekSummary` documents with aggregated stats
3. Archive original week data to `archived-weeks` collection
4. Remove embedded week fields from Guest document
5. Set `currentWeekId` and `currentWeekStartDate` if not set

**Idempotency:** Skips if activity documents for that guest+week already exist.

**Output:** Activities in `activities/`, summaries in `week-summaries/`, originals in `archived-weeks/`.

### Phase 3: Standalone Weeks Collection Migration

**Collection:** `weeks`

Same logic as Phase 2 but for standalone Week documents.
- Checks for duplicate activities before creating
- Archives original Week documents to `archived-weeks`

### Phase 4: Houses houseType Backfill

**Collection:** `houses`

For each House document missing `houseType`:
- Set `houseType: 'traditional'`

Simple field update, no archiving needed.

## Safety Features

| Feature | Implementation |
|---------|---------------|
| Dry-run mode | No writes; full preview with counts |
| Archiving | Original data backed up before deletion |
| Idempotency | Check for existing data before creating |
| Error isolation | Per-document try/catch; one failure doesn't stop phase |
| Batching | Firestore 500-op batch limit respected |
| Confirmation | `execute` requires typing "EXECUTE" |
| Stats | Shared `MigrationStats` across all 4 phases |

## Migration Stats Tracked

```typescript
interface MigrationStats {
  // Phase 1 - Users
  usersChecked: number;
  usersUpdated: number;
  // Phase 2 - Guests
  guestsProcessed: number;
  guestsSkipped: number;
  // Phase 3 - Weeks
  weeksProcessed: number;
  weeksSkipped: number;
  // Shared
  activitiesCreated: number;
  summariesCreated: number;
  itemsArchived: number;
  // Phase 4 - Houses
  housesUpdated: number;
  // Errors
  errors: Array<{ collection: string; docId: string; error: string }>;
  // Timing
  startTime: Date;
  endTime?: Date;
  durationSeconds?: number;
}
```

## Validate Command

Post-migration checks:
- Users: role flags are consistent with actual Guest/Admin docs
- Guests: no embedded week data remaining
- Activities: all guests that had week data now have activities
- WeekSummaries: all guests that had week data now have summaries
- Houses: all docs have `houseType` field

## Implementation Plan

See `docs/plans/2026-02-19-full-migration-plan.md` (written next via writing-plans skill).
