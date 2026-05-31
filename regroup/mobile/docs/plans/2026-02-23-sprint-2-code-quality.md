# Sprint 2 Code Quality Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all production console statements, surface error states that are currently swallowed, and add null-safety guards to prevent silent NaN/invalid-Date values reaching the UI.

**Architecture:** The app uses custom hooks that wrap Firestore `onSnapshot` subscriptions and expose `{ data, loading, error }` tuples; consumers rely on those flags to render loading/error UI. Services are plain async functions called from Redux thunks or React event handlers. All diagnostic output must go through `logException` (Sentry) instead of `console.*`.

**Tech Stack:** React Native, TypeScript, Redux Toolkit, `@react-native-firebase/firestore`, Jest + `@testing-library/react-native`, Sentry via `src/util/logging.ts`.

---

## Issue Index

| # | Issue | File(s) | Task(s) |
|---|-------|---------|---------|
| 1 | Production `console.*` in notification service | `src/services/notifications/service.ts`, `src/services/notifications/handler.ts` | 1–2 |
| 2 | Production `console.*` in deep-link service | `src/services/native-deep-links.ts` | 3 |
| 3 | Production `console.*` in DataContext | `src/context/DataContext.tsx` | 4 |
| 4 | Production `console.*` in EnhancedAuthService | `src/services/EnhancedAuthService.ts` | 5 |
| 5 | Production `console.*` in house service | `src/services/house.tsx` | 6 |
| 6 | Firebase Timestamp null-check in useWeekSummary | `src/hooks/activity/useWeekSummary.ts` | 7–8 |
| 7 | No `isError` on `useStatSummary` | `src/hooks/useStatSummary.ts` | 9–10 |
| 8 | Firestore error not surfaced in `useActivities` | `src/hooks/activity/useActivities.ts` | 11–12 |

---

## Task 1 — Remove console statements from `notifications/handler.ts`

**File:** `src/services/notifications/handler.ts`

**Before (lines 18, 26, 34–36, 45):**
```ts
onNotification(notification: IReceivedNotification) {
  console.log('NotificationHandler:', notification);
  ...
}

onRegister(token: MessagingToken) {
  console.log('NotificationHandler:', token);
  ...
}

onAction(notification: ReceivedNotification) {
  console.log('Notification action received:');
  console.log(notification.action);
  console.log(notification);
  ...
}

onRegistrationError(err: any) {
  console.error(err);
}
```

**After:**
```ts
import { logException } from '../../util/logging';

onNotification(notification: IReceivedNotification) {
  if (typeof this._onNotification === 'function') {
    this._onNotification(notification);
  }
}

onRegister(token: MessagingToken) {
  if (typeof this._onRegister === 'function') {
    this._onRegister(token);
  }
}

onAction(notification: ReceivedNotification) {
  if (notification.action === 'Yes') {
    PushNotification.invokeApp(notification as PushNotificationObject);
  }
}

onRegistrationError(err: any) {
  logException(err);
}
```

**Steps:**
1. Edit `src/services/notifications/handler.ts`: add `import { logException } from '../../util/logging';` at the top, then remove the four `console.log` calls and the three `console.log` lines inside `onAction`, and replace `console.error(err)` with `logException(err)`.
2. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
3. Commit:
   ```
   git commit -m "fix(notifications): remove production console statements from handler"
   ```

---

## Task 2 — Remove console statements from `notifications/service.ts`

**File:** `src/services/notifications/service.ts`

**Before (lines 28, 43, 55, 70, 76):**
```ts
PushNotification.getChannels(function (channels) {
  console.log(channels);
});

created => console.log(`createChannel 'default-channel-id' returned '${created}'`),

created => console.log(`createChannel 'sound-channel-id' returned '${created}'`),

created => console.log(`createChannel returned '${created}'`),

PushNotification.popInitialNotification(notification =>
  console.log('InitialNotication:', notification),
);
```

**After:**
```ts
PushNotification.getChannels(function (_channels) {});

created => { if (!created) { logException(new Error(`createChannel 'default-channel-id' already existed`)); } },

created => { if (!created) { logException(new Error(`createChannel 'sound-channel-id' already existed`)); } },

created => { if (!created) { logException(new Error(`createChannel 'custom-channel-id' already existed`)); } },

PushNotification.popInitialNotification(function (_notification) {});
```

**Steps:**
1. Add `import { logException } from '../../util/logging';` at the top of `src/services/notifications/service.ts`.
2. Replace each `console.log(...)` callback with the `created => { if (!created) { logException(...) } }` form shown above. The `getChannels` and `popInitialNotification` callbacks become no-ops.
3. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
4. Commit:
   ```
   git commit -m "fix(notifications): remove production console statements from service"
   ```

