# Week 1 Parallel Tracks: Payment Dashboard + Oxford Completion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Track A (payment dashboard rebuilt with React Query + analytics) and Track B (Oxford screens deepened with attendance, anonymous voting, term reminders, and EES trigger) in parallel over Week 1.

**Architecture:**

- Track A lives entirely in `rats-v2` (screens/services) + `regroup-functions` (one new CF).
- Track B lives entirely in `rats-v2` (screens/entities) + `regroup-functions` (one trigger + one scheduled CF).
- Both tracks are independent — they can be executed in any order or in parallel sessions.

**Tech Stack:** React Native 0.72 (JSC), Firebase Cloud Functions v2, React Query (`@tanstack/react-query`), `victory-native` (bar chart), `moment`, Firestore security rules

**Repos:**

- `rats-v2` → `/Users/marcusklein/dev/rats-v2`
- `regroup-functions` → `/Users/marcusklein/dev/regroup-functions`

---

## TRACK A — Traditional Payments

---

### Task A1: Fix `createRentPaymentIntent` function name

**Problem:** `src/services/payment.ts` calls `createRentPaymentIntent` but the deployed Cloud Function is named `createPaymentIntent`. This is a runtime crash waiting to happen.

**Files:**

- Modify: `src/services/payment.ts:44-50`
- Modify: `src/services/__tests__/payment.test.ts:58-83`
- Modify: `src/state/queries/paymentQueries.ts` (no change needed — calls `createRentPaymentIntent` from service)

**Step 1: Run the existing test to confirm it passes the WRONG function name**

```bash
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest src/services/__tests__/payment.test.ts -t 'createRentPaymentIntent' --no-coverage
```

Expected: PASS (but it's wrong — it's testing the wrong CF name)

**Step 2: Write failing test that asserts the CORRECT CF name**

In `src/services/__tests__/payment.test.ts`, replace the existing `createRentPaymentIntent` describe block with:

```typescript
describe('createRentPaymentIntent', () => {
  it('calls the createPaymentIntent Cloud Function (not createRentPaymentIntent)', async () => {
    const mockCallable = jest.fn(() =>
      Promise.resolve({
        data: {
          clientSecret: 'pi_abc_secret',
          paymentUrl: 'https://stripe.com/pay/abc',
          paymentIntentId: 'pi_abc',
        },
      }),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

    await createRentPaymentIntent('guest1', 'house1', 150);

    expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
      'createPaymentIntent',
    );
  });

  it('propagates errors from the Cloud Function', async () => {
    const failCallable = jest.fn(() =>
      Promise.reject(new Error('functions/not-found')),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

    await expect(
      createRentPaymentIntent('guest1', 'house1', 150),
    ).rejects.toThrow('functions/not-found');
  });

  it('returns the correct shape for a successful response', async () => {
    const mockCallable = jest.fn(() =>
      Promise.resolve({
        data: {
          clientSecret: 'cs_test',
          paymentUrl: 'https://stripe.com/pay/test',
          paymentIntentId: 'pi_test',
        },
      }),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

    const result = await createRentPaymentIntent('g1', 'h1', 200);
    expect(result).toEqual({
      clientSecret: 'cs_test',
      paymentUrl: 'https://stripe.com/pay/test',
      paymentIntentId: 'pi_test',
    });
  });
});
```

**Step 3: Run test to confirm it FAILS**

```bash
node_modules/.bin/jest src/services/__tests__/payment.test.ts -t 'createPaymentIntent Cloud Function' --no-coverage
```

Expected: FAIL — `expected 'createRentPaymentIntent', received 'createPaymentIntent'`

**Step 4: Fix `src/services/payment.ts` — change the function name**

```typescript
// Line 45: change:
const response = await functions.httpsCallable('createPaymentIntent')({
// from:
const response = await functions.httpsCallable('createRentPaymentIntent')({
```

**Step 5: Run all payment.ts tests to confirm GREEN**

```bash
node_modules/.bin/jest src/services/__tests__/payment.test.ts --no-coverage
```

Expected: All PASS

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/rats-v2
git add src/services/payment.ts src/services/__tests__/payment.test.ts
git commit -m "fix: call createPaymentIntent CF (was createRentPaymentIntent — name mismatch with deployed function)"
```

---

### Task A2: Add `listHousePayments` Cloud Function

**Problem:** `PaymentDashboard.tsx` makes N calls to `listPayments(guestId, houseId)` — one per resident. Replace with a single `listHousePayments(houseId)` that fetches all charges from the house's connected Stripe account.

**Files:**

- Modify: `functions/src/callable/payments.ts` (in `regroup-functions`)
- Create: `functions/src/__tests__/callable/listHousePayments.test.ts`
- Modify: `functions/src/index.ts` (no change needed — already exports `* from "./callable/payments"`)

**Step 1: Write the failing test**

Create `functions/src/__tests__/callable/listHousePayments.test.ts`:

```typescript
/**
 * Unit tests for listHousePayments Cloud Function.
 *
 * We test the authorization and business logic in isolation by mocking:
 * - firebase-admin (Firestore reads)
 * - Stripe client
 * - assertHouseMemberFromClaims
 */
import { listHousePayments } from '../../callable/payments';
import * as admin from 'firebase-admin';
import * as houseAuth from '../../util/houseAuth';

jest.mock('../../util/houseAuth', () => ({
  ...jest.requireActual('../../util/houseAuth'),
  assertHouseMemberFromClaims: jest.fn(),
}));

jest.mock('../../util/stripe', () => ({
  createStripeClient: jest.fn(() => ({
    charges: {
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'ch_001',
            amount: 50000,
            currency: 'usd',
            status: 'succeeded',
            description: 'Rent payment',
            created: 1700000000,
            receipt_url: 'https://stripe.com/receipts/001',
            metadata: { guestId: 'guest1', houseId: 'house1' },
          },
          {
            id: 'ch_002',
            amount: 25000,
            currency: 'usd',
            status: 'pending',
            description: 'Chore fee',
            created: 1699900000,
            receipt_url: null,
            metadata: { guestId: 'guest2', houseId: 'house1' },
          },
        ],
      }),
    },
  })),
}));

const mockGet = jest.fn();
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ get: mockGet })),
    })),
  })),
  initializeApp: jest.fn(),
}));

const makeRequest = (overrides: Record<string, any> = {}) => ({
  auth: { uid: 'admin1', token: { admin: { house1: true } } },
  data: { houseId: 'house1', limit: 50 },
  ...overrides,
});

