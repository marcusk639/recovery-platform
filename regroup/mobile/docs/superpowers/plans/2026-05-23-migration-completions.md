# Migration Completions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete three in-flight migrations (ActivityType enum, BaseEntity timestamps, meetings Redux → React Query), seal each one with ESLint guardrails, and verify with unit tests so neither migration can silently reopen.

**Architecture:** Migrations are sequenced: BaseEntity first (removes the `createdDate`/`lastUpdated` re-declarations that exist in multiple entity classes), then ActivityType (fixes switch-case string literals in util and UI that depend on clean entity definitions), then meetingsSlice (narrowest Redux-to-React Query scope: 2 consumer files, no auth-state concerns). Each migration ends with an ESLint rule that makes regressing to the old pattern a lint error.

**Tech Stack:** React Native 0.72, TypeScript, Jest, Firebase Firestore, Redux Toolkit, React Query (`@tanstack/react-query`)

---

## Execution Order

Run these migrations in order — BaseEntity → ActivityType → meetingsSlice. Each builds on the previous.

---

## Migration 1: BaseEntity Timestamps (`createdDate` / `lastUpdated` → `createdAt` / `updatedAt`)

### Files Affected

| Role                    | File                                    |
| ----------------------- | --------------------------------------- |
| Modify entity           | `src/entities/Guest.tsx`                |
| Modify entity           | `src/entities/Complaint.ts`             |
| Modify entity           | `src/entities/Issue.ts`                 |
| Modify service (writes) | `src/services/guest.tsx`                |
| Modify service (writes) | `src/services/activity.ts`              |
| Modify service (writes) | `src/services/guestImport.ts`           |
| Modify service (writes) | `src/services/phaseAdvancement.ts`      |
| Modify service (writes) | `src/services/house.tsx`                |
| Modify hook (writes)    | `src/hooks/useBaseActivityScreen.ts`    |
| Modify screen (writes)  | `src/screens/Personal/Personal.tsx`     |
| Modify screen (reads)   | `src/screens/Complaints/Complaints.tsx` |
| Modify screen (reads)   | `src/screens/GuestList/GuestList.tsx`   |
| Modify screen (reads)   | `src/screens/Issues/Issues.tsx`         |
| Modify util (reads)     | `src/util/issues.ts`                    |
| Modify test             | `src/entities/__tests__/Guest.test.ts`  |
| Modify ESLint           | `.eslintrc.js`                          |

> **What to leave alone:** `src/hooks/activity/useWeekSummary.ts` reads `lastUpdated` from Firestore `week-summaries` documents — that is a Firestore _schema_ field, not the entity class field. Changing it requires a Firestore data migration. Leave those three occurrences as-is; they are isolated at the Firestore read boundary and guarded by `typeof` checks. `src/entities/WeekSummary.ts` `lastUpdated` field is also left as-is for the same reason.

---

### Task M1-1: Fix `Guest` entity — remove re-declared deprecated fields

**Files:**

- Modify: `src/entities/Guest.tsx:66-69,89`
- Test: `src/entities/__tests__/Guest.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/entities/__tests__/Guest.test.ts` and add this test inside the existing `describe('Guest')` block:

```typescript
it('uses BaseEntity createdAt/updatedAt, not redeclared createdDate/lastUpdated', () => {
  const guest = new Guest();
  // Should have BaseEntity canonical fields
  expect(typeof guest.createdAt).toBe('string');
  expect(typeof guest.updatedAt).toBe('string');
  // createdDate and lastUpdated should NOT be own properties of Guest class —
  // they live only on BaseEntity as deprecated optionals
  const ownKeys = Object.getOwnPropertyNames(guest);
  expect(ownKeys).not.toContain('createdDate');
  expect(ownKeys).not.toContain('lastUpdated');
  // duplicate moveOutDate should not be present either
  expect(ownKeys.filter(k => k === 'moveOutDate')).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/entities/__tests__/Guest.test.ts --testNamePattern="uses BaseEntity createdAt" -t
```

Expected: FAIL — `expect(received).not.toContain(expected)` because `createdDate` is currently an own property.

- [ ] **Step 3: Fix `Guest.tsx` — remove re-declarations**

In `src/entities/Guest.tsx`, locate lines 67-89. Remove the three lines that re-declare deprecated fields and the duplicate `moveOutDate`:

```typescript
  // Timestamps
  version: number = 0;
  moveInDate?: string;
  moveOutDate?: string;

  // Intake fields
```

The lines to delete are:

- Line 68: `createdDate: string = new Date().toISOString();`
- Line 69: `lastUpdated: string = new Date().toISOString();`
- Line 89: `moveOutDate?: string;` (duplicate — the first declaration at line 71 stays)

After the edit the timestamps block should read:

```typescript
  // Timestamps
  version: number = 0;
  moveInDate?: string;
  moveOutDate?: string;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/entities/__tests__/Guest.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Guest.tsx src/entities/__tests__/Guest.test.ts
git commit -m "fix(entities): remove re-declared createdDate/lastUpdated from Guest, fix duplicate moveOutDate"
```

---

### Task M1-2: Fix `Complaint` and `HouseIssue` entities

**Files:**

- Modify: `src/entities/Complaint.ts`
- Modify: `src/entities/Issue.ts`
- Test: `src/entities/__tests__/Complaint.test.ts`
- Test: `src/entities/__tests__/HouseIssue.test.ts`