---

## Task 3 — Remove console statements from `native-deep-links.ts`

**File:** `src/services/native-deep-links.ts`

**Before (lines 38–40, 59, 62, 65, 68–76, 78–81, 85, 90):**
```ts
console.log('Creating invite link:', link);
const encodedLink = encodeURI(link);
console.log('Encoded invite link:', encodedLink);
...
console.log('getInitialLink - isValid:', isValid);
...
console.log('getInitialLink - returning valid link:', initialUrl);
...
console.log('getInitialLink - invalid link, returning null');
try {
  const parsedForDebug = new URL(initialUrl);
  console.log('getInitialLink - invalid link details:', { ... });
} catch (e) {
  console.log('getInitialLink - invalid link details:', { ... });
}
...
console.log('getInitialLink - no initial URL found');
...
console.error('Error getting initial link:', error);
```

**After:**
```ts
import { logException } from '../util/logging';

export const createNewInviteLink = (...): string => {
  const link = `${customScheme}?type=invitation&invitationType=${invitationType}&house=${houseId}&inviter=${
    inviterUserId || ''
  }&email=${email}&owner=${ownerId || ''}&initialPhase=${initialPhase || ''}`;
  return encodeURI(link);
};

export const getInitialLink = async (): Promise<NativeDeepLink | null> => {
  try {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl && isValidDeepLink(initialUrl)) {
      return { url: initialUrl };
    }
    return null;
  } catch (error) {
    logException(error);
    return null;
  }
};
```

**Steps:**
1. Add `import { logException } from '../util/logging';` to `src/services/native-deep-links.ts`.
2. In `createNewInviteLink`: delete lines 38 and 40 (`console.log('Creating invite link:',...)` and `console.log('Encoded invite link:',...)`) and the inline variable `const encodedLink` — inline the `encodeURI` call directly in the `return` statement.
3. In `getInitialLink`: replace the full inner body (lines 57–92) with the flat `if (initialUrl && isValidDeepLink(initialUrl))` guard shown above; replace `console.error` in the catch with `logException(error)`.
4. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
5. Commit:
   ```
   git commit -m "fix(deep-links): remove production console statements"
   ```

---

## Task 4 — Remove console statements from `DataContext.tsx`

**File:** `src/context/DataContext.tsx`

**Lines with console calls:** 88, 94, 106, 110, 120, 130, 134, 136.

**Before:**
```ts
console.log('[DataProvider] Fetching initial data for user:', currentUser.id);
...
console.log('[DataProvider] Fetching houses for adminId:', currentUser.adminId);
...
console.log('[DataProvider] Selecting first house:', firstHouse.id);
...
console.log('[DataProvider] Fetching guests for house:', firstHouse.id);
...
console.log('[DataProvider] Selecting user as guest:', userAsGuest.id);
...
console.log('[DataProvider] Fetching admin data:', currentUser.adminId);
...
console.log('[DataProvider] Initial data fetch complete');
...
console.error('[DataProvider] Error fetching initial data:', error);
```

**After:**
```ts
import { logException } from '../util/logging';

// All console.log lines are deleted entirely.
// The catch block becomes:
} catch (error) {
  logException(error);
}
```

**Steps:**
1. Add `import { logException } from '../util/logging';` to `src/context/DataContext.tsx` (existing imports block).
2. Delete all eight `console.log(...)` lines (88, 94, 106, 110, 120, 130, 134).
3. Replace `console.error('[DataProvider] Error fetching initial data:', error)` (line 136) with `logException(error)`.
4. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
5. Commit:
   ```
   git commit -m "fix(context): remove production console statements from DataProvider"
   ```

---

## Task 5 — Replace `console.error` in `EnhancedAuthService.ts`

**File:** `src/services/EnhancedAuthService.ts`

**Lines with console calls:** 87, 186, 248, 289, 331, 346, 394.

All are `console.error('... error:', error)` in catch blocks that already return a typed `AuthResult` object. The error is not re-thrown, so the only lost value is Sentry visibility.

**Before (example, line 86–87):**
```ts
} catch (error: any) {
  console.error('Sign in error:', error);
  switch (error.code) {
```

**After:**
```ts
import { logException } from '../util/logging';

} catch (error: any) {
  logException(error);
  switch (error.code) {
```

