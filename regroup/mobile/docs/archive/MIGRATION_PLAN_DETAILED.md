# Detailed Migration Plan: Week/Day → Activity System

**Date:** February 15, 2026
**Estimated Duration:** 2-3 weeks
**Risk Level:** Medium (mitigated with dual-write strategy)

---

## 📊 Executive Summary

**Files to Migrate:** 25 files
**Lines of Code Affected:** ~2,000-3,000 LOC
**Strategy:** Iterative replacement with dual-write safety net
**Rollback Plan:** Keep Week/Day code until migration validated

---

## 🎯 Migration Goals

1. ✅ Replace all `guest.currentWeek`, `guest.previousWeek` references
2. ✅ Replace Week/Day entities with Activity queries
3. ✅ Update UI components to use new data sources
4. ✅ Maintain backward compatibility during transition
5. ✅ Validate data integrity through migration
6. ✅ Remove legacy code after successful migration

---

## 📁 File Inventory & Categorization

### Category 1: Core Entities (2 files) - **Priority: HIGH**
```
src/entities/Guest.tsx                  # Remove currentWeek, previousWeek, nextWeek
src/entities/Week.tsx                   # To be deprecated
```

### Category 2: Hooks (2 files) - **Priority: CRITICAL**
```
src/hooks/useStatSummary.ts            # Core hook used by 5+ screens
src/hooks/useBaseActivityScreen.ts     # Base logic for activity screens
```

### Category 3: UI Components - Guest Summaries (5 files) - **Priority: HIGH**
```
src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx
src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx ← YOU ARE HERE
src/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx
src/screens/GuestMeetingOverview/GuestMeetingSummary/GuestMeetingSummary.tsx
src/screens/GuestMedicationOverview/GuestMedicationSummary/GuestMedicationSummary.tsx
```

### Category 4: UI Components - Other (4 files) - **Priority: MEDIUM**
```
src/screens/BaseStatSummary/BaseStatSummary.tsx
src/screens/Activity/ActivityScreen.tsx
src/screens/Disputes/Disputes.tsx
src/screens/Profile/ProfileUpdate.tsx
```

### Category 5: Services (4 files) - **Priority: HIGH**
```
src/services/guest.tsx                 # Guest CRUD operations
src/services/weeks.tsx                 # Week operations (to deprecate)
src/services/weeklyreport.ts          # Weekly report generation
src/services/migration.ts             # Migration utilities
```

### Category 6: State Management (2 files) - **Priority: HIGH**
```
src/state/queries/activityQueries.ts  # Already partially migrated?
src/state/slices/reportsSlice.ts     # Weekly reports slice
```

### Category 7: Utilities (6 files) - **Priority: MEDIUM**
```
src/util/guest.tsx                    # Guest utility functions
src/util/week.ts                      # Week utilities (to deprecate)
src/util/statHelpers.ts              # Stat calculation helpers
src/util/display.tsx                  # Display utilities
src/constants/activities.tsx         # Activity constants
src/screens/StatUpdates/DayTimeWidget.tsx
src/screens/StatUpdates/MeetingSearch/useMeetingSearch.ts
```

---

## 🚀 Phase-by-Phase Migration Strategy

### **Phase 0: Preparation (2-3 days)**

#### Tasks:
1. **Create Activity Query Hooks**
   ```typescript
   // src/hooks/useActivityStats.ts
   export function useActivityStats(guestId: string, startDate: string, endDate: string) {
     const [stats, setStats] = useState(null);
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       const unsubscribe = subscribeToActivities({
         guestId,
         startDate,
         endDate,
         onUpdate: (activities) => {
           const aggregated = aggregateActivities(activities);
           setStats(aggregated);
           setLoading(false);
         }
       });

       return unsubscribe;
     }, [guestId, startDate, endDate]);

     return { stats, loading };
   }
   ```

2. **Create Migration Toggle**
   ```typescript
   // src/config/featureFlags.ts
   export const FEATURE_FLAGS = {
     USE_ACTIVITY_SYSTEM: true, // Toggle for gradual rollout
     DUAL_WRITE_ENABLED: true,  // Write to both systems during migration
   };
   ```

