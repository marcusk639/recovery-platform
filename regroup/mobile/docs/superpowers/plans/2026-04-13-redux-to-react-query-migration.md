# Redux-to-React Query Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dual state management pattern where Redux async thunks and React Query hooks both fetch the same entities (Houses, Guests, Admins), causing triple-cache incoherence and stale UI.

**Architecture:** Keep Redux for client-only state (selectedHouseId, selectedGuestId, UI flags). Move all server data fetching to React Query exclusively. DataContext becomes a thin bridge that reads from React Query and writes selection IDs to Redux. Screens read entities from React Query hooks, selection IDs from Redux.

**Tech Stack:** React Query (TanStack Query), Redux Toolkit, TypeScript, Firebase/Firestore

---

## Current State Analysis

### Where Redux thunks are dispatched (app code only)

| Location                | Thunks                                                                                     | Purpose                    |
| ----------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| `DataContext.tsx`       | `getHouses`, `getGuests`, `getAdmin`, `getHouse`, `getGuest`, `selectHouse`, `selectGuest` | Initial data load on login |
| `LoginForm.tsx`         | `getHouses`, `getAdmin`                                                                    | Post-login data pre-fetch  |
| `NewAccountForm.tsx`    | `getGuest`, `updateGuest`                                                                  | Post-signup guest load     |
| `SignUpForm.tsx`        | `createGuest`, `createAdmin`                                                               | Account creation           |
| `HouseConfigForm.tsx`   | `createHouse`, `createAdmin`                                                               | House setup                |
| `EditUserInfoForm.tsx`  | `updateGuest`, `updateAdmin`                                                               | Profile editing            |
| `AdminManagement.tsx`   | `getHouseAdmins`, `deleteAdmin`                                                            | Admin CRUD                 |
| `ManagerSettings.tsx`   | `updateHouse` (via `updateHouseData`)                                                      | House config               |
| `AddManager.tsx`        | `updateHouse` (via `updateHouseData`)                                                      | Invite manager             |
| `Personal.tsx`          | `updateHouse`                                                                              | House settings             |
| `GuestList.tsx`         | `selectGuest`                                                                              | Guest selection            |
| `DirectChat.tsx`        | `selectGuest`                                                                              | Guest selection            |
| `HouseSearchScreen.tsx` | `selectHouse`                                                                              | House selection            |

### Where screens read Redux entity state (48 files)

Almost every screen reads `state.housesRTK.selectedHouse` and `state.guestsRTK.selectedGuest` via `useAppSelector`. This is the largest surface area.

### Existing React Query hooks (ready to use)

| Hook                       | File              | Replaces            |
| -------------------------- | ----------------- | ------------------- |
| `useHouse(id)`             | `houseQueries.ts` | `getHouse` thunk    |
| `useHouses(attr, op, val)` | `houseQueries.ts` | `getHouses` thunk   |
| `useUpdateHouse()`         | `houseQueries.ts` | `updateHouse` thunk |
| `useCreateHouse()`         | `houseQueries.ts` | `createHouse` thunk |
| `useGuest(id)`             | `guestQueries.ts` | `getGuest` thunk    |
| `useGuests(houseId)`       | `guestQueries.ts` | `getGuests` thunk   |
| `useUpdateGuest()`         | `guestQueries.ts` | `updateGuest` thunk |
| `useCreateGuest()`         | `guestQueries.ts` | `createGuest` thunk |
| `useDeleteGuest()`         | `guestQueries.ts` | `deleteGuest` thunk |
| `useAdmin(id)`             | `adminQueries.ts` | `getAdmin` thunk    |

---

## Migration Strategy: Strangler Fig

Each phase produces working software. Phases can be done in separate sessions/PRs.

**Phase A:** Introduce `selectedHouseId` / `selectedGuestId` as Redux primitives (IDs only, not full entities). Wire DataContext to set them from React Query data. Backward-compatible — old `selectedHouse` still works.

**Phase B:** Create `useSelectedHouse()` and `useSelectedGuest()` convenience hooks that combine the Redux ID with React Query data. Migrate screens one domain at a time.

**Phase C:** Remove async thunks from slices. Slim Redux state to IDs + flags only.

---

## Phase A: Selection State + DataContext Bridge

### Task 1: Add ID-based selection to housesSlice

**Files:**

- Modify: `src/state/slices/housesSlice.ts`
- Test: `src/state/slices/__tests__/housesSlice.test.ts`

- [ ] **Step 1: Write the failing test for selectHouseId**