**Steps:**
1. Add `import { logException } from '../util/logging';` to `src/services/EnhancedAuthService.ts`.
2. Replace every `console.error(...)` call in the file with `logException(error)` — seven occurrences at lines 87, 186, 248, 289, 331, 346, 394. The `error` variable name is `error` in all catch blocks.
3. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
4. Commit:
   ```
   git commit -m "fix(auth): replace console.error with logException in EnhancedAuthService"
   ```

---

## Task 6 — Clean up `console.*` in `house.tsx`

**File:** `src/services/house.tsx`

**Lines with console calls:** 189, 403, 406–410.

Line 189 is a `console.error` in a catch for `createHouses`.
Lines 403–410 are inside `updateHouseBatch`'s try/catch.

**Before (lines 401–413):**
```ts
try {
  const result = await Promise.all(promises);
  console.log('updateHouseBatch - Successfully updated house batch');
  return result;
} catch (error) {
  console.error('updateHouseBatch - Error in batch update:', error);
  console.error('updateHouseBatch - Error details:', {
    message: (error as Error)?.message,
    code: (error as any)?.code,
    stack: (error as Error)?.stack,
  });
  throw error;
}
```

**After:**
```ts
import { logException } from '../util/logging';

// line 189
} catch (error) {
  logException(error);
  throw error;
}

// lines 401-413
try {
  const result = await Promise.all(promises);
  return result;
} catch (error) {
  logException(error);
  throw error;
}
```

**Steps:**
1. Add `import { logException } from '../util/logging';` to `src/services/house.tsx`.
2. At line 189, replace `console.error('failed to create houses', error)` with `logException(error)`.
3. At lines 403–411, delete `console.log('updateHouseBatch - Successfully updated house batch')` and replace the two `console.error(...)` calls with a single `logException(error)`.
4. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
5. Commit:
   ```
   git commit -m "fix(house): replace console statements with logException"
   ```

---

## Task 7 — Write failing test for Timestamp null-check in `useWeekSummary`

**File:** `src/hooks/activity/__tests__/useWeekSummary.test.ts`

**Problem:** Line 66 of `useWeekSummary.ts` calls `(data.lastUpdated as any).toDate()` without checking whether `toDate()` returns a valid Date. If `toDate()` returns `null` (possible when firebase-admin writes a null sentinel), the `summary.lastUpdated` becomes `null` cast to `Date` — an invalid Date that silently corrupts downstream date displays.

