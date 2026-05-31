# Quick Start: Migrate GuestSupporterSummary

**File:** `src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx`
**Complexity:** Medium
**Estimated Time:** 2-3 hours
**Dependencies:** `useStatSummary` hook (needs Phase 1 first)

---

## 📋 Current Issues in This File

**Line 76-83:** Uses `guest.currentWeek`
```typescript
const sponsorName = useMemo(() => {
  if (guest?.currentWeek?.primarySupporterName) {  // ❌ Legacy Week/Day system
    return guest.currentWeek.primarySupporterName;
  }
  if (guest?.primarySupporterName) {
    return guest.primarySupporterName;
  }
  return 'No Sponsor Assigned';
}, [guest?.currentWeek?.primarySupporterName, guest?.primarySupporterName]);
```

**Line 65:** Uses `useStatSummary` which internally uses Week/Day
```typescript
const {
  guest,
  house,
  user,
  statSum,        // ← Comes from guest.currentWeek (legacy)
  phaseRule,
  percentage,
  disputes,       // ← Comes from guest.currentWeek.activities (legacy)
  daysRemaining,
  graphData,
  getBarFillColor,
  isLoading,
} = useStatSummary('metPrimarySupporter');
```

---

## 🎯 Migration Steps

### Step 1: Migrate `useStatSummary` Hook First

**This component depends on the `useStatSummary` hook, so migrate that first!**

See: `docs/MIGRATION_PLAN_DETAILED.md` - Phase 1.1

Once `useStatSummary` is migrated to use the Activity system, this component will automatically benefit from the new data source.

---

### Step 2: Simplify Sponsor Name Logic

**Current Code (Lines 75-83):**
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

**New Code:**
```typescript
const sponsorName = useMemo(() => {
  // Supporter name is a guest-level property, not week-specific
  // So it stays on the guest entity, not in activities
  if (guest?.primarySupporterName) {
    return guest.primarySupporterName;
  }
  return 'No Sponsor Assigned';
}, [guest?.primarySupporterName]);
```

**Explanation:**
- Sponsor name is a property of the guest, not the week
- We don't need to check `currentWeek` anymore
- This simplifies the logic significantly

---

### Step 3: Update Dependencies

**Remove:**
```typescript
import { Week } from '../../../entities/Week';  // If imported
import { Day } from '../../../entities/Day';    // If imported
```

**No new imports needed!**
The component relies on `useStatSummary` which will handle all Activity system interactions.

---

### Step 4: Test the Changes

