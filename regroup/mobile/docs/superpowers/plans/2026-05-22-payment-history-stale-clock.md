# PaymentHistory Stale Clock Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an amber clock icon to payment rows in `PaymentHistory` when a payment has been `pending` for more than 24 hours — completing the offline payment pending indicator feature (the `StalePendingBanner` in `PaymentDashboard` was already shipped; this is the remaining UI touch in `PaymentHistory`).

**Architecture:** Pure UI change inside `renderItem` in `PaymentHistory.tsx`. An inline stale check (`status === 'pending' && age > 24h`) drives a `FontAwesome5 clock` icon rendered in amber (`color.yellow`) next to the status badge. No new service calls, no new query hooks, no new files except the test.

**Tech Stack:** React Native, FontAwesome5 (react-native-vector-icons), `toDateSafe` (already imported in `PaymentHistory.tsx`), `@testing-library/react-native`.

---

## Codebase Anchor Points

| Concern               | Path                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Screen to modify      | `src/screens/Payments/PaymentHistory.tsx`                                                                      |
| `renderItem` function | `PaymentHistory.tsx:84`                                                                                        |
| `toDateSafe` import   | Already imported at line 11                                                                                    |
| `color` import        | Already imported from `../../styles/theme`                                                                     |
| `PaymentRecord` type  | `src/services/payments.ts:36` — has `status: 'succeeded' \| 'pending' \| 'failed'` and `createdAt: string`     |
| FontAwesome5 pattern  | `src/screens/GuestList/GuestList.tsx:17` — `import FontAwesome5 from 'react-native-vector-icons/FontAwesome5'` |
| Test to create        | `src/screens/Payments/__tests__/PaymentHistory.test.tsx`                                                       |
| Store mock pattern    | See `src/screens/Payments/__tests__/ResidentPayment.test.tsx`                                                  |

## File Structure

**Modify:**

- `src/screens/Payments/PaymentHistory.tsx` — add `STALE_THRESHOLD_MS` constant, `FontAwesome5` import, stale check + clock icon in `renderItem`

**Create:**

- `src/screens/Payments/__tests__/PaymentHistory.test.tsx` — tests for normal, pending, and stale-pending row rendering

---

## Task 1: Write Failing Tests

**File:** `src/screens/Payments/__tests__/PaymentHistory.test.tsx`

- [ ] **Step 1.1: Create the test file with mocks and fixtures**

```typescript
// src/screens/Payments/__tests__/PaymentHistory.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-native-vector-icons/FontAwesome5', () => {
  const { View } = require('react-native');
  return ({ testID }: { testID?: string }) => <View testID={testID} />;
});

jest.mock('../../../services/payments', () => ({
  listPayments: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../services/reportExport', () => ({
  exportPaymentHistoryCSV: jest.fn().mockReturnValue('csv-content'),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

// Store: provide a selected guest and house
jest.mock('../../../state/store', () => ({
  useAppSelector: (selector: (s: any) => any) =>
    selector({
      guests: {
        selectedGuest: {
          id: 'guest-1',
          displayName: 'Alice Smith',
          firstName: 'Alice',
          lastName: 'Smith',
        },
      },
      houses: { selectedHouse: { id: 'house-1', name: 'Test House' } },
    }),
}));

// ─── Imports (must come after jest.mock calls) ───────────────────────────────

import * as paymentsService from '../../../services/payments';
import { PaymentRecord } from '../../../services/payments';
import PaymentHistory from '../PaymentHistory';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const _succeeded: PaymentRecord = {
  id: 'pay-001',
  amount: 50000,
  currency: 'usd',
  status: 'succeeded',
  description: 'Monthly Rent',
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const _recentPending: PaymentRecord = {
  id: 'pay-002',
  amount: 60000,
  currency: 'usd',
  status: 'pending',
  description: 'Rent Payment',
  createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
};

const _stalePending: PaymentRecord = {
  id: 'pay-003',
  amount: 70000,
  currency: 'usd',
  status: 'pending',
  description: 'Rent Payment',
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
};

const _fakeNavigation: any = { goBack: jest.fn(), navigate: jest.fn() };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaymentHistory', () => {
  it('renders a succeeded row without a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([_succeeded]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-001');
    expect(queryByTestId('stale-clock-pay-001')).toBeNull();
  });

  it('renders a recent-pending row without a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _recentPending,
    ]);
    const { findByTestId, queryByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-002');
    expect(queryByTestId('stale-clock-pay-002')).toBeNull();
  });

  it('renders a stale-pending row WITH a stale-clock icon', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _stalePending,
    ]);
    const { findByTestId } = render(
      <PaymentHistory navigation={_fakeNavigation} />,
    );
    await findByTestId('payment-row-pay-003');
    await findByTestId('stale-clock-pay-003');
  });
});
```

