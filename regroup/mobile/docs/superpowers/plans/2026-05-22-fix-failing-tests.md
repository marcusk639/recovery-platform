# Fix Failing Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 29 currently failing unit tests across 8 suites so `npm test` is fully green (excluding emulator-gated integration tests).

**Architecture:** Each task targets one root-cause category of failures. Tasks are independent and can be done in any order. No logic changes — only test infrastructure fixes and one import correction.

**Tech Stack:** Jest, `@testing-library/react-native`, `@tanstack/react-query`, React Native, TypeScript.

---

## Root Cause Summary

| Suite                            | # Failing            | Root Cause                                                                                                                               |
| -------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `payment.test.ts`                | 1 suite fails to run | Imports `'../payment'` but file is `payments.ts`                                                                                         |
| `BusinessMeetingDetail.test.tsx` | 6                    | Renders without `QueryClientProvider`                                                                                                    |
| `OxfordDashboard.test.tsx`       | 4                    | Renders without `QueryClientProvider`                                                                                                    |
| `OfficerManagement.test.tsx`     | 11                   | Mocks `services/oxford/officers` but `useOfficers` hook reads from `services/oxford` barrel — mock never intercepts                      |
| `MeetingResultsList.test.tsx`    | 1                    | `new MeetingFilters()` defaults `day` to today (Friday) — filters out the Monday mock meeting                                            |
| `HouseSearchScreen.test.tsx`     | 7                    | Phase C removed Redux `searchedHouses`; component now uses local state fed by `searchForHousesService`, but test never mocks the service |
| `firestore.rules.test.ts`        | 1 suite fails to run | `firebase/compat/database` is ESM; not in `transformIgnorePatterns` + needs Firestore emulator                                           |
| `storage.rules.test.ts`          | 1 suite fails to run | Same ESM parse error + needs Firebase Storage emulator                                                                                   |

---

## File Map

| File                                                            | Action                                                                   | Task |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| `src/services/__tests__/payment.test.ts`                        | Modify — fix import path                                                 | 1    |
| `src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx`   | Modify — add `QueryClientProvider` wrapper                               | 2    |
| `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx`         | Modify — add `QueryClientProvider` wrapper                               | 2    |
| `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`       | Modify — fix mock path from `oxford/officers` → `oxford` barrel          | 3    |
| `src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx` | Modify — override `day: 'all'` in test filters                           | 4    |
| `src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx`  | Modify — add `searchForHouses` service mock, remove stale Redux preloads | 5    |
| `jest.config.js`                                                | Modify — add rules test files to `testPathIgnorePatterns`                | 6    |

---

## Task 1: Fix payment.test.ts — broken import path

The service file was renamed from `payment.ts` to `payments.ts` but the test still imports the old name.

**Files:**

- Modify: `src/services/__tests__/payment.test.ts`

- [ ] **Step 1.1: Fix the import**

  In `src/services/__tests__/payment.test.ts`, find line 21:

  ```typescript
  import {
    createRentPaymentIntent,
    recordRentPayment,
    getPaymentHistory,
    RentPayment,
  } from '../payment';
  ```

  Change to:

  ```typescript
  import {
    createRentPaymentIntent,
    recordRentPayment,
    getPaymentHistory,
    RentPayment,
  } from '../payments';
  ```