```typescript
// Add to housesSlice.test.ts
describe('selectHouseById', () => {
  it('sets selectedHouseId without storing the full entity', () => {
    store.dispatch(selectHouseById('house-123'));
    expect(store.getState().housesRTK.selectedHouseId).toBe('house-123');
  });

  it('clears selectedHouseId when null is passed', () => {
    store.dispatch(selectHouseById('house-123'));
    store.dispatch(selectHouseById(null));
    expect(store.getState().housesRTK.selectedHouseId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern='housesSlice\.test' --no-coverage --forceExit`
Expected: FAIL — `selectHouseById` not defined

- [ ] **Step 3: Add selectHouseById action to housesSlice**

In `housesSlice.ts`, add to `HousesState`:

```typescript
selectedHouseId: string | null;
```

Add to `initialState`:

```typescript
selectedHouseId: null,
```

Add to `reducers`:

```typescript
selectHouseById: (state, action: PayloadAction<string | null>) => {
  state.selectedHouseId = action.payload;
},
```

Export the action.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern='housesSlice\.test' --no-coverage --forceExit`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add selectHouseById action (ID-only selection)
```

---

### Task 2: Add ID-based selection to guestsSlice

**Files:**

- Modify: `src/state/slices/guestsSlice.ts`
- Test: `src/state/slices/__tests__/guestsSlice.test.ts`

Same pattern as Task 1: add `selectedGuestId: string | null` to state, `selectGuestById` action.

- [ ] **Step 1: Write failing test for selectGuestById**

```typescript
describe('selectGuestById', () => {
  it('sets selectedGuestId', () => {
    store.dispatch(selectGuestById('guest-456'));
    expect(store.getState().guestsRTK.selectedGuestId).toBe('guest-456');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement selectGuestById in guestsSlice.ts**
- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Commit**

```
feat: add selectGuestById action (ID-only selection)
```

---

### Task 3: Create useSelectedHouse and useSelectedGuest convenience hooks

**Files:**

- Create: `src/hooks/useSelectedHouse.ts`
- Create: `src/hooks/useSelectedGuest.ts`
- Create: `src/hooks/__tests__/useSelectedHouse.test.ts`
- Create: `src/hooks/__tests__/useSelectedGuest.test.ts`

- [ ] **Step 1: Write failing test for useSelectedHouse**

```typescript
// src/hooks/__tests__/useSelectedHouse.test.ts
import { renderHook } from '@testing-library/react-native';
import { useSelectedHouse } from '../useSelectedHouse';

// Mock Redux to return a selectedHouseId
jest.mock('../../state/store', () => ({
  useAppSelector: jest.fn(),
}));

// Mock React Query to return house data
jest.mock('../../state/queries/houseQueries', () => ({
  useHouse: jest.fn(),
}));