- [ ] **Step 1.2: Run the tests — verify they fail**

```bash
npx jest src/screens/Payments/__tests__/PaymentHistory.test.tsx --no-coverage
```

Expected: FAIL — `payment-row-pay-001` not found (no testID on the row yet).

---

## Task 2: Implement the Stale Clock Icon

**File:** `src/screens/Payments/PaymentHistory.tsx`

- [ ] **Step 2.1: Add `FontAwesome5` import and `STALE_THRESHOLD_MS` constant**

Add immediately after the existing `color` import (after line 25):

```typescript
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
```

- [ ] **Step 2.2: Replace `renderItem` with the stale-aware version**

Replace the entire `renderItem` function (lines 84–116):

```typescript
const renderItem = ({ item }: { item: PaymentRecord }) => {
  const succeeded = item.status === 'succeeded';
  const createdMs = toDateSafe(item.createdAt)?.getTime();
  const isStale =
    item.status === 'pending' &&
    createdMs !== undefined &&
    createdMs < Date.now() - STALE_THRESHOLD_MS;

  return (
    <View
      testID={`payment-row-${item.id}`}
      style={[
        CARD_STYLE,
        styles.paymentCard,
        { borderLeftColor: succeeded ? color.green : color.red },
      ]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <RatsText
            translate={false}
            text={item.description}
            style={styles.description}
          />
          <RatsText
            translate={false}
            text={(() => {
              const d = toDateSafe(item.createdAt);
              return d ? format(d, 'MMM d, yyyy') : '—';
            })()}
            style={styles.date}
          />
        </View>
        <View style={styles.rightColumn}>
          <RatsText
            translate={false}
            text={`$${(item.amount / 100).toFixed(2)}`}
            style={styles.amount}
          />
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: succeeded ? color.green : color.red },
              ]}>
              <RatsText
                translate={false}
                text={item.status.toUpperCase()}
                style={styles.statusText}
              />
            </View>
            {isStale && (
              <FontAwesome5
                testID={`stale-clock-${item.id}`}
                name="clock"
                size={normalize(14)}
                color={color.yellow}
                style={styles.staleIcon}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};
```

- [ ] **Step 2.3: Add `statusRow` and `staleIcon` to the `StyleSheet`**

In `const styles = StyleSheet.create({...})`, add after the `statusBadge` entry:

```typescript
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: normalize(4),
  },
  staleIcon: {
    marginLeft: normalize(6),
  },
```

Remove `marginTop: normalize(4)` from the existing `statusBadge` entry (it's moving to `statusRow`):

```typescript
  statusBadge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: normalize(4),
  },
```

- [ ] **Step 2.4: Run the tests — verify they pass**

```bash
npx jest src/screens/Payments/__tests__/PaymentHistory.test.tsx --no-coverage
```

Expected: PASS — 3 tests green.

- [ ] **Step 2.5: Commit**

```bash
git add src/screens/Payments/PaymentHistory.tsx \
        src/screens/Payments/__tests__/PaymentHistory.test.tsx
git commit -m "feat(payments): add stale-pending clock icon to PaymentHistory rows"
```

---

## Self-Review Checklist

- [x] Spec coverage: stale icon on rows older than 24h — ✅ covered by `isStale` check
- [x] Spec coverage: amber color — ✅ `color.yellow`
- [x] Spec coverage: recent-pending rows — ✅ test verifies no icon
- [x] No placeholders — all code is complete
- [x] Type consistency — `PaymentRecord` imported from same source as `PaymentHistory`
- [x] `testID` on every row — ✅ `payment-row-${item.id}` enables future E2E targeting