3. **Set up Dual-Write System**
   ```typescript
   // Modify existing stat update functions to write to both systems
   async function logChore(guestId: string, houseId: string) {
     if (FEATURE_FLAGS.DUAL_WRITE_ENABLED) {
       // Write to Activity system (new)
       await logActivity(guestId, houseId, { type: 'chore', ... });

       // Write to Week/Day system (old)
       await updateGuestWeek(guestId, { choreCompleted: true });
     } else if (FEATURE_FLAGS.USE_ACTIVITY_SYSTEM) {
       await logActivity(guestId, houseId, { type: 'chore', ... });
     } else {
       await updateGuestWeek(guestId, { choreCompleted: true });
     }
   }
   ```

**Deliverable:** Activity hooks ready, dual-write configured, feature flags in place

---

### **Phase 1: Core Hooks Migration (3-4 days)**

#### 1.1: Migrate `useStatSummary` Hook

**Current Implementation (Lines 57-61):**
```typescript
const statSum = useMemo(() => {
  if (!guest?.currentWeek) return 0;
  return sumStat(guest.currentWeek, stat);
}, [guest?.currentWeek, stat]);
```

**New Implementation:**
```typescript
const statSum = useMemo(() => {
  if (!weekSummary) return 0;

  const statMap: Record<Stat, keyof WeekStats> = {
    choreCompleted: 'choresCompleted',
    meeting: 'meetingsAttended',
    hoursWorked: 'hoursWorked',
    medication: 'medicationTaken',
    metPrimarySupporter: 'primarySupporterMet',
  };

  return weekSummary.stats[statMap[stat]] || 0;
}, [weekSummary, stat]);
```

**Full Hook Migration:**
```typescript
// src/hooks/useStatSummary.ts (NEW VERSION)
import { useWeekSummary } from './useWeekSummary';
import { useActivities } from './useActivities';

export const useStatSummary = (stat: Stat): StatSummaryData => {
  const guest = useAppSelector((state: any) => state.guests.selectedGuest);
  const house = useAppSelector((state: any) => state.houses.selectedHouse);
  const user = useAppSelector((state: any) => state.user.user);

  // NEW: Get current week dates
  const { startDate, endDate } = getCurrentWeekDates();

  // NEW: Subscribe to week summary
  const { summary: weekSummary, loading: summaryLoading } = useWeekSummary(
    guest?.id,
    house?.id,
    startDate
  );

  // NEW: Subscribe to activities for disputes
  const { activities, loading: activitiesLoading } = useActivities({
    guestId: guest?.id,
    startDate,
    endDate,
  });

  // Calculate stat sum from week summary
  const statSum = useMemo(() => {
    if (!weekSummary) return 0;
    const statMap: Record<Stat, keyof WeekStats> = {
      choreCompleted: 'choresCompleted',
      meeting: 'meetingsAttended',
      hoursWorked: 'hoursWorked',
      medication: 'medicationTaken',
      metPrimarySupporter: 'primarySupporterMet',
    };
    return weekSummary.stats[statMap[stat]] || 0;
  }, [weekSummary, stat]);

  // Calculate disputes from activities
  const disputes = useMemo(() => {
    if (!activities) return 0;

    const typeMap: Record<Stat, ActivityType[]> = {
      meeting: ['meeting'],
      medication: ['medication'],
      metPrimarySupporter: ['primary_supporter'],
      hoursWorked: ['work'],
      choreCompleted: ['chore'],
    };

    return activities.filter(
      (activity) =>
        activity.status === 'DISPUTED' &&
        typeMap[stat].includes(activity.type)
    ).length;
  }, [activities, stat]);

  // ... rest of hook logic

  return {
    guest,
    house,
    user,
    statSum,
    phaseRule,
    percentage,
    disputes,
    daysRemaining,
    graphData,
    getBarFillColor,
    calculateDisputesFromWeek,
    isLoading: summaryLoading || activitiesLoading,
  };
};
```

**Testing Checklist:**
- [ ] Run unit tests for useStatSummary
- [ ] Verify stats match old system (dual-write validation)
- [ ] Test with empty week (no activities)
- [ ] Test with disputed activities
- [ ] Performance test (check for excessive re-renders)

---

#### 1.2: Create New Activity Hooks

**File:** `src/hooks/useWeekSummary.ts`
```typescript
import { useState, useEffect } from 'react';
import { WeekSummary } from '../entities/WeekSummary';
import { subscribeToWeekSummary } from '../services/activity';

export function useWeekSummary(
  guestId: string | undefined,
  houseId: string | undefined,
  weekStart: string
) {
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!guestId || !houseId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToWeekSummary(
      guestId,
      houseId,
      weekStart,
      (newSummary) => {
        setSummary(newSummary);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guestId, houseId, weekStart]);

  return { summary, loading, error };
}
```

