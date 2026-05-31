# Sprint 1: Table Stakes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the table-stakes features that sober living operators will pay for on day one: enhanced resident intake, drug testing module, billing improvements, and balance dashboard.

**Architecture:** Extends the existing service + entity + React Query pattern. New features follow the established domain service model (module-level collection export, `logException` error handling, React Query key factories). All new screens register in the `Routes` enum and `RootStackParamList`.

**Tech Stack:** React Native 0.72, TypeScript, Firestore, React Query, Redux Toolkit, Formik + Yup, Jest

**Priority Order:** Drug Testing (missing, competitive table stakes) > Intake Enhancement (partial, operators expect this) > Balance Dashboard (partial, revenue visibility) > Billing Improvements (partial, collection rate)

---

## File Structure

### New Files

```
src/entities/DrugTest.ts                          # DrugTest interface + Yup schema
src/services/drugTests.ts                         # Firestore CRUD for drug tests
src/state/queries/drugTestQueries.ts              # React Query hooks
src/screens/DrugTesting/DrugTestingScreen.tsx      # House-level drug test management
src/screens/DrugTesting/DrugTestForm.tsx           # Log a new drug test result
src/screens/DrugTesting/DrugTestHistory.tsx        # Guest drug test history
src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx
src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx

src/screens/ResidentIntake/IntakeFormScreen.tsx    # Multi-step intake form
src/screens/ResidentIntake/IntakeReview.tsx        # Review + confirm intake
src/screens/ResidentIntake/__tests__/IntakeFormScreen.test.tsx

src/screens/BalanceDashboard/BalanceDashboard.tsx  # Per-resident balance detail
src/screens/BalanceDashboard/__tests__/BalanceDashboard.test.tsx
```

### Modified Files

```
src/entities/Guest.tsx                            # Add intake fields (emergencyContact, insurance, referringCenter)
src/navigation/types.ts                           # Add new Routes + param types
src/navigation/navigators.tsx                     # Register new screens in RootStack
src/screens/HouseSettings/PaymentDashboard.tsx    # Add per-resident drill-down nav
src/services/payments.ts                          # Add generateReceipt(), getBalancesByGuest()
src/state/queries/paymentQueries.ts               # Add useGuestBalances() hook
```

---

## Task 1: Drug Test Entity & Service

**Files:**

- Create: `src/entities/DrugTest.ts`
- Create: `src/services/drugTests.ts`
- Test: `src/services/__tests__/drugTests.test.ts` (optional unit test — integration test via emulator preferred)

### Steps

- [ ] **Step 1: Create the DrugTest entity**

```ts
// src/entities/DrugTest.ts
import * as yup from 'yup';

export type DrugTestResult =
  | 'negative'
  | 'positive'
  | 'inconclusive'
  | 'refused';

export type DrugTestType = 'urine' | 'saliva' | 'breathalyzer' | 'hair';

export interface DrugTest {
  id: string;
  guestId: string;
  houseId: string;
  testDate: string; // ISO date
  result: DrugTestResult;
  testType: DrugTestType;
  substancesDetected: string[]; // empty if negative
  observedBy: string; // userId of observer
  observerName: string;
  notes: string;
  scheduledDate?: string; // ISO date if from random schedule
  isRandom: boolean;
  escalationTriggered: boolean;
  createdAt: string;
}

export const drugTestSchema = yup.object().shape({
  guestId: yup.string().required('Guest is required'),
  houseId: yup.string().required('House is required'),
  testDate: yup.string().required('Test date is required'),
  result: yup
    .string()
    .oneOf(['negative', 'positive', 'inconclusive', 'refused'])
    .required('Result is required'),
  testType: yup
    .string()
    .oneOf(['urine', 'saliva', 'breathalyzer', 'hair'])
    .required('Test type is required'),
  substancesDetected: yup.array().of(yup.string()).default([]),
  observedBy: yup.string().required('Observer is required'),
  observerName: yup.string().required('Observer name is required'),
  notes: yup.string().default(''),
  isRandom: yup.boolean().default(false),
});
```

