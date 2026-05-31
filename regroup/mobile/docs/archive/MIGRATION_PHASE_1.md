# Phase 1: Data Model Consolidation - Database Migration Documentation

## ⚠️ IMPORTANT: DO NOT EXECUTE WITHOUT APPROVAL

This document describes the database migrations required for Phase 1 of the application refactoring.
These migrations should be reviewed and approved before execution.

## Overview

Phase 1 consolidates the Activity entity and standardizes field naming across the database.
The application code has been updated to support both old and new field names during the transition period.

---

## Migration 1.1: Activity Entity Field Standardization

### Summary
Standardize Activity collection field names from legacy patterns to modern conventions.

### Affected Collection
- `activities`

### Field Changes

| Old Field Name | New Field Name | Type | Notes |
|----------------|----------------|------|-------|
| `residentId` | `guestId` | string | Core entity reference rename |
| `createdDate` | `createdAt` | string (ISO) | Timestamp standardization |
| `modifiedDate` | `updatedAt` | string (ISO) | Timestamp standardization |

### Migration Strategy

**Approach**: Dual-write strategy (zero-downtime migration)

1. **Phase A: Add new fields alongside old** (Completed in code)
   - Application writes to both `residentId` AND `guestId`
   - Application reads `guestId` first, falls back to `residentId`
   - No database migration needed yet

2. **Phase B: Database backfill** (This migration)
   - Copy `residentId` → `guestId` for all documents
   - Copy `createdDate` → `createdAt` for all documents
   - Copy `modifiedDate` → `updatedAt` for all documents
   - Original fields remain for rollback safety

3. **Phase C: Drop old fields** (Future migration, after verification)
   - Remove `residentId`, `createdDate`, `modifiedDate` fields
   - Only after confirming Phase B successful

### Firestore Migration Script (Pseudocode)

```javascript
/**
 * Migration: Activity Field Standardization
 * Estimated time: ~1 minute per 10,000 documents
 * Safe to run multiple times (idempotent)
 */

const firestore = admin.firestore();
const activitiesRef = firestore.collection('activities');

async function migrateActivityFields() {
  console.log('Starting Activity field migration...');

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Process in batches of 500 (Firestore batch limit)
  const batchSize = 500;
  let lastDoc = null;

  while (true) {
    // Build query
    let query = activitiesRef.orderBy('__name__').limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      break; // No more documents
    }

    const batch = firestore.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};
      let needsUpdate = false;

      // Migrate residentId → guestId
      if (data.residentId && !data.guestId) {
        updates.guestId = data.residentId;
        needsUpdate = true;
      }

      // Migrate createdDate → createdAt
      if (data.createdDate && !data.createdAt) {
        updates.createdAt = data.createdDate;
        needsUpdate = true;
      }

      // Migrate modifiedDate → updatedAt
      if (data.modifiedDate && !data.updatedAt) {
        updates.updatedAt = data.modifiedDate;
        needsUpdate = true;
      }

      // Ensure timestamp is ISO string format
      if (data.timestamp && typeof data.timestamp.toDate === 'function') {
        updates.timestamp = data.timestamp.toDate().toISOString();
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(doc.ref, updates);
        batchCount++;
      } else {
        skippedCount++;
      }

      lastDoc = doc;
    }

    if (batchCount > 0) {
      try {
        await batch.commit();
        migratedCount += batchCount;
        console.log(`Migrated ${migratedCount} documents, skipped ${skippedCount}`);
      } catch (error) {
        errorCount += batchCount;
        console.error(`Batch commit failed:`, error);
        // Continue with next batch
      }
    }

    if (snapshot.docs.length < batchSize) {
      break; // Last batch
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`- Migrated: ${migratedCount}`);
  console.log(`- Skipped: ${skippedCount}`);
  console.log(`- Errors: ${errorCount}`);

  return { migratedCount, skippedCount, errorCount };
}

// Execute migration
migrateActivityFields()
  .then(result => {
    console.log('Migration successful:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

### Rollback Plan

If issues are discovered after migration:

1. Application code already supports reading old fields
2. No old fields were deleted, only new fields added
3. Rollback: Deploy previous application version
4. Database: No rollback needed (old fields still exist)

### Verification Queries

```javascript
// Check migration progress
db.collection('activities')
  .where('residentId', '!=', null)
  .where('guestId', '==', null)
  .count();