**File:** `src/hooks/useActivities.ts`
```typescript
import { useState, useEffect } from 'react';
import { Activity } from '../entities/ActivityModel';
import { subscribeToGuestActivities } from '../services/activity';

export function useActivities({
  guestId,
  startDate,
  endDate,
  type,
}: {
  guestId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  type?: ActivityType;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!guestId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToGuestActivities(
      guestId,
      (newActivities) => {
        // Filter by date range and type if provided
        let filtered = newActivities;

        if (startDate) {
          filtered = filtered.filter(
            (a) => new Date(a.timestamp) >= new Date(startDate)
          );
        }

        if (endDate) {
          filtered = filtered.filter(
            (a) => new Date(a.timestamp) <= new Date(endDate)
          );
        }

        if (type) {
          filtered = filtered.filter((a) => a.type === type);
        }

        setActivities(filtered);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [guestId, startDate, endDate, type]);

  return { activities, loading, error };
}
```

**Deliverable:** Core hooks migrated and tested

---

### **Phase 2: UI Components Migration (5-7 days)**

#### Migration Template for Each Component

**Example: GuestSupporterSummary.tsx**

**BEFORE (Line 76):**
```typescript
const sponsorName = useMemo(() => {
  if (guest?.currentWeek?.primarySupporterName) {
    return guest.currentWeek.primarySupporterName;
  }
  if (guest?.primarySupporterName) {
    return guest.primarySupporterName;
  }
  return 'No Sponsor Assigned';
}, [guest?.currentWeek?.primarySupporterName, guest?.primarySupporterName]);
```

**AFTER:**
```typescript
const sponsorName = useMemo(() => {
  // Try guest-level property first (current pattern)
  if (guest?.primarySupporterName) {
    return guest.primarySupporterName;
  }

  // Fallback to week summary if needed (future pattern)
  // Note: Week summary doesn't store supporter name, it's on the guest
  // So this simplifies to just checking guest.primarySupporterName

  return 'No Sponsor Assigned';
}, [guest?.primarySupporterName]);
```

**Migration Order:**

1. **GuestChoreOverview/GuestChoreSummary** (Simplest)
   - Just displays chore status
   - Single stat type
   - Good starter component

2. **GuestSupporterSummary** (Medium) ← Current file
   - Uses `useStatSummary` hook (already migrated in Phase 1)
   - Minor changes needed for sponsor name
   - Test with disputed supporter meetings

3. **GuestWorkSummary** (Medium)
   - Uses hours worked stat
   - May have multiple job entries
   - Verify decimal hours work correctly

4. **GuestMeetingSummary** (Medium)
   - Meeting types (house, AA, NA, etc.)
   - Multiple meetings per day possible

5. **GuestMedicationSummary** (Medium)
   - Boolean medication taken
   - Simplest data model

**Component Migration Checklist (Per Component):**
- [ ] Identify all `guest.currentWeek` references
- [ ] Replace with hook-provided data
- [ ] Update PropTypes/TypeScript interfaces
- [ ] Remove Week/Day imports
- [ ] Add Activity imports
- [ ] Test component renders correctly
- [ ] Test loading states
- [ ] Test empty states
- [ ] Test with disputed activities
- [ ] Verify E2E test still passes

---

### **Phase 3: Services Migration (4-5 days)**

#### 3.1: Guest Service (`src/services/guest.tsx`)

**Current Pattern:**
```typescript
// Writing to guest.currentWeek
await firestore.doc(`guests/${guestId}`).update({
  'currentWeek.days.2024-01-15.choreCompleted': true
});
```

**New Pattern:**
```typescript
// Log activity instead
await logActivity(guestId, houseId, {
  type: 'chore',
  choreType: 'daily',
  choreName: 'Kitchen',
  choreId: 'chore123'
}, new Date('2024-01-15T10:00:00Z'));
```

**Migration Strategy:**
1. Identify all functions that write to `currentWeek`
2. Replace with `logActivity()` calls
3. Keep dual-write during migration
4. Add validation to ensure both systems sync

**Functions to Migrate:**
```typescript
// src/services/guest.tsx
updateGuestChore()        → logActivity(type: 'chore')
updateGuestWork()         → logActivity(type: 'work')
updateGuestMeeting()      → logActivity(type: 'meeting')
updateGuestSupporter()    → logActivity(type: 'primary_supporter')
updateGuestMedication()   → logActivity(type: 'medication')
```