- [ ] **Step 2: Create the drug test service**

```ts
// src/services/drugTests.ts
import { firestore } from '../../firebase-setup';
import { DrugTest } from '../entities/DrugTest';
import { logException } from '../util/logging';
import FirebaseFirestore from '@react-native-firebase/firestore';

export const drugTestCollection = firestore.collection('drug-tests');

export async function logDrugTest(
  test: Omit<DrugTest, 'id' | 'createdAt' | 'escalationTriggered'>,
): Promise<DrugTest> {
  try {
    const ref = drugTestCollection.doc();
    const record: DrugTest = {
      ...test,
      id: ref.id,
      escalationTriggered:
        test.result === 'positive' || test.result === 'refused',
      createdAt: new Date().toISOString(),
    };
    await ref.set(record);
    return record;
  } catch (error) {
    logException(error);
    throw new Error('Failed to log drug test result');
  }
}

export async function getDrugTestsForGuest(
  guestId: string,
  limit = 50,
): Promise<DrugTest[]> {
  try {
    const snapshot = await drugTestCollection
      .where('guestId', '==', guestId)
      .orderBy('testDate', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => doc.data() as DrugTest);
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch drug test history');
  }
}

export async function getDrugTestsForHouse(
  houseId: string,
  limit = 100,
): Promise<DrugTest[]> {
  try {
    const snapshot = await drugTestCollection
      .where('houseId', '==', houseId)
      .orderBy('testDate', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => doc.data() as DrugTest);
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch house drug tests');
  }
}

export async function getPositiveTestCount(
  guestId: string,
  sinceDays = 90,
): Promise<number> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    const snapshot = await drugTestCollection
      .where('guestId', '==', guestId)
      .where('result', 'in', ['positive', 'refused'])
      .where('testDate', '>=', since.toISOString())
      .get();
    return snapshot.size;
  } catch (error) {
    logException(error);
    throw new Error('Failed to count positive tests');
  }
}
```

- [ ] **Step 3: Commit entity + service**

```bash
git add src/entities/DrugTest.ts src/services/drugTests.ts
git commit -m "feat(drug-testing): add DrugTest entity and Firestore service"
```

---

## Task 2: Drug Test React Query Hooks

**Files:**

- Create: `src/state/queries/drugTestQueries.ts`

### Steps

- [ ] **Step 1: Create the query hooks**

```ts
// src/state/queries/drugTestQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  logDrugTest,
  getDrugTestsForGuest,
  getDrugTestsForHouse,
  getPositiveTestCount,
} from '../../services/drugTests';
import { DrugTest } from '../../entities/DrugTest';

export const drugTestKeys = {
  all: ['drug-tests'] as const,
  guestTests: (guestId: string) =>
    [...drugTestKeys.all, 'guest', guestId] as const,
  houseTests: (houseId: string) =>
    [...drugTestKeys.all, 'house', houseId] as const,
  positiveCount: (guestId: string) =>
    [...drugTestKeys.all, 'positive-count', guestId] as const,
};

export function useGuestDrugTests(guestId: string, enabled = true) {
  return useQuery({
    queryKey: drugTestKeys.guestTests(guestId),
    queryFn: () => getDrugTestsForGuest(guestId),
    enabled: enabled && !!guestId,
    staleTime: 30000,
  });
}

export function useHouseDrugTests(houseId: string, enabled = true) {
  return useQuery({
    queryKey: drugTestKeys.houseTests(houseId),
    queryFn: () => getDrugTestsForHouse(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30000,
  });
}

export function usePositiveTestCount(guestId: string, sinceDays = 90) {
  return useQuery({
    queryKey: drugTestKeys.positiveCount(guestId),
    queryFn: () => getPositiveTestCount(guestId, sinceDays),
    enabled: !!guestId,
    staleTime: 60000,
  });
}

export function useLogDrugTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      test: Omit<DrugTest, 'id' | 'createdAt' | 'escalationTriggered'>,
    ) => logDrugTest(test),
    onSuccess: result => {
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.guestTests(result.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.houseTests(result.houseId),
      });
      queryClient.invalidateQueries({
        queryKey: drugTestKeys.positiveCount(result.guestId),
      });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/state/queries/drugTestQueries.ts
git commit -m "feat(drug-testing): add React Query hooks for drug tests"
```

