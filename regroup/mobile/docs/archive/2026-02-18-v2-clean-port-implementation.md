# RATS v2 Clean Port — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the RATS app to a clean v2 architecture — no embedded week data, hooks-only Redux, single navigator, all screens type-safe. Includes aligned changes to regroup-functions and rats-web.

**Architecture:** Branch from `mk/mass-miration`. Carry forward services, hooks, styles, and ActivityModel/WeekSummary entities. Rewrite Guest entity (remove embedded weeks), navigation, and any screens still using connect() HOC or props-based Redux. Update regroup-functions weekly transfer to use normalized model. Update rats-web entity types.

**Tech Stack:** React Native, Redux Toolkit, React Query, Firebase Firestore, TypeScript, React Navigation 6, Angular (rats-web), Node.js Cloud Functions (regroup-functions)

**Repos:** `rats` (mobile), `regroup-functions` (Cloud Functions), `rats-web` (Angular web)

**Design Doc:** `docs/plans/2026-02-18-clean-port-architecture-design.md`

---

## Phase 0: Branch Setup

### Task 0: Create v2 branch

**Files:** none — git operations only

**Step 1: Create the branch from mk/mass-miration**

```bash
git checkout mk/mass-miration
git pull origin mk/mass-miration
git checkout -b v2/clean-architecture
```

Expected: new branch created at same commit as `mk/mass-miration`

**Step 2: Verify clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

**Step 3: Push branch to remote**

```bash
git push -u origin v2/clean-architecture
```

---

## Phase 1: Entity Layer

### Task 1: Rewrite Guest entity (remove embedded weeks)

**Context:** `src/entities/Guest.tsx` currently embeds 3 `Week` objects in every Guest document. This is the root of the Firestore document-size anti-pattern. 28 files reference `.currentWeek` — those will be fixed in Phase 5 (screens).

**Files:**
- Modify: `src/entities/Guest.tsx`
- Test: `src/entities/__tests__/Guest.test.ts` (create new)

**Step 1: Write the failing test**

Create `src/entities/__tests__/Guest.test.ts`:

```typescript
import { Guest } from '../Guest';

describe('Guest entity', () => {
  it('should not have embedded week objects', () => {
    const guest = new Guest();
    expect(guest).not.toHaveProperty('currentWeek');
    expect(guest).not.toHaveProperty('previousWeek');
    expect(guest).not.toHaveProperty('nextWeek');
  });

  it('should have currentWeekId reference field', () => {
    const guest = new Guest();
    expect(guest).toHaveProperty('currentWeekId');
    expect(guest).toHaveProperty('currentWeekStartDate');
  });

  it('should have required identity fields', () => {
    const guest = new Guest();
    expect(guest).toHaveProperty('id');
    expect(guest).toHaveProperty('userId');
    expect(guest).toHaveProperty('houseId');
    expect(guest).toHaveProperty('status');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/entities/__tests__/Guest.test.ts --no-coverage
```

Expected: FAIL — `guest.currentWeek` exists, `guest.status` does not exist

**Step 3: Rewrite Guest.tsx**

Replace the entire file with:

```typescript
import * as yup from 'yup';
import { BaseEntity } from './BaseEntity';
import { Roles } from './Roles';
import { createGuestId } from '../services/guest';

export type GuestStatus = 'active' | 'inactive' | 'expelled';

export type PartialGuestWithId = Partial<Guest> & { id: string };

export class Guest extends BaseEntity {
  id: string = createGuestId();
  userId: string = '';
  houseId: string = '';
  displayName: string = '';
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  avatar?: string;
  phoneNumber?: string;

  // Recovery
  sobrietyDate: string = '';
  drugOfChoice: string = '';
  phase: string = 'default';

  // Status
  status: GuestStatus = 'active';
  isAdmin: boolean = false;
  infoEntered: boolean = false;
  hasJob: boolean = false;

  // Financial
  rentOwed: number = 0;
  choreFees: number = 0;
  dailyHabit: number = 0;

  // Relationships
  supporters: string[] = [];
  primarySupporterId?: string;
  primarySupporterName?: string;
  roles?: Roles;

  // Week reference (normalized — no embedded week objects)
  currentWeekId?: string;
  currentWeekStartDate?: string;

  // Timestamps
  version: number = 0;
  createdDate: string = new Date().toISOString();
  lastUpdated: string = new Date().toISOString();
  moveInDate?: string;
  moveOutDate?: string;
}

export const guestSchema = yup.object().shape({
  id: yup.string().notRequired(),
  houseId: yup.string().notRequired().max(50).min(1),
  email: yup.string().email().max(50).required('Email is required'),
  firstName: yup.string().required('First name is required').min(1).max(50),
  lastName: yup.string().required('Last name is required').min(1).max(50),
  sobrietyDate: yup.string().required('Sobriety date is required'),
  drugOfChoice: yup.string().required('Drug of choice is required').min(1).max(50),
  hasJob: yup.boolean().required(),
  phase: yup.string().required(),
  rentOwed: yup.number().typeError('Must be a number').default(0).min(0),
  choreFees: yup.number().typeError('Must be a number').default(0).integer().min(0),
  dailyHabit: yup.number().typeError('Must be a number').required().integer().min(0),
});
```

**Step 4: Run test to verify it passes**