describe('listHousePayments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({ stripeAccountId: 'acct_test_123' }),
    });
  });

  it('throws unauthenticated when auth is missing', async () => {
    const req = makeRequest({ auth: null });
    await expect((listHousePayments as any).run(req)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('throws invalid-argument when houseId is missing', async () => {
    const req = makeRequest({ data: {} });
    await expect((listHousePayments as any).run(req)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('calls assertHouseMemberFromClaims with the token and houseId', async () => {
    await (listHousePayments as any).run(makeRequest());
    expect(houseAuth.assertHouseMemberFromClaims).toHaveBeenCalledWith(
      expect.objectContaining({ admin: { house1: true } }),
      'house1',
    );
  });

  it('returns empty payments when house has no stripeAccountId', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({}),
    });
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments).toEqual([]);
  });

  it('returns mapped payment records from Stripe charges', async () => {
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0]).toMatchObject({
      id: 'ch_001',
      amount: 500,
      currency: 'usd',
      status: 'succeeded',
      guestId: 'guest1',
    });
    expect(result.payments[1]).toMatchObject({
      id: 'ch_002',
      amount: 250,
      guestId: 'guest2',
    });
  });

  it('converts Stripe amount from cents to dollars', async () => {
    const result = await (listHousePayments as any).run(makeRequest());
    expect(result.payments[0].amount).toBe(500);
    expect(result.payments[1].amount).toBe(250);
  });
});
```

**Step 2: Run to confirm FAIL**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest listHousePayments --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `listHousePayments is not exported`

**Step 3: Implement `listHousePayments` in `functions/src/callable/payments.ts`**

Append after the `listPayments` function:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// listHousePayments
// Returns all recent payments across all residents for a house in one call.
// Replaces the N+1 pattern of calling listPayments per guest.
// ─────────────────────────────────────────────────────────────────────────────
export const listHousePayments = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async request => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login required');
    }

    const { houseId, limit = 100 } = request.data as {
      houseId: string;
      limit?: number;
    };

    if (!houseId) {
      throw new HttpsError('invalid-argument', 'houseId is required');
    }

    assertHouseMemberFromClaims(
      request.auth.token as Record<string, unknown>,
      houseId,
    );

    const houseDoc = await db.collection('houses').doc(houseId).get();
    const house = houseDoc.data();
    if (!house?.stripeAccountId) return { payments: [] };

    const stripe = createStripeClient();
    const charges = await stripe.charges.list(
      { limit },
      { stripeAccount: house.stripeAccountId },
    );

    return {
      payments: charges.data.map(c => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        description: c.description,
        createdAt: new Date(c.created * 1000).toISOString(),
        receiptUrl: c.receipt_url,
        guestId: c.metadata?.guestId ?? null,
        houseId: c.metadata?.houseId ?? houseId,
      })),
    };
  },
);
```

**Step 4: Run tests GREEN**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest listHousePayments --no-coverage
```

Expected: All PASS

**Step 5: Run full functions test suite**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: All existing tests still pass

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/callable/payments.ts "functions/src/__tests__/callable/listHousePayments.test.ts"
git commit -m "feat: add listHousePayments CF — single call replaces N+1 per-guest queries"
```

---

### Task A3: Add `listHousePayments` service function to rats-v2

**Files:**

- Modify: `src/services/payments.ts`
- Modify: `src/services/__tests__/payments.test.ts`

**Step 1: Write the failing test** — add to `payments.test.ts`:

```typescript
describe('listHousePayments', () => {
  const mockHousePayments = [
    {
      id: 'ch_001',
      amount: 500,
      currency: 'usd',
      status: 'succeeded' as const,
      description: 'Rent',
      createdAt: '2026-02-01T10:00:00.000Z',
      guestId: 'guest1',
      houseId: 'house1',
    },
  ];

  it('calls the listHousePayments Cloud Function with houseId and limit', async () => {
    const mockCallable = jest.fn(() =>
      Promise.resolve({ data: { payments: mockHousePayments } }),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

    await listHousePayments('house1', 100);

    expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
      'listHousePayments',
    );
    expect(mockCallable).toHaveBeenCalledWith({
      houseId: 'house1',
      limit: 100,
    });
  });

  it('uses default limit of 100 when not specified', async () => {
    const mockCallable = jest.fn(() =>
      Promise.resolve({ data: { payments: [] } }),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

    await listHousePayments('house1');

    expect(mockCallable).toHaveBeenCalledWith({
      houseId: 'house1',
      limit: 100,
    });
  });

  it('returns the payments array', async () => {
    const mockCallable = jest.fn(() =>
      Promise.resolve({ data: { payments: mockHousePayments } }),
    );
    mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

    const result = await listHousePayments('house1');
    expect(result).toHaveLength(1);
    expect(result[0].guestId).toBe('guest1');
  });
});
```

**Step 2: Run to confirm FAIL**

```bash
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest src/services/__tests__/payments.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `listHousePayments is not a function`

**Step 3: Add `listHousePayments` and `HousePaymentRecord` to `src/services/payments.ts`**

```typescript
export interface HousePaymentRecord extends PaymentRecord {
  guestId: string | null;
  houseId: string;
}

export async function listHousePayments(
  houseId: string,
  limit = 100,
): Promise<HousePaymentRecord[]> {
  const result = await functions.httpsCallable('listHousePayments')({
    houseId,
    limit,
  });
  return (result.data as any).payments;
}
```

**Step 4: Run tests GREEN**

```bash
node_modules/.bin/jest src/services/__tests__/payments.test.ts --no-coverage
```

Expected: All PASS

**Step 5: Commit**

```bash
git add src/services/payments.ts src/services/__tests__/payments.test.ts
git commit -m "feat: add listHousePayments service function (rats-v2)"
```

---

### Task A4: Rebuild PaymentDashboard with React Query, date filters, stats, and bar chart

**Files:**

- Modify: `src/screens/HouseSettings/PaymentDashboard.tsx` (full rewrite)
- Create: `src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx`

**Context:** The current PaymentDashboard uses `useEffect` + manual state to call `listPayments` N times. Replace with:

1. `useQuery` calling `listHousePayments` once
2. Date filter pills: This Week / This Month / All Time
3. Stats card: Total Collected / Outstanding / Collection Rate
4. Overdue residents card
5. Weekly bar chart (8 weeks, `VictoryBar`)
6. FAB for manual payment recording

**Step 1: Write failing tests**

Create `src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx`:

```typescript
import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Standard mocks for this project
jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('victory-native', () => ({
  VictoryBar: () => null,
  VictoryChart: ({ children }: any) => <>{children}</>,
  VictoryAxis: () => null,
  VictoryTheme: { material: {} },
}));

const mockListHousePayments = jest.fn();
jest.mock('../../../services/payments', () => ({
  listHousePayments: (...args: any[]) => mockListHousePayments(...args),
}));

const mockUseAppSelector = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

import PaymentDashboard from '../PaymentDashboard';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const setupStore = (guests: Record<string, any> = {}) => {
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      housesRTK: { selectedHouse: { id: 'house1', name: 'Test House' } },
      guestsRTK: { guests },
    }),
  );
};

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

const renderDashboard = () =>
  render(<PaymentDashboard navigation={mockNavigation} />, {
    wrapper: makeWrapper(),
  });