- [ ] **Step 1: Write failing test for Complaint**

In `src/entities/__tests__/Complaint.test.ts`, add inside the existing `describe` block:

```typescript
it('uses createdAt from BaseEntity, not own createdDate', () => {
  const complaint = new Complaint();
  const ownKeys = Object.getOwnPropertyNames(complaint);
  expect(ownKeys).not.toContain('createdDate');
  expect(typeof complaint.createdAt).toBe('string');
});
```

- [ ] **Step 2: Write failing test for HouseIssue**

In `src/entities/__tests__/HouseIssue.test.ts`, add inside the existing `describe` block:

```typescript
it('uses createdAt from BaseEntity, not own createdDate', () => {
  const issue = new HouseIssue('id1', 'maintenance', 'leaky faucet', 'user1');
  const ownKeys = Object.getOwnPropertyNames(issue);
  expect(ownKeys).not.toContain('createdDate');
  expect(typeof issue.createdAt).toBe('string');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest src/entities/__tests__/Complaint.test.ts src/entities/__tests__/HouseIssue.test.ts -t "uses createdAt"
```

Expected: FAIL.

- [ ] **Step 4: Fix `Complaint.ts`**

Replace line 11 in `src/entities/Complaint.ts`:

```typescript
// Before:
createdDate: string = getCurrentTime();

// After: (remove this line entirely — BaseEntity already provides createdAt)
```

Also remove the `getCurrentTime` import if it is only used for `createdDate`:

```typescript
// Before:
import { getCurrentTime } from '../util/display';

// After: (remove this import line if getCurrentTime is only used for createdDate)
```

- [ ] **Step 5: Fix `Issue.ts`**

In `src/entities/Issue.ts`, the `HouseIssue` constructor sets `this.createdDate`. Replace that line:

```typescript
// Before (line ~39):
this.createdDate = getCurrentTime();

// After:
this.createdAt = getCurrentTime();
```

Also remove the `getCurrentTime` import if no longer needed elsewhere in the file.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest src/entities/__tests__/Complaint.test.ts src/entities/__tests__/HouseIssue.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Complaint.ts src/entities/Issue.ts \
  src/entities/__tests__/Complaint.test.ts src/entities/__tests__/HouseIssue.test.ts
git commit -m "fix(entities): migrate Complaint and HouseIssue from createdDate to createdAt"
```

---

### Task M1-3: Update service and hook _writes_ to use `createdAt` / `updatedAt`

**Files:**

- Modify: `src/services/guest.tsx`
- Modify: `src/services/activity.ts`
- Modify: `src/services/guestImport.ts`
- Modify: `src/services/phaseAdvancement.ts`
- Modify: `src/services/house.tsx`
- Modify: `src/hooks/useBaseActivityScreen.ts`
- Modify: `src/screens/Personal/Personal.tsx`

These are mechanical replacements at Firestore _write_ boundaries. New documents written after this task will have `createdAt`/`updatedAt` instead of `createdDate`/`lastUpdated`.

- [ ] **Step 1: Fix `src/services/guest.tsx`**

Line 98 — replace `lastUpdated` write:

```typescript
// Before:
mergedGuest.lastUpdated = new Date().toISOString();
// After:
mergedGuest.updatedAt = new Date().toISOString();
```

Line 302 — replace Firestore serverTimestamp write:

```typescript
// Before:
lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp(),
// After:
updatedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
```

- [ ] **Step 2: Fix `src/services/activity.ts`**

Line 298 — reading back `lastUpdated` from Firestore document:

```typescript
// Before:
lastUpdated: data?.lastUpdated?.toDate?.() || data?.lastUpdated,
// After:
updatedAt: data?.updatedAt?.toDate?.() ?? data?.lastUpdated?.toDate?.() ?? data?.updatedAt ?? data?.lastUpdated,
```

Line 389 — writing serverTimestamp:

```typescript
// Before:
lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp() as any,
// After:
updatedAt: FirebaseFirestore.FieldValue.serverTimestamp() as any,
```

- [ ] **Step 3: Fix `src/services/guestImport.ts`**

Lines 112-113:

```typescript
// Before:
          createdDate: new Date().toISOString(),
          lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp(),
// After:
          createdAt: new Date().toISOString(),
          updatedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
```

- [ ] **Step 4: Fix `src/services/phaseAdvancement.ts`**

Line 144:

```typescript
// Before:
    lastUpdated: new Date().toISOString(),
// After:
    updatedAt: new Date().toISOString(),
```

- [ ] **Step 5: Fix `src/services/house.tsx`**

Line 178:

```typescript
// Before:
    createdDate: getCurrentTime(),
// After:
    createdAt: getCurrentTime(),
```

- [ ] **Step 6: Fix `src/hooks/useBaseActivityScreen.ts`**

Line 190:

```typescript
// Before:
          createdDate: getTodaysDate(),
// After:
          createdAt: getTodaysDate(),
```

- [ ] **Step 7: Fix `src/screens/Personal/Personal.tsx`**

Lines 157 and 226 both set `createdDate`:

```typescript
// Before (both occurrences):
            createdDate: getCurrentTime(),
// After:
            createdAt: getCurrentTime(),