```bash
npx jest src/entities/__tests__/Guest.test.ts --no-coverage
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/entities/Guest.tsx src/entities/__tests__/Guest.test.ts
git commit -m "refactor(entities): Remove embedded Week objects from Guest entity

Guest now uses currentWeekId reference instead of embedding
currentWeek/previousWeek/nextWeek objects. Eliminates the root
cause of Firestore 1MB document-size risk.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Add Oxford House entity interfaces

**Context:** Oxford House features are UI-gated but we define the data shapes now to avoid schema migrations later. These are TypeScript interfaces + Firestore collection stubs — no UI implementation.

**Files:**
- Create: `src/entities/oxford/Officer.ts`
- Create: `src/entities/oxford/BusinessMeeting.ts`
- Create: `src/entities/oxford/Vote.ts`
- Create: `src/entities/oxford/Election.ts`
- Create: `src/entities/oxford/EESTransaction.ts`
- Create: `src/entities/oxford/FinancialRecord.ts`
- Create: `src/entities/oxford/index.ts`

**Step 1: Create Officer entity**

```typescript
// src/entities/oxford/Officer.ts
export type OfficerRole = 'president' | 'treasurer' | 'secretary' | 'comptroller';

export interface Officer {
  id: string;
  houseId: string;
  userId: string;
  role: OfficerRole;
  termStartDate: string; // ISO date string
  termEndDate: string;   // ISO date string (~6 months)
  isActive: boolean;
  electedAt: string;     // ISO timestamp
}
```

**Step 2: Create BusinessMeeting entity**

```typescript
// src/entities/oxford/BusinessMeeting.ts
export interface AgendaItem {
  id: string;
  title: string;
  description?: string;
  addedBy: string; // userId
  voteId?: string;
}

export interface BusinessMeeting {
  id: string;
  houseId: string;
  scheduledDate: string;  // ISO date
  actualDate?: string;
  agenda: AgendaItem[];
  attendees: string[];    // userId[]
  quorumMet: boolean;
  minutes?: string;
  createdBy: string;
  createdAt: string;
}
```

**Step 3: Create Vote entity**

```typescript
// src/entities/oxford/Vote.ts
export type VoteType =
  | 'acceptance'
  | 'expulsion'
  | 'officer_removal'
  | 'chore_assignment'
  | 'general';

export interface Vote {
  id: string;
  houseId: string;
  meetingId?: string;  // null for async votes
  topic: string;
  description: string;
  type: VoteType;
  options: string[];
  results: { [option: string]: number };
  individualVotes: { [userId: string]: string };
  threshold: number;  // e.g. 0.8 for 80% acceptance requirement
  passed: boolean;
  closedAt?: string;
  createdAt: string;
}
```

**Step 4: Create Election entity**

```typescript
// src/entities/oxford/Election.ts
import { OfficerRole } from './Officer';

export interface ElectionCandidate {
  userId: string;
  nominatedBy: string;
}

export interface Election {
  id: string;
  houseId: string;
  role: OfficerRole;
  candidates: ElectionCandidate[];
  voteId: string;       // references votes collection
  winnerId?: string;
  termStartDate: string;
  termEndDate: string;
  conductedAt: string;
}
```

**Step 5: Create EESTransaction entity**

```typescript
// src/entities/oxford/EESTransaction.ts
export type EESTransactionType = 'payment' | 'adjustment' | 'refund';
export type EESTransactionStatus = 'pending' | 'paid' | 'overdue';

export interface EESTransaction {
  id: string;
  houseId: string;
  guestId: string;
  amount: number;
  period: string;  // YYYY-MM-DD (week start)
  type: EESTransactionType;
  status: EESTransactionStatus;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}
```

**Step 6: Create FinancialRecord entity**

```typescript
// src/entities/oxford/FinancialRecord.ts
export interface FinancialLineItem {
  category: string;
  amount: number;
}

export interface FinancialRecord {
  id: string;
  houseId: string;
  period: string;  // YYYY-MM-DD (week start)
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  breakdown: FinancialLineItem[];
  submittedBy: string;
  submittedAt: string;
  approvedByVote: boolean;
  voteId?: string;
}
```

**Step 7: Create index barrel file**

```typescript
// src/entities/oxford/index.ts
export type { Officer, OfficerRole } from './Officer';
export type { BusinessMeeting, AgendaItem } from './BusinessMeeting';
export type { Vote, VoteType } from './Vote';
export type { Election, ElectionCandidate } from './Election';
export type { EESTransaction, EESTransactionType, EESTransactionStatus } from './EESTransaction';
export type { FinancialRecord, FinancialLineItem } from './FinancialRecord';
```

**Step 8: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "oxford" | head -20
```

Expected: no errors in oxford/ files

**Step 9: Commit**

```bash
git add src/entities/oxford/
git commit -m "feat(entities): Add Oxford House entity type definitions

Defines Officer, BusinessMeeting, Vote, Election, EESTransaction,
and FinancialRecord interfaces. Data shapes are established now
to prevent schema migrations when Oxford House UI is built.
UI features remain gated by house.type === 'oxford'.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: Redux Store Cleanup

### Task 3: Verify store is clean and update guestsSlice type

**Context:** The store.ts is already RTK-based. The guestsSlice imports Guest which had embedded weeks — update the state type to match the new Guest entity and remove any dead state fields.

**Files:**
- Modify: `src/state/slices/guestsSlice.ts`

**Step 1: Read the current guestsSlice**

```bash
cat src/state/slices/guestsSlice.ts
```

Look for any state fields that reference embedded week data (`currentWeek`, `previousWeek`, `nextWeek`) or are loading-state triplets (requesting/succeeded/failed) that should be RTK `status` fields.

**Step 2: Update GuestsState interface to clean pattern**

The clean RTK pattern for async state uses `status: 'idle' | 'loading' | 'succeeded' | 'failed'` instead of triplet booleans. Replace the existing GuestsState with:

```typescript
interface GuestsState {
  guests: { [id: string]: Guest };
  selectedGuest: Guest | null;
  userAsGuest: Guest | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  // Per-operation status
  updateStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  createStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  deleteStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
}
```

**Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "guestsSlice" | head -20
```