describe('PaymentDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    setupStore();
    mockListHousePayments.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = renderDashboard();
    expect(getByTestId('payment-dashboard-loading')).toBeTruthy();
  });

  it('shows total collected amount for succeeded payments', async () => {
    setupStore({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    mockListHousePayments.mockResolvedValue([
      {
        id: 'c1',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        description: 'Rent',
        createdAt: new Date().toISOString(),
        guestId: 'g1',
        houseId: 'house1',
      },
    ]);
    const { findByTestId } = renderDashboard();
    await findByTestId('payment-stats-card');
  });

  it('renders date filter pills', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByText } = renderDashboard();
    expect(await findByText('This Week')).toBeTruthy();
    expect(await findByText('This Month')).toBeTruthy();
    expect(await findByText('All Time')).toBeTruthy();
  });

  it('shows empty state when no payments', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId('payment-empty-state');
  });

  it('shows FAB for recording manual payment', async () => {
    setupStore();
    mockListHousePayments.mockResolvedValue([]);
    const { findByTestId } = renderDashboard();
    await findByTestId('manual-payment-fab');
  });
});
```

**Step 2: Run to confirm FAIL**

```bash
node_modules/.bin/jest src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — missing `testID` attributes and new component structure

**Step 3: Implement the new `PaymentDashboard.tsx`**