- [ ] **Step 1.2: Run the test to verify it passes**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest src/services/__tests__/payment.test.ts --no-coverage 2>&1 | tail -10
  ```

  Expected: `Tests: X passed` (no suite-level failure).

- [ ] **Step 1.3: Commit**

  ```bash
  git add src/services/__tests__/payment.test.ts
  git commit -m "fix(tests): update payment.test.ts import to renamed payments.ts"
  ```

---

## Task 2: Fix BusinessMeetingDetail and OxfordDashboard — missing QueryClientProvider

Both files render React Query-powered components (`BusinessMeetingDetail` calls `useUpdateBusinessMeeting`, `OxfordDashboard` calls `useCurrentWeekRecord`) without a `QueryClientProvider`. React Query throws immediately: `"No QueryClient set, use QueryClientProvider to set one"`.

**Files:**

- Modify: `src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx`
- Modify: `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx`

- [ ] **Step 2.1: Add QueryClientProvider to BusinessMeetingDetail tests**

  In `src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx`, add the import at the top (after the existing React import):

  ```typescript
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  ```

  Then add a `renderScreen` helper just before the first `describe` block:

  ```typescript
  function renderScreen(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  }
  ```

  Then replace every bare `render(<BusinessMeetingDetail .../>)` call with `renderScreen(<BusinessMeetingDetail .../>)`. For example:

  ```typescript
  // Before
  const { getByText } = render(
    <BusinessMeetingDetail navigation={mockNavigation} />,
  );

  // After
  const { getByText } = renderScreen(
    <BusinessMeetingDetail navigation={mockNavigation} />,
  );
  ```

  Repeat for every `render(` call in the file.

- [ ] **Step 2.2: Run BusinessMeetingDetail to confirm green**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx --no-coverage 2>&1 | tail -10
  ```

  Expected: `6 passed`.

- [ ] **Step 2.3: Add QueryClientProvider to OxfordDashboard tests**

  In `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx`, check if `QueryClient` is already imported. If not, add:

  ```typescript
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  ```

  Add the same `renderScreen` helper before the first `describe`:

  ```typescript
  function renderScreen(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  }
  ```

  Replace all bare `render(` calls in the file with `renderScreen(`.

- [ ] **Step 2.4: Run OxfordDashboard to confirm green**

  ```bash
  npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx --no-coverage 2>&1 | tail -10
  ```

  Expected: `4 passed`.

- [ ] **Step 2.5: Commit**

  ```bash
  git add src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx \
          src/screens/Oxford/__tests__/OxfordDashboard.test.tsx
  git commit -m "fix(tests): wrap Oxford component tests in QueryClientProvider"
  ```

---

## Task 3: Fix OfficerManagement — wrong service mock path

The test mocks `'../../../services/oxford/officers'` (the sub-module), but `useOfficers` in `state/queries/oxfordQueries.ts` imports from `'../../services/oxford'` (the barrel/index). Jest module mocks do not reliably propagate from a sub-module through a barrel re-export when the barrel is imported as a namespace (`import * as oxfordService`). The mock never intercepts the query function, so all `waitFor` calls that wait for officer data to appear time out after 1 second.

**Files:**

- Modify: `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`

- [ ] **Step 3.1: Change the mock target from the sub-module to the barrel**

  Find the existing mock (around line 63):

  ```typescript
  jest.mock('../../../services/oxford/officers', () => ({
    getOfficers: (...args: any[]) => mockGetOfficers(...args),
  }));
  ```

  Replace with (mock the barrel, preserving all other functions as pass-throughs so unrelated imports don't break):

  ```typescript
  jest.mock('../../../services/oxford', () => ({
    getOfficers: (...args: any[]) => mockGetOfficers(...args),
    setOfficer: (...args: any[]) => mockSetOfficer(...args),
    removeOfficer: (...args: any[]) => mockRemoveOfficer(...args),
  }));
  ```

  Check that `mockSetOfficer` and `mockRemoveOfficer` are already declared in the test file. If not, add them alongside `mockGetOfficers`:

  ```typescript
  const mockSetOfficer = jest.fn();
  const mockRemoveOfficer = jest.fn();
  ```

  Then scan the test for any references to `setOfficer` or `removeOfficer` to see which mock names are already used. Update accordingly so names match.

- [ ] **Step 3.2: Run OfficerManagement to confirm green**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage 2>&1 | tail -10
  ```

  Expected: `11 passed`.

- [ ] **Step 3.3: Commit**

  ```bash
  git add src/screens/Oxford/__tests__/OfficerManagement.test.tsx
  git commit -m "fix(tests): mock services/oxford barrel instead of sub-module in OfficerManagement test"
  ```

---

## Task 4: Fix MeetingResultsList — time-dependent filter default

`new MeetingFilters()` sets `day` to today's day of the week (`getDayOfWeek(getTodaysDate())`). On most days, this is not `'monday'`, so the `mockMeeting` (which has `day: 'monday'`) is filtered out by `meetingShouldRender`. The test's `getByText('Serenity Group')` then finds nothing and fails.

**Files:**

- Modify: `src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx`

- [ ] **Step 4.1: Override `day` in the test filter to `'all'`**

  Find (around line 55):

  ```typescript
  const defaultFilters = new MeetingFilters();
  ```

  Replace with:

  ```typescript
  const defaultFilters: MeetingFilters = {
    ...new MeetingFilters(),
    day: 'all',
  };
  ```

  This prevents the filter from dropping meetings that don't match today's day.

- [ ] **Step 4.2: Run MeetingResultsList to confirm green**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx --no-coverage 2>&1 | tail -10
  ```

  Expected: `Tests: X passed` with no failures.

- [ ] **Step 4.3: Commit**

  ```bash
  git add src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx
  git commit -m "fix(tests): use day:'all' in MeetingResultsList filter to avoid weekday-sensitive failures"
  ```

---

## Task 5: Fix HouseSearchScreen — component migrated from Redux to local state

Phase C removed the `searchedHouses` Redux thunk and moved search results to local component state (`useState<House[]>([])`). The component now calls `searchForHousesService` directly. Tests still preload `houses.searchedHouses` in Redux — that field is never read by the component and has no effect. Tests that assert on rendered house names always see empty results.

**Files:**

- Modify: `src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx`

- [ ] **Step 5.1: Add a mock variable and mock for `services/house`**

  Near the top of the test file (after existing `jest.mock` calls), add:

  ```typescript
  const mockSearchForHouses = jest.fn();

  jest.mock('../../../services/house', () => ({
    searchForHouses: (...args: any[]) => mockSearchForHouses(...args),
  }));
  ```

- [ ] **Step 5.2: Set a default mock return in `beforeEach`**

  Find the `beforeEach` that calls `jest.clearAllMocks()`. Add a default resolution after it:

  ```typescript
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: search returns empty (most tests don't need results)
    mockSearchForHouses.mockResolvedValue({});
  });
  ```

- [ ] **Step 5.3: Update result-rendering tests to mock the service response**

  Find the `describe('results rendering', ...)` block. Each test that passes `searchedHouses` as a Redux preload should instead configure `mockSearchForHouses` to return those houses. For example:

  ```typescript
  it('renders house names when search results are present', async () => {
    mockSearchForHouses.mockResolvedValue({ [BASE_HOUSE.id]: BASE_HOUSE });
    const { getByText } = renderScreen(); // no store options needed for houses
    await waitFor(() => expect(getByText('Sunrise Recovery')).toBeTruthy());
  });

  it('renders multiple houses when results contain multiple houses', async () => {
    mockSearchForHouses.mockResolvedValue({
      [BASE_HOUSE.id]: BASE_HOUSE,
      [SECOND_HOUSE.id]: SECOND_HOUSE,
    });
    const { getByText } = renderScreen();
    await waitFor(() => {
      expect(getByText('Sunrise Recovery')).toBeTruthy();
      expect(getByText('Serenity House')).toBeTruthy();
    });
  });
  ```

  Do the same for any test that passed `searchedHouses` in `renderScreen({ searchedHouses: [...] })`. Remove the `searchedHouses` key from those calls — it is no longer part of `BuildStoreOptions` and should be deleted to avoid confusion.

- [ ] **Step 5.4: Run HouseSearchScreen to confirm green**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npx jest src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx --no-coverage 2>&1 | tail -10
  ```

  Expected: all previously-failing 7 tests pass.

- [ ] **Step 5.5: Commit**

  ```bash
  git add src/screens/HouseSearch/__tests__/HouseSearchScreen.test.tsx
  git commit -m "fix(tests): mock searchForHousesService in HouseSearchScreen after Phase C Redux removal"
  ```

---

## Task 6: Move rules tests to integration-only path

`firestore.rules.test.ts` and `storage.rules.test.ts` both:

1. Import `firebase/compat/database` which uses ESM `import` syntax — not handled by the current `transformIgnorePatterns` (would require adding `firebase|@firebase` to the transform list, which can cause other breakage)
2. Require a running Firestore/Storage emulator to produce meaningful results

These are integration tests. They should not run in `npm test` (unit test mode). Excluding them from unit runs is the correct fix; they'll continue to be runnable explicitly with `npx jest firebase/__tests__/...` when the emulator is up.

**Files:**

- Modify: `jest.config.js`

- [ ] **Step 6.1: Add rules tests to `testPathIgnorePatterns`**

  In `jest.config.js`, find:

  ```javascript
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/integration/',
    '/.claude/',
    // Emulator/Firebase integration tests that require native modules or running emulator
    'firebase-test-utils.ts',
    'activity.emulator.test.ts',
    // Test utility files (not test suites themselves)
    'src/state/__tests__/test-utils.tsx',
    // Full-app render test that requires native modules not available in unit test environment
    '__tests__/App-test.tsx',
  ],
  ```

  Add two entries to the emulator section:

  ```javascript
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/integration/',
    '/.claude/',
    // Emulator/Firebase integration tests that require native modules or running emulator
    'firebase-test-utils.ts',
    'activity.emulator.test.ts',
    'firebase/__tests__/firestore.rules.test.ts',
    'firebase/__tests__/storage.rules.test.ts',
    // Test utility files (not test suites themselves)
    'src/state/__tests__/test-utils.tsx',
    // Full-app render test that requires native modules not available in unit test environment
    '__tests__/App-test.tsx',
  ],
  ```

- [ ] **Step 6.2: Verify `npm test` no longer attempts to run rules tests**

  ```bash
  cd /Users/marcusklein/dev/rats-v2
  npm test -- --listTests 2>&1 | grep "rules.test"
  ```

  Expected: no output (neither rules test file listed).

- [ ] **Step 6.3: Confirm full test suite is now green**

  ```bash
  npm test 2>&1 | tail -8
  ```

  Expected:

  ```
  Test Suites: X passed, X total
  Tests:       X passed, X total
  ```

  Zero failures.

- [ ] **Step 6.4: Commit**

  ```bash
  git add jest.config.js
  git commit -m "fix(tests): exclude firestore/storage rules tests from unit test run (require emulator)"
  ```

---

## Existing Plans (no new plan needed)

The other two pre-launch blockers already have detailed implementation plans:

| Blocker                                                                                 | Existing Plan                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Paywall / subscription gate (Firestore rules, backfill migration, House entity default) | `docs/superpowers/plans/2026-05-19-paywall-completion.md`   |
| Drug Testing feature (entity, service, queries, screens, navigation)                    | `docs/superpowers/plans/2026-04-08-sprint1-table-stakes.md` |