Fix any type errors found. Screens using old triplet state fields (`requestingGuests`, etc.) will show errors — note them for Phase 5 screen fixes.

**Step 4: Commit**

```bash
git add src/state/slices/guestsSlice.ts
git commit -m "refactor(state): Simplify guestsSlice state shape to RTK pattern

Replace boolean triplets with status enum pattern.
Remove Guest entity embedded week dependencies.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Run full TypeScript check and inventory broken imports

**Context:** After changing Guest entity, there will be TypeScript errors throughout the codebase from files that accessed `.currentWeek`, `.previousWeek`, `.nextWeek`. Inventory them now before fixing screens.

**Step 1: Run full TypeScript compilation**

```bash
npx tsc --noEmit 2>&1 | tee /tmp/ts-errors.txt | wc -l
```

**Step 2: Count errors by category**

```bash
grep "currentWeek\|previousWeek\|nextWeek" /tmp/ts-errors.txt | wc -l
grep "requestingGuests\|requestingGuestsFailed" /tmp/ts-errors.txt | wc -l
```

**Step 3: List affected files**

```bash
grep "error TS" /tmp/ts-errors.txt | sed "s/(.*//" | sort -u
```

This gives the hit list for Phase 5. Paste the output in a comment below so you know which screens need fixing.

**Step 4: Commit the inventory (no code changes)**

```bash
git commit --allow-empty -m "chore: TypeScript error inventory after entity refactor

Run 'npx tsc --noEmit' to see current broken files.
These are fixed in Phase 5 (screen migrations).

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Navigation

### Task 5: Create single clean navigator

**Context:** Two navigator files exist — `src/navigation/navigators.tsx` (active) and `src/navigation/improved-navigators.tsx` (parallel implementation). The goal is one clean file. Start from `navigators.tsx` which is the current active one.

**Files:**
- Modify: `src/navigation/navigators.tsx` (this becomes the single source of truth)
- Delete: `src/navigation/improved-navigators.tsx`

**Step 1: Read both navigator files**

```bash
cat src/navigation/navigators.tsx
cat src/navigation/improved-navigators.tsx
```

Note any screens in `improved-navigators.tsx` that are NOT in `navigators.tsx`.

**Step 2: Verify navigators.tsx has all screens**

Cross-reference the screen list in `navigators.tsx` against `src/screens/` directory. Every routable screen should appear in `navigators.tsx`.

Missing screens from the RootStack.Group (modal screens) in `navigators.tsx`:
- `Routes.HouseSummary` ✓
- `Routes.Beds` ✓
- `Routes.HouseDisputes` ✓
- `Routes.GuestOverview` ✓
- `Routes.MeetingSummary` ✓
- `Routes.WorkSummary` ✓
- `Routes.ChoreSummary` ✓
- `Routes.SupporterSummary` ✓

Add any missing screens before deleting `improved-navigators.tsx`.

**Step 3: Verify no `as any` casts remain in navigators.tsx**

```bash
grep "as any" src/navigation/navigators.tsx
```

Expected: no output. If any exist, remove them and fix the underlying TypeScript issue first.

**Step 4: Delete improved-navigators.tsx**

```bash
rm src/navigation/improved-navigators.tsx
```

**Step 5: Check for any imports of improved-navigators**

```bash
grep -r "improved-navigators" src/ --include="*.ts" --include="*.tsx"
```

Expected: no results. If any exist, update them to import from `navigators.tsx`.

**Step 6: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -i "navigat" | head -20
```

Expected: no navigation-related errors.

**Step 7: Commit**

```bash
git add src/navigation/
git rm src/navigation/improved-navigators.tsx
git commit -m "refactor(navigation): Remove duplicate navigator, single source of truth

Deleted improved-navigators.tsx. navigators.tsx is the canonical
navigator. All screens accounted for in RootStack.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Navigation Types Audit

### Task 6: Verify navigation types and Routes enum

**Context:** The `Routes` enum and `RootStackParamList` type must match what's in `navigators.tsx`. TypeScript errors in screens often trace back to mismatches here.

**Files:**
- Read: `src/navigation/types.ts`

**Step 1: Read navigation types**

```bash
cat src/navigation/types.ts
```

**Step 2: Verify every Route in the enum is used in a navigator screen**

```bash
grep "Routes\." src/navigation/navigators.tsx | grep "name={" | sed 's/.*name={Routes\.\([^}]*\)}.*/\1/' | sort > /tmp/nav-routes.txt
grep "^\s*[A-Z].*=.*'" src/navigation/types.ts | sed "s/.*= '//;s/'.*//" | sort > /tmp/enum-routes.txt
diff /tmp/enum-routes.txt /tmp/nav-routes.txt
```

Routes in the enum but not in a navigator = dead routes (can be removed).
Routes in navigator but not in enum = TypeScript error.

**Step 3: Remove dead Routes from the enum**

Any Route defined in the enum but never used in any navigator screen should be removed.

**Step 4: Commit**