```

- [ ] **Step 8: Run affected tests**

```bash
npx jest src/services/__tests__ src/hooks --passWithNoTests
```

Expected: PASS (or pre-existing failures only — do not regress).

- [ ] **Step 9: Commit**

```bash
git add src/services/guest.tsx src/services/activity.ts src/services/guestImport.ts \
  src/services/phaseAdvancement.ts src/services/house.tsx \
  src/hooks/useBaseActivityScreen.ts src/screens/Personal/Personal.tsx
git commit -m "fix(services): write createdAt/updatedAt instead of createdDate/lastUpdated at Firestore boundaries"
```

---

### Task M1-4: Update screen _reads_ with legacy fallback

**Files:**

- Modify: `src/util/issues.ts`
- Modify: `src/screens/Complaints/Complaints.tsx`
- Modify: `src/screens/GuestList/GuestList.tsx`
- Modify: `src/screens/Issues/Issues.tsx`

Existing Firestore documents written before this migration still have `createdDate`. Read code must fall back gracefully: `createdAt ?? createdDate`.

- [ ] **Step 1: Fix `src/util/issues.ts`**

Lines 55-56 — update sort comparator:

```typescript
// Before:
const dateA = a.createdAt || String(a.createdDate || '');
const dateB = b.createdAt || String(b.createdDate || '');
// After: (no change needed — these already have the fallback pattern)
```

Line 43 — update the JSDoc comment:

```typescript
// Before:
 * sorted newest-first by their `createdDate` legacy field or `createdAt` ISO
// After:
 * sorted newest-first by `createdAt` (canonical) falling back to legacy `createdDate`
```

- [ ] **Step 2: Fix `src/screens/Complaints/Complaints.tsx`**

Lines 160, 283 — read `createdDate` for display:

```typescript
// Before (both):
headerSubtext={getDateAndTime(complaint.createdDate)}
// After:
headerSubtext={getDateAndTime(complaint.createdAt ?? complaint.createdDate)}
```

Lines 383-384 — sort comparator:

```typescript
// Before:
new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime();
// After:
new Date(right.createdAt ?? right.createdDate ?? 0).getTime() -
  new Date(left.createdAt ?? left.createdDate ?? 0).getTime();
```

- [ ] **Step 3: Fix `src/screens/GuestList/GuestList.tsx`**

Line 181:

```typescript
// Before:
          description={getDateAndTime(guest.createdDate || new Date(), false)}
// After:
          description={getDateAndTime(guest.createdAt ?? guest.createdDate ?? new Date(), false)}
```

- [ ] **Step 4: Fix `src/screens/Issues/Issues.tsx`**

Lines 226 and 470:

```typescript
// Before (both):
headerSubtext={getDateAndTime(issue.createdDate)}
// After:
headerSubtext={getDateAndTime(issue.createdAt ?? issue.createdDate)}
```

- [ ] **Step 5: Run tests**

```bash
npx jest src/screens/Complaints src/screens/GuestList src/screens/Issues --passWithNoTests
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/util/issues.ts src/screens/Complaints/Complaints.tsx \
  src/screens/GuestList/GuestList.tsx src/screens/Issues/Issues.tsx
git commit -m "fix(screens): read createdAt with legacy createdDate fallback for old Firestore docs"
```

---

### Task M1-5: Add ESLint ban rule for deprecated field writes

**Files:**

- Modify: `.eslintrc.js`

- [ ] **Step 1: Run the full test suite to establish baseline**

```bash
npm test -- --passWithNoTests 2>&1 | tail -5
```

Expected: note the current pass/fail count.

- [ ] **Step 2: Add ESLint rule**

Replace the contents of `.eslintrc.js` with:

```javascript
module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Migration M1: Ban writes to deprecated timestamp fields.
    // Reads with fallback (e.g. `x.createdAt ?? x.createdDate`) are still allowed
    // during the Firestore legacy-data window.
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='createdDate']",
        message:
          "Use 'createdAt' instead of deprecated 'createdDate'. See src/entities/BaseEntity.tsx.",
      },
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='lastUpdated']",
        message:
          "Use 'updatedAt' instead of deprecated 'lastUpdated'. See src/entities/BaseEntity.tsx.",
      },
      {
        selector:
          "Property[key.name='createdDate'][parent.type='ObjectExpression']",
        message:
          "Use 'createdAt' instead of deprecated 'createdDate' in object literals.",
      },
      {
        selector:
          "Property[key.name='lastUpdated'][parent.type='ObjectExpression']",
        message:
          "Use 'updatedAt' instead of deprecated 'lastUpdated' in object literals.",
      },
    ],
  },
};
```

- [ ] **Step 3: Run lint to confirm zero new violations**

```bash
npm run lint 2>&1 | grep -E "error|warning" | grep -E "createdDate|lastUpdated" | head -20
```

Expected: no output (zero violations).

If violations appear, fix them before proceeding. Each violation is a missed write-site from Tasks M1-3 or M1-4.

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.js
git commit -m "chore(lint): ban writes to deprecated createdDate/lastUpdated fields"
```

---

## Migration 2: ActivityType Enum (raw string literals → `ActivityType`)

### Background

`ActivityType` enum is defined in `src/entities/ActivityModel.ts`:

```typescript
export enum ActivityType {
  CHORE = 'chore',
  MEETING = 'meeting',
  WORK = 'work',
  MEDICATION = 'medication',
  PRIMARY_SUPPORTER = 'primary_supporter',
}
```

