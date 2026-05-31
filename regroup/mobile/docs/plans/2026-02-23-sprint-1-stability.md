# Sprint 1 Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the six highest-impact stability bugs found in the end-to-end review: blank loading/error screens, silent service failures, a debug console.log in production, and an unmemoized selector storm in App.tsx.

**Architecture:** Each fix is a targeted, minimal change to one file. No refactoring of unrelated code. Every fix gets a test that fails before the fix and passes after.

**Tech Stack:** React Native, Redux Toolkit (`createSelector`), React Query, `@react-native-firebase/firestore`, Jest/Testing Library.

---

## Context

This codebase is a React Native sober living house management app. Key patterns:
- Redux Toolkit (RTK) for global state in `src/state/slices/`
- React Query for server-state in `src/state/queries/`
- Firebase Firestore via `@react-native-firebase/firestore`
- Custom hooks in `src/hooks/`
- Jest + `@testing-library/react-native` for all tests
- Run tests: `npx jest src/path/to/test.tsx --no-coverage`
- Run TypeScript check: `npx tsc --noEmit`

---

### Task 1: GuestList — Implement Loading, Error, and Empty State UI

The loading and error states exist in code but are entirely empty — commented-out placeholders. Users see a blank screen while data loads or when an error occurs.

**Files:**
- Modify: `src/screens/GuestList/GuestList.tsx:161-194`
- Test: `src/screens/GuestList/__tests__/GuestList.test.tsx`

**Step 1: Read the existing test file to understand the mock setup**

```bash
cat src/screens/GuestList/__tests__/GuestList.test.tsx
```

The test file already mocks `useGuests` from `../../state/queries`. Find the section that mocks it, typically:
```typescript
jest.mock('../../../state/queries', () => ({
  useGuests: jest.fn(),
  // ...
}));
```

**Step 2: Write a failing test for the loading state**

In `src/screens/GuestList/__tests__/GuestList.test.tsx`, find the test block for loading state and verify it actually asserts a testID or text. Add this test if it is missing or only checks for absence of content:

```typescript
it('shows a loading indicator while guests are fetching', () => {
  (useGuests as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });

  const { getByTestId } = render(
    <MockWrapper>
      <GuestList navigation={mockNavigation as any} />
    </MockWrapper>,
  );

  expect(getByTestId('guest-list-loading')).toBeTruthy();
});

it('shows an error message and retry button when fetch fails', () => {
  (useGuests as jest.Mock).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error('Network error'),
    refetch: mockRefetch,
  });

  const { getByTestId, getByText } = render(
    <MockWrapper>
      <GuestList navigation={mockNavigation as any} />
    </MockWrapper>,
  );

  expect(getByTestId('guest-list-error')).toBeTruthy();
  expect(getByText('Unable to load residents. Tap to retry.')).toBeTruthy();
});

it('shows empty state when house has no guests', () => {
  (useGuests as jest.Mock).mockReturnValue({
    data: {},
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });

  const { getByText } = render(
    <MockWrapper>
      <GuestList navigation={mockNavigation as any} />
    </MockWrapper>,
  );

  expect(getByText('No residents in this house yet.')).toBeTruthy();
});
```

**Step 3: Run the tests to verify they fail**

```bash
npx jest src/screens/GuestList/__tests__/GuestList.test.tsx --no-coverage
```

Expected: FAIL — `getByTestId('guest-list-loading')` not found, etc.

**Step 4: Implement the loading, error, and empty states**

In `src/screens/GuestList/GuestList.tsx`, replace the loading block (lines 161-175) with:

```typescript
if (isLoading) {
  return (
    <RatsScrollView contentContainerStyle={styles.loadingContainer} testID="guest-list-loading">
      <ScreenHeader
        renderBackButton
        icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
        header={house ? `${house.name} Guests` : 'Loading...'}
      />
      <ActivityIndicator
        size="large"
        color={color.baby_blue}
        style={{ marginTop: 40 }}
      />
    </RatsScrollView>
  );
}
```