```bash
git add src/navigation/types.ts
git commit -m "chore(navigation): Remove unused Routes from enum

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 5: Screen Migrations

**Pattern for every screen in this phase:**

```typescript
// BEFORE (old pattern)
const mapStateToProps = (state: any) => ({ guest: state.guestsRTK.selectedGuest });
export default connect(mapStateToProps)(MyScreen);

// AFTER (correct pattern)
const MyScreen: React.FC<{ navigation: NavigationProp<any> }> = ({ navigation }) => {
  const guest = useAppSelector(state => state.guestsRTK.selectedGuest);
  const dispatch = useAppDispatch();
  // ...
};
export default MyScreen;
```

For screens that accessed `.currentWeek` on a guest:

```typescript
// BEFORE
const meetings = guest.currentWeek.meetings;

// AFTER — use WeekSummary hook
const { summary } = useWeekSummary(guest.id, guest.houseId, guest.currentWeekStartDate ?? '');
const meetingCount = summary?.stats.meetingsAttended ?? 0;
```

---

### Task 7: Fix GuestHome screen

**Files:**
- Modify: `src/screens/Profile/GuestHome.tsx`

**Step 1: Read the file**

```bash
cat src/screens/Profile/GuestHome.tsx
```

**Step 2: Check if it uses connect() or embedded week data**

```bash
grep -n "connect\|currentWeek\|previousWeek\|nextWeek\|mapStateToProps" src/screens/Profile/GuestHome.tsx
```

**Step 3: If connect() found, migrate to hooks**

Replace `mapStateToProps`/`connect()` with `useAppSelector`:

```typescript
// Replace connect block with:
const guest = useAppSelector(state => state.guestsRTK.userAsGuest);
const dispatch = useAppDispatch();
```

**Step 4: If currentWeek access found, replace with WeekSummary hook**

```typescript
import { useWeekSummary } from '../../hooks/activity/useWeekSummary';

// Inside component:
const { summary, loading } = useWeekSummary(
  guest?.id,
  guest?.houseId,
  guest?.currentWeekStartDate ?? ''
);
```

**Step 5: Run TypeScript check for this file**

```bash
npx tsc --noEmit 2>&1 | grep "GuestHome"
```

Expected: no errors

**Step 6: Commit**

```bash
git add src/screens/Profile/GuestHome.tsx
git commit -m "refactor(screens): Migrate GuestHome to hooks-only Redux pattern

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Fix HouseSummary screen

**Files:**
- Modify: `src/screens/HouseOverview/HouseSummary/HouseSummary.tsx`

Follow the same pattern as Task 7. Check for `connect()`, `currentWeek`, `mapStateToProps`.

```bash
grep -n "connect\|currentWeek\|mapStateToProps" src/screens/HouseOverview/HouseSummary/HouseSummary.tsx
```

Migrate to `useAppSelector(state => state.housesRTK.selectedHouse)` and `useAppSelector(state => state.guestsRTK.guests)`.

Commit after fixing.

---

### Task 9: Fix GuestMeetingSummary, GuestWorkSummary, GuestChoreSummary, GuestSupporterSummary

**Files:**
- Modify: `src/screens/GuestMeetingOverview/GuestMeetingSummary/GuestMeetingSummary.tsx`
- Modify: `src/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx`
- Modify: `src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx`
- Modify: `src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx`

All four of these summary screens display stats for a guest's week. They likely accessed `guest.currentWeek.X`. They should all use `useWeekSummary`.

**Step 1: Check all four files**

```bash
grep -n "currentWeek\|connect\|mapStateToProps" \
  src/screens/GuestMeetingOverview/GuestMeetingSummary/GuestMeetingSummary.tsx \
  src/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx \
  src/screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx \
  src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx
```

**Step 2: For each file, apply the WeekSummary hook pattern**

The stat each screen displays:
- `GuestMeetingSummary` → `summary.stats.meetingsAttended`
- `GuestWorkSummary` → `summary.stats.hoursWorked`
- `GuestChoreSummary` → `summary.stats.choresCompleted`
- `GuestSupporterSummary` → `summary.stats.primarySupporterMet`

**Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "GuestMeeting|GuestWork|GuestChore|GuestSupporter"
```

**Step 4: Commit all four**

```bash
git add src/screens/GuestMeetingOverview/ src/screens/GuestWorkOverview/ \
        src/screens/GuestChoreOverview/ src/screens/GuestSupporterOverview/
git commit -m "refactor(screens): Migrate guest summary screens to WeekSummary hook

All four guest summary screens (meeting, work, chore, supporter)
now derive stats from useWeekSummary instead of embedded week data.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 10: Fix ActivityScreen

**Files:**
- Modify: `src/screens/Activity/ActivityScreen.tsx`

```bash
grep -n "connect\|currentWeek\|mapStateToProps" src/screens/Activity/ActivityScreen.tsx
```

ActivityScreen should use `useActivities` hook (already exists in `src/hooks/activity/useActivities.ts`) and `useAppSelector` for any Redux state.

Commit after fixing.

---

### Task 11: Fix remaining screens from TypeScript error inventory

**Context:** Use the list generated in Task 4 (`/tmp/ts-errors.txt`). Work through each remaining file.

For each file in the list:

1. Read the file
2. Identify: connect() HOC, mapStateToProps, currentWeek/previousWeek/nextWeek access
3. Apply the fix:
   - `connect()` → `useAppSelector` + `useAppDispatch`
   - `.currentWeek.X` → `useWeekSummary` hook
4. Run `npx tsc --noEmit 2>&1 | grep "FileName"`
5. Commit with descriptive message