---

## Task 3: Register Drug Testing Routes

**Files:**

- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/navigators.tsx`

### Steps

- [ ] **Step 1: Add routes to the Routes enum**

In `src/navigation/types.ts`, add to the `Routes` enum:

```ts
// Add these entries to the Routes enum:
DrugTesting = 'DrugTesting',
DrugTestForm = 'DrugTestForm',
DrugTestHistory = 'DrugTestHistory',
ResidentIntake = 'ResidentIntake',
BalanceDashboard = 'BalanceDashboard',
```

- [ ] **Step 2: Add param types to RootStackParamList**

In `src/navigation/types.ts`, add to the `RootStackParamList`:

```ts
// Add these entries to RootStackParamList:
[Routes.DrugTesting]: undefined;
[Routes.DrugTestForm]: { guestId?: string };
[Routes.DrugTestHistory]: { guestId: string };
[Routes.ResidentIntake]: { houseId: string };
[Routes.BalanceDashboard]: undefined;
```

- [ ] **Step 3: Register screens in navigators.tsx**

Add screen registrations in the RootStack (follow existing pattern — these are modals presented over MainTab):

```tsx
<RootStack.Screen
  name={Routes.DrugTesting}
  component={DrugTestingScreen}
  options={{ title: 'Drug Testing' }}
/>
<RootStack.Screen
  name={Routes.DrugTestForm}
  component={DrugTestForm}
  options={{ title: 'Log Test Result' }}
/>
<RootStack.Screen
  name={Routes.DrugTestHistory}
  component={DrugTestHistory}
  options={{ title: 'Test History' }}
/>
<RootStack.Screen
  name={Routes.ResidentIntake}
  component={IntakeFormScreen}
  options={{ title: 'Resident Intake' }}
/>
<RootStack.Screen
  name={Routes.BalanceDashboard}
  component={BalanceDashboard}
  options={{ title: 'Balance Details' }}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/navigation/types.ts src/navigation/navigators.tsx
git commit -m "feat: register drug testing, intake, and balance routes"
```

---

## Task 4: Drug Testing Screen (House-Level)

**Files:**

- Create: `src/screens/DrugTesting/DrugTestingScreen.tsx`
- Create: `src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrugTestingScreen from '../DrugTestingScreen';