Three files still use raw string literals where the enum should be used:

1. `ActivityFilterForm.tsx` — defines its own parallel type `ActivityTypeFilters`
2. `util/guest.tsx` — `getStatsFromActivities` switch also accepts legacy keys (`meeting_attended`, `hours_worked`, etc.) that no longer exist
3. `HouseActivity/HouseActivity.tsx` — `getActivityLabel` switch uses string literals

### Files Affected

| Role          | File                                                        |
| ------------- | ----------------------------------------------------------- |
| Modify        | `src/screens/Activity/ActivityFilterForm.tsx`               |
| Modify + test | `src/util/guest.tsx`                                        |
| Modify        | `src/screens/HouseOverview/HouseActivity/HouseActivity.tsx` |
| Modify        | `.eslintrc.js`                                              |
| Test          | `src/util/__tests__/guestUtil.test.ts`                      |

---

### Task M2-1: Fix `ActivityFilterForm.tsx` — replace local type with `ActivityType`

**Files:**

- Modify: `src/screens/Activity/ActivityFilterForm.tsx`

- [ ] **Step 1: View the current type and items map**

The file currently declares (lines 12-33):

```typescript
export type ActivityTypeFilters =
  | 'meeting'
  | 'medication'
  | 'sponsor'
  | 'chore'
  | 'work'
  | 'all';

// ...
const activityTypeItems = {
  Meeting: 'meeting',
  Medication: 'medication',
  Sponsor: 'supporter', // ← bug: 'supporter' ≠ ActivityType.PRIMARY_SUPPORTER ('primary_supporter')
  Work: 'work',
  Chore: 'chore',
  All: 'all',
};
```

- [ ] **Step 2: Replace with enum-based type**

Replace the `ActivityTypeFilters` type and `activityTypeItems` map:

```typescript
import { ActivityType } from '../../entities/ActivityModel';

export type ActivityTypeFilters = ActivityType | 'all';

export class ActivityFilterFormValues {
  disputed: 'yes' | 'no' | 'all' = 'all';
  guest: Guest | null = null;
  type: ActivityTypeFilters = 'all';
}

const activityTypeItems: Record<string, ActivityTypeFilters> = {
  Meeting: ActivityType.MEETING,
  Medication: ActivityType.MEDICATION,
  'Primary Supporter': ActivityType.PRIMARY_SUPPORTER,
  Work: ActivityType.WORK,
  Chore: ActivityType.CHORE,
  All: 'all',
};
```

- [ ] **Step 3: Run lint and tests**

```bash
npm run lint -- --quiet 2>&1 | grep "ActivityFilterForm" | head -5
npx jest src/screens/Activity --passWithNoTests
```

Expected: no lint errors, tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/Activity/ActivityFilterForm.tsx
git commit -m "fix(activity): replace ActivityTypeFilters string literals with ActivityType enum"
```

---

### Task M2-2: Fix `util/guest.tsx` — remove legacy stat key switch arms

**Files:**

- Modify: `src/util/guest.tsx:146-169`
- Test: `src/util/__tests__/guestUtil.test.ts`

The `getStatsFromActivities` function currently accepts both old keys (`meeting_attended`, `hours_worked`) and new keys (`meeting`, `work`). The old keys have not been written to Firestore since the ActivityModel migration completed. Remove them.

- [ ] **Step 1: Write a failing test confirming only enum values are handled**

In `src/util/__tests__/guestUtil.test.ts`, add:

```typescript
import { ActivityType } from '@/entities/ActivityModel';
import { getStatsFromActivities } from '../guest';

describe('getStatsFromActivities', () => {
  it('counts ActivityType.MEETING activities', () => {
    const activities: any[] = [
      { type: ActivityType.MEETING, data: {} },
      { type: ActivityType.MEETING, data: {} },
    ];
    const stats = getStatsFromActivities(activities);
    expect(stats.meeting).toBe(2);
  });

  it('counts ActivityType.CHORE activities', () => {
    const activities: any[] = [{ type: ActivityType.CHORE, data: {} }];
    const stats = getStatsFromActivities(activities);
    expect(stats.choreCompleted).toBe(1);
  });

  it('does NOT count legacy meeting_attended key (old Firestore schema)', () => {
    // If legacy keys sneak back in, this test catches the regression
    const activities: any[] = [{ type: 'meeting_attended', data: {} }];
    const stats = getStatsFromActivities(activities);
    expect(stats.meeting).toBe(0);
  });

  it('counts ActivityType.WORK hoursWorked from data', () => {
    const activities: any[] = [
      { type: ActivityType.WORK, data: { hoursWorked: 4.5 } },
    ];
    const stats = getStatsFromActivities(activities);
    expect(stats.hoursWorked).toBe(4.5);
  });
});
```

- [ ] **Step 2: Run the test to see current state**

```bash
npx jest src/util/__tests__/guestUtil.test.ts -t "getStatsFromActivities"
```

The test "does NOT count legacy meeting_attended key" will FAIL if legacy arms are present.

- [ ] **Step 3: Fix the switch in `util/guest.tsx`**

Locate `getStatsFromActivities` (around line 146). Replace the switch body:

```typescript
// Before:
weekActivities.forEach(activity => {
  const activityType = activity.type as string;
  switch (activityType) {
    case 'meeting_attended':
    case 'meeting':
      stats.meeting += 1;
      break;
    case 'medication_taken':
    case 'medication':
      stats.medication += 1;
      break;
    case 'supporter_met':
    case 'primary_supporter':
      stats.metPrimarySupporter = true;
      break;
    case 'hours_worked':
    case 'work':
      stats.hoursWorked += (activity.data as WorkActivityData).hoursWorked;
      break;
    case 'chore_completed':
    case 'chore':
      stats.choreCompleted += 1;
      break;
  }
});