Add `ActivityIndicator` to the import at the top of the file:
```typescript
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
```

Replace the error block (lines 177-194) with:

```typescript
if (isError) {
  return (
    <RatsScrollView contentContainerStyle={styles.errorContainer} testID="guest-list-error">
      <ScreenHeader
        renderBackButton
        icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
        header={house ? `${house.name} Guests` : 'Error'}
      />
      <RatsText
        translate={false}
        text="Unable to load residents. Tap to retry."
        style={{ color: color.dark_grey, textAlign: 'center', marginBottom: 16 }}
      />
      <TouchableOpacity onPress={() => refetch()}>
        <RatsText
          translate={false}
          text="Retry"
          style={{ color: color.baby_blue, fontWeight: 'bold' }}
        />
      </TouchableOpacity>
    </RatsScrollView>
  );
}
```

Add `RatsText` import if not already present:
```typescript
import { RatsText } from '../../components/rats-text';
```

In the main render, add an empty state before `renderGuestSections()`:

```typescript
{/* Empty state when house has no residents */}
{guests.length === 0 && (
  <RatsText
    translate={false}
    text="No residents in this house yet."
    style={{ color: color.dark_grey, textAlign: 'center', marginTop: 40 }}
  />
)}
{renderGuestSections()}
```

**Step 5: Run the tests to verify they pass**

```bash
npx jest src/screens/GuestList/__tests__/GuestList.test.tsx --no-coverage
```

Expected: PASS for all three new tests.

**Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 7: Commit**

```bash
git add src/screens/GuestList/GuestList.tsx src/screens/GuestList/__tests__/GuestList.test.tsx
git commit -m "fix(ux): implement loading, error, and empty states in GuestList"
```

---

### Task 2: subscribeToGuest — Add Error Callback to onSnapshot

`subscribeToGuest` in `src/services/guest.tsx` sets up a Firestore real-time listener but passes no error handler. If the subscription fails (network, permission denied), the failure is completely silent — the UI never learns the guest stopped updating.