**Failing test to add (at the end of the file's `describe('useWeekSummary')` block):**
```ts
describe('Timestamp conversion', () => {
  it('sets lastUpdated to null when toDate() returns null', async () => {
    const { result } = renderHook(() =>
      useWeekSummary('guest123', 'house456', '2024-01-15')
    );

    act(() => {
      onSnapshotCallback?.({
        exists: true,
        data: () => ({
          ...makeSummary(),
          lastUpdated: { toDate: () => null },
        }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary?.lastUpdated).toBeNull();
  });

  it('leaves lastUpdated as-is when it is already a string', async () => {
    const { result } = renderHook(() =>
      useWeekSummary('guest123', 'house456', '2024-01-15')
    );

    act(() => {
      onSnapshotCallback?.({
        exists: true,
        data: () => ({
          ...makeSummary(),
          lastUpdated: '2024-01-21T00:00:00.000Z',
        }),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary?.lastUpdated).toBe('2024-01-21T00:00:00.000Z');
  });
});
```

**Steps:**
1. Add the `act` import to the test file's import line: `import { renderHook, waitFor, act } from '@testing-library/react-native';`
2. Append both test cases inside `describe('useWeekSummary')` in `src/hooks/activity/__tests__/useWeekSummary.test.ts`.
3. Run the tests to confirm they FAIL:
   ```
   npx jest src/hooks/activity/__tests__/useWeekSummary.test.ts --no-coverage
   ```
   Expected: the `toDate() returns null` test fails because the hook stores `null` as-is but `summary.lastUpdated` is `null` rather than an invalid Date — actually this test exposes whether the current code propagates null correctly. The test for `toDate()` returning null should fail if the hook doesn't guard the result.

---

## Task 8 — Implement Timestamp null-check in `useWeekSummary`

**File:** `src/hooks/activity/useWeekSummary.ts`

**Before (lines 64–67):**
```ts
// Convert Firestore timestamps to Date objects if needed
if (data.lastUpdated && typeof data.lastUpdated !== 'string') {
  data.lastUpdated = (data.lastUpdated as any).toDate();
}
```

**After:**
```ts
if (data.lastUpdated && typeof data.lastUpdated !== 'string') {
  const converted = (data.lastUpdated as any).toDate();
  data.lastUpdated = converted instanceof Date && !isNaN(converted.getTime())
    ? converted
    : null as any;
}
```

The guard captures the result of `toDate()` into `converted`, then only assigns it if it is a real `Date` with a valid time value. If `toDate()` returns `null` or produces `Invalid Date`, `lastUpdated` is set to `null` rather than silently storing garbage.

**Steps:**
1. Edit lines 65–66 of `src/hooks/activity/useWeekSummary.ts` with the new guard shown above.
2. Run the tests:
   ```
   npx jest src/hooks/activity/__tests__/useWeekSummary.test.ts --no-coverage
   ```
   Expected: all tests pass.
3. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
4. Commit:
   ```
   git commit -m "fix(useWeekSummary): guard Timestamp.toDate() result against null/invalid Date"
   ```

---

## Task 9 — Write failing test for `isError` on `useStatSummary`

**File:** `src/hooks/__tests__/useStatSummary.test.ts`

**Problem:** `StatSummaryData` (line 34) has no `isError` field. When `useWeekSummary` or `useWeekSummaryHistory` sets `error`, the consumer of `useStatSummary` has no way to know a subscription failed — it sees `isLoading: false` and stale/empty data with no error indicator.

**Failing test to add** (inside the existing `describe('useStatSummary')` block, as a new `describe` group at the end):

```ts
describe('isError flag', () => {
  it('returns isError=true when useWeekSummary reports an error', () => {
    mockUseWeekSummary.mockReturnValue({
      summary: null,
      loading: false,
      error: new Error('Firestore permission denied'),
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useStatSummary('meeting'));
    expect(result.current.isError).toBe(true);
  });

  it('returns isError=true when useWeekSummaryHistory reports an error', () => {
    mockUseWeekSummaryHistory.mockReturnValue({
      summaries: [],
      loading: false,
      error: new Error('network timeout'),
    });

    const { result } = renderHook(() => useStatSummary('meeting'));
    expect(result.current.isError).toBe(true);
  });

  it('returns isError=false when no hook has an error', () => {
    const { result } = renderHook(() => useStatSummary('meeting'));
    expect(result.current.isError).toBe(false);
  });
});
```

**Steps:**
1. Append the `describe('isError flag', ...)` block to the existing test file `src/hooks/__tests__/useStatSummary.test.ts`.
2. Run the tests to confirm they FAIL:
   ```
   npx jest src/hooks/__tests__/useStatSummary.test.ts --no-coverage
   ```
   Expected: three new tests fail with `TypeError: Cannot read properties of undefined (reading 'isError')` or similar — because `isError` does not yet exist on the return value.

---

## Task 10 — Implement `isError` on `useStatSummary`

**Files:**
- `src/hooks/useStatSummary.ts`
- `src/hooks/activity/useWeekSummaryHistory.ts` (verify `error` is in the return type)

**Step A — Confirm `useWeekSummaryHistory` already returns `error`.**

Check the hook's return statement. If `error` is not there it must be added; if it is, proceed.

**Step B — Add `isError` to the `StatSummaryData` interface (line 34 area):**

Before:
```ts
export interface StatSummaryData {
  guest: Guest | null;
  house: House | null;
  user: User | null;
  isLoading: boolean;
  ...
}
```

After:
```ts
export interface StatSummaryData {
  guest: Guest | null;
  house: House | null;
  user: User | null;
  isLoading: boolean;
  isError: boolean;
  ...
}
```

**Step C — Destructure `error` from the two hooks (lines 87–99 area):**

Before:
```ts
const { summary, loading: summaryLoading } = useWeekSummary(
  guest?.id,
  house?.id,
  startDate,
);

const { summaries: historicalSummaries, loading: historyLoading } = useWeekSummaryHistory(
  guest?.id,
  house?.id,
  8,
);
```

After:
```ts
const { summary, loading: summaryLoading, error: summaryError } = useWeekSummary(
  guest?.id,
  house?.id,
  startDate,
);

const { summaries: historicalSummaries, loading: historyLoading, error: historyError } = useWeekSummaryHistory(
  guest?.id,
  house?.id,
  8,
);
```

**Step D — Add `isError` to the return object (line 155 area):**

Before:
```ts
return {
  guest,
  house,
  user,
  isLoading: summaryLoading || historyLoading || disputesLoading,
  statSum,
  ...
};
```

After:
```ts
return {
  guest,
  house,
  user,
  isLoading: summaryLoading || historyLoading || disputesLoading,
  isError: summaryError !== null || historyError !== null,
  statSum,
  ...
};
```

**Steps:**
1. Edit `src/hooks/useStatSummary.ts` with changes B, C, and D above.
2. Run the tests:
   ```
   npx jest src/hooks/__tests__/useStatSummary.test.ts --no-coverage
   ```
   Expected: all tests pass including the three new `isError` tests.
3. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors. If `useWeekSummaryHistory` does not expose `error`, the compiler will flag it — add `error` to that hook's return type as well.
4. Commit:
   ```
   git commit -m "feat(useStatSummary): expose isError when any Firestore subscription fails"
   ```

---

## Task 11 — Write failing test for Firestore error surfacing in `useActivities`

**File:** `src/hooks/activity/__tests__/useActivities.test.ts`

**Problem:** Line 116 calls `console.error('Error fetching activities:', err)` but this is the only side-effect beyond calling `setError`. The `console.error` leaks to production. The existing test suite already tests that `error` is set on failure; there is no test that `console.error` is NOT called in production (i.e., that the error callback does not call `console.error`).

This task removes the production `console.error` from `useActivities.ts` and adds a test to prevent regression.

**Failing test to add** (new `describe` block in `useActivities.test.ts`):

```ts
describe('Firestore error callback', () => {
  it('does not call console.error when the Firestore subscription fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useActivities({ guestId: 'guest123', houseId: 'house456' })
    );

    act(() => {
      onSnapshotErrorCallback?.(new Error('permission-denied'));
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
```

**Steps:**
1. Add `act` to the import line in `src/hooks/activity/__tests__/useActivities.test.ts`.
2. Append the new `describe` block to the file.
3. Run the tests to confirm the new test FAILS:
   ```
   npx jest src/hooks/activity/__tests__/useActivities.test.ts --no-coverage
   ```
   Expected: the new test fails because `console.error` is still called at line 116 of `useActivities.ts`.

---

## Task 12 — Replace `console.error` with `logException` in `useActivities`

**File:** `src/hooks/activity/useActivities.ts`

**Before (lines 115–119):**
```ts
(err: Error) => {
  console.error('Error fetching activities:', err);
  setError(err);
  setLoading(false);
}
```

**After:**
```ts
import { logException } from '../../../util/logging';

(err: Error) => {
  logException(err);
  setError(err);
  setLoading(false);
}
```

**Steps:**
1. Add `import { logException } from '../../../util/logging';` to `src/hooks/activity/useActivities.ts` (near top with other imports).
2. Replace `console.error('Error fetching activities:', err)` with `logException(err)` at line 116.
3. Run the tests:
   ```
   npx jest src/hooks/activity/__tests__/useActivities.test.ts --no-coverage
   ```
   Expected: all tests pass including the new regression test.
4. Run TypeScript check:
   ```
   npx tsc --noEmit
   ```
   Expected: no errors.
5. Commit:
   ```
   git commit -m "fix(useActivities): replace console.error with logException in error callback"
   ```

---

## Verification Checklist

After all tasks are committed, run a full sweep to confirm no production `console.*` remain in the modified files:

```bash
npx grep -n "console\." \
  src/services/notifications/service.ts \
  src/services/notifications/handler.ts \
  src/services/native-deep-links.ts \
  src/context/DataContext.tsx \
  src/services/EnhancedAuthService.ts \
  src/services/house.tsx \
  src/hooks/activity/useActivities.ts \
  src/hooks/activity/useWeekSummary.ts \
  src/hooks/useStatSummary.ts
```

Expected: no output.

Run the full test suite for all affected files:

```bash
npx jest \
  src/hooks/activity/__tests__/useWeekSummary.test.ts \
  src/hooks/activity/__tests__/useActivities.test.ts \
  src/hooks/__tests__/useStatSummary.test.ts \
  --no-coverage
```

Expected: all tests pass.

Run TypeScript across the whole project:

```bash
npx tsc --noEmit
```

Expected: 0 errors.

---

## Commit Order Summary

| Task | Commit message |
|------|---------------|
| 1 | `fix(notifications): remove production console statements from handler` |
| 2 | `fix(notifications): remove production console statements from service` |
| 3 | `fix(deep-links): remove production console statements` |
| 4 | `fix(context): remove production console statements from DataProvider` |
| 5 | `fix(auth): replace console.error with logException in EnhancedAuthService` |
| 6 | `fix(house): replace console statements with logException` |
| 7–8 | `fix(useWeekSummary): guard Timestamp.toDate() result against null/invalid Date` |
| 9–10 | `feat(useStatSummary): expose isError when any Firestore subscription fails` |
| 11–12 | `fix(useActivities): replace console.error with logException in error callback` |