// After:
weekActivities.forEach(activity => {
  switch (activity.type) {
    case ActivityType.MEETING:
      stats.meeting += 1;
      break;
    case ActivityType.MEDICATION:
      stats.medication += 1;
      break;
    case ActivityType.PRIMARY_SUPPORTER:
      stats.metPrimarySupporter = true;
      break;
    case ActivityType.WORK:
      stats.hoursWorked += (activity.data as WorkActivityData).hoursWorked;
      break;
    case ActivityType.CHORE:
      stats.choreCompleted += 1;
      break;
  }
});
```

Also add the import at the top of `util/guest.tsx` if not already present:

```typescript
import { ActivityType, WorkActivityData } from '../entities/ActivityModel';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/util/__tests__/guestUtil.test.ts
```

Expected: all tests PASS including the new ones.

- [ ] **Step 5: Commit**

```bash
git add src/util/guest.tsx src/util/__tests__/guestUtil.test.ts
git commit -m "fix(util): remove legacy stat key switch arms from getStatsFromActivities, use ActivityType enum"
```

---

### Task M2-3: Fix `HouseActivity.tsx` — update `getActivityLabel` switch

**Files:**

- Modify: `src/screens/HouseOverview/HouseActivity/HouseActivity.tsx`

This file has `// @ts-nocheck` which suppresses all TypeScript errors. The switch in `getActivityLabel` uses raw strings.

- [ ] **Step 1: Update `getActivityLabel`**

Replace the `getActivityLabel` function (lines 41-58):

```typescript
function getActivityLabel(activity: Activity): string {
  const data = activity.data;
  if (!data) return 'Activity';
  switch (activity.type) {
    case ActivityType.MEETING:
      return (data as any).meetingName || 'Meeting';
    case ActivityType.WORK:
      return `${(data as any).hoursWorked ?? 0}h at ${
        (data as any).jobName || 'Work'
      }`;
    case ActivityType.CHORE:
      return (data as any).choreName || 'Chore';
    case ActivityType.MEDICATION:
      return (data as any).medicationName || 'Medication';
    case ActivityType.PRIMARY_SUPPORTER:
      return `Met with ${(data as any).supporterName || 'Supporter'}`;
    default:
      return 'Activity';
  }
}
```

Also remove the `// @ts-nocheck` comment at line 1 so TypeScript can catch future regressions:

```typescript
// Delete line 1: //@ts-nocheck
```

Fix any TypeScript errors that appear after removing `@ts-nocheck` (there may be a few `any` casts needed on the `data` union type — add them as shown above with `as any` until the data types are narrowed in a separate cleanup).

- [ ] **Step 2: Run lint and tests**

```bash
npm run lint -- --quiet 2>&1 | grep "HouseActivity" | head -5
npx jest src/screens/HouseOverview --passWithNoTests
```