---

#### 3.2: Weeks Service Deprecation

**File:** `src/services/weeks.tsx`

**Strategy:** Don't migrate - mark as deprecated and remove after migration complete.

```typescript
// Add deprecation warning
/**
 * @deprecated Use Activity system instead
 * This service will be removed after migration to Activity system completes.
 * See: docs/MIGRATION_PLAN_DETAILED.md
 */
export const weeksService = {
  // ... existing functions
};
```

---

### **Phase 4: Utility Functions Migration (2-3 days)**

#### 4.1: Guest Utilities (`src/util/guest.tsx`)

**Functions Needing Migration:**
```typescript
calculateHealth()              # Change data source
calculateHealthPercentage()    # Change data source
getOverallPercentage()        # Change to use WeekSummary
```

**Before:**
```typescript
export const getOverallPercentage = (guest: Guest, house: House, date: string) => {
  if (!guest.currentWeek) return 0;

  const stats = {
    meeting: getMeetingsToDate(guest, date),      // Uses currentWeek
    hoursWorked: getWorkToDate(guest, date),      // Uses currentWeek
    choreCompleted: getChoreCompletedToDate(guest, date),  // Uses currentWeek
    // ...
  };
  // ...
};
```

**After:**
```typescript
export const getOverallPercentage = (
  weekSummary: WeekSummary | null,
  house: House,
  date: string
) => {
  if (!weekSummary) return 0;

  // Get stats up to this date in the week
  const dateObj = new Date(date);
  const stats = {
    meeting: getDailyStatsUpToDate(weekSummary, date, 'meetingsAttended'),
    hoursWorked: getDailyStatsUpToDate(weekSummary, date, 'hoursWorked'),
    choreCompleted: getDailyStatsUpToDate(weekSummary, date, 'choresCompleted'),
    // ...
  };
  // ...
};

// Helper to sum daily stats up to a date
function getDailyStatsUpToDate(
  summary: WeekSummary,
  date: string,
  stat: keyof DailyStats
): number {
  const startDate = new Date(summary.startDate);
  const endDate = new Date(date);
  let sum = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    if (summary.dailyStats[dateStr]) {
      sum += summary.dailyStats[dateStr][stat];
    }
  }

  return sum;
}
```

---

### **Phase 5: Entity Updates (1-2 days)**

#### 5.1: Guest Entity (`src/entities/Guest.tsx`)

**Changes:**
```typescript
// BEFORE
export interface Guest {
  id: string;
  // ... other fields ...
  currentWeek?: Week;        // REMOVE
  previousWeek?: Week;       // REMOVE
  nextWeek?: Week;          // REMOVE
}

// AFTER
export interface Guest {
  id: string;
  // ... other fields ...
  // Weeks removed - use Activity queries instead

  // Keep these if they're guest-level properties (not week-specific)
  primarySupporterName?: string;
  primarySupporterId?: string;
}
```

**Migration Notes:**
- Don't remove Week references until ALL components migrated
- Use TypeScript to find all usages: `currentWeek` should have zero references
- Mark as deprecated first, remove later

---

### **Phase 6: Validation & Testing (3-4 days)**

#### 6.1: Data Integrity Validation

**Create Validation Script:**
```typescript
// scripts/validate-migration.ts
async function validateMigration() {
  const guests = await getAllGuests();

  for (const guest of guests) {
    const weekStart = getCurrentWeekStart();

    // Get stats from old system
    const oldStats = {
      chores: sumStat(guest.currentWeek, 'choreCompleted'),
      meetings: sumStat(guest.currentWeek, 'meeting'),
      hoursWorked: sumStat(guest.currentWeek, 'hoursWorked'),
      // ...
    };

    // Get stats from new system
    const summary = await getWeekSummary(guest.id, guest.houseId, weekStart);
    const newStats = {
      chores: summary?.stats.choresCompleted || 0,
      meetings: summary?.stats.meetingsAttended || 0,
      hoursWorked: summary?.stats.hoursWorked || 0,
      // ...
    };

    // Compare
    const matches =
      oldStats.chores === newStats.chores &&
      oldStats.meetings === newStats.meetings &&
      oldStats.hoursWorked === newStats.hoursWorked;

    if (!matches) {
      console.error(`Mismatch for guest ${guest.id}:`, {
        old: oldStats,
        new: newStats
      });
    }
  }
}
```