Screens likely in the list (based on 28 files accessing `.currentWeek`):
- `src/screens/Beds/Beds.tsx`
- `src/screens/Disputes/Disputes.tsx`
- `src/screens/Issues/Issues.tsx`
- `src/screens/Complaints/Complaints.tsx`
- `src/screens/GuestList/GuestList.tsx`
- `src/screens/HouseSettings/HouseSettings.tsx`
- `src/screens/Personal/Personal.tsx`
- `src/screens/StatUpdates/NewMeeting.tsx`

Commit each screen fix separately.

---

## Phase 6: Clean TypeScript Check

### Task 12: Zero TypeScript errors

**Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tee /tmp/ts-final.txt | wc -l
```

**Step 2: Fix all remaining errors**

For each error:
1. Read the file
2. Identify root cause (type mismatch, missing import, old pattern)
3. Fix minimally — don't refactor surrounding code
4. Re-run `npx tsc --noEmit 2>&1 | grep "FileName"` to verify fixed

**Step 3: Verify zero errors**

```bash
npx tsc --noEmit && echo "✅ Zero TypeScript errors"
```

Expected: `✅ Zero TypeScript errors`

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(typescript): Achieve zero TypeScript errors across codebase

All screens migrated to hooks-only Redux pattern.
All embedded week references replaced with WeekSummary hook.
All navigation screen definitions are type-safe.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 7: Oxford House House Entity Update

### Task 13: Add `type` field to House entity

**Context:** House entity needs a `type` field to distinguish Traditional vs Oxford House. This enables `house.type === 'oxford'` gating throughout the app.

**Files:**
- Modify: `src/entities/House.tsx`

**Step 1: Add HouseType to House class**

Add to the House class (after line with `isDemoHouse`):

```typescript
// House model type — gates Oxford House features
houseType: 'traditional' | 'oxford' = 'traditional';
```

Note: Use `houseType` (not `type`) to avoid shadowing BaseEntity or causing Firestore indexing issues with a field named `type`.

**Step 2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "House.tsx"
```

**Step 3: Commit**

```bash
git add src/entities/House.tsx
git commit -m "feat(entities): Add houseType field to House entity

'traditional' | 'oxford' type field enables gating of Oxford
House features throughout the app. Defaults to 'traditional'.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 8: Final Verification

### Task 14: Full verification pass

**Step 1: TypeScript**

```bash
npx tsc --noEmit && echo "✅ TypeScript clean"
```

**Step 2: Run unit tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass. If any fail, fix them before proceeding.

**Step 3: Check for any remaining connect() HOC usage in screens**

```bash
grep -rn "connect(" src/screens/ --include="*.tsx"
```

Expected: no output (or only legitimate non-Redux uses)

**Step 4: Check for any remaining embedded week access**

```bash
grep -rn "\.currentWeek\|\.previousWeek\|\.nextWeek" src/screens/ src/state/ --include="*.ts" --include="*.tsx"
```

Expected: no output

**Step 5: Check for any `as any` in navigators**

```bash
grep -n "as any" src/navigation/navigators.tsx
```

Expected: no output

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: v2 clean port complete — verification pass

✅ Zero TypeScript errors
✅ All unit tests passing
✅ No connect() HOC in screens
✅ No embedded week data access
✅ No 'as any' in navigation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 9: regroup-functions — Weekly Transfer Migration

**Context:** This is the most critical cross-repo change. The five scheduled transfer functions and `adHocTransfer` all depend on `guest.currentWeek` being embedded in the guest Firestore document. When the mobile app removes this field from the data model, these functions will either silently fail (no week rotation) or throw at runtime.

**Strategy:** Rewrite the weekly transfer to work with the new normalized model:
- Old: read `guest.currentWeek`, rotate to `previousWeek`, write new embedded week back to guest
- New: update `guest.currentWeekId` and `guest.currentWeekStartDate` to point to next week; activities and week-summaries are already normalized

**Repo:** `/Users/marcusklein/dev/regroup-functions`

---

### Task 15: Update functions Guest entity

**Files:**
- Modify: `functions/src/entities/Guest.ts`

**Step 1: Read the current functions Guest entity**

```bash
cat /Users/marcusklein/dev/regroup-functions/functions/src/entities/Guest.ts
```

Note all fields that reference `Week` objects.

**Step 2: Remove embedded week fields, add normalized references**

Find and remove:
```typescript
currentWeek: Week;
previousWeek: Week;
nextWeek: Week;
```

Add in their place (if not already present):
```typescript
// Week reference (normalized)
currentWeekId?: string;      // Format: {guestId}_{YYYY-MM-DD}
currentWeekStartDate?: string; // ISO date string YYYY-MM-DD
```

**Step 3: Run TypeScript check in functions**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit 2>&1 | tee /tmp/functions-ts-errors.txt | wc -l
```

This will reveal all usages of the removed fields.

**Step 4: Commit entity change**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/entities/Guest.ts
git commit -m "refactor(entities): Remove embedded Week from Guest entity

Replace currentWeek/previousWeek/nextWeek embedded objects with
currentWeekId and currentWeekStartDate reference fields.
Aligns with RATS mobile app v2 normalized data model.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 16: Rewrite weekly transfer logic

**Context:** The weekly transfer currently:
1. Checks if `guest.currentWeek` is stale (past end date)
2. Archives `guest.currentWeek` to `guest-weeks` collection
3. Rotates: `previousWeek = currentWeek`
4. Creates new `currentWeek = new Week(guest)` with next week's dates
5. Writes entire updated guest back to Firestore