**Unit Test (Create if doesn't exist):**
```typescript
// src/screens/GuestSupporterOverview/GuestSupporterSummary/__tests__/GuestSupporterSummary.test.tsx

import React from 'react';
import { render } from '@testing-library/react-native';
import GuestSupporterSummary from '../GuestSupporterSummary';

// Mock dependencies
jest.mock('../../../../hooks/useStatSummary', () => ({
  useStatSummary: jest.fn(() => ({
    guest: {
      id: 'guest123',
      primarySupporterName: 'John Sponsor',
      step: 3,
    },
    house: { id: 'house123' },
    user: { id: 'user123' },
    statSum: 1,
    phaseRule: 1,
    percentage: 100,
    disputes: 0,
    daysRemaining: 3,
    graphData: [],
    getBarFillColor: jest.fn(),
    isLoading: false,
  })),
}));

describe('GuestSupporterSummary', () => {
  it('should display sponsor name from guest property', () => {
    const { getByText } = render(
      <GuestSupporterSummary navigation={{} as any} />
    );

    expect(getByText('John Sponsor')).toBeTruthy();
    expect(getByText('Step 3')).toBeTruthy();
  });

  it('should display default message when no sponsor assigned', () => {
    // Override mock for this test
    jest.mocked(useStatSummary).mockReturnValueOnce({
      guest: {
        id: 'guest123',
        primarySupporterName: undefined,
        step: 1,
      },
      // ... other mock data
    } as any);

    const { getByText } = render(
      <GuestSupporterSummary navigation={{} as any} />
    );

    expect(getByText('No Sponsor Assigned')).toBeTruthy();
  });
});
```

**E2E Test:**
```bash
# Run existing E2E test
detox test --configuration ios.sim.debug e2e/tests/guest-stats.test.js

# Should still pass after migration
```

---

### Step 5: Verify No Regressions

**Checklist:**
- [ ] Component renders correctly
- [ ] Sponsor name displays from guest property
- [ ] "No Sponsor Assigned" shows when appropriate
- [ ] Step number displays correctly
- [ ] Action buttons work (Change Sponsor, Meet Sponsor)
- [ ] Stats card shows correct data
- [ ] Loading state works
- [ ] No console errors
- [ ] E2E test passes

---

## 🔍 What Changes vs What Stays

### ✅ Changes:
```diff
  const sponsorName = useMemo(() => {
-   if (guest?.currentWeek?.primarySupporterName) {
-     return guest.currentWeek.primarySupporterName;
-   }
    if (guest?.primarySupporterName) {
      return guest.primarySupporterName;
    }
    return 'No Sponsor Assigned';
- }, [guest?.currentWeek?.primarySupporterName, guest?.primarySupporterName]);
+ }, [guest?.primarySupporterName]);
```

### ✅ Stays the Same:
- All UI rendering logic
- Modal functions (`showChangeSponsorModal`, `showMeetSponsorModal`)
- Action buttons
- `useStatSummary` hook usage (just the hook's implementation changes)
- Redux integration
- Navigation
- All other component logic

---

## 🎯 Expected Outcome

After migration:
1. Component works exactly the same from user perspective
2. No more `guest.currentWeek` references
3. Data comes from Activity system via `useStatSummary`
4. Simpler, cleaner code (less nested property access)
5. Better performance (real-time Activity updates)

---

## 🚨 Common Pitfalls

**Pitfall 1: Migrating component before hook**
- ❌ Don't migrate this component until `useStatSummary` is migrated
- ✅ Follow the migration plan order: Hooks first, then UI components

**Pitfall 2: Over-complicating sponsor name**
- ❌ Don't try to fetch sponsor name from activities
- ✅ Keep it simple - sponsor name lives on guest entity

**Pitfall 3: Breaking existing tests**
- ❌ Don't delete old tests
- ✅ Update test mocks to reflect new data structure

---

## 📊 Impact Assessment

**Files Affected:** 1
**Lines Changed:** ~10
**Risk Level:** LOW
**User Impact:** None (invisible to users)
**Test Coverage:** High (if tests added)

---

## ✅ Done Criteria

This component is considered migrated when:
- [ ] No references to `guest.currentWeek`
- [ ] Sponsor name comes from `guest.primarySupporterName` only
- [ ] Unit tests passing
- [ ] E2E tests passing
- [ ] No console warnings
- [ ] Code review approved
- [ ] Deployed to staging without issues

---

## 🔗 Related Files

**This component depends on:**
- `src/hooks/useStatSummary.ts` - Migrate this FIRST
- `src/util/guest.tsx` - calculateHealth, getPhaseRule
- `src/components/StatSummaryScreen` - UI component (no changes needed)

**Similar components to migrate next:**
- `GuestChoreSummary.tsx` - Same pattern, easier
- `GuestWorkSummary.tsx` - Same pattern, slightly more complex
- `GuestMeetingSummary.tsx` - Same pattern
- `GuestMedicationSummary.tsx` - Same pattern

---

## 🚀 Ready to Start?

**Order of Operations:**
1. Read `docs/MIGRATION_PLAN_DETAILED.md` - Phase 1
2. Migrate `useStatSummary` hook first
3. Come back to this component
4. Make the simple change on lines 76-83
5. Test thoroughly
6. Commit and move to next component

**Estimated Total Time:** 2-3 hours (including testing)

Good luck! 🎉