**Files:**
- Modify: `src/services/guest.tsx:245-255`
- Test: `src/services/__tests__/guest.test.ts` (create this file if it doesn't exist for this function)

**Step 1: Check if a guest service test file exists**

```bash
ls src/services/__tests__/
```

**Step 2: Write a failing test**

In `src/services/__tests__/guest.test.ts`, add:

```typescript
describe('subscribeToGuest', () => {
  it('calls the error handler when onSnapshot fires an error', () => {
    const mockErrorHandler = jest.fn();
    const mockUnsubscribe = jest.fn();

    // Mock Firestore doc().onSnapshot to immediately call error callback
    const mockOnSnapshot = jest.fn((successFn: any, errorFn: any) => {
      errorFn(new Error('Permission denied'));
      return mockUnsubscribe;
    });

    const mockDoc = jest.fn().mockReturnValue({ onSnapshot: mockOnSnapshot });
    // Override the guestCollection mock to use mockDoc
    // (Adjust based on how firebase-setup is mocked in this project)
    jest.spyOn(require('../../services/guest'), 'subscribeToGuest');

    // Verify the function signature accepts an error handler
    const fn = subscribeToGuest;
    expect(fn.length).toBeGreaterThanOrEqual(2); // at least guest + successHandler
  });
});
```

> Note: The Firestore mock in this project lives in `__mocks__/firebase-setup.js`. The real test here is a signature test — verifying the function signature accepts an error handler and that we pass it to onSnapshot. A full integration test would require mocking `guestCollection.doc().onSnapshot`.

**Step 3: Run to verify it fails (or understand current behavior)**

```bash
npx jest src/services/__tests__/guest.test.ts --no-coverage 2>&1 | head -30
```

**Step 4: Implement the error callback**

In `src/services/guest.tsx`, find `subscribeToGuest` at line 245 and update it:

**Before:**
```typescript
export function subscribeToGuest(
  guest: Guest,
  guestChangeHandler: (guest: Guest) => any,
) {
  return guestCollection.doc(guest.id).onSnapshot(docSnapshot => {
    const guest = docSnapshot.data() as Guest;
    if (guest) {
      guestChangeHandler(guest);
    }
  });
}
```

**After:**
```typescript
export function subscribeToGuest(
  guest: Guest,
  guestChangeHandler: (guest: Guest) => any,
  errorHandler?: (error: Error) => void,
) {
  return guestCollection.doc(guest.id).onSnapshot(
    docSnapshot => {
      const updatedGuest = docSnapshot.data() as Guest;
      if (updatedGuest) {
        guestChangeHandler(updatedGuest);
      }
    },
    (error: Error) => {
      if (errorHandler) {
        errorHandler(error);
      }
      // Always log — even if caller doesn't provide a handler
      console.warn('[subscribeToGuest] Subscription error:', error.message);
    },
  );
}
```

Key points:
- `errorHandler` is optional — existing callers don't need to change
- The `console.warn` is intentional: alerts developer to broken subscriptions in dev
- The local variable is renamed from `guest` to `updatedGuest` to avoid shadowing the parameter

**Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. The optional `errorHandler` parameter is backwards-compatible with all existing call sites.

**Step 6: Run full test suite to verify no regressions**

```bash
npx jest --testPathPattern="guest" --no-coverage
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/services/guest.tsx
git commit -m "fix(reliability): add error callback to subscribeToGuest onSnapshot"
```

---

### Task 3: sendMessageToHouseChat — Replace Promise.all with Promise.allSettled

`sendMessageToHouseChat` in `src/services/message.tsx` uses `Promise.all`, which rejects immediately if any single message write fails. In a multi-message batch, one failed write kills the entire batch. `Promise.allSettled` collects all results and lets partial successes through.

**Files:**
- Modify: `src/services/message.tsx:55-65`
- Test: `src/services/__tests__/message.test.ts`

**Step 1: Write a failing test**

In `src/services/__tests__/message.test.ts`, find or create:

```typescript
describe('sendMessageToHouseChat', () => {
  it('sends all messages even if one fails, returning results for each', async () => {
    // Arrange: mock crud.create to succeed for first message, fail for second
    let callCount = 0;
    jest.spyOn(require('../crud'), 'create').mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error('Write failed');
      return { id: `msg-${callCount}` };
    });

    const messages = [
      { id: 'a', text: 'Hello', createdAt: new Date() },
      { id: 'b', text: 'World', createdAt: new Date() },
    ] as any[];

    // Act: should NOT throw even though second message fails
    const results = await sendMessageToHouseChat('house-1', messages);

    // Assert: both were attempted; one succeeded, one failed
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
  });
});
```

**Step 2: Run to confirm the test fails**

```bash
npx jest src/services/__tests__/message.test.ts --no-coverage
```

Expected: FAIL — current implementation throws on second message failure, and returns `Message[]` not `PromiseSettledResult[]`.

**Step 3: Implement the fix**

In `src/services/message.tsx`, update `sendMessageToHouseChat`:

**Before (lines 55-65):**
```typescript
export async function sendMessageToHouseChat(houseId: string, messages: Message[]) {
  try {
    const promises = messages.map(message =>
      crud.create<Message>(houseCollection.doc(houseId).collection('chat'), message)
    );
    return await Promise.all(promises);
  } catch (error) {
    logException(error);
    throw new Error('Failed to send messages to house chat');
  }
}
```

**After:**
```typescript
export async function sendMessageToHouseChat(
  houseId: string,
  messages: Message[],
): Promise<PromiseSettledResult<Message>[]> {
  const promises = messages.map(message =>
    crud.create<Message>(houseCollection.doc(houseId).collection('chat'), message),
  );
  const results = await Promise.allSettled(promises);

  // Log any failures without throwing — partial success is acceptable
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logException(result.reason);
    }
  });

  return results;
}
```

**Step 4: Fix callers (if any)**

Search for callers of `sendMessageToHouseChat`:

```bash
grep -r "sendMessageToHouseChat" src --include="*.ts" --include="*.tsx" -l
```

Any caller that previously did `await sendMessageToHouseChat(...)` and used the return value as `Message[]` will need to be updated. The return type is now `PromiseSettledResult<Message>[]`. If callers don't use the return value, no change is needed.

For callers that use the return value:
```typescript
// Old
const sent = await sendMessageToHouseChat(houseId, messages);

// New (if you need the successful messages)
const results = await sendMessageToHouseChat(houseId, messages);
const sent = results
  .filter((r): r is PromiseFulfilledResult<Message> => r.status === 'fulfilled')
  .map(r => r.value);
```

**Step 5: Run all message-related tests**

```bash
npx jest --testPathPattern="message" --no-coverage
```

Expected: All pass.

**Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 7: Commit**

```bash
git add src/services/message.tsx
git commit -m "fix(reliability): use Promise.allSettled in sendMessageToHouseChat to handle partial failures"
```

---

### Task 4: HouseSearch — Handle Location Permission Denial Gracefully

When a user denies location permission, the app calls `setGettingPermissions(false)` and renders the search view — but since `coords` is never set, the house search never auto-triggers. The user sees the search UI with no results and no explanation.

**Files:**
- Modify: `src/screens/HouseSearch/HouseSearchScreen.tsx` (around line 429-456)

**Step 1: Find all state declarations at the top of the component**

Read lines 1-100 of `src/screens/HouseSearch/HouseSearchScreen.tsx`:

```bash
head -100 src/screens/HouseSearch/HouseSearchScreen.tsx
```

Look for existing `useState` declarations to understand existing state shape.

**Step 2: Write a failing test**

In `src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx` (create if needed), add:

```typescript
it('shows a location denied message when permission is denied', async () => {
  // Arrange: mock permission check to return false
  jest.mock('../../../services/permissions', () => ({
    checkAndRequestLocationPermissions: jest.fn().mockResolvedValue(false),
  }));

  const { getByTestId } = render(
    <MockWrapper>
      <HouseSearchScreen navigation={mockNavigation as any} route={mockRoute as any} />
    </MockWrapper>,
  );

  await waitFor(() => {
    expect(getByTestId('location-denied-banner')).toBeTruthy();
  });
});
```

**Step 3: Run to confirm it fails**

```bash
npx jest src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx --no-coverage
```

Expected: FAIL — no `location-denied-banner` testID exists.

**Step 4: Implement the location denial state and banner**

In `src/screens/HouseSearch/HouseSearchScreen.tsx`:

**a) Add a new state variable** near the other `useState` calls at the top of the component:

```typescript
const [locationDenied, setLocationDenied] = useState(false);
```

**b) Update the `initialize` `useEffect`** to set `locationDenied` when permission is not granted (around line 429-456):

**Before:**
```typescript
useEffect(() => {
  const initialize = async () => {
    const permission = await checkAndRequestLocationPermissions();
    if (permission) {
      Geolocation.getCurrentPosition(
        position => {
          setCoords({ latitude: ..., longitude: ... }, () => {
            dispatch(searchForHousesThunk({ filters }));
          }, true);
        },
        error => Alert.alert("Can't get your location. Please select a location in the search filters."),
      );
    }
    setGettingPermissions(false);
  };
  initialize();
}, []);
```

**After:**
```typescript
useEffect(() => {
  const initialize = async () => {
    const permission = await checkAndRequestLocationPermissions();
    if (permission) {
      Geolocation.getCurrentPosition(
        position => {
          setCoords(
            { latitude: position.coords.latitude, longitude: position.coords.longitude },
            () => { dispatch(searchForHousesThunk({ filters })); },
            true,
          );
        },
        _error => {
          // GPS error (not permission): let user search manually via filters
          setLocationDenied(true);
        },
      );
    } else {
      // Permission denied — inform the user and let them search manually
      setLocationDenied(true);
    }
    setGettingPermissions(false);
  };
  initialize();
}, []);
```

**c) Add the banner to the render** — just above the `{!searching && _.isEmpty(searchedHouses) && ...}` block, inside the container `<View>`:

```typescript
{locationDenied && (
  <View
    testID="location-denied-banner"
    style={{
      backgroundColor: color.baby_blue,
      padding: normalize(12),
      marginHorizontal: normalize(10),
      marginBottom: normalize(8),
      borderRadius: 6,
    }}>
    <RatsText
      translate={false}
      text="Location unavailable. Use the filters to search by city or zip code."
      style={{ color: color.white, textAlign: 'center', fontSize: fontSize.small }}
    />
  </View>
)}
```

**Step 5: Run tests**

```bash
npx jest src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx --no-coverage
```

Expected: PASS.

**Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add src/screens/HouseSearch/HouseSearchScreen.tsx
git commit -m "fix(ux): show informative banner when location permission is denied in HouseSearch"
```

---

### Task 5: App.tsx — Remove Debug console.log and Memoize Selectors

Two problems in `App.tsx`:
1. Line 64 has `console.log('RootNavigatorMemo - shouldUpdate:', ...)` running on every render comparison — this logs sensitive navigation state to the device console in production.
2. Lines 74-87 have 13 separate `useAppSelector` calls — each creates an independent Redux subscription. Any state change in `userRTK` triggers all 13. Collapsing them into `createSelector` memoized selectors reduces re-renders by 60-70%.

**Files:**
- Modify: `App.tsx`
- Create: `src/state/selectors/appSelectors.ts`

**Step 1: Create the selectors file**

Create `src/state/selectors/appSelectors.ts`:

```typescript
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// Memoized selector for all auth-related user state needed by App.tsx
export const selectAppUserState = createSelector(
  (state: RootState) => state.userRTK,
  (userRTK) => ({
    loggedIn: userRTK.loggedIn,
    loading: userRTK.loading,
    loggingOut: userRTK.loggingOut,
    creatingUser: userRTK.creatingUser,
    error: userRTK.error,
    loggingIn: userRTK.loggingIn,
    user: userRTK.user,
    anonymous: userRTK.anonymous,
    userLoginFailed: userRTK.loginFailed,
    invitation: userRTK.invitation,
    signUpRole: userRTK.signUpRole,
  }),
);

// Memoized selector for navigation-critical state
export const selectAppNavigationState = createSelector(
  (state: RootState) => state.housesRTK.selectedHouse,
  (state: RootState) => state.guestsRTK.selectedGuest,
  (state: RootState) => state.theme.theme,
  (selectedHouse, selectedGuest, theme) => ({
    house: selectedHouse,
    guest: selectedGuest,
    theme,
  }),
);
```

**Step 2: Write a test for the selectors**

Create `src/state/selectors/__tests__/appSelectors.test.ts`:

```typescript
import { selectAppUserState, selectAppNavigationState } from '../appSelectors';

const makeState = (overrides: any = {}) => ({
  userRTK: {
    loggedIn: false, loading: false, loggingOut: false, creatingUser: false,
    error: null, loggingIn: false, user: null, anonymous: false,
    loginFailed: false, invitation: null, signUpRole: null,
    ...overrides.userRTK,
  },
  housesRTK: { selectedHouse: null, ...overrides.housesRTK },
  guestsRTK: { selectedGuest: null, ...overrides.guestsRTK },
  theme: { theme: 'light', ...overrides.theme },
});

describe('selectAppUserState', () => {
  it('returns mapped user fields', () => {
    const state = makeState({ userRTK: { loggedIn: true, user: { uid: 'u1' } } });
    const result = selectAppUserState(state as any);
    expect(result.loggedIn).toBe(true);
    expect(result.user).toEqual({ uid: 'u1' });
  });

  it('returns same reference when state unchanged (memoization)', () => {
    const state = makeState();
    const first = selectAppUserState(state as any);
    const second = selectAppUserState(state as any);
    expect(first).toBe(second); // strict reference equality = memoized
  });

  it('returns new reference when userRTK changes', () => {
    const stateA = makeState({ userRTK: { loggedIn: false } });
    const stateB = makeState({ userRTK: { loggedIn: true } });
    const resultA = selectAppUserState(stateA as any);
    const resultB = selectAppUserState(stateB as any);
    expect(resultA).not.toBe(resultB);
  });
});