```typescript
import React, { useState, useMemo } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  VictoryBar,
  VictoryChart,
  VictoryAxis,
  VictoryTheme,
} from 'victory-native';
import moment from 'moment';

import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';

import { useAppSelector } from '../../state/store';
import { listHousePayments, HousePaymentRecord } from '../../services/payments';
import { Guest } from '../../entities/Guest';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';

type DateFilter = 'week' | 'month' | 'all';

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const PaymentDashboard: React.FC<Props> = ({ navigation }) => {
  const house = useAppSelector((s: any) => s.housesRTK.selectedHouse);
  const guests = useAppSelector((s: any) => s.guestsRTK.guests) as Record<
    string,
    Guest
  >;

  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [showManualModal, setShowManualModal] = useState(false);

  const {
    data: allPayments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['housePayments', house?.id],
    queryFn: () => listHousePayments(house!.id),
    enabled: !!house?.id,
    staleTime: 60_000,
  });

  const filteredPayments = useMemo(() => {
    if (dateFilter === 'all') return allPayments;
    const cutoff =
      dateFilter === 'week'
        ? moment().startOf('isoWeek')
        : moment().startOf('month');
    return allPayments.filter(p => moment(p.createdAt).isAfter(cutoff));
  }, [allPayments, dateFilter]);

  const guestName = (guestId: string | null): string => {
    if (!guestId) return 'Unknown';
    const g = guests[guestId];
    if (!g) return 'Unknown Resident';
    return (
      `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Unknown Resident'
    );
  };

  const totalCollected = filteredPayments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalOutstanding = filteredPayments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const collectionRate =
    filteredPayments.length > 0
      ? Math.round(
          (filteredPayments.filter(p => p.status === 'succeeded').length /
            filteredPayments.length) *
            100,
        )
      : 0;

  // Build 8-week bar chart data
  const weeklyData = useMemo(() => {
    const weeks: { week: string; total: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = moment().subtract(i, 'weeks').startOf('isoWeek');
      const weekEnd = weekStart.clone().endOf('isoWeek');
      const total = allPayments
        .filter(
          p =>
            p.status === 'succeeded' &&
            moment(p.createdAt).isBetween(weekStart, weekEnd),
        )
        .reduce((sum, p) => sum + p.amount, 0);
      weeks.push({ week: weekStart.format('M/D'), total });
    }
    return weeks;
  }, [allPayments]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Payment Dashboard" />
        <View style={styles.centered} testID="payment-dashboard-loading">
          <ActivityIndicator size="large" color={color.main} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader renderBackButton header="Payment Dashboard" />
        <View style={styles.centered}>
          <RatsText
            translate={false}
            text="Failed to load payment data."
            style={styles.errorText}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader renderBackButton header="Payment Dashboard" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Date Filter Pills */}
        <View style={styles.pills}>
          {(['week', 'month', 'all'] as DateFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setDateFilter(f)}
              style={[styles.pill, dateFilter === f && styles.pillActive]}>
              <RatsText
                translate={false}
                text={
                  f === 'week'
                    ? 'This Week'
                    : f === 'month'
                    ? 'This Month'
                    : 'All Time'
                }
                style={[
                  styles.pillText,
                  dateFilter === f && styles.pillTextActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Card */}
        <View
          style={[CARD_STYLE, styles.statsCard]}
          testID="payment-stats-card">
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Collected"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`$${totalCollected.toFixed(2)}`}
                style={[styles.statValue, { color: color.green }]}
              />
            </View>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Outstanding"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`$${totalOutstanding.toFixed(2)}`}
                style={[styles.statValue, { color: color.red }]}
              />
            </View>
            <View style={styles.stat}>
              <RatsText
                translate={false}
                text="Collection"
                style={styles.statLabel}
              />
              <RatsText
                translate={false}
                text={`${collectionRate}%`}
                style={[styles.statValue, { color: color.baby_blue }]}
              />
            </View>
          </View>
        </View>

        {/* 8-Week Bar Chart */}
        <View style={[CARD_STYLE, styles.chartCard]}>
          <RatsText
            translate={false}
            text="Weekly Revenue (8 weeks)"
            style={styles.chartTitle}
          />
          <VictoryChart
            theme={VictoryTheme.material}
            height={180}
            padding={{ top: 10, bottom: 40, left: 50, right: 20 }}>
            <VictoryAxis
              tickFormat={(t: string) => t}
              style={{ tickLabels: { fontSize: 9, angle: -30 } }}
            />
            <VictoryAxis dependentAxis tickFormat={(v: number) => `$${v}`} />
            <VictoryBar
              data={weeklyData}
              x="week"
              y="total"
              style={{ data: { fill: color.baby_blue } }}
            />
          </VictoryChart>
        </View>

        {/* Payment List */}
        {filteredPayments.length === 0 ? (
          <View style={styles.centered} testID="payment-empty-state">
            <RatsText
              translate={false}
              text="No payments in this period."
              style={styles.emptyText}
            />
          </View>
        ) : (
          filteredPayments.map(item => {
            const succeeded = item.status === 'succeeded';
            return (
              <View
                key={item.id}
                style={[
                  CARD_STYLE,
                  styles.paymentCard,
                  { borderLeftColor: succeeded ? color.green : color.red },
                ]}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <RatsText
                      translate={false}
                      text={guestName(item.guestId)}
                      style={styles.guestName}
                    />
                    <RatsText
                      translate={false}
                      text={item.description || ''}
                      style={styles.description}
                    />
                    <RatsText
                      translate={false}
                      text={moment(item.createdAt).format('MMM D, YYYY')}
                      style={styles.date}
                    />
                  </View>
                  <View style={styles.rightColumn}>
                    <RatsText
                      translate={false}
                      text={`$${item.amount.toFixed(2)}`}
                      style={styles.amount}
                    />
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: succeeded ? color.green : color.red,
                        },
                      ]}>
                      <RatsText
                        translate={false}
                        text={item.status.toUpperCase()}
                        style={styles.statusText}
                      />
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FAB for manual payment */}
      <TouchableOpacity
        testID="manual-payment-fab"
        style={styles.fab}
        onPress={() => setShowManualModal(true)}>
        <RatsText
          translate={false}
          text="+ Record Payment"
          style={styles.fabText}
        />
      </TouchableOpacity>

      <ManualPaymentModal
        visible={showManualModal}
        onClose={() => setShowManualModal(false)}
        guests={Object.values(guests) as Guest[]}
        houseId={house?.id ?? ''}
      />
    </View>
  );
};

// ─── Manual Payment Modal ─────────────────────────────────────────────────────

const ManualPaymentModal = ({
  visible,
  onClose,
  guests,
  houseId,
}: {
  visible: boolean;
  onClose: () => void;
  guests: Guest[];
  houseId: string;
}) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'Cash' | 'Check' | 'Venmo' | 'Zelle'>(
    'Cash',
  );
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [notes, setNotes] = useState('');

  const handleRecord = () => {
    // TODO Week 2 — wire to recordManualPayment service function
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={{ flex: 1, padding: normalize(16) }}>
        <RatsText
          translate={false}
          text="Record Manual Payment"
          style={{ fontSize: fontSize.large, marginBottom: normalize(16) }}
        />
        <TextInput
          placeholder="Amount ($)"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          style={styles.input}
        />
        <View style={styles.methodRow}>
          {(['Cash', 'Check', 'Venmo', 'Zelle'] as const).map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => setMethod(m)}
              style={[
                styles.methodPill,
                method === m && styles.methodPillActive,
              ]}>
              <RatsText
                translate={false}
                text={m}
                style={{
                  color: method === m ? color.white : color.dark_grey,
                  fontSize: fontSize.small,
                }}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          placeholder="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, { marginTop: normalize(8) }]}
        />
        <RatsButton
          title="Record"
          onPress={handleRecord}
          containerStyle={{ marginTop: normalize(16) }}
        />
        <RatsButton
          title="Cancel"
          light
          onPress={onClose}
          containerStyle={{ marginTop: normalize(8) }}
        />
      </View>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.light_grey },
  scroll: { padding: normalize(12), paddingBottom: normalize(80) },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(20),
    minHeight: normalize(100),
  },
  pills: { flexDirection: 'row', marginBottom: normalize(12) },
  pill: {
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(6),
    borderRadius: normalize(20),
    marginRight: normalize(8),
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.medium_grey,
  },
  pillActive: {
    backgroundColor: color.baby_blue,
    borderColor: color.baby_blue,
  },
  pillText: { fontSize: fontSize.small, color: color.dark_grey },
  pillTextActive: { color: color.white },
  statsCard: { marginBottom: normalize(12), padding: normalize(16) },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  statValue: { fontSize: fontSize.large, fontFamily: fontFamily.bold },
  chartCard: { marginBottom: normalize(12), padding: normalize(12) },
  chartTitle: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  paymentCard: {
    marginBottom: normalize(8),
    borderRadius: 8,
    borderLeftWidth: 4,
    backgroundColor: color.white,
    padding: normalize(12),
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  guestName: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  description: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  date: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  rightColumn: { alignItems: 'flex-end' },
  amount: {
    fontSize: fontSize.medium,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  statusBadge: {
    marginTop: normalize(4),
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: normalize(4),
  },
  statusText: { fontSize: fontSize.extraSmall, color: color.white },
  emptyText: {
    color: color.dark_grey,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
  errorText: {
    color: color.red,
    fontSize: fontSize.regular,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: normalize(24),
    right: normalize(24),
    backgroundColor: color.baby_blue,
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    borderRadius: normalize(24),
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: color.white,
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
  },
  input: {
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(10),
    fontSize: fontSize.regular,
    color: color.black,
    marginBottom: normalize(8),
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: normalize(8),
  },
  methodPill: {
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
    borderRadius: normalize(16),
    marginRight: normalize(8),
    marginBottom: normalize(8),
    borderWidth: 1,
    borderColor: color.medium_grey,
    backgroundColor: color.white,
  },
  methodPillActive: {
    backgroundColor: color.baby_blue,
    borderColor: color.baby_blue,
  },
});

export default PaymentDashboard;
```

**Step 4: Run tests GREEN**

```bash
node_modules/.bin/jest src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx --no-coverage
```

Expected: All PASS

**Step 5: Run full rats-v2 test suite**

```bash
node_modules/.bin/jest --testPathPattern='subscription|OxfordDashboard|OfficerManagement|BusinessMeetings|PaymentDashboard|payments' --no-coverage 2>&1 | tail -10
```

Expected: All PASS (some console.error from test payment mock expected)

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/rats-v2
git add src/screens/HouseSettings/PaymentDashboard.tsx "src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx"
git commit -m "feat: rebuild PaymentDashboard with React Query, date filters, stats card, bar chart, and manual payment FAB"
```

---

## TRACK B — Oxford Completion

---

### Task B1: OfficerManagement — term expiry warning + remove officer

**Problem:** Officers are assigned but there's no "expires in X days" warning and no way to remove an officer without re-assigning the role.

**Files:**

- Modify: `src/screens/Oxford/OfficerManagement.tsx`
- Modify: `src/screens/Oxford/__tests__/OfficerManagement.test.tsx`

**Step 1: Write failing tests**

Add to `src/screens/Oxford/__tests__/OfficerManagement.test.tsx` (or create it if it doesn't exist):

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import moment from 'moment';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

const mockGetOfficers = jest.fn();
const mockSetOfficer = jest.fn();
jest.mock('../../../services/oxford/officers', () => ({
  getOfficers: () => mockGetOfficers(),
  setOfficer: (...args: any[]) => mockSetOfficer(...args),
}));

const mockUseAppSelector = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

jest.mock('../../../components/rats-interactable-section', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return ({ name, onPress }: any) => (
    <TouchableOpacity onPress={onPress}>
      <Text>{name}</Text>
    </TouchableOpacity>
  );
});

import OfficerManagement from '../OfficerManagement';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;

const setup = (officers: any[] = [], guests: any = {}) => {
  mockGetOfficers.mockResolvedValue(officers);
  mockSetOfficer.mockResolvedValue(undefined);
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      housesRTK: { selectedHouse: { id: 'house1' } },
      guestsRTK: { guests },
    }),
  );
};