In the new model, activities are already in their own `activities` collection (normalized), so archiving is unnecessary. The transfer only needs to:
1. Calculate the new week's start date (next Monday)
2. Update `guest.currentWeekId` and `guest.currentWeekStartDate`
3. The new `week-summaries` document will be created lazily by the first activity of the new week, or can be pre-created here as an empty summary

**Files:**
- Modify: `functions/src/util/guest.ts`
- Modify: `functions/src/util/week.ts`
- Modify: `functions/src/index.ts` (the scheduled transfer functions)

**Step 1: Read the transfer utility files**

```bash
cat /Users/marcusklein/dev/regroup-functions/functions/src/util/guest.ts
cat /Users/marcusklein/dev/regroup-functions/functions/src/util/week.ts
```

**Step 2: Write a failing test for the new transfer logic**

Create `functions/src/util/__tests__/weekTransfer.test.ts`:

```typescript
import { getNextWeekStart, buildWeekId } from '../week';

describe('week utilities', () => {
  it('buildWeekId returns correct format', () => {
    const id = buildWeekId('guest123', '2026-02-16');
    expect(id).toBe('guest123_2026-02-16');
  });

  it('getNextWeekStart returns next Monday from a Sunday', () => {
    // 2026-02-15 is a Sunday
    const next = getNextWeekStart('2026-02-15');
    expect(next).toBe('2026-02-16'); // Monday
  });

  it('getNextWeekStart returns next Monday from a Monday', () => {
    // 2026-02-16 is a Monday
    const next = getNextWeekStart('2026-02-16');
    expect(next).toBe('2026-02-23'); // Following Monday
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest src/util/__tests__/weekTransfer.test.ts --no-coverage
```

Expected: FAIL — `buildWeekId` and `getNextWeekStart` not yet exported

**Step 4: Add utility functions to week.ts**

Add these exports to `functions/src/util/week.ts`:

```typescript
/**
 * Build a week document ID from guestId and week start date
 * Format: {guestId}_{YYYY-MM-DD}
 */
export function buildWeekId(guestId: string, weekStart: string): string {
  return `${guestId}_${weekStart}`;
}

/**
 * Get the next week's Monday start date from any date string
 * @param fromDate - ISO date string YYYY-MM-DD
 * @returns ISO date string YYYY-MM-DD of the next Monday
 */
export function getNextWeekStart(fromDate: string): string {
  const date = new Date(fromDate + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon
  const daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(date);
  nextMonday.setUTCDate(date.getUTCDate() + daysUntilNextMonday);
  return nextMonday.toISOString().split('T')[0];
}

/**
 * Get the current week's Monday start date from any date
 */
export function getCurrentWeekStart(date: Date = new Date()): string {
  const dayOfWeek = date.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - daysToMonday);
  return monday.toISOString().split('T')[0];
}
```

**Step 5: Run test to verify it passes**

```bash
npx jest src/util/__tests__/weekTransfer.test.ts --no-coverage
```

Expected: PASS (3 tests)

**Step 6: Rewrite the transferGuestWeek function in guest.ts**

Replace the existing `transferGuestWeekWithRetry` / `transferStats` logic with:

```typescript
import { buildWeekId, getCurrentWeekStart, getNextWeekStart } from './week';

/**
 * Advance a guest's week reference in a Firestore transaction.
 * In the normalized model, this only updates currentWeekId and currentWeekStartDate.
 * Activities and week-summaries are already stored in their own collections.
 */
export async function advanceGuestWeek(
  db: FirebaseFirestore.Firestore,
  guestRef: FirebaseFirestore.DocumentReference,
  guest: Guest,
): Promise<void> {
  const currentWeekStart = guest.currentWeekStartDate ?? getCurrentWeekStart();
  const nextWeekStart = getNextWeekStart(currentWeekStart);
  const nextWeekId = buildWeekId(guest.id, nextWeekStart);
  const nextWeekEnd = new Date(nextWeekStart + 'T00:00:00Z');
  nextWeekEnd.setUTCDate(nextWeekEnd.getUTCDate() + 6);
  const nextWeekEndStr = nextWeekEnd.toISOString().split('T')[0];

  await db.runTransaction(async (transaction) => {
    const currentDoc = await transaction.get(guestRef);
    if (!currentDoc.exists) return;

    const currentGuest = currentDoc.data() as Guest;

    // Only advance if the week has actually ended
    const today = getCurrentWeekStart();
    if (currentGuest.currentWeekStartDate === today) {
      console.log(`Guest ${guest.id} week is current, skipping`);
      return;
    }

    // Update guest week reference
    transaction.update(guestRef, {
      currentWeekId: nextWeekId,
      currentWeekStartDate: nextWeekStart,
      lastUpdated: new Date().toISOString(),
    });

    // Pre-create empty week-summary document for the new week
    const summaryRef = db.collection('week-summaries').doc(nextWeekId);
    transaction.set(summaryRef, {
      id: nextWeekId,
      guestId: guest.id,
      houseId: guest.houseId,
      startDate: nextWeekStart,
      endDate: nextWeekEndStr,
      stats: {
        choresCompleted: 0,
        meetingsAttended: 0,
        hoursWorked: 0,
        medicationTaken: 0,
        primarySupporterMet: 0,
      },
      dailyStats: {},
      lastUpdated: new Date().toISOString(),
      activityCount: 0,
    }, { merge: true }); // merge:true so we don't overwrite if it already exists
  });
}
```

**Step 7: Update the scheduled transfer functions in index.ts**