// Should return 0 after migration

// Verify data integrity
db.collection('activities')
  .limit(100)
  .get()
  .then(snapshot => {
    snapshot.forEach(doc => {
      const data = doc.data();
      console.assert(data.guestId === data.residentId,
        `Mismatch in ${doc.id}: guestId=${data.guestId}, residentId=${data.residentId}`);
    });
  });
```

---

## Migration 1.2: DailyActivitySummary Field Standardization

### Summary
Update pre-aggregated activity summary documents to use `guestId` instead of `residentId`.

### Affected Collections
- `daily-activity-summaries` (if exists)
- `weekly-activity-summaries` (if exists)

### Field Changes

| Old Field Name | New Field Name |
|----------------|----------------|
| `residentId` | `guestId` |

### Migration Script

Same pattern as Activity migration above, applied to summary collections.

---

## Migration 1.3: Week Summary Field Updates

### Summary
Ensure week summary documents reference guests consistently.

### Affected Collections
- `week-summaries`

### Changes
- Ensure all documents use `guestId` field
- No migration needed if collection created after refactor

---

## Timeline and Execution Plan

### Pre-Migration Checklist
- [ ] Deploy application code with dual-write support
- [ ] Monitor error rates for 24 hours
- [ ] Create database backup
- [ ] Test migration script on staging environment
- [ ] Verify rollback procedure

### Migration Execution
1. **Maintenance window**: Not required (zero-downtime)
2. **Execute migration**: Run Firestore migration script
3. **Monitor**: Watch for errors during migration
4. **Verify**: Run verification queries
5. **Validate**: Test application functionality

### Post-Migration
1. Monitor application logs for 48 hours
2. Verify no errors accessing activities
3. Check weekly reports generation
4. Schedule Phase C (field removal) for 2 weeks later

---

## Impact Assessment

### User Impact
- **During migration**: None (dual-read strategy)
- **After migration**: None (backward compatible)

### Performance Impact
- **Migration duration**: ~1 minute per 10,000 documents
- **Application performance**: No degradation
- **Database size**: Temporary increase (duplicate fields)

### Risk Level
- **Data loss risk**: LOW (additive only, no deletions)
- **Downtime risk**: NONE (zero-downtime migration)
- **Rollback complexity**: LOW (old fields preserved)

---

## Monitoring and Alerts

### Metrics to Watch
1. Activity read/write error rates
2. Migration script progress
3. Database query performance
4. Application error logs

### Alert Conditions
- Migration script errors > 1%
- Activity query failures spike
- Application error rate increases

---

## Success Criteria

Migration is considered successful when:
- [ ] 100% of Activity documents have `guestId` field
- [ ] All `guestId` values match `residentId` values
- [ ] Application functions normally with new fields
- [ ] No increase in error rates
- [ ] All verification queries pass

---

## Additional Notes

### Code Changes Complete
- ✅ ActivityModel.ts: Canonical source with modern fields
- ✅ Activity.tsx: Backward compatibility with legacy fields
- ✅ ActivityTypes.tsx: Wrapper classes updated
- ✅ activity.ts service: Uses modern ActivityModel
- ✅ Legacy code: Supports both residentId and guestId via getters/setters

### Next Steps After This Migration
1. Phase 1.2: Standardize ID fields across all entities
2. Phase 1.3: Standardize date fields (createdAt/updatedAt)
3. Phase 1.4: Fix Message entity type safety
4. Phase 1.5: Remove Guest denormalization

---

**Document Version**: 1.0
**Last Updated**: 2026-02-04
**Status**: Ready for Review
**Requires Approval From**: Tech Lead, Database Admin