Expected: no lint errors, tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/screens/HouseOverview/HouseActivity/HouseActivity.tsx
git commit -m "fix(activity): use ActivityType enum in getActivityLabel, remove @ts-nocheck"
```

---

### Task M2-4: Add ESLint ban rule for raw stat key string literals

**Files:**

- Modify: `.eslintrc.js`

- [ ] **Step 1: Add the rule**

Add to the `rules` object in `.eslintrc.js`:

Replace the entire contents of `.eslintrc.js` with the fully combined rule (M1 + M2 selectors in one array):

```javascript
module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-restricted-syntax': [
      'error',
      // M1: Ban writes to deprecated timestamp fields
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='createdDate']",
        message:
          "Use 'createdAt' instead of deprecated 'createdDate'. See src/entities/BaseEntity.tsx.",
      },
      {
        selector:
          "AssignmentExpression[left.type='MemberExpression'][left.property.name='lastUpdated']",
        message:
          "Use 'updatedAt' instead of deprecated 'lastUpdated'. See src/entities/BaseEntity.tsx.",
      },
      {
        selector:
          "Property[key.name='createdDate'][parent.type='ObjectExpression']",
        message:
          "Use 'createdAt' instead of deprecated 'createdDate' in object literals.",
      },
      {
        selector:
          "Property[key.name='lastUpdated'][parent.type='ObjectExpression']",
        message:
          "Use 'updatedAt' instead of deprecated 'lastUpdated' in object literals.",
      },
      // M2: Ban raw activity type string literals in switch/case
      {
        selector: "SwitchCase > Literal[value='meeting']",
        message: "Use ActivityType.MEETING instead of the string 'meeting'.",
      },
      {
        selector: "SwitchCase > Literal[value='chore']",
        message: "Use ActivityType.CHORE instead of the string 'chore'.",
      },
      {
        selector: "SwitchCase > Literal[value='work']",
        message: "Use ActivityType.WORK instead of the string 'work'.",
      },
      {
        selector: "SwitchCase > Literal[value='medication']",
        message:
          "Use ActivityType.MEDICATION instead of the string 'medication'.",
      },
      {
        selector: "SwitchCase > Literal[value='primary_supporter']",
        message:
          "Use ActivityType.PRIMARY_SUPPORTER instead of the string 'primary_supporter'.",
      },
    ],
  },
};
```

> Note: The full `no-restricted-syntax` rule must combine ALL selectors from both M1-5 and this task into a single array. ESLint only uses the last definition of a rule key, so two separate `no-restricted-syntax` entries would cause the first to be silently ignored.

- [ ] **Step 2: Run lint to confirm zero new violations**

```bash
npm run lint 2>&1 | grep -E "ActivityType|primary_supporter|meeting.*Literal" | head -20
```

Expected: no output.

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: same or better pass count as before.

- [ ] **Step 4: Commit**

```bash
git add .eslintrc.js
git commit -m "chore(lint): ban raw activity type string literals in switch/case statements"
```

---

## Migration 3: `meetingsSlice` Redux → React Query

### Background

`meetingsSlice` is the narrowest remaining Redux-for-server-data case. It has exactly two consumer files outside the slice itself: `MeetingSearch.tsx` and `NewMeeting.tsx`. The auth state (`userSlice`) and UI selection state (`guestsSlice.selectedGuestId`) are legitimate Redux concerns and are **not** in scope.

The migration replaces two Redux async thunks with React Query `useMutation` hooks. The `checkIntoMeeting` thunk currently reads guest/house/user from Redux state inside the thunk; after migration these are passed as parameters.

### Files Affected

| Role          | File                                                        |
| ------------- | ----------------------------------------------------------- |
| Create        | `src/state/queries/meetingQueries.ts`                       |
| Modify        | `src/screens/StatUpdates/MeetingSearch.tsx`                 |
| Modify        | `src/screens/StatUpdates/MeetingSearch/useMeetingSearch.ts` |
| Modify        | `src/screens/StatUpdates/NewMeeting.tsx`                    |
| Test (new)    | `src/state/queries/__tests__/meetingQueries.test.ts`        |
| Test (update) | `src/screens/StatUpdates/__tests__/MeetingSearch.test.tsx`  |

---

### Task M3-1: Create `meetingQueries.ts` with React Query mutations

**Files:**

- Create: `src/state/queries/meetingQueries.ts`
- Test: `src/state/queries/__tests__/meetingQueries.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/queries/__tests__/meetingQueries.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useSearchMeetings, useCheckIntoMeeting } from '../meetingQueries';
import * as meetingService from '../../../services/meeting';
import { ReactQueryTestWrapper } from '../../__tests__/testUtils';

jest.mock('../../../services/meeting');

const mockSearchForMeetings = meetingService.searchForMeetings as jest.Mock;
const mockUserIsAtMeeting = meetingService.userIsAtMeeting as jest.Mock;

describe('useSearchMeetings', () => {
  it('returns search results on success', async () => {
    const fakeMeetings = [{ id: 'm1', name: 'AA Friday' }];
    mockSearchForMeetings.mockResolvedValue(fakeMeetings);

    const { result } = renderHook(() => useSearchMeetings(), {
      wrapper: ReactQueryTestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        location: { lat: 0, lng: 0 },
        filters: {} as any,
      });
    });

    expect(result.current.data).toEqual(fakeMeetings);
    expect(result.current.isSuccess).toBe(true);
  });

  it('exposes error on failure', async () => {
    mockSearchForMeetings.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useSearchMeetings(), {
      wrapper: ReactQueryTestWrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({ location: { lat: 0, lng: 0 }, filters: {} as any })
        .catch(() => {});
    });

    expect(result.current.isError).toBe(true);
  });
});

describe('useCheckIntoMeeting', () => {
  it('calls userIsAtMeeting and logActivity', async () => {
    mockUserIsAtMeeting.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useCheckIntoMeeting(), {
      wrapper: ReactQueryTestWrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        checkInInput: { lat: 0, lng: 0 },
        meeting: {
          id: 'm1',
          name: 'AA Friday',
          type: 'AA',
          online: false,
        } as any,
        guestId: 'g1',
        houseId: 'h1',
        userId: 'u1',
      });
    });

    expect(mockUserIsAtMeeting).toHaveBeenCalledWith({ lat: 0, lng: 0 });
  });
});
```

- [ ] **Step 2: Check that `ReactQueryTestWrapper` exists or create it**

Check `src/state/__tests__/testUtils.tsx` (or similar). If it does not exist:

```typescript
// src/state/__tests__/testUtils.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function ReactQueryTestWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest src/state/queries/__tests__/meetingQueries.test.ts
```

Expected: FAIL — `meetingQueries` module not found.

- [ ] **Step 4: Create `meetingQueries.ts`**

Create `src/state/queries/meetingQueries.ts`:

```typescript
import { useMutation } from '@tanstack/react-query';
import * as meetingService from '../../services/meeting';
import { logActivity } from '../../services/activity';
import {
  ActivityType,
  ActivityDataFactory,
} from '../../entities/ActivityModel';
import { MeetingSearchInput, RatsMeeting } from '../../entities/Meeting';
import { logException } from '../../util/logging';