Replace calls to the old `transferStats()` with `advanceGuestWeek()`. The pattern for each timezone-specific scheduled function:

```typescript
// Old pattern (remove):
await transferStats(db, houseSnap, timezone);

// New pattern:
const guestsSnap = await db.collection('guests')
  .where('houseId', '==', houseId)
  .where('status', '==', 'active')
  .get();

const transfers = guestsSnap.docs.map(async (doc) => {
  const guest = doc.data() as Guest;
  await advanceGuestWeek(db, doc.ref, guest);
});

await Promise.allSettled(transfers);
```

**Step 8: TypeScript check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit && echo "✅ Functions TypeScript clean"
```

**Step 9: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/
git commit -m "refactor(transfer): Rewrite weekly transfer for normalized data model

Replace embedded week rotation (currentWeek → previousWeek) with
simple guest.currentWeekId + currentWeekStartDate reference update.
Activities and week-summaries are already normalized collections —
no archiving needed.

Adds buildWeekId(), getNextWeekStart(), getCurrentWeekStart() utilities.
Adds advanceGuestWeek() as the new transfer function.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 17: Update adHocTransfer function

**Files:**
- Modify: `functions/src/index.ts` (adHocTransfer function)

**Step 1: Read the adHocTransfer function**

```bash
grep -A 50 "adHocTransfer" /Users/marcusklein/dev/regroup-functions/functions/src/index.ts | head -60
```

**Step 2: Replace adHocTransfer body**

The adHocTransfer allows operators to manually trigger a week transfer for a specific guest. Update it to use `advanceGuestWeek`:

```typescript
// Old: called transferStats or manipulated guest.currentWeek directly
// New:
const guestRef = db.collection('guests').doc(data.guestId);
const guestDoc = await guestRef.get();
if (!guestDoc.exists) {
  throw new functions.https.HttpsError('not-found', 'Guest not found');
}
const guest = guestDoc.data() as Guest;
await advanceGuestWeek(db, guestRef, guest);
return { success: true };
```

**Step 3: TypeScript check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit 2>&1 | grep "adHocTransfer\|index.ts" | head -20
```

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/index.ts
git commit -m "refactor(transfer): Update adHocTransfer to use advanceGuestWeek

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 18: Clean up dead functions entity code

**Step 1: Check for any remaining references to old Week embedding in functions**

```bash
grep -rn "currentWeek\|previousWeek\|nextWeek\|startNewWeek\|guest-weeks" \
  /Users/marcusklein/dev/regroup-functions/functions/src/
```

**Step 2: Delete dead utility files if fully replaced**

If `util/week.ts` still has `startNewWeek` or other functions that manipulate embedded weeks, remove them. Keep only the new utilities (`buildWeekId`, `getNextWeekStart`, `getCurrentWeekStart`).

If `entities/Week.ts` is no longer imported anywhere, it can be deleted:

```bash
grep -rn "from.*entities/Week\|require.*entities/Week" \
  /Users/marcusklein/dev/regroup-functions/functions/src/
```

**Step 3: Final functions TypeScript check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx tsc --noEmit && echo "✅ Functions clean"
```

**Step 4: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add -A
git commit -m "chore(cleanup): Remove dead embedded-week code from functions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 19: Test weekly transfer locally with Firebase emulator

**Context:** The weekly transfer is critical infrastructure. Test it against the emulator before deploying.

**Step 1: Start the Firebase emulator**

```bash
cd /Users/marcusklein/dev/regroup-functions
firebase emulators:start --only functions,firestore
```

**Step 2: Seed a test guest document**

Using the Firestore emulator UI (http://localhost:4000) or a seed script, create a guest document:

```json
{
  "id": "test-guest-001",
  "houseId": "test-house-001",
  "status": "active",
  "currentWeekId": "test-guest-001_2026-02-09",
  "currentWeekStartDate": "2026-02-09"
}
```

Note: `currentWeekStartDate` is intentionally set to a past week to trigger the transfer.

**Step 3: Trigger adHocTransfer**

Call the function via the emulator:

```bash
curl -X POST http://localhost:5001/<project-id>/us-central1/adHocTransfer \
  -H "Content-Type: application/json" \
  -d '{"data": {"guestId": "test-guest-001"}}'
```

**Step 4: Verify in emulator UI**

Check the Firestore emulator UI:
- `guests/test-guest-001` should have `currentWeekStartDate: "2026-02-16"` (or current Monday)
- `week-summaries/test-guest-001_2026-02-16` should exist with empty stats

**Step 5: Commit test notes**

```bash
cd /Users/marcusklein/dev/regroup-functions
git commit --allow-empty -m "test: Verified weekly transfer with Firebase emulator

adHocTransfer correctly updates guest.currentWeekId and
creates empty week-summary document. No embedded week data.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Phase 10: rats-web — Entity Update

**Context:** The Angular web app (`/Users/marcusklein/dev/rats-web`) maintains its own copy of the Guest entity with `currentWeek: Week` and `previousWeek: Week`. The web app doesn't appear to operationally display week data (no GuestService reading `guests` collection), but the type mismatch will cause runtime errors if any code reads a guest document and tries to access typed `currentWeek` which is now `undefined` in Firestore.

**Repo:** `/Users/marcusklein/dev/rats-web`

---

### Task 20: Update rats-web Guest entity

**Files:**
- Modify: `src/app/entities/Guest.ts`

**Step 1: Read the current Guest entity**

```bash
cat /Users/marcusklein/dev/rats-web/src/app/entities/Guest.ts
```