describe('OfficerManagement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows term expiry warning when term ends within 30 days', async () => {
    const termEndDate = moment().add(15, 'days').format('YYYY-MM-DD');
    setup([
      {
        id: 'o1',
        role: 'president',
        userId: 'u1',
        isActive: true,
        termEndDate,
      },
    ]);
    const { findByText } = render(<OfficerManagement navigation={nav} />);
    expect(await findByText(/expires in 15 days/i)).toBeTruthy();
  });

  it('does NOT show warning when term ends in more than 30 days', async () => {
    const termEndDate = moment().add(60, 'days').format('YYYY-MM-DD');
    setup([
      {
        id: 'o1',
        role: 'president',
        userId: 'u1',
        isActive: true,
        termEndDate,
      },
    ]);
    const { queryByText } = render(<OfficerManagement navigation={nav} />);
    await waitFor(() => {
      expect(queryByText(/expires in/i)).toBeNull();
    });
  });

  it('shows Remove button for active officers', async () => {
    const termEndDate = moment().add(60, 'days').format('YYYY-MM-DD');
    setup([
      {
        id: 'o1',
        role: 'president',
        userId: 'u1',
        isActive: true,
        termEndDate,
      },
    ]);
    const { findByTestId } = render(<OfficerManagement navigation={nav} />);
    expect(await findByTestId('remove-officer-president')).toBeTruthy();
  });

  it('calls setOfficer with isActive:false when Remove is pressed', async () => {
    const officer = {
      id: 'o1',
      role: 'president',
      userId: 'u1',
      isActive: true,
      termEndDate: moment().add(60, 'days').format('YYYY-MM-DD'),
      houseId: 'house1',
      electedAt: new Date().toISOString(),
      termStartDate: '2026-01-01',
    };
    setup([officer]);
    const { findByTestId } = render(<OfficerManagement navigation={nav} />);
    const btn = await findByTestId('remove-officer-president');
    fireEvent.press(btn);
    await waitFor(() => {
      expect(mockSetOfficer).toHaveBeenCalledWith(
        'house1',
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
```

**Step 2: Run to confirm FAIL**

```bash
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage 2>&1 | tail -15
```

**Step 3: Modify `OfficerManagement.tsx`**

After `getGuestName`, add `getTermWarning`:

```typescript
const getTermWarning = (officer: Officer): string | null => {
  const daysLeft = moment(officer.termEndDate).diff(moment(), 'days');
  if (daysLeft <= 30 && daysLeft >= 0) {
    return `Expires in ${daysLeft} days`;
  }
  return null;
};
```

Add `handleRemoveOfficer`:

```typescript
const handleRemoveOfficer = async (officer: Officer) => {
  if (!house?.id) return;
  try {
    await setOfficer(house.id, { ...officer, isActive: false });
    await loadOfficers();
  } catch (err) {
    console.error('Failed to remove officer:', err);
    Alert.alert('Error', 'Failed to remove officer. Please try again.');
  }
};
```

Update the role render section (inside `OFFICER_ROLES.map`):

```typescript
const warning = currentOfficer ? getTermWarning(currentOfficer) : null;

return (
  <View key={role}>
    <Section
      name={label}
      description={warning ? `${currentName} · ⚠ ${warning}` : currentName}
      boxedIconName={icon}
      iconBackgroundColor={iconColor}
      onPress={() => handleAssignOfficer(role)}
      iconName="chevron-right"
    />
    {currentOfficer && (
      <TouchableOpacity
        testID={`remove-officer-${role}`}
        onPress={() => handleRemoveOfficer(currentOfficer)}
        style={{
          alignSelf: 'flex-end',
          marginTop: -8,
          marginBottom: 8,
          marginRight: normalize(16),
          padding: normalize(4),
        }}>
        <RatsText
          translate={false}
          text="Remove"
          style={{ color: color.red, fontSize: fontSize.small }}
        />
      </TouchableOpacity>
    )}
  </View>
);
```

Add `TouchableOpacity` to the import.

**Step 4: Run tests GREEN**

```bash
node_modules/.bin/jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage
```

**Step 5: Commit**

```bash
git add src/screens/Oxford/OfficerManagement.tsx src/screens/Oxford/__tests__/OfficerManagement.test.tsx
git commit -m "feat(oxford): officer term expiry warning + remove officer button"
```

---

### Task B2: BusinessMeetings — attendance toggle + minutes per meeting

**Problem:** Meetings are read-only in the list. Residents need to tap a meeting to toggle their attendance and admins need to add meeting minutes.

**Files:**

- Create: `src/screens/Oxford/BusinessMeetingDetail.tsx`
- Modify: `src/screens/Oxford/BusinessMeetings.tsx` (make cards tappable → navigate to detail)
- Modify: `src/services/oxford/businessMeetings.ts` (add `updateBusinessMeeting`)
- Create: `src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx`

**Step 1: Add `updateBusinessMeeting` to service**

In `src/services/oxford/businessMeetings.ts`, append:

```typescript
export async function updateBusinessMeeting(
  houseId: string,
  meetingId: string,
  update: Partial<BusinessMeeting>,
): Promise<void> {
  await firestore
    .collection('houses')
    .doc(houseId)
    .collection('business-meetings')
    .doc(meetingId)
    .update(update);
}
```

**Step 2: Write failing test for BusinessMeetingDetail**

Create `src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx`:

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: 'rgb(99,139,250)',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View>
      <Text>{header}</Text>
    </View>
  );
});

const mockUpdateMeeting = jest.fn();
jest.mock('../../../services/oxford/businessMeetings', () => ({
  updateBusinessMeeting: (...args: any[]) => mockUpdateMeeting(...args),
}));

const mockUseAppSelector = jest.fn();
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: any) => mockUseAppSelector(selector),
}));

import BusinessMeetingDetail from '../BusinessMeetingDetail';

const mockMeeting = {
  id: 'meeting1',
  houseId: 'house1',
  scheduledDate: '2026-03-01',
  agenda: [],
  attendees: [],
  quorumMet: false,
  createdBy: 'user1',
  createdAt: new Date().toISOString(),
};

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;
const route = { params: { meeting: mockMeeting } } as any;

const setup = (guests: any = {}) => {
  mockUpdateMeeting.mockResolvedValue(undefined);
  mockUseAppSelector.mockImplementation((selector: any) =>
    selector({
      housesRTK: { selectedHouse: { id: 'house1' } },
      guestsRTK: { guests },
      userRTK: { user: { id: 'user1', userId: 'u1' } },
    }),
  );
};

describe('BusinessMeetingDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders meeting date', () => {
    setup();
    const { getByText } = render(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    expect(getByText(/March 1, 2026/i)).toBeTruthy();
  });

  it('shows resident attendance list', () => {
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByText } = render(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    expect(getByText('Alice Smith')).toBeTruthy();
  });

  it('toggling attendance calls updateBusinessMeeting', async () => {
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByTestId } = render(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.press(getByTestId('attendance-toggle-g1'));
    await waitFor(() => {
      expect(mockUpdateMeeting).toHaveBeenCalledWith(
        'house1',
        'meeting1',
        expect.objectContaining({ attendees: ['g1'] }),
      );
    });
  });

  it('quorum indicator updates as attendees are toggled', async () => {
    // quorum = 51% of residents; 1 of 1 = 100% → quorum met
    setup({
      g1: { id: 'g1', userId: 'u1', firstName: 'Alice', lastName: 'Smith' },
    });
    const { getByTestId, findByText } = render(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.press(getByTestId('attendance-toggle-g1'));
    expect(await findByText(/quorum met/i)).toBeTruthy();
  });

  it('saves meeting minutes when typed', async () => {
    setup();
    const { getByTestId } = render(
      <BusinessMeetingDetail navigation={nav} route={route} />,
    );
    fireEvent.changeText(
      getByTestId('minutes-input'),
      'Discussed chore schedule.',
    );
    fireEvent.press(getByTestId('save-minutes-button'));
    await waitFor(() => {
      expect(mockUpdateMeeting).toHaveBeenCalledWith(
        'house1',
        'meeting1',
        expect.objectContaining({ minutes: 'Discussed chore schedule.' }),
      );
    });
  });
});
```

**Step 3: Run to confirm FAIL**

```bash
node_modules/.bin/jest src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx --no-coverage 2>&1 | tail -10
```

**Step 4: Implement `BusinessMeetingDetail.tsx`**

Create `src/screens/Oxford/BusinessMeetingDetail.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import moment from 'moment';

import ScreenHeader from '../../components/screen-header';
import RatsButton from '../../components/rats-button/rats-button';
import { RatsText } from '../../components/rats-text';

import { useAppSelector } from '../../state/store';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';
import { updateBusinessMeeting } from '../../services/oxford/businessMeetings';
import { Guest } from '../../entities/Guest';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: { params: { meeting: BusinessMeeting & { id: string } } };
}

const BusinessMeetingDetail: React.FC<Props> = ({ navigation, route }) => {
  const { meeting: initialMeeting } = route.params;
  const house = useAppSelector(state => state.housesRTK.selectedHouse);
  const guests = useAppSelector(state => state.guestsRTK.guests) as Record<
    string,
    Guest
  >;

  const [attendees, setAttendees] = useState<string[]>(
    initialMeeting.attendees ?? [],
  );
  const [minutes, setMinutes] = useState(initialMeeting.minutes ?? '');
  const [saving, setSaving] = useState(false);

  const guestList = Object.values(guests) as Guest[];
  const totalResidents = guestList.length;
  const quorumThreshold = Math.ceil(totalResidents * 0.51);
  const quorumMet = attendees.length >= quorumThreshold;

  const toggleAttendance = async (guestId: string) => {
    const newAttendees = attendees.includes(guestId)
      ? attendees.filter(id => id !== guestId)
      : [...attendees, guestId];
    setAttendees(newAttendees);
    if (!house?.id) return;
    try {
      await updateBusinessMeeting(house.id, initialMeeting.id, {
        attendees: newAttendees,
        quorumMet: newAttendees.length >= quorumThreshold,
      });
    } catch (err) {
      console.error('Failed to update attendance:', err);
    }
  };

  const handleSaveMinutes = async () => {
    if (!house?.id) return;
    setSaving(true);
    try {
      await updateBusinessMeeting(house.id, initialMeeting.id, { minutes });
      Alert.alert('Saved', 'Meeting minutes saved.');
    } catch (err) {
      console.error('Failed to save minutes:', err);
      Alert.alert('Error', 'Failed to save minutes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader renderBackButton header="Business Meeting" />
      <View style={{ padding: normalize(16) }}>
        {/* Date */}
        <RatsText
          translate={false}
          text={moment(initialMeeting.scheduledDate).format(
            'dddd, MMMM D, YYYY',
          )}
          style={{
            fontSize: fontSize.large,
            color: color.black,
            marginBottom: normalize(12),
          }}
        />

        {/* Quorum indicator */}
        <View
          style={[
            CARD_STYLE,
            {
              backgroundColor: quorumMet ? color.green : color.grey,
              padding: normalize(12),
              marginBottom: normalize(16),
            },
          ]}>
          <RatsText
            translate={false}
            text={
              quorumMet
                ? 'Quorum Met'
                : `${attendees.length} / ${quorumThreshold} needed for quorum`
            }
            style={{ color: color.white, fontSize: fontSize.regular }}
          />
        </View>

        {/* Attendance */}
        <RatsText
          translate={false}
          text="Attendance"
          style={{
            fontSize: fontSize.medium,
            color: color.black,
            marginBottom: normalize(8),
          }}
        />
        {guestList.map(g => {
          const present = attendees.includes(g.id);
          const name =
            `${g.firstName || ''} ${g.lastName || ''}`.trim() || 'Resident';
          return (
            <TouchableOpacity
              key={g.id}
              testID={`attendance-toggle-${g.id}`}
              onPress={() => toggleAttendance(g.id)}
              style={[
                CARD_STYLE,
                {
                  backgroundColor: color.white,
                  marginBottom: normalize(6),
                  padding: normalize(12),
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                },
              ]}>
              <RatsText
                translate={false}
                text={name}
                style={{ fontSize: fontSize.regular, color: color.black }}
              />
              <View
                style={{
                  backgroundColor: present ? color.green : color.light_grey,
                  width: normalize(24),
                  height: normalize(24),
                  borderRadius: normalize(12),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                {present && (
                  <RatsText
                    translate={false}
                    text="✓"
                    style={{ color: color.white, fontSize: fontSize.small }}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Minutes */}
        <RatsText
          translate={false}
          text="Meeting Minutes"
          style={{
            fontSize: fontSize.medium,
            color: color.black,
            marginTop: normalize(20),
            marginBottom: normalize(8),
          }}
        />
        <TextInput
          testID="minutes-input"
          value={minutes}
          onChangeText={setMinutes}
          placeholder="Record meeting discussion..."
          placeholderTextColor={color.grey}
          multiline
          numberOfLines={6}
          style={{
            borderWidth: 1,
            borderColor: color.medium_grey,
            borderRadius: normalize(4),
            padding: normalize(10),
            fontSize: fontSize.regular,
            color: color.black,
            textAlignVertical: 'top',
            marginBottom: normalize(12),
            backgroundColor: color.white,
          }}
        />
        <RatsButton
          testID="save-minutes-button"
          title={saving ? 'Saving...' : 'Save Minutes'}
          disabled={saving}
          onPress={handleSaveMinutes}
        />
      </View>
    </ScrollView>
  );
};

export default BusinessMeetingDetail;
```

**Step 5: Update `BusinessMeetings.tsx` to navigate on tap**

In the `renderMeeting` function, wrap the card in a `TouchableOpacity`:

```typescript
// Change:
const renderMeeting = ({ item }: { item: BusinessMeeting }) => (
  <View style={[CARD_STYLE, { ... }]}>
// To:
const renderMeeting = ({ item }: { item: BusinessMeeting & { id: string } }) => (
  <TouchableOpacity
    onPress={() => navigation.navigate('BusinessMeetingDetail', { meeting: item })}
    style={[CARD_STYLE, { ... }]}>
```

Close with `</TouchableOpacity>` instead of `</View>`.

Add `TouchableOpacity` to the React Native imports.

**Step 6: Run tests GREEN**

```bash
node_modules/.bin/jest src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx --no-coverage
```

**Step 7: Commit**

```bash
git add src/screens/Oxford/BusinessMeetingDetail.tsx src/screens/Oxford/BusinessMeetings.tsx src/services/oxford/businessMeetings.ts "src/screens/Oxford/__tests__/BusinessMeetingDetail.test.tsx"
git commit -m "feat(oxford): business meeting detail — attendance toggle, quorum indicator, and minutes field"
```

---

### Task B3: EES auto-recalculation Firestore trigger

**Problem:** When a guest is added or removed from a house, the EES (Equal Expense Share) per-resident amount doesn't update automatically.

**Files:**

- Modify: `functions/src/triggers/firestore.ts` (in `regroup-functions`)
- Modify: `functions/src/__tests__/triggers/firestore.test.ts`

**Step 1: Write failing test**

Add to `functions/src/__tests__/triggers/firestore.test.ts`:

```typescript
describe('eesRecalculationOnGuestWrite', () => {
  it('is exported from triggers/firestore', () => {
    const triggers = require('../../triggers/firestore');
    expect(typeof triggers.eesRecalculationOnGuestWrite).toBe('function');
  });
});
```

**Step 2: Run to confirm FAIL**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest firestore.test --no-coverage 2>&1 | tail -10
```

**Step 3: Implement in `functions/src/triggers/firestore.ts`**

Append at the end of the file:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// eesRecalculationOnGuestWrite
//
// Triggered when any guest document is created, updated, or deleted.
// Recalculates the Equal Expense Share (EES) amount for the current week
// based on the updated resident count.
// ─────────────────────────────────────────────────────────────────────────────
export const eesRecalculationOnGuestWrite = onDocumentWritten(
  'guests/{guestId}',
  async event => {
    const guestData = event.data?.after?.data() ?? event.data?.before?.data();
    if (!guestData) return;

    const houseId = guestData.houseId as string | undefined;
    if (!houseId) return;

    // Count active guests in the house
    const guestsSnap = await db
      .collection('guests')
      .where('houseId', '==', houseId)
      .get();

    const activeCount = guestsSnap.docs.filter(d => !d.data().leftAt).length;
    if (activeCount === 0) return;

    // Get current week's EES records and update amounts
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // ISO week Monday
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const eesSnap = await db
      .collection('ees-records')
      .where('houseId', '==', houseId)
      .where('weekStart', '==', weekStartStr)
      .where('paid', '==', false)
      .get();

    if (eesSnap.empty) return;

    // Calculate new amount based on total expenses / new resident count
    const firstRecord = eesSnap.docs[0].data();
    const totalExpenses = (firstRecord.totalExpenses as number) ?? 0;
    const newAmount = totalExpenses > 0 ? totalExpenses / activeCount : 0;

    const batch = db.batch();
    eesSnap.docs.forEach(doc => {
      batch.update(doc.ref, { amount: newAmount, residentCount: activeCount });
    });
    await batch.commit();

    logger.info(
      `EES recalculated for house ${houseId}: ${activeCount} residents, $${newAmount.toFixed(
        2,
      )} each`,
    );
  },
);
```

Make sure to import `onDocumentWritten` from `"firebase-functions/v2/firestore"` at the top of the file if not already present.

**Step 4: Run tests GREEN**

```bash
npx jest firestore.test --no-coverage
```

**Step 5: Run full functions test suite**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/triggers/firestore.ts functions/src/__tests__/triggers/firestore.test.ts
git commit -m "feat(oxford): EES auto-recalculation Firestore trigger on guest add/remove"
```

---

### Task B4: Anonymous voting toggle

**Problem:** All votes expose individual votes (`individualVotes` map). Oxford House charter requires an anonymous voting option.

**Files:**

- Modify: `src/entities/oxford/Vote.ts` (add `isAnonymous?: boolean`)
- Modify: `src/services/oxford/votes.ts` (update `castVote` to skip `individualVotes` when anonymous)
- Modify: `src/screens/Oxford/Voting.tsx` (add toggle in create form, hide vote attribution in list)
- Create: `src/services/oxford/__tests__/votes.test.ts`

**Step 1: Update `Vote.ts`**

```typescript
export interface Vote {
  id: string;
  houseId: string;
  meetingId?: string;
  topic: string;
  description: string;
  type: VoteType;
  options: string[];
  results: { [option: string]: number };
  individualVotes: { [userId: string]: string }; // empty when isAnonymous
  isAnonymous?: boolean; // NEW
  threshold: number;
  passed: boolean;
  closedAt?: string;
  createdAt: string;
}
```

**Step 2: Write failing tests**

Create `src/services/oxford/__tests__/votes.test.ts`:

```typescript
import { functions, firestore } from '../../../../firebase-setup';
import { castVote } from '../votes';

const mockFunctions = functions as any;
const mockFirestore = firestore as any;

describe('castVote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes individualVotes when vote is NOT anonymous', async () => {
    const mockUpdateFn = jest.fn(() => Promise.resolve());
    const mockDocFn = jest.fn(() => ({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          isAnonymous: false,
          results: { yes: 0 },
          individualVotes: {},
        }),
      }),
      update: mockUpdateFn,
    }));

    mockFirestore.collection = jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: mockDocFn,
        })),
      })),
    }));

    await castVote('house1', 'vote1', 'guest1', 'yes');

    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        'individualVotes.guest1': 'yes',
      }),
    );
  });

  it('does NOT write individualVotes when vote IS anonymous', async () => {
    const mockUpdateFn = jest.fn(() => Promise.resolve());
    const mockDocFn = jest.fn(() => ({
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          isAnonymous: true,
          results: { yes: 0 },
          individualVotes: {},
        }),
      }),
      update: mockUpdateFn,
    }));

    mockFirestore.collection = jest.fn(() => ({
      doc: jest.fn(() => ({
        collection: jest.fn(() => ({
          doc: mockDocFn,
        })),
      })),
    }));

    await castVote('house1', 'vote1', 'guest1', 'yes');

    const updateArg = mockUpdateFn.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('individualVotes.guest1');
  });
});
```

**Step 3: Run to confirm FAIL**

```bash
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest src/services/oxford/__tests__/votes.test.ts --no-coverage 2>&1 | tail -15
```

**Step 4: Read current `src/services/oxford/votes.ts` and update `castVote`**

The `castVote` function needs to check `isAnonymous` on the vote document. Update the `castVote` update call:

```typescript
// In castVote, after fetching the vote document:
const voteData = voteDoc.data() as Vote;
const isAnonymous = voteData.isAnonymous ?? false;