export interface CheckInInput {
  checkInInput: any;
  meeting: RatsMeeting;
  guestId: string;
  houseId: string;
  userId: string;
  force?: boolean;
}

export function useSearchMeetings() {
  return useMutation({
    mutationFn: (input: MeetingSearchInput) =>
      meetingService.searchForMeetings(input),
  });
}

export function useCheckIntoMeeting() {
  return useMutation({
    mutationFn: async ({
      checkInInput,
      meeting,
      guestId,
      houseId,
      userId,
    }: CheckInInput) => {
      const result = await meetingService.userIsAtMeeting(checkInInput);

      logActivity(
        guestId,
        houseId,
        ActivityType.MEETING,
        ActivityDataFactory.meeting(
          meeting.name || '',
          meeting.type || 'AA',
          60,
          meeting.id,
          meeting.online
            ? 'online'
            : `${meeting.city || ''}, ${meeting.state || ''}`,
        ),
        userId,
      ).catch(err => logException(err));

      return result;
    },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest src/state/queries/__tests__/meetingQueries.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/queries/meetingQueries.ts \
  src/state/queries/__tests__/meetingQueries.test.ts \
  src/state/__tests__/testUtils.tsx
git commit -m "feat(queries): add useSearchMeetings and useCheckIntoMeeting React Query mutations"
```

---

### Task M3-2: Migrate `MeetingSearch.tsx` to use React Query mutations

**Files:**

- Modify: `src/screens/StatUpdates/MeetingSearch.tsx`
- Modify: `src/screens/StatUpdates/MeetingSearch/useMeetingSearch.ts`
- Test: `src/screens/StatUpdates/__tests__/MeetingSearch.test.tsx`

- [ ] **Step 1: Update `useMeetingSearch.ts` signature**

The hook currently receives `searchForMeetings`, `checkIntoMeeting`, and status flags as props from the parent Redux-wired component. After migration, it will manage mutations internally.

Replace the `UseMeetingSearchProps` interface and the hook's opening in `useMeetingSearch.ts`:

```typescript
// Add these imports at the top:
import { useSearchMeetings, useCheckIntoMeeting } from '../../../state/queries/meetingQueries';
import { useAppSelector } from '../../../state/store';

// Replace the props interface:
export interface UseMeetingSearchProps {
  navigation: any;
}

// Replace the hook signature and destructure:
export const useMeetingSearch = ({ navigation }: UseMeetingSearchProps) => {
  const { guest } = useSelectedGuest();
  const { house } = useSelectedHouse();
  const userAsGuest = useAppSelector(state => state.guests.userAsGuest);
  const user = useAppSelector(state => state.user.user);

  const searchMutation = useSearchMeetings();
  const checkInMutation = useCheckIntoMeeting();

  const meetings = searchMutation.data ?? [];
  const searchingForMeetings = searchMutation.isPending;
  const checkingIn = checkInMutation.isPending;
  const checkInSuccessful = checkInMutation.isSuccess;
  const checkInError = checkInMutation.error instanceof Error
    ? checkInMutation.error.message
    : '';
```

Update the `searchForMeetings` call sites inside the hook to use `searchMutation.mutate`:

```typescript
const searchForMeetings = useCallback(
  (input: MeetingSearchInput) => searchMutation.mutate(input),
  [searchMutation],
);
```

Update `performCheckIn` to pass the required context:

```typescript
const performCheckIn = useCallback(
  (meeting: RatsMeeting) => {
    const guestRecord = guest ?? userAsGuest;
    if (!guestRecord?.id || !house?.id || !user?.id) return;
    const checkinInput = getCheckinInput(meeting, userLocation);
    checkInMutation.mutate({
      checkInInput: checkinInput,
      meeting,
      guestId: guestRecord.id,
      houseId: house.id,
      userId: user.id,
    });
  },
  [guest, userAsGuest, house, user, userLocation, checkInMutation],
);
```

Update the return object to remove the props-based state and expose the same API shape:

```typescript
return {
  // State
  searchTerm,
  filters,
  meetings,
  searchingForMeetings,
  checkingIn,
  checkInSuccessful,
  checkInError,
  userLocation,
  gettingPermissions,
  showForceModal,
  previousMeeting,
  guest,
  userAsGuest,
  // ... rest unchanged
};
```

- [ ] **Step 2: Simplify `MeetingSearch.tsx`**

Remove the Redux slice imports and replace the component:

```typescript
// Remove these imports:
// import { useAppSelector, useAppDispatch } from '../../state/store';
// import { searchForMeetings as searchForMeetingsThunk, checkIntoMeeting as checkIntoMeetingThunk } from '../../state/slices/meetingsSlice';

// The component body becomes:
const MeetingSearch: React.FC<Props> = ({ navigation }) => {
  const meetingSearch = useMeetingSearch({ navigation });
  // ... rest of render unchanged, since useMeetingSearch now exposes the same API
```

- [ ] **Step 3: Run tests**

```bash
npx jest src/screens/StatUpdates/__tests__/MeetingSearch.test.tsx
```

The existing mocks for `useMeetingSearch` already mock the whole hook, so tests should pass without modification. If any test passes raw Redux props to the component directly, update those tests to remove the Redux-shaped props.

- [ ] **Step 4: Commit**

```bash
git add src/screens/StatUpdates/MeetingSearch.tsx \
  src/screens/StatUpdates/MeetingSearch/useMeetingSearch.ts \
  src/screens/StatUpdates/__tests__/MeetingSearch.test.tsx
git commit -m "refactor(meetings): migrate MeetingSearch from Redux thunks to React Query mutations"
```

---

### Task M3-3: Migrate `NewMeeting.tsx` to use React Query

**Files:**

- Modify: `src/screens/StatUpdates/NewMeeting.tsx`

- [ ] **Step 1: Identify the Redux reads in `NewMeeting.tsx`**

The `NewMeetingWrapper` component (around line 131) reads:

```typescript
const error = useAppSelector(state => state.meetings.error);
const addingMeeting = useAppSelector(state => state.meetings.addingMeeting);
const checkInError = useAppSelector(state => state.meetings.checkInError);
```

And dispatches `addMeeting` thunk (check imports at top of file).

- [ ] **Step 2: Add `useAddMeeting` mutation to `meetingQueries.ts`**

Add this to `src/state/queries/meetingQueries.ts`:

```typescript
export function useAddMeeting() {
  return useMutation({
    mutationFn: ({
      meeting,
      isGuest,
    }: {
      meeting: RatsMeeting;
      isGuest: boolean;
    }) => meetingService.addMeeting(meeting),
  });
}
```

- [ ] **Step 3: Update `NewMeetingWrapper`**

```typescript
import {
  useAddMeeting,
  useCheckIntoMeeting,
} from '../../state/queries/meetingQueries';

const NewMeetingWrapper: React.FC<any> = props => {
  const { house } = useSelectedHouse();
  const user = useAppSelector(state => state.user.user);

  const addMeetingMutation = useAddMeeting();
  const checkInMutation = useCheckIntoMeeting();

  return (
    <NewMeeting
      {...props}
      house={house}
      user={user}
      error={
        addMeetingMutation.error instanceof Error
          ? addMeetingMutation.error.message
          : null
      }
      addingMeeting={addMeetingMutation.isPending}
      checkInError={
        checkInMutation.error instanceof Error
          ? checkInMutation.error.message
          : null
      }
      onAddMeeting={(meeting: RatsMeeting, isGuest: boolean) =>
        addMeetingMutation.mutate({ meeting, isGuest })
      }
    />
  );
};
```

Update `NewMeeting`'s props interface to replace the Redux-dispatch `addMeeting` prop with `onAddMeeting`, and update call sites inside the component accordingly.

- [ ] **Step 4: Run tests**

```bash
npx jest src/screens/StatUpdates/__tests__/NewMeeting.test.tsx --passWithNoTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/StatUpdates/NewMeeting.tsx src/state/queries/meetingQueries.ts
git commit -m "refactor(meetings): migrate NewMeeting from Redux addMeeting thunk to React Query mutation"
```

---

### Task M3-4: Mark `meetingsSlice` as deprecated and run full verification

**Files:**

- Modify: `src/state/slices/meetingsSlice.ts`
- Modify: `src/state/store.ts` (comment only)

- [ ] **Step 1: Add deprecation comment to meetingsSlice**

Add at the top of `src/state/slices/meetingsSlice.ts`:

```typescript
/**
 * @deprecated All async data operations have been migrated to React Query.
 * See src/state/queries/meetingQueries.ts.
 * This slice's reducers (clearMeetingError, resetCheckInStatus, clearMeetings)
 * can be removed once no consumer references state.meetings.*.
 * The store entry in store.ts can then be removed.
 */
```

- [ ] **Step 2: Verify no consumer reads `state.meetings.*` outside the slice**

```bash
grep -rn "state\.meetings\." src --include="*.ts" --include="*.tsx" | grep -v "meetingsSlice.ts" | grep -v "test\|spec"
```

Expected: no output. If any file still reads `state.meetings.*`, migrate it using the pattern from M3-2.

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: same or better pass count versus the baseline from M1-5.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/state/slices/meetingsSlice.ts src/state/store.ts
git commit -m "chore(meetings): mark meetingsSlice as deprecated — data moved to React Query"
```

---

## Final Verification Checklist

After all three migrations are complete, run this verification sweep:

- [ ] **All ESLint rules clean:**

  ```bash
  npm run lint
  ```

  Expected: exit 0.

- [ ] **No deprecated field writes remain:**

  ```bash
  grep -rn "\.createdDate\s*=" src --include="*.ts" --include="*.tsx" | grep -v test | grep -v "BaseEntity"
  grep -rn "\.lastUpdated\s*=" src --include="*.ts" --include="*.tsx" | grep -v test | grep -v "WeekSummary\|useWeekSummary"
  ```

  Expected: no output.

- [ ] **No raw stat key literals in switch/case:**

  ```bash
  grep -rn "case 'meeting':\|case 'chore':\|case 'work':\|case 'medication':\|case 'primary_supporter':" src --include="*.ts" --include="*.tsx" | grep -v test
  ```

  Expected: no output.

- [ ] **No consumer reading `state.meetings.*`:**

  ```bash
  grep -rn "state\.meetings\." src --include="*.ts" --include="*.tsx" | grep -v "meetingsSlice\|test\|spec"
  ```

  Expected: no output.

- [ ] **Full test suite:**
  ```bash
  npm test -- --passWithNoTests
  ```
  Expected: green.