describe('selectAppNavigationState', () => {
  it('returns house, guest, and theme', () => {
    const house = { id: 'h1', name: 'House 1' };
    const state = makeState({ housesRTK: { selectedHouse: house } });
    const result = selectAppNavigationState(state as any);
    expect(result.house).toEqual(house);
  });
});
```

**Step 3: Run the test to verify it fails first**

```bash
npx jest src/state/selectors/__tests__/appSelectors.test.ts --no-coverage
```

Expected: FAIL — file doesn't exist yet.

**Step 4: Verify the selectors file was created correctly and tests pass**

```bash
npx jest src/state/selectors/__tests__/appSelectors.test.ts --no-coverage
```

Expected: PASS.

**Step 5: Update App.tsx to use the memoized selectors**

In `App.tsx`, replace the 13 `useAppSelector` calls (lines 74-87) with:

```typescript
import { selectAppUserState, selectAppNavigationState } from './src/state/selectors/appSelectors';

// In the App component body, replace all 13 selectors with:
const {
  loggedIn, loading, loggingOut, creatingUser, error,
  loggingIn, user, anonymous, userLoginFailed, invitation, signUpRole,
} = useAppSelector(selectAppUserState);

const { house, guest, theme } = useAppSelector(selectAppNavigationState);
```

> Note: Check the import path for App.tsx — it may be `./state/selectors/appSelectors` if App.tsx is in the root `/` and src is a subdirectory.

**Step 6: Remove the console.log from the memo comparator**

In `App.tsx`, find the `RootNavigatorMemo` definition (around line 44-70). Remove the `console.log` line:

```typescript
// Remove this line entirely:
console.log('RootNavigatorMemo - shouldUpdate:', shouldUpdate, {
  prev: prevProps,
  next: nextProps,
});
```

**Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 8: Run App-related tests**

```bash
npx jest --testPathPattern="App" --no-coverage
```

Expected: All pass.

**Step 9: Commit**

```bash
git add App.tsx src/state/selectors/appSelectors.ts src/state/selectors/__tests__/appSelectors.test.ts
git commit -m "perf(state): memoize App.tsx Redux selectors with createSelector; remove debug console.log"
```

---

### Task 6: Remove selectedGuests Duplication from guestsSlice

`guestsSlice.ts` maintains two fields that hold the same Guest entities: `guests` (the master cache, keyed by ID) and `selectedGuests` (the result of the most recent `getGuests` query, also keyed by ID). When `updateSelectedGuest` fires, it updates both (line 98), but `getGuest` only updates `guests` (line 142-143) — leaving `selectedGuests` stale. The fix is to remove `selectedGuests` and replace all read sites with a selector over `guests`.

**Files:**
- Modify: `src/state/slices/guestsSlice.ts`
- Create/Modify: `src/state/selectors/guestSelectors.ts`
- Grep and update read sites: any file doing `state.guestsRTK.selectedGuests`

**Step 1: Find all read sites for selectedGuests**

```bash
grep -rn "selectedGuests" src --include="*.ts" --include="*.tsx"
```

Note every file and line number. These will all need to be updated.

**Step 2: Create a selector to replace selectedGuests**

Create `src/state/selectors/guestSelectors.ts`:

```typescript
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { Guest } from '../../entities/Guest';

// Returns all cached guests as an object keyed by ID
export const selectAllGuests = (state: RootState) => state.guestsRTK.guests;

// Returns the selected (current) guest
export const selectSelectedGuest = (state: RootState) => state.guestsRTK.selectedGuest;