#### 6.2: E2E Test Execution

```bash
# Run ALL E2E tests
detox build --configuration ios.sim.debug
detox test --configuration ios.sim.debug

# Specifically test activity flows
detox test --configuration ios.sim.debug e2e/tests/activity-system-new.test.js
detox test --configuration ios.sim.debug e2e/tests/guest-stats.test.js
detox test --configuration ios.sim.debug e2e/tests/activity-verification.test.js
```

**Expected Results:**
- ✅ All existing E2E tests still pass
- ✅ New activity system E2E tests pass
- ✅ No regression in user flows

---

### **Phase 7: Cleanup & Documentation (2-3 days)**

#### 7.1: Remove Legacy Code

**Files to Delete:**
```bash
src/entities/Week.tsx                 # Deprecated entity
src/entities/Day.tsx                  # Deprecated entity
src/services/weeks.tsx                # Deprecated service
src/util/week.ts                      # Deprecated utilities
```

**Code to Remove:**
```typescript
// From Guest.tsx
currentWeek?: Week;
previousWeek?: Week;
nextWeek?: Week;

// From any remaining files
import { Week } from '../entities/Week';
import { Day } from '../entities/Day';
```

#### 7.2: Update Documentation

**Files to Update:**
```
README.md                           # Update architecture docs
docs/NEW_ARCHITECTURE_STRATEGY.md  # Mark as IMPLEMENTED
docs/MIGRATION_PLAN_DETAILED.md    # Mark as COMPLETE
```

**Create New Docs:**
```
docs/ACTIVITY_SYSTEM_GUIDE.md      # Developer guide for new system
docs/MIGRATION_POSTMORTEM.md       # Lessons learned
```

---

## 🎯 Success Criteria

### Phase Completion Checklist

**Phase 0 - Preparation:**
- [ ] Activity query hooks created
- [ ] Feature flags configured
- [ ] Dual-write system implemented
- [ ] Migration toggle working

**Phase 1 - Core Hooks:**
- [ ] useStatSummary migrated
- [ ] useWeekSummary created
- [ ] useActivities created
- [ ] All hook unit tests passing

**Phase 2 - UI Components:**
- [ ] All 5 guest summary screens migrated
- [ ] BaseStatSummary migrated
- [ ] No `guest.currentWeek` references in UI
- [ ] All component tests passing

**Phase 3 - Services:**
- [ ] Guest service migrated
- [ ] All write operations use logActivity()
- [ ] Dual-write validation passing

**Phase 4 - Utilities:**
- [ ] calculateHealth updated
- [ ] getOverallPercentage updated
- [ ] All utility tests passing

**Phase 5 - Entities:**
- [ ] Guest entity cleaned up
- [ ] Week/Day marked deprecated
- [ ] TypeScript errors resolved

**Phase 6 - Validation:**
- [ ] Data integrity validation script run
- [ ] All E2E tests passing
- [ ] No regressions found

**Phase 7 - Cleanup:**
- [ ] Legacy code removed
- [ ] Documentation updated
- [ ] Code review completed

---

## ⚠️ Risk Mitigation

### Identified Risks & Mitigation Strategies

**Risk 1: Data Loss During Migration**
- **Mitigation:** Dual-write to both systems
- **Validation:** Run comparison script after each migration
- **Rollback:** Keep old system functional until validation complete

**Risk 2: Performance Degradation**
- **Mitigation:** Use Firestore real-time listeners efficiently
- **Monitoring:** Add performance metrics to dashboards
- **Optimization:** Implement caching for week summaries

**Risk 3: Bugs in Production**
- **Mitigation:** Feature flag for gradual rollout
- **Testing:** Comprehensive E2E test suite
- **Monitoring:** Error tracking and alerts

**Risk 4: Missing Edge Cases**
- **Mitigation:** Review all 25 files for edge cases
- **Testing:** Add tests for disputed activities, missing data, etc.
- **Documentation:** Document known edge cases

---

## 🔄 Rollback Plan

### If Migration Fails

**Immediate Rollback (< 5 minutes):**
```typescript
// Toggle feature flag
FEATURE_FLAGS.USE_ACTIVITY_SYSTEM = false;
FEATURE_FLAGS.DUAL_WRITE_ENABLED = true; // Keep dual-write for safety
```