describe('useSelectedHouse', () => {
  it('returns null when no house is selected', () => {
    const { useAppSelector } = require('../../state/store');
    useAppSelector.mockReturnValue(null); // no selectedHouseId

    const { useHouse } = require('../../state/queries/houseQueries');
    useHouse.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useSelectedHouse());
    expect(result.current.house).toBeNull();
  });

  it('returns house data from React Query when ID is selected', () => {
    const { useAppSelector } = require('../../state/store');
    useAppSelector.mockImplementation((selector: any) => {
      // Return selectedHouseId from new field, selectedHouse from legacy
      return selector({
        housesRTK: { selectedHouseId: 'house-1', selectedHouse: null },
      });
    });

    const mockHouse = { id: 'house-1', name: 'Test House' };
    const { useHouse } = require('../../state/queries/houseQueries');
    useHouse.mockReturnValue({ data: mockHouse, isLoading: false });

    const { result } = renderHook(() => useSelectedHouse());
    expect(result.current.house).toEqual(mockHouse);
    expect(result.current.isLoading).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement useSelectedHouse**

```typescript
// src/hooks/useSelectedHouse.ts
import { useAppSelector } from '../state/store';
import { useHouse } from '../state/queries/houseQueries';
import { House } from '../entities/House';

export function useSelectedHouse(): {
  house: House | null;
  houseId: string | null;
  isLoading: boolean;
} {
  // Read ID from Redux (new field), fall back to legacy selectedHouse.id
  const selectedHouseId = useAppSelector(
    s => s.housesRTK.selectedHouseId ?? s.housesRTK.selectedHouse?.id ?? null,
  );

  // Fetch full entity from React Query cache
  const { data, isLoading } = useHouse(
    selectedHouseId ?? '',
    !!selectedHouseId,
  );

  return {
    house: data ?? null,
    houseId: selectedHouseId,
    isLoading,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Implement useSelectedGuest (same pattern)**

```typescript
// src/hooks/useSelectedGuest.ts
import { useAppSelector } from '../state/store';
import { useGuest } from '../state/queries/guestQueries';
import { Guest } from '../entities/Guest';

export function useSelectedGuest(): {
  guest: Guest | null;
  guestId: string | null;
  isLoading: boolean;
} {
  const selectedGuestId = useAppSelector(
    s => s.guestsRTK.selectedGuestId ?? s.guestsRTK.selectedGuest?.id ?? null,
  );

  const { data, isLoading } = useGuest(
    selectedGuestId ?? '',
    !!selectedGuestId,
  );

  return {
    guest: data ?? null,
    guestId: selectedGuestId,
    isLoading,
  };
}
```

- [ ] **Step 6: Write and run test for useSelectedGuest**
- [ ] **Step 7: Commit**

```
feat: add useSelectedHouse and useSelectedGuest hooks (RQ-backed)
```

---

### Task 4: Migrate DataContext to React Query

**Files:**

- Modify: `src/context/DataContext.tsx`
- Test: Existing tests (verify no regression)

This is the critical task. DataContext currently dispatches Redux thunks to fetch data. It should instead use React Query hooks and write only selection IDs to Redux.

- [ ] **Step 1: Rewrite DataContext fetchInitialData**

Replace the thunk-based fetching with React Query's `queryClient.fetchQuery`:

```typescript
// DataContext.tsx — key changes:

import { useQueryClient } from '@tanstack/react-query';
import { houseKeys } from '../state/queries/houseQueries';
import { guestKeys } from '../state/queries/guestQueries';
import { adminKeys } from '../state/queries/adminQueries';
import * as houseService from '../services/house';
import * as guestService from '../services/guest';
import * as adminService from '../services/admin';
import { selectHouseById } from '../state/slices/housesSlice';
import { selectGuestById } from '../state/slices/guestsSlice';
// Keep legacy imports for backward compat during migration:
import { selectHouse } from '../state/slices/housesSlice';

// Inside DataProvider:
const queryClient = useQueryClient();

// Replace the fetchInitialData useEffect body:
if (currentUser.isAdmin && currentUser.adminId) {
  const [houses] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: houseKeys.list({
        attribute: 'adminIds',
        value: currentUser.adminId,
      }),
      queryFn: () =>
        houseService.getHouses(
          'adminIds',
          'array-contains',
          currentUser.adminId!,
        ),
    }),
    queryClient.fetchQuery({
      queryKey: adminKeys.detail(currentUser.adminId),
      queryFn: () => adminService.getAdmin(currentUser.adminId!),
    }),
  ]);

  if (houses) {
    const houseIds = Object.keys(houses);
    if (houseIds.length > 0) {
      const firstHouse = houses[houseIds[0]];
      // Write ID to new Redux field
      dispatch(selectHouseById(firstHouse.id));
      // Also write full entity to legacy field (backward compat)
      dispatch(selectHouse(firstHouse));

      const guests = await queryClient.fetchQuery({
        queryKey: guestKeys.list(firstHouse.id),
        queryFn: () => guestService.getGuests('houseId', firstHouse.id),
      });

      if (guests) {
        const userAsGuest = Object.values(guests).find(
          g => g.userId === currentUser.id,
        );
        if (userAsGuest) {
          dispatch(selectGuestById(userAsGuest.id));
        }
      }
    }
  }
}

if (currentUser.isGuest && currentUser.houseId) {
  await Promise.all([
    queryClient.fetchQuery({
      queryKey: houseKeys.detail(currentUser.houseId),
      queryFn: () => houseService.getHouse(currentUser.houseId!),
    }),
    currentUser.guestId
      ? queryClient.fetchQuery({
          queryKey: guestKeys.detail(currentUser.guestId),
          queryFn: () => guestService.getGuest(currentUser.guestId!),
        })
      : Promise.resolve(),
  ]);

  dispatch(selectHouseById(currentUser.houseId));
  if (currentUser.guestId) {
    dispatch(selectGuestById(currentUser.guestId));
  }
}
```

- [ ] **Step 2: Update DataContext value to include React Query data**

Add `useSelectedHouse` and `useSelectedGuest` to DataContext so consumers get RQ-backed data:

```typescript
const { house: rqHouse } = useSelectedHouse();
const { guest: rqGuest } = useSelectedGuest();