**Step 2: Remove embedded week fields and yup schema references**

Find and remove:
```typescript
currentWeek: Week;
previousWeek: Week;
```

And from the `guestSchema` yup validation:
```typescript
currentWeek: weekSchema,
previousWeek: weekSchema,
```

Add normalized week reference fields:
```typescript
// Week reference (normalized)
currentWeekId?: string;
currentWeekStartDate?: string;
```

**Step 3: Check if Week import is still needed**

```bash
grep -n "Week\b" /Users/marcusklein/dev/rats-web/src/app/entities/Guest.ts
```

If `Week` is no longer referenced, remove the import.

**Step 4: Run Angular TypeScript check**

```bash
cd /Users/marcusklein/dev/rats-web
npx tsc --noEmit 2>&1 | grep -i "guest\|week" | head -30
```

Fix any type errors found.

**Step 5: Check if any Angular components access currentWeek**

```bash
grep -rn "currentWeek\|previousWeek" /Users/marcusklein/dev/rats-web/src/ \
  --include="*.ts" --include="*.html"
```

Fix any component references found. Based on the exploration, the web app doesn't appear to operationally use week data, but verify.

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/rats-web
git add src/app/entities/Guest.ts
git commit -m "refactor(entities): Remove embedded Week from Guest entity

Aligns with RATS v2 normalized data model.
currentWeek/previousWeek removed; currentWeekId added as reference.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 21: Update rats-web House entity

**Files:**
- Modify: `src/app/entities/House.ts`

**Step 1: Add houseType field**

```typescript
// House model type — gates Oxford House features
houseType: 'traditional' | 'oxford' = 'traditional';
```

This mirrors Task 13 in the RATS mobile app.

**Step 2: TypeScript check**

```bash
cd /Users/marcusklein/dev/rats-web
npx tsc --noEmit 2>&1 | grep "House.ts"
```

**Step 3: Commit**

```bash
cd /Users/marcusklein/dev/rats-web
git add src/app/entities/House.ts
git commit -m "feat(entities): Add houseType field to House entity

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 22: Final rats-web TypeScript verification

```bash
cd /Users/marcusklein/dev/rats-web
npx tsc --noEmit && echo "✅ rats-web TypeScript clean"
```

If errors remain, fix them. Commit the fixes.

---

## Appendix: Key File Locations

### RATS Mobile App (`/Users/marcusklein/dev/rats`)

| Purpose | Path |
|---------|------|
| Store + hooks | `src/state/store.ts` |
| useAppSelector/Dispatch | `src/state/hooks.ts` |
| Navigator | `src/navigation/navigators.tsx` |
| Route types | `src/navigation/types.ts` |
| Guest entity | `src/entities/Guest.tsx` |
| Oxford House entities | `src/entities/oxford/` |
| WeekSummary entity | `src/entities/WeekSummary.ts` |
| ActivityModel entity | `src/entities/ActivityModel.ts` |
| House entity | `src/entities/House.tsx` |
| useWeekSummary hook | `src/hooks/activity/useWeekSummary.ts` |
| useActivities hook | `src/hooks/activity/useActivities.ts` |
| Theme/styles | `src/styles/theme.ts` |
| Design doc | `docs/plans/2026-02-18-clean-port-architecture-design.md` |

### regroup-functions (`/Users/marcusklein/dev/regroup-functions`)

| Purpose | Path |
|---------|------|
| Guest entity | `functions/src/entities/Guest.ts` |
| Week utilities | `functions/src/util/week.ts` |
| Guest transfer logic | `functions/src/util/guest.ts` |
| Function entrypoints | `functions/src/index.ts` |
| Stripe Connect functions | `functions/src/stripeConnect.ts` |
| Firestore collection refs | `functions/src/api/firestore.ts` |

### rats-web (`/Users/marcusklein/dev/rats-web`)

| Purpose | Path |
|---------|------|
| Guest entity | `src/app/entities/Guest.ts` |
| House entity | `src/app/entities/House.ts` |
| Week entity | `src/app/entities/Week.ts` |
| House service | `src/app/services/house.service.ts` |
| Cloud functions service | `src/app/services/functions/cloud-function.service.ts` |

---

## Appendix: Cross-Repo Deployment Order

**CRITICAL:** The Firestore data model change (removing `guest.currentWeek`) affects all three repos. Deploy in this order to avoid downtime:

1. **Deploy regroup-functions first** (Phases 9) — the new transfer logic must be live before the guest documents lose their embedded week data
2. **Run data migration** — update existing guest documents to remove embedded week fields and populate `currentWeekId`/`currentWeekStartDate` (write a one-time migration script)
3. **Release RATS mobile app** (v2/clean-architecture) — now safe to read `currentWeekId` instead of `currentWeek`
4. **rats-web** — entity type update only; no operational impact since web app doesn't read guest week data

If you reverse this order (mobile app first), the app will show broken week stats until functions are updated.

---

## Appendix: What NOT to do

- Do NOT add `connect()` HOC to any component
- Do NOT embed Week or Day data inside Guest documents
- Do NOT use `as any` to bypass TypeScript errors in navigator screen definitions
- Do NOT create a `weeks` collection — use `week-summaries` and `activities`
- Do NOT implement Oxford House UI screens — only entity types are defined in v1
- Do NOT refactor surrounding code when fixing a specific bug — fix the minimum
- Do NOT skip the TypeScript check before committing
- Do NOT deploy the RATS mobile app v2 before regroup-functions is updated and deployed