**Full Rollback (< 1 hour):**
1. Revert code changes via git
2. Redeploy previous version
3. Verify old system still functional
4. Analyze failure cause

**Partial Rollback (Per Component):**
- Revert individual component changes
- Keep other migrated components active
- Isolate problematic areas

---

## 📊 Progress Tracking

### Migration Dashboard

| Phase | Component | Status | Assignee | Due Date | Tests Passing |
|-------|-----------|--------|----------|----------|---------------|
| 0 | Preparation | ⏳ Not Started | - | - | - |
| 1 | useStatSummary | ⏳ Not Started | - | - | 0/10 |
| 1 | useWeekSummary | ⏳ Not Started | - | - | 0/5 |
| 1 | useActivities | ⏳ Not Started | - | - | 0/5 |
| 2 | GuestChoreSummary | ⏳ Not Started | - | - | 0/8 |
| 2 | GuestSupporterSummary | ⏳ Not Started | - | - | 0/8 |
| 2 | GuestWorkSummary | ⏳ Not Started | - | - | 0/8 |
| 2 | GuestMeetingSummary | ⏳ Not Started | - | - | 0/8 |
| 2 | GuestMedicationSummary | ⏳ Not Started | - | - | 0/8 |
| 3 | Guest Service | ⏳ Not Started | - | - | 0/15 |
| 4 | Guest Utilities | ⏳ Not Started | - | - | 0/12 |
| 5 | Entity Updates | ⏳ Not Started | - | - | 0/5 |
| 6 | Validation | ⏳ Not Started | - | - | 0/20 |
| 7 | Cleanup | ⏳ Not Started | - | - | - |

**Update this table as you progress through migration**

---

## 🚀 Quick Start Guide

### Day 1: Get Started

```bash
# 1. Create feature branch
git checkout -b migration/activity-system

# 2. Create Phase 0 hooks
mkdir -p src/hooks/activity
touch src/hooks/activity/useWeekSummary.ts
touch src/hooks/activity/useActivities.ts

# 3. Implement feature flags
touch src/config/featureFlags.ts

# 4. Run tests to establish baseline
npm test
detox test --configuration ios.sim.debug

# 5. Start with useWeekSummary hook
# ... implement according to Phase 1.2
```

### Daily Workflow

```bash
# Morning: Pick a component to migrate
# 1. Review migration plan for that component
# 2. Create test file if doesn't exist
# 3. Write failing tests for new behavior

# Afternoon: Implement migration
# 1. Update component to use new hooks
# 2. Run tests until passing
# 3. Verify E2E tests still pass

# End of day: Commit progress
git add .
git commit -m "feat: migrate GuestSupporterSummary to Activity system"
git push origin migration/activity-system
```

---

## 📞 Support & Resources

### Getting Help

**Stuck on a component?**
- Review `docs/NEW_ARCHITECTURE_STRATEGY.md` for architecture details
- Check `src/services/__tests__/activity.test.ts` for service examples
- Look at migrated hooks for patterns

**Test failures?**
- Run `npm test -- --verbose` for detailed output
- Check `docs/TESTING_COMPLETE_GUIDE.md` for debugging tips
- Use `console.log` in hooks to debug data flow

**Performance issues?**
- Use React DevTools Profiler
- Check Firestore listener subscriptions
- Verify useEffect dependencies are correct

---

## ✅ Final Checklist

Before marking migration complete:

- [ ] All 25 files migrated
- [ ] Zero references to `guest.currentWeek`
- [ ] Zero references to `guest.previousWeek`
- [ ] All unit tests passing (200+ tests)
- [ ] All E2E tests passing (12+ tests)
- [ ] Data integrity validation script passing
- [ ] Performance benchmarks meet targets
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Feature flags removed (fully migrated)
- [ ] Legacy code deleted
- [ ] Migration postmortem written

---

## 🎉 Success!

When all checklists are complete, the migration is done!

**Final Steps:**
1. Merge migration branch to main
2. Deploy to production
3. Monitor for issues
4. Celebrate! 🎊

**Benefits Realized:**
- ✅ 92% reduction in Firestore writes
- ✅ Flexible querying of historical data
- ✅ Better performance and scalability
- ✅ Cleaner, more maintainable codebase
- ✅ Event-sourced audit trail
- ✅ Ready for analytics and reporting

---

**Next Action:** Start with Phase 0 - Create the activity query hooks!