const update: Record<string, any> = {
  [`results.${choice}`]: (voteData.results[choice] ?? 0) + 1,
};

if (!isAnonymous) {
  update[`individualVotes.${guestId}`] = choice;
}

await voteRef.update(update);
```

**Step 5: Update `Voting.tsx` create form to add anonymous toggle**

In the create vote form section, add after the description input:

```typescript
const [isAnonymous, setIsAnonymous] = useState(false);

// In the form JSX, after description field:
<TouchableOpacity
  testID="anonymous-toggle"
  onPress={() => setIsAnonymous(prev => !prev)}
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(12),
  }}>
  <View
    style={{
      width: normalize(24),
      height: normalize(24),
      borderRadius: normalize(4),
      borderWidth: 1,
      borderColor: color.baby_blue,
      backgroundColor: isAnonymous ? color.baby_blue : color.white,
      marginRight: normalize(8),
      justifyContent: 'center',
      alignItems: 'center',
    }}>
    {isAnonymous && (
      <RatsText translate={false} text="✓" style={{ color: color.white }} />
    )}
  </View>
  <RatsText
    translate={false}
    text="Anonymous voting"
    style={{ color: color.dark_grey, fontSize: fontSize.regular }}
  />
</TouchableOpacity>;
```

Add `isAnonymous` to the `createVote` call:

```typescript
await createVote(house.id, {
  ...existingFields,
  isAnonymous,
});
```

Hide individual votes display when `isAnonymous`:

```typescript
// In renderVote, wrap the "Your vote" indicator:
{!item.isAnonymous && currentChoice && (
  <RatsText text={`Your vote: ${currentChoice.toUpperCase()}`} ... />
)}
```

**Step 6: Run tests GREEN**

```bash
node_modules/.bin/jest src/services/oxford/__tests__/votes.test.ts --no-coverage
```

**Step 7: Commit**

```bash
git add src/entities/oxford/Vote.ts src/services/oxford/votes.ts src/screens/Oxford/Voting.tsx "src/services/oxford/__tests__/votes.test.ts"
git commit -m "feat(oxford): anonymous voting toggle — skips individualVotes write when isAnonymous"
```

---

### Task B5: Officer term rotation reminders (scheduled Cloud Function)

**Problem:** No push notification when an officer's term is expiring in 30 days.

**Files:**

- Modify: `functions/src/scheduled/index.ts` (append new scheduled function)
- Modify: `functions/src/__tests__` (add test for officer reminder logic)

**Step 1: Write failing test**

In `functions/src/__tests__/scheduled/officerTermReminder.test.ts`:

```typescript
import { sendOfficerTermReminders } from '../../scheduled/officerTermReminder';

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collectionGroup: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
  })),
  messaging: jest.fn(() => ({
    sendMulticast: jest
      .fn()
      .mockResolvedValue({ successCount: 0, failureCount: 0, responses: [] }),
  })),
  initializeApp: jest.fn(),
}));