const value: DataContextType = {
  currentUser,
  currentHouse: rqHouse ?? currentHouse, // prefer RQ, fall back to Redux
  currentGuest: rqGuest ?? currentGuest,
  currentAdmin,
  loading,
  housesLoading,
  guestsLoading,
};
```

- [ ] **Step 3: Run full test suite to verify no regression**

Run: `npx jest --no-coverage --forceExit --testPathIgnorePattern='firebase/__tests__|services/__tests__/payment\.test'`
Expected: Same pass/fail counts as before

- [ ] **Step 4: Commit**

```
refactor: migrate DataContext to React Query for data fetching
```

---

## Phase B: Screen Migration (by domain)

Each task migrates one group of screens from `useAppSelector(s => s.housesRTK.selectedHouse)` to `useSelectedHouse()`. These are independent and can be done in any order.

### Task 5: Migrate Oxford screens (5 files)

**Files:**

- Modify: `src/screens/Oxford/OxfordDashboard.tsx`
- Modify: `src/screens/Oxford/BusinessMeetings.tsx`
- Modify: `src/screens/Oxford/Voting.tsx`
- Modify: `src/screens/Oxford/EESTracker.tsx`
- Modify: `src/screens/Oxford/OfficerManagement.tsx`
- Modify: `src/screens/Oxford/BusinessMeetingDetail.tsx`

- [ ] **Step 1: Replace Redux selectors with convenience hooks**

In each file, replace:

```typescript
const house = useAppSelector(state => state.housesRTK.selectedHouse);
```

with:

```typescript
const { house } = useSelectedHouse();
```

And replace:

```typescript
const user = useAppSelector(state => state.userRTK.user);
const userAsGuest = useAppSelector(state => state.guestsRTK.userAsGuest);
```

Keep `userRTK` and `guestsRTK.userAsGuest` in Redux for now — those are auth state, not server data.

- [ ] **Step 2: Run Oxford screen tests**

Run: `npx jest --testPathPattern='Oxford' --no-coverage --forceExit`
Expected: All pass

- [ ] **Step 3: Commit**

```
refactor(oxford): use useSelectedHouse hook instead of Redux selector
```

---

### Task 6: Migrate House screens (8 files)

**Files:** HouseSummary, HouseInfo, HouseActivity, HouseSettings, AdminManagement, ManagerSettings, HouseConfig, HouseChat

Same pattern as Task 5. Replace `useAppSelector(s => s.housesRTK.selectedHouse)` with `useSelectedHouse()`.

- [ ] **Step 1: Replace selectors in all 8 files**
- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

---

### Task 7: Migrate Guest screens (10 files)

**Files:** GuestHome, GuestList, GuestUpdate, ProfileUpdate, EditUserInfo, PhaseCustomization, GuestInvites, UserInfo, plus guest summary screens (Chore, Work, Meeting, Medication, Supporter)

Replace `useAppSelector(s => s.guestsRTK.selectedGuest)` with `useSelectedGuest()`.

- [ ] **Step 1: Replace selectors**
- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

---

### Task 8: Migrate remaining screens (15+ files)

**Files:** Activity, Disputes, Complaints, Issues, Contacts, DirectChat, StatUpdates, Personal, Beds, DrugTesting, BalanceDashboard, IntroHouseSummary, Payments

- [ ] **Step 1: Replace selectors**
- [ ] **Step 2: Run tests**
- [ ] **Step 3: Commit**

---

### Task 9: Migrate mutation dispatches

**Files:**

- `src/screens/SignUp/SignUpForm.tsx` — `createGuest`, `createAdmin`
- `src/screens/HouseConfig/HouseConfigForm.tsx` — `createHouse`, `createAdmin`
- `src/screens/NewAccount/NewAccountForm.tsx` — `updateGuest`, `getGuest`
- `src/screens/Profile/EditUserInfoForm.tsx` — `updateGuest`, `updateAdmin`
- `src/screens/HouseSettings/AdminManagement.tsx` — `deleteAdmin`, `getHouseAdmins`
- `src/screens/Personal/Personal.tsx` — `updateHouse`
- `src/screens/HouseSettings/ManagerSettings.tsx` — `updateHouse`
- `src/screens/HouseSettings/AddManager.tsx` — `updateHouse`
- `src/screens/Login/LoginForm.tsx` — `getHouses`, `getAdmin`

Replace `dispatch(createGuest(guest))` with `createGuestMutation.mutateAsync(guest)` using existing React Query mutation hooks.

- [ ] **Step 1: Replace mutation dispatches in each file with RQ mutation hooks**
- [ ] **Step 2: Replace LoginForm thunk dispatches with queryClient.prefetchQuery**
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```
refactor: replace Redux mutation thunks with React Query mutations
```

---

## Phase C: Remove Dead Thunks

### Task 10: Remove async thunks from housesSlice

**Files:**

- Modify: `src/state/slices/housesSlice.ts`
- Modify: `src/state/slices/index.ts`
- Test: `src/state/slices/__tests__/housesSlice.test.ts`

- [ ] **Step 1: Remove getHouse, getHouses, createHouse, updateHouse async thunks**

Keep: `selectHouse`, `selectHouseById`, `clearHouseError`, `resetSearchResults` (synchronous actions).
Remove: `getHouse`, `getHouses`, `searchForHouses`, `createHouse`, `updateHouse`, `addIssue`, `removeIssue`, `updateIssueStatus` async thunks.
Remove: All `extraReducers` cases for the removed thunks.
Remove: The 14 boolean loading flags — replace with a single `status: 'idle' | 'loading'` if any UI still needs it.

- [ ] **Step 2: Update housesSlice.test.ts — remove thunk tests, keep action tests**
- [ ] **Step 3: Remove dead exports from slices/index.ts**
- [ ] **Step 4: Run full test suite**
- [ ] **Step 5: Commit**

```
refactor: remove async thunks from housesSlice (React Query owns data fetching)
```

---

### Task 11: Remove async thunks from guestsSlice

Same pattern as Task 10.

Keep: `selectGuest`, `selectGuestById`, `updateSelectedGuest`, `cacheGuests`, `cacheGuest`, `clearGuestError`.
Remove: `getGuests`, `getGuest`, `createGuest`, `updateGuest`, `deleteGuest`, `customizePhase` async thunks + their `extraReducers`.

- [ ] **Step 1-5: Same pattern as Task 10**

```
refactor: remove async thunks from guestsSlice
```

---

### Task 12: Remove async thunks from adminSlice

Keep: `setUserAsAdmin`, `selectAdmin`, `clearSelectedAdmin`, `clearError`, `resetAdminState` and all selectors.
Remove: `getAdmin`, `getHouseAdmins`, `createAdmin`, `updateAdmin`, `deleteAdmin`, `inviteAdmin` async thunks.

- [ ] **Step 1-5: Same pattern**

```
refactor: remove async thunks from adminSlice
```

---

### Task 13: Clean up DataContext — remove legacy Redux reads

**Files:**

- Modify: `src/context/DataContext.tsx`

- [ ] **Step 1: Remove legacy Redux entity reads**

Remove:

```typescript
const currentHouse = useAppSelector(state => state.housesRTK.selectedHouse);
const currentGuest = useAppSelector(state => state.guestsRTK.selectedGuest);
```

Use exclusively:

```typescript
const { house: currentHouse } = useSelectedHouse();
const { guest: currentGuest } = useSelectedGuest();
```

- [ ] **Step 2: Remove legacy thunk imports**

Remove imports of `getHouses`, `getHouse`, `getGuests`, `getGuest`, `getAdmin`, `selectHouse`, `selectGuest` from slices.

- [ ] **Step 3: Run full test suite**
- [ ] **Step 4: Commit**

```
refactor: DataContext reads exclusively from React Query
```

---

### Task 14: Remove the RTK suffix from store keys (cleanup)

**Files:**

- Modify: `src/state/store.ts`
- Modify: All 48 files that reference `housesRTK`, `guestsRTK`, `adminRTK`

Rename `housesRTK` → `houses`, `guestsRTK` → `guests`, `adminRTK` → `admin` in the store config. This is a migration artifact from the original Redux → RTK migration that no longer serves a purpose.

- [ ] **Step 1: Rename keys in store.ts**
- [ ] **Step 2: Find-and-replace across all files**
- [ ] **Step 3: Run full test suite**
- [ ] **Step 4: Commit**

```
refactor: remove RTK suffix from store keys (migration artifact)
```

---

## Risk Assessment

| Risk                                    | Mitigation                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------- |
| DataContext change breaks app startup   | Phase A keeps legacy `selectedHouse` populated alongside `selectedHouseId`  |
| Screen migration introduces stale data  | `useSelectedHouse` falls back to legacy Redux until migration is complete   |
| React Query cache miss on cold start    | `queryClient.fetchQuery` in DataContext ensures cache is warm before render |
| Test mock stores need updating          | Each phase updates test mocks incrementally                                 |
| Merge conflicts from large surface area | Phase B tasks are independent — can be separate PRs                         |

## Success Criteria

- Zero `dispatch(getHouses/getHouse/getGuests/getGuest/getAdmin)` calls remain in app code
- `housesSlice`, `guestsSlice`, `adminSlice` have zero async thunks
- `DataContext.tsx` uses `queryClient.fetchQuery` exclusively
- All 4,300+ tests pass
- Same entity never exists in two caches simultaneously