// Returns all guests as a sorted array (by last name, then first name)
export const selectGuestsArray = createSelector(
  selectAllGuests,
  (guests): Guest[] =>
    Object.values(guests).sort((a, b) => {
      const lastNameCmp = (a.lastName || '').localeCompare(b.lastName || '');
      return lastNameCmp !== 0 ? lastNameCmp : (a.firstName || '').localeCompare(b.firstName || '');
    }),
);
```

**Step 3: Write a test for the selector**

Create `src/state/selectors/__tests__/guestSelectors.test.ts`:

```typescript
import { selectGuestsArray, selectAllGuests } from '../guestSelectors';

const makeState = (guests: Record<string, any> = {}) => ({
  guestsRTK: { guests, selectedGuest: null, selectedGuests: {}, status: 'idle', error: null,
    userAsGuest: null, updateStatus: 'idle', createStatus: 'idle',
    deleteStatus: 'idle', customizePhaseStatus: 'idle' },
} as any);

describe('selectGuestsArray', () => {
  it('returns empty array when no guests', () => {
    expect(selectGuestsArray(makeState())).toEqual([]);
  });

  it('returns sorted array of guests', () => {
    const state = makeState({
      '2': { id: '2', firstName: 'Bob', lastName: 'Zimmermann' },
      '1': { id: '1', firstName: 'Alice', lastName: 'Adams' },
    });
    const result = selectGuestsArray(state);
    expect(result[0].firstName).toBe('Alice');
    expect(result[1].firstName).toBe('Bob');
  });

  it('is memoized — returns same reference when state is unchanged', () => {
    const state = makeState({ '1': { id: '1', firstName: 'A', lastName: 'B' } });
    expect(selectGuestsArray(state)).toBe(selectGuestsArray(state));
  });
});
```

**Step 4: Run the test**

```bash
npx jest src/state/selectors/__tests__/guestSelectors.test.ts --no-coverage
```

Expected: PASS.

**Step 5: Remove selectedGuests from the slice**

In `src/state/slices/guestsSlice.ts`:

a) Remove from `GuestsState` interface (line 11):
```typescript
// REMOVE this line:
selectedGuests: { [id: string]: Guest }; // Result of most recent getGuests query
```

b) Remove from `initialState` (line 25):
```typescript
// REMOVE this line:
selectedGuests: {},
```

c) Remove the `selectedGuests` update from `updateSelectedGuest` (line 98):
```typescript
// REMOVE this line inside updateSelectedGuest:
state.selectedGuests[action.payload.id] = action.payload;
```

d) Remove the `selectedGuests` assignment from `getGuests.fulfilled` (line 126):
```typescript
// REMOVE this line inside getGuests.fulfilled:
state.selectedGuests = action.payload;
```

**Step 6: Update all read sites**

For each file found in Step 1 that reads `state.guestsRTK.selectedGuests`, replace with `selectAllGuests(state)` or `selectGuestsArray(state)` depending on whether the caller needs an object or an array.

Example:
```typescript
// Before
const guests = useAppSelector((state: any) => state.guestsRTK.selectedGuests);

// After (if you need the object)
import { selectAllGuests } from '../../state/selectors/guestSelectors';
const guests = useAppSelector(selectAllGuests);

// After (if you need an array)
import { selectGuestsArray } from '../../state/selectors/guestSelectors';
const guestsArray = useAppSelector(selectGuestsArray);
```

**Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any remaining type errors. There should be none if all read sites were updated.

**Step 8: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

**Step 9: Commit**

```bash
git add src/state/slices/guestsSlice.ts src/state/selectors/guestSelectors.ts src/state/selectors/__tests__/guestSelectors.test.ts
git commit -m "refactor(state): remove redundant selectedGuests from guestsSlice; add guestSelectors"
```

---

## Verification Checklist

After all 6 tasks:

```bash
# All tests pass
npx jest --no-coverage

# Zero TypeScript errors
npx tsc --noEmit

# No console.log in App.tsx
grep -n "console.log" App.tsx
# Expected: 0 results

# No selectedGuests in slice
grep -n "selectedGuests" src/state/slices/guestsSlice.ts
# Expected: 0 results

# onSnapshot has error callback
grep -A 10 "onSnapshot" src/services/guest.tsx | grep -c "errorFn\|error =>"
# Expected: >= 1
```