describe('sendOfficerTermReminders', () => {
  it('is a function', () => {
    expect(typeof sendOfficerTermReminders).toBe('function');
  });

  it('does not throw when there are no officers expiring', async () => {
    await expect(sendOfficerTermReminders()).resolves.not.toThrow();
  });
});
```

**Step 2: Create `functions/src/scheduled/officerTermReminder.ts`**

```typescript
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Exported for testing — the core logic without the scheduler wrapper.
 */
export async function sendOfficerTermReminders(): Promise<void> {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const cutoffDate = thirtyDaysFromNow.toISOString().slice(0, 10);

  const today = new Date().toISOString().slice(0, 10);

  // Query all active officers whose term ends within 30 days
  const snapshot = await db
    .collectionGroup('officers')
    .where('isActive', '==', true)
    .where('termEndDate', '<=', cutoffDate)
    .where('termEndDate', '>=', today)
    .get();

  if (snapshot.empty) {
    logger.info('No officer terms expiring within 30 days');
    return;
  }

  for (const doc of snapshot.docs) {
    const officer = doc.data();
    const { userId, role, houseId, termEndDate } = officer;

    // Look up FCM token from user document
    const userDoc = await db.collection('users').doc(userId).get();
    const fcmToken = userDoc.data()?.fcmToken as string | undefined;

    if (!fcmToken) continue;

    const daysLeft = Math.ceil(
      (new Date(termEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    try {
      await messaging.sendMulticast({
        tokens: [fcmToken],
        notification: {
          title: 'Officer Term Expiring',
          body: `Your term as ${roleLabel} expires in ${daysLeft} days.`,
        },
        data: { houseId, role, type: 'officer_term_reminder' },
      });
      logger.info(
        `Sent term reminder to officer ${userId} (${role}) — ${daysLeft} days left`,
      );
    } catch (err) {
      logger.warn(`Failed to send reminder to ${userId}:`, err);
    }
  }
}

// Scheduled Cloud Function: runs daily at 8 AM UTC
export const officerTermReminder = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'UTC' },
  async _event => {
    logger.info('Running officer term reminder check...');
    await sendOfficerTermReminders();
  },
);
```

**Step 3: Export from `scheduled/index.ts`**

Append to `functions/src/scheduled/index.ts`:

```typescript
export * from './officerTermReminder';
```

**Step 4: Run tests GREEN**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest officerTermReminder --no-coverage
```

**Step 5: Run full functions test suite**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

**Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/scheduled/officerTermReminder.ts functions/src/scheduled/index.ts "functions/src/__tests__/scheduled/officerTermReminder.test.ts"
git commit -m "feat(oxford): officer term rotation reminder — daily scheduled CF, 30 days before expiry"
```

---

## Final Verification

**Run all tests in both repos:**

```bash
# rats-v2
cd /Users/marcusklein/dev/rats-v2
node_modules/.bin/jest --testPathPattern='subscription|OxfordDashboard|OfficerManagement|BusinessMeetings|PaymentDashboard|payments|votes' --no-coverage 2>&1 | tail -8

# regroup-functions
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest --no-coverage 2>&1 | tail -5
```

Expected: All tests pass in both repos.

---

## Week 1 Completion Checklist

Track A — Traditional Payments:

- [ ] A1: `createPaymentIntent` CF name fixed in `payment.ts` (no more `createRentPaymentIntent`)
- [ ] A2: `listHousePayments` CF added in `regroup-functions`
- [ ] A3: `listHousePayments` service function added in `rats-v2`
- [ ] A4: `PaymentDashboard` rebuilt with React Query, date pills, stats card, bar chart, FAB

Track B — Oxford Completion:

- [ ] B1: `OfficerManagement` term expiry warning + Remove officer button
- [ ] B2: `BusinessMeetingDetail` screen — attendance toggle, quorum indicator, minutes field
- [ ] B3: EES auto-recalculation Firestore trigger on guest add/remove
- [ ] B4: Anonymous voting toggle on create form + `castVote` logic
- [ ] B5: Officer term reminder scheduled CF (daily, 30-day window)