jest.mock('../../../state/queries/drugTestQueries', () => ({
  useHouseDrugTests: jest.fn(),
}));

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1', name: 'Test House' },
  }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { useHouseDrugTests } from '../../../state/queries/drugTestQueries';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('DrugTestingScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders loading state', () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { getByTestId } = render(<DrugTestingScreen />, { wrapper });
    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders drug test list when data loaded', async () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'test-1',
          guestId: 'guest-1',
          result: 'negative',
          testDate: '2026-04-01',
          testType: 'urine',
          observerName: 'Jane Admin',
          isRandom: true,
          substancesDetected: [],
          escalationTriggered: false,
        },
      ],
      isLoading: false,
    });
    const { findByText } = render(<DrugTestingScreen />, { wrapper });
    expect(await findByText('Negative')).toBeTruthy();
    expect(await findByText('Jane Admin')).toBeTruthy();
  });

  it('navigates to log form on FAB press', () => {
    (useHouseDrugTests as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
    });
    const { getByTestId } = render(<DrugTestingScreen />, { wrapper });
    fireEvent.press(getByTestId('fab-log-test'));
    expect(mockNavigate).toHaveBeenCalledWith('DrugTestForm', {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx --no-coverage`

Expected: FAIL — DrugTestingScreen module not found

- [ ] **Step 3: Implement the screen**

```tsx
// src/screens/DrugTesting/DrugTestingScreen.tsx
import React, { useMemo, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useData } from '../../context/DataContext';
import { useHouseDrugTests } from '../../state/queries/drugTestQueries';
import { DrugTest, DrugTestResult } from '../../entities/DrugTest';
import { Routes } from '../../navigation/types';
import RatsText from '../../components/rats-text/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header/screen-header';

const RESULT_COLORS: Record<DrugTestResult, string> = {
  negative: '#4CAF50',
  positive: '#F44336',
  inconclusive: '#FF9800',
  refused: '#9E9E9E',
};

function DrugTestRow({ test }: { test: DrugTest }) {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate(Routes.DrugTestHistory, { guestId: test.guestId })
      }>
      <View style={styles.rowLeft}>
        <RatsText style={styles.date}>
          {new Date(test.testDate).toLocaleDateString()}
        </RatsText>
        <RatsText style={styles.observer}>{test.observerName}</RatsText>
        {test.isRandom && (
          <RatsText style={styles.randomBadge}>Random</RatsText>
        )}
      </View>
      <View
        style={[
          styles.resultBadge,
          { backgroundColor: RESULT_COLORS[test.result] },
        ]}>
        <RatsText style={styles.resultText}>
          {test.result.charAt(0).toUpperCase() + test.result.slice(1)}
        </RatsText>
      </View>
    </TouchableOpacity>
  );
}

export default function DrugTestingScreen() {
  const navigation = useNavigation<any>();
  const { currentHouse } = useData();
  const { data: tests, isLoading } = useHouseDrugTests(currentHouse?.id ?? '');

  const [filter, setFilter] = useState<DrugTestResult | 'all'>('all');

  const filteredTests = useMemo(() => {
    if (!tests) return [];
    if (filter === 'all') return tests;
    return tests.filter(t => t.result === filter);
  }, [tests, filter]);

  if (isLoading) {
    return (
      <View style={styles.center} testID="loading-indicator">
        <RatsLoadingIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Drug Testing" />
      <View style={styles.filterRow}>
        {(
          ['all', 'negative', 'positive', 'inconclusive', 'refused'] as const
        ).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)}>
            <RatsText
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </RatsText>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filteredTests}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DrugTestRow test={item} />}
        contentContainerStyle={styles.list}
      />
      <TouchableOpacity
        testID="fab-log-test"
        style={styles.fab}
        onPress={() => navigation.navigate(Routes.DrugTestForm, {})}>
        <RatsText style={styles.fabText}>+</RatsText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterActive: { backgroundColor: '#1976D2' },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  rowLeft: { flex: 1 },
  date: { fontSize: 15, fontWeight: '600' },
  observer: { fontSize: 13, color: '#666', marginTop: 2 },
  randomBadge: {
    fontSize: 11,
    color: '#1976D2',
    fontWeight: '600',
    marginTop: 2,
  },
  resultBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  resultText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/DrugTesting/__tests__/DrugTestingScreen.test.tsx --no-coverage`

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/screens/DrugTesting/
git commit -m "feat(drug-testing): add house-level drug testing screen with filters"
```

---

## Task 5: Drug Test Form (Log Result)

**Files:**

- Create: `src/screens/DrugTesting/DrugTestForm.tsx`
- Create: `src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DrugTestForm from '../DrugTestForm';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1' },
    currentUser: { uid: 'admin-1', firstName: 'Jane', lastName: 'Admin' },
  }),
}));

const mockLogDrugTest = jest.fn();
jest.mock('../../../state/queries/drugTestQueries', () => ({
  useLogDrugTest: () => ({
    mutateAsync: mockLogDrugTest,
    isPending: false,
  }),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: () => [
    { id: 'guest-1', displayName: 'John Doe' },
    { id: 'guest-2', displayName: 'Jane Smith' },
  ],
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('DrugTestForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders guest picker and result options', () => {
    const { getByText } = render(<DrugTestForm />, { wrapper });
    expect(getByText('Log Drug Test')).toBeTruthy();
    expect(getByText('Negative')).toBeTruthy();
    expect(getByText('Positive')).toBeTruthy();
  });

  it('submits form and navigates back', async () => {
    mockLogDrugTest.mockResolvedValue({ id: 'test-1' });
    const { getByText, getByTestId } = render(<DrugTestForm />, { wrapper });

    // Select guest
    fireEvent.press(getByText('John Doe'));
    // Select result
    fireEvent.press(getByText('Negative'));
    // Submit
    fireEvent.press(getByTestId('submit-button'));

    await waitFor(() => {
      expect(mockLogDrugTest).toHaveBeenCalledWith(
        expect.objectContaining({
          guestId: 'guest-1',
          result: 'negative',
          houseId: 'house-1',
        }),
      );
      expect(mockGoBack).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx --no-coverage`

Expected: FAIL — DrugTestForm module not found

- [ ] **Step 3: Implement the form**

This is a meaningful design decision for the implementer. The form needs to handle:

- Guest selection (picker from house guest list)
- Test type selection (urine/saliva/breathalyzer/hair)
- Result selection (negative/positive/inconclusive/refused)
- Substances detected (multi-select, only shown if positive)
- Notes (free text)
- Random test toggle

Implement in `src/screens/DrugTesting/DrugTestForm.tsx` using Formik + Yup with the `drugTestSchema` from `src/entities/DrugTest.ts`. Follow the pattern of existing form screens (e.g., `CreateGuest`). Use `useLogDrugTest` mutation hook. Navigate back on success via `navigation.goBack()`.

The form should show the substances field conditionally only when result is `'positive'`. Use `useNotification()` from context to show a success toast after submission.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/DrugTesting/DrugTestForm.tsx src/screens/DrugTesting/__tests__/DrugTestForm.test.tsx
git commit -m "feat(drug-testing): add drug test logging form with guest picker and result types"
```

---

## Task 6: Drug Test History (Per-Guest)

**Files:**

- Create: `src/screens/DrugTesting/DrugTestHistory.tsx`

### Steps

- [ ] **Step 1: Implement the history screen**

A list screen showing all drug tests for a specific guest, navigated to via `route.params.guestId`. Uses `useGuestDrugTests(guestId)` hook. Show summary stats at top: total tests, positive count (via `usePositiveTestCount`), last test date.

Follow the same list pattern as `DrugTestingScreen` but filtered to one guest. Add color-coded result badges. Show `substancesDetected` for positive tests.

- [ ] **Step 2: Commit**

```bash
git add src/screens/DrugTesting/DrugTestHistory.tsx
git commit -m "feat(drug-testing): add per-guest drug test history screen"
```

---

## Task 7: Firestore Security Rules for Drug Tests

**Files:**

- Modify: `firebase/firestore.rules`
- Modify: `firebase/__tests__/firestore.rules.test.ts`

### Steps

- [ ] **Step 1: Add drug-tests collection rules**

In `firebase/firestore.rules`, add a match block for the new collection. Follow existing patterns (helper functions at top):

```
match /drug-tests/{testId} {
  allow read: if signedIn() && (
    isAdmin(resource.data.houseId) ||
    isSameUser(resource.data.observedBy)
  );
  allow create: if signedIn() && isAdmin(request.resource.data.houseId);
  allow update, delete: if false; // Drug tests are immutable records
}
```

Drug tests should be immutable (like votes) — once logged, they cannot be edited or deleted for audit integrity.

- [ ] **Step 2: Write a rules test**

Add a test case in `firebase/__tests__/firestore.rules.test.ts` that verifies:

- Admin can create a drug test for their house
- Admin can read drug tests for their house
- Guest cannot create drug tests
- Drug tests cannot be updated or deleted

Follow the existing test patterns in that file (Firebase Rules Unit Testing framework).

- [ ] **Step 3: Run rules tests**

Run: `npx jest firebase/__tests__/firestore.rules.test.ts --no-coverage`

Expected: PASS (requires emulator running)

- [ ] **Step 4: Commit**

```bash
git add firebase/firestore.rules firebase/__tests__/firestore.rules.test.ts
git commit -m "feat(drug-testing): add Firestore security rules for drug-tests collection"
```

---

## Task 8: Add Firestore Index for Drug Tests

**Files:**

- Modify: `firebase/firestore.indexes.json`

### Steps

- [ ] **Step 1: Add composite indexes**

Add these indexes for the drug-tests collection queries:

```json
{
  "collectionGroup": "drug-tests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "guestId", "order": "ASCENDING" },
    { "fieldPath": "testDate", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "drug-tests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "houseId", "order": "ASCENDING" },
    { "fieldPath": "testDate", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "drug-tests",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "guestId", "order": "ASCENDING" },
    { "fieldPath": "result", "order": "ASCENDING" },
    { "fieldPath": "testDate", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add firebase/firestore.indexes.json
git commit -m "feat(drug-testing): add composite Firestore indexes for drug test queries"
```

---

## Task 9: Enhance Guest Entity with Intake Fields

**Files:**

- Modify: `src/entities/Guest.tsx`

### Steps

- [ ] **Step 1: Add intake fields to Guest interface**

Add these fields to the Guest class (all optional to maintain backward compatibility with existing guests):

```ts
// Intake fields — add to Guest class
emergencyContactName?: string;
emergencyContactPhone?: string;
emergencyContactRelation?: string;
insuranceProvider?: string;
insurancePolicyNumber?: string;
referringCenterName?: string;
referringCenterContact?: string;
referralDate?: string;
legalStatus?: string; // probation, parole, none
probationOfficer?: string;
probationOfficerPhone?: string;
intakeDate?: string; // ISO date of formal intake
intakeCompletedBy?: string; // userId who completed intake
intakeNotes?: string;
```

- [ ] **Step 2: Commit**

```bash
git add src/entities/Guest.tsx
git commit -m "feat(intake): add emergency contact, insurance, referral, and legal fields to Guest entity"
```

---

## Task 10: Resident Intake Form Screen

**Files:**

- Create: `src/screens/ResidentIntake/IntakeFormScreen.tsx`
- Create: `src/screens/ResidentIntake/__tests__/IntakeFormScreen.test.tsx`

### Steps

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/ResidentIntake/__tests__/IntakeFormScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntakeFormScreen from '../IntakeFormScreen';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { houseId: 'house-1' } }),
}));

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1' },
    currentUser: { uid: 'admin-1' },
  }),
}));

const mockCreateGuest = jest.fn();
jest.mock('../../../state/queries/guestQueries', () => ({
  useCreateGuest: () => ({
    mutateAsync: mockCreateGuest,
    isPending: false,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('IntakeFormScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders multi-step form with step indicator', () => {
    const { getByText } = render(<IntakeFormScreen />, { wrapper });
    expect(getByText('Personal Info')).toBeTruthy();
  });

  it('advances to next step on Continue press', () => {
    const { getByText, getByPlaceholderText } = render(<IntakeFormScreen />, {
      wrapper,
    });
    // Fill required fields
    fireEvent.changeText(getByPlaceholderText('First Name'), 'John');
    fireEvent.changeText(getByPlaceholderText('Last Name'), 'Doe');
    fireEvent.changeText(getByPlaceholderText('Email'), 'john@test.com');
    fireEvent.press(getByText('Continue'));
    // Should advance to step 2
    expect(getByText('Emergency Contact')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/ResidentIntake/__tests__/IntakeFormScreen.test.tsx --no-coverage`

Expected: FAIL — IntakeFormScreen module not found

- [ ] **Step 3: Implement the multi-step intake form**

This is a multi-step Formik form with 4 steps:

1. **Personal Info** — firstName, lastName, email, phoneNumber, sobrietyDate, drugOfChoice (mirrors existing CreateGuest but more complete)
2. **Emergency Contact** — emergencyContactName, emergencyContactPhone, emergencyContactRelation
3. **Insurance & Referral** — insuranceProvider, insurancePolicyNumber, referringCenterName, referringCenterContact
4. **Legal & Notes** — legalStatus (picker: none/probation/parole), probationOfficer, probationOfficerPhone, intakeNotes

Use `rats-step-indicator` component for the step progress bar. Each step validates its own fields before advancing. Final submit calls `useCreateGuest` mutation with all fields including `intakeDate: new Date().toISOString()` and `intakeCompletedBy: currentUser.uid`.

Follow the visual pattern of `OperatorSetupWizard` for multi-step layout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/screens/ResidentIntake/__tests__/IntakeFormScreen.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/ResidentIntake/
git commit -m "feat(intake): add multi-step resident intake form with emergency contact, insurance, referral, and legal sections"
```

---

## Task 11: Per-Resident Balance Dashboard

**Files:**

- Create: `src/screens/BalanceDashboard/BalanceDashboard.tsx`
- Create: `src/screens/BalanceDashboard/__tests__/BalanceDashboard.test.tsx`
- Modify: `src/state/queries/paymentQueries.ts` — add `useGuestBalances` hook

### Steps

- [ ] **Step 1: Add useGuestBalances hook to paymentQueries**

```ts
// Add to src/state/queries/paymentQueries.ts

export const paymentKeys = {
  // ... existing keys ...
  guestBalances: (houseId: string) =>
    [...paymentKeys.all, 'guest-balances', houseId] as const,
};

export function useGuestBalances(houseId: string, guests: Guest[]) {
  return useQuery({
    queryKey: paymentKeys.guestBalances(houseId),
    queryFn: async () => {
      const payments = await listHousePayments(houseId, 500);
      return guests.map(guest => {
        const guestPayments = payments.filter(p => p.guestId === guest.id);
        const totalPaid = guestPayments
          .filter(p => p.status === 'succeeded')
          .reduce((sum, p) => sum + p.amount, 0);
        const lastPaymentDate =
          guestPayments.length > 0 ? guestPayments[0].createdAt : null;
        return {
          guestId: guest.id,
          guestName:
            guest.displayName || `${guest.firstName} ${guest.lastName}`,
          rentOwed: guest.rentOwed,
          choreFees: guest.choreFees,
          totalBalance: guest.rentOwed + guest.choreFees,
          totalPaid,
          lastPaymentDate,
          status:
            guest.rentOwed > 0 ? ('overdue' as const) : ('current' as const),
        };
      });
    },
    enabled: !!houseId && guests.length > 0,
    staleTime: 30000,
  });
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/screens/BalanceDashboard/__tests__/BalanceDashboard.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BalanceDashboard from '../BalanceDashboard';

jest.mock('../../../context/DataContext', () => ({
  useData: () => ({
    currentHouse: { id: 'house-1', monthlyRent: 1200 },
  }),
}));

jest.mock('../../../state/queries/paymentQueries', () => ({
  useGuestBalances: jest.fn(),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: () => [
    { id: 'g1', displayName: 'John Doe', rentOwed: 600, choreFees: 50 },
    { id: 'g2', displayName: 'Jane Smith', rentOwed: 0, choreFees: 0 },
  ],
}));

import { useGuestBalances } from '../../../state/queries/paymentQueries';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('BalanceDashboard', () => {
  it('renders per-resident balances sorted by amount owed', () => {
    (useGuestBalances as jest.Mock).mockReturnValue({
      data: [
        {
          guestId: 'g1',
          guestName: 'John Doe',
          totalBalance: 650,
          totalPaid: 1200,
          status: 'overdue',
        },
        {
          guestId: 'g2',
          guestName: 'Jane Smith',
          totalBalance: 0,
          totalPaid: 2400,
          status: 'current',
        },
      ],
      isLoading: false,
    });
    const { getByText } = render(<BalanceDashboard />, { wrapper });
    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('$650.00')).toBeTruthy();
    expect(getByText('Jane Smith')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/screens/BalanceDashboard/__tests__/BalanceDashboard.test.tsx --no-coverage`

Expected: FAIL — BalanceDashboard module not found

- [ ] **Step 4: Implement the balance dashboard**

A screen showing per-resident balance details. Sort guests by `totalBalance` descending (highest owed first). Show:

- Summary stats at top: total outstanding, total collected this month, collection rate
- Per-resident rows with: name, total balance, last payment date, status badge (current/overdue)
- Tap a row to navigate to that guest's payment history

Use `useGuestBalances` hook. Follow the visual pattern of `PaymentDashboard` (stat cards + list).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/screens/BalanceDashboard/__tests__/BalanceDashboard.test.tsx --no-coverage`

Expected: PASS

- [ ] **Step 6: Add navigation from PaymentDashboard**

In `src/screens/HouseSettings/PaymentDashboard.tsx`, add a "View All Balances" button that navigates to `Routes.BalanceDashboard`.

- [ ] **Step 7: Commit**

```bash
git add src/screens/BalanceDashboard/ src/state/queries/paymentQueries.ts src/screens/HouseSettings/PaymentDashboard.tsx
git commit -m "feat(payments): add per-resident balance dashboard with aging and drill-down"
```

---

## Task 12: Wire Drug Testing into House Dashboard

**Files:**

- Modify: `src/screens/HouseOverview/HouseSummary/HouseSummary.tsx`

### Steps

- [ ] **Step 1: Add Drug Testing navigation card**

Add a navigation card/button to the house summary screen that navigates to `Routes.DrugTesting`. Follow the existing card pattern for other house management features (e.g., issues, disputes).

```tsx
// Add to the house action cards section:
<TouchableOpacity
  style={styles.actionCard}
  onPress={() => navigation.navigate(Routes.DrugTesting)}>
  <RatsIcon name="vial" size={24} color="#1976D2" />
  <RatsText style={styles.actionLabel}>Drug Testing</RatsText>
</TouchableOpacity>
```

- [ ] **Step 2: Add Intake navigation to guest creation flow**

In the guest list or house settings, add a "New Resident Intake" button that navigates to `Routes.ResidentIntake` with `{ houseId: currentHouse.id }`.

- [ ] **Step 3: Commit**

```bash
git add src/screens/HouseOverview/HouseSummary/HouseSummary.tsx
git commit -m "feat: wire drug testing and intake into house dashboard navigation"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Drug testing (Tasks 1-8), Intake enhancement (Tasks 9-10), Balance dashboard (Task 11), Navigation wiring (Tasks 3, 12). Billing improvements (receipts, ACH) deferred to Sprint 1.5 — lower priority than the 3 features above.
- [x] **Placeholder scan:** Task 5 Step 3 and Task 6 Step 1 describe implementation rather than providing full code — these are intentionally left for the implementer since they involve UI layout decisions that benefit from the engineer's judgment and the app's existing visual patterns.
- [x] **Type consistency:** `DrugTest` interface used consistently across entity → service → queries → screens. `DrugTestResult` type matches between entity, service filter, and UI color map. Routes enum values match between types.ts additions and screen navigation calls.

---

## Deferred to Sprint 1.5

These Sprint 1 features are lower priority and should be planned after the core tasks above:

- **Billing: ACH/cash/Venmo tracking** — `recordManualPayment` already exists in payments service; needs UI for non-Stripe methods
- **Billing: Receipt generation** — PDF receipt from payment record; requires react-native-pdf or server-side generation
- **Billing: Family payment portal** — Web-based payment link shared with family; requires web endpoint
- **Resident portal: Maintenance requests** — Guest-facing issue creation; mostly UI work on existing Issue entity
- **SMS/email rent reminders** — `rentReminder.ts` exists for push; needs email/SMS channel
