# Payment Failure Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Scope:** P1-1 (guest discharge), P1-3 (balance aging), P1-4 (CSV export), and P1-5 (bulk import) are all already fully implemented. This plan covers the remaining gap in P1-2 only.

**Goal:** Let house admins mark failed resident rent payments as resolved offline (cash/check) directly from the Payment Dashboard, and fix the broken "Fix Payment" button that currently navigates to the wrong screen.

**Architecture:** `RentPayment.status` gains a `'resolved_offline'` variant. A new `markPaymentResolvedOffline(paymentId)` service function writes this status directly to the `payments` Firestore collection. The `FailedPaymentBanner` component is refactored to show per-payment rows with inline action buttons instead of a single broken CTA that navigated to the house subscription screen.

**Tech Stack:** React Native, Firestore (`payments` flat collection), React Query v5 (TanStack), existing `FailedPaymentBanner` + `useFailedPayments`

---

## File Structure

**Modify:**

- `src/services/payments.ts` — extend `RentPayment.status` union; add `markPaymentResolvedOffline()`
- `src/state/queries/paymentQueries.ts` — add `useMarkPaymentResolved` mutation
- `src/screens/Payments/FailedPaymentBanner.tsx` — replace single broken CTA with per-payment rows + "Mark Resolved" buttons

**Existing context you must know:**

- `paymentsCollection = firestore.collection('payments')` — already exported from `payments.ts:53`
- `useFailedPayments(houseId)` — already in `paymentQueries.ts:152`; returns `RentPayment[]` filtered to `status === 'failed'`
- `FailedPaymentBanner` is used in `src/screens/HouseSettings/PaymentDashboard.tsx:200`; it receives `failedPayments: RentPayment[]` and `userId: string`
- The current `FailedPaymentBanner` "Fix Payment" button navigates to `Routes.SubscriptionHandler` — this is wrong (that screen manages the house's Regroup subscription, not guest rent payments). This needs to be removed.
- Auth singleton: `import { auth } from '../../firebase-setup'` — use `auth.currentUser`, never `auth().currentUser`
- Jest mock pattern: self-contained `jest.mock` factories, private mocks via `_mock` prefix (see `src/services/__tests__/guest.test.ts`)
- Theme: use `color.dark_grey`, `color.grey`, `color.red`, `color.green`, `color.white`, `color.blue`, `fontSize.regular`, `fontSize.small`, `fontSize.medium`, `normalize()` from `../../styles/theme`

---

### Task 1: Extend `RentPayment.status` and add `markPaymentResolvedOffline`

**Files:**

- Modify: `src/services/payments.ts:15-53`
- Create: `src/services/__tests__/markPaymentResolved.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/markPaymentResolved.test.ts`:

```typescript
// src/services/__tests__/markPaymentResolved.test.ts

jest.mock('../../../firebase-setup', () => {
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockDoc = jest.fn(() => ({ update: mockUpdate }));
  const mockCollection = jest.fn(() => ({ doc: mockDoc }));
  return {
    firestore: {
      collection: mockCollection,
      _mockUpdate: mockUpdate,
      _mockDoc: mockDoc,
    },
    auth: { currentUser: { uid: 'admin-uid-1' } },
  };
});

import { firestore } from '../../../firebase-setup';
import { markPaymentResolvedOffline } from '../payments';

const getUpdate = () => (firestore as any)._mockUpdate as jest.Mock;

describe('markPaymentResolvedOffline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates status to resolved_offline on the payments document', async () => {
    await markPaymentResolvedOffline('pay-abc-123');

    expect(getUpdate()).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'resolved_offline' }),
    );
  });

  it('writes resolvedAt as a valid ISO string', async () => {
    await markPaymentResolvedOffline('pay-abc-123');
    const written = getUpdate().mock.calls[0][0];
    expect(new Date(written.resolvedAt).toISOString()).toBe(written.resolvedAt);
  });

  it('targets the correct document id', async () => {
    await markPaymentResolvedOffline('pay-abc-123');
    expect((firestore as any)._mockDoc).toHaveBeenCalledWith('pay-abc-123');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd /Users/marcusklein/dev/rats-v2
yarn test src/services/__tests__/markPaymentResolved.test.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `markPaymentResolvedOffline is not exported from '../payments'`

- [ ] **Step 3: Extend `RentPayment.status` and add the function**

In `src/services/payments.ts`, make two changes:

**Change 1** — update the `RentPayment.status` union (line 20):

```typescript
status: 'pending' | 'succeeded' | 'failed' | 'resolved_offline';
```

**Change 2** — append `markPaymentResolvedOffline` after `recordManualPayment` (after line ~220):

```typescript
/**
 * Mark a failed payment as resolved via an offline method (cash/check).
 * Writes `status: 'resolved_offline'` directly to the payments collection.
 * The `useFailedPayments` query will automatically exclude it on next refetch.
 */
export async function markPaymentResolvedOffline(
  paymentId: string,
): Promise<void> {
  await paymentsCollection.doc(paymentId).update({
    status: 'resolved_offline',
    resolvedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 4: Run to verify pass**

```bash
yarn test src/services/__tests__/markPaymentResolved.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 3 tests

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "payments" | head -10
```

Expected: No errors. If `'resolved_offline'` causes type mismatches elsewhere (e.g. in `FailedPaymentBanner.test.tsx`), check that `PaymentRecord.status` (the Stripe-backed type on line 40) remains unchanged — only `RentPayment.status` changes.

- [ ] **Step 6: Commit**

```bash
git add src/services/payments.ts src/services/__tests__/markPaymentResolved.test.ts
git commit -m "feat(payments): add markPaymentResolvedOffline — marks failed rent payment as resolved via cash/check"
```

---

### Task 2: Add `useMarkPaymentResolved` mutation to `paymentQueries.ts`

**Files:**

- Modify: `src/state/queries/paymentQueries.ts`
- Modify: `src/state/queries/__tests__/paymentQueries.test.ts` (or create if it doesn't exist)

- [ ] **Step 1: Check if a test file exists**

```bash
ls /Users/marcusklein/dev/rats-v2/src/state/queries/__tests__/ 2>/dev/null
```

If `paymentQueries.test.ts` exists, append the new describe block from Step 2 to it. If the directory doesn't exist, create the file from scratch.

- [ ] **Step 2: Write the failing test**

Append to (or create) `src/state/queries/__tests__/paymentQueries.test.ts`:

```typescript
// Tests for useMarkPaymentResolved

jest.mock('../../services/payments', () => ({
  markPaymentResolvedOffline: jest.fn().mockResolvedValue(undefined),
  // include any other functions this file already mocks
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
  useMutation: jest.fn(({ mutationFn }) => ({
    mutateAsync: mutationFn,
    isPending: false,
  })),
  useQueryClient: jest.fn(() => ({ invalidateQueries: jest.fn() })),
}));

import { markPaymentResolvedOffline } from '../../services/payments';
import { useMarkPaymentResolved } from '../paymentQueries';

describe('useMarkPaymentResolved', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls markPaymentResolvedOffline with the given paymentId', async () => {
    const { mutateAsync } = useMarkPaymentResolved('house-1');
    await mutateAsync({ paymentId: 'pay-001' });
    expect(markPaymentResolvedOffline).toHaveBeenCalledWith('pay-001');
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
yarn test src/state/queries/__tests__/paymentQueries.test.ts --no-coverage 2>&1 | grep -E "FAIL|PASS|Cannot find" | head -10
```

Expected: FAIL — `useMarkPaymentResolved is not exported from '../paymentQueries'`

- [ ] **Step 4: Add the mutation**

Append to `src/state/queries/paymentQueries.ts` (after `useFailedPayments`):

```typescript
// ─── Resolve Failed Payment (offline) ────────────────────────────────────────

export const useMarkPaymentResolved = (houseId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string }) =>
      paymentService.markPaymentResolvedOffline(paymentId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...paymentKeys.housePayments(houseId), 'failed'],
      });
    },
    onError: logException,
  });
};
```

Make sure `paymentService` is already imported as a namespace import. At the top of `paymentQueries.ts`, the import looks like:

```typescript
import * as paymentService from '../../services/payments';
```

If it's a named import instead, add `markPaymentResolvedOffline` to that import.

- [ ] **Step 5: Run to verify pass**

```bash
yarn test src/state/queries/__tests__/paymentQueries.test.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/state/queries/paymentQueries.ts src/state/queries/__tests__/paymentQueries.test.ts
git commit -m "feat(payments): add useMarkPaymentResolved React Query mutation"
```

---

### Task 3: Fix `FailedPaymentBanner` — per-payment rows with inline actions

**Files:**

- Modify: `src/screens/Payments/FailedPaymentBanner.tsx`
- Modify: `src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx`

The current banner shows a single amber block with a "Fix Payment" button that navigates to `Routes.SubscriptionHandler`. That is the wrong destination (SubscriptionHandler is for managing the house's Regroup subscription — not for resolving guest rent payments). Replace it with a list of failed payment rows, each with a "Mark Resolved" button.

- [ ] **Step 1: Read the current test file before editing**

```bash
cat /Users/marcusklein/dev/rats-v2/src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx
```

Note what helpers and mock data it already defines. You will replace its test cases with updated ones.

- [ ] **Step 2: Rewrite the test file**

```typescript
// src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../../state/queries/paymentQueries', () => ({
  useMarkPaymentResolved: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
}));

import FailedPaymentBanner from '../FailedPaymentBanner';

const fakePayment = {
  id: 'pay-001',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 50000,
  status: 'failed' as const,
  createdAt: '2026-04-01T00:00:00.000Z',
  description: 'Monthly Rent',
};

const fakePayment2 = { ...fakePayment, id: 'pay-002' };

const guestNames: Record<string, string> = { 'guest-1': 'Alice Smith' };

describe('FailedPaymentBanner', () => {
  it('renders nothing when failedPayments is empty', () => {
    const { queryByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[]}
        houseId="house-1"
        guestNames={{}}
      />,
    );
    expect(queryByTestId('failed-payment-banner')).toBeNull();
  });

  it('renders a row for each failed payment', () => {
    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment, fakePayment2]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    expect(getByTestId('failed-payment-row-pay-001')).toBeTruthy();
    expect(getByTestId('failed-payment-row-pay-002')).toBeTruthy();
  });

  it('shows "Mark Resolved" button for each row', () => {
    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    expect(getByTestId('mark-resolved-pay-001')).toBeTruthy();
  });

  it('calls useMarkPaymentResolved mutateAsync when "Mark Resolved" is tapped', () => {
    const mockMutate = jest.fn().mockResolvedValue(undefined);
    const { useMarkPaymentResolved } = require('../../../state/queries/paymentQueries');
    (useMarkPaymentResolved as jest.Mock).mockReturnValue({
      mutateAsync: mockMutate,
      isPending: false,
    });

    const { getByTestId } = render(
      <FailedPaymentBanner
        failedPayments={[fakePayment]}
        houseId="house-1"
        guestNames={guestNames}
      />,
    );
    fireEvent.press(getByTestId('mark-resolved-pay-001'));
    expect(mockMutate).toHaveBeenCalledWith({ paymentId: 'pay-001' });
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
yarn test src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx --no-coverage 2>&1 | tail -15
```

Expected: FAIL — props mismatch, new `testID`s not found

- [ ] **Step 4: Rewrite `FailedPaymentBanner.tsx`**

```tsx
// src/screens/Payments/FailedPaymentBanner.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { format, parseISO } from 'date-fns';
import { RentPayment } from '../../services/payments';
import { useMarkPaymentResolved } from '../../state/queries/paymentQueries';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';

interface Props {
  failedPayments: RentPayment[];
  houseId: string;
  guestNames: Record<string, string>;
}

interface RowProps {
  payment: RentPayment;
  guestName: string;
  houseId: string;
}

const FailedPaymentRow: React.FC<RowProps> = ({
  payment,
  guestName,
  houseId,
}) => {
  const { mutateAsync, isPending } = useMarkPaymentResolved(houseId);

  const handleMarkResolved = () => {
    Alert.alert(
      'Mark as Resolved',
      `Mark ${guestName}'s $${(payment.amount / 100).toFixed(2)} payment as resolved offline (cash/check)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Resolved',
          onPress: () => mutateAsync({ paymentId: payment.id }),
        },
      ],
    );
  };

  const dateStr = payment.createdAt
    ? format(parseISO(payment.createdAt), 'MMM d')
    : '';

  return (
    <View style={styles.row} testID={`failed-payment-row-${payment.id}`}>
      <View style={styles.rowBody}>
        <RatsText translate={false} text={guestName} style={styles.guestName} />
        <RatsText
          translate={false}
          text={`$${(payment.amount / 100).toFixed(2)} · ${payment.description ?? 'Rent'} · ${dateStr}`}
          style={styles.detail}
        />
      </View>
      <TouchableOpacity
        style={[styles.resolveBtn, isPending && styles.btnDisabled]}
        onPress={handleMarkResolved}
        disabled={isPending}
        testID={`mark-resolved-${payment.id}`}>
        <RatsText
          translate={false}
          text="Mark Resolved"
          style={styles.resolveBtnText}
        />
      </TouchableOpacity>
    </View>
  );
};

const FailedPaymentBanner: React.FC<Props> = ({
  failedPayments,
  houseId,
  guestNames,
}) => {
  if (failedPayments.length === 0) return null;

  return (
    <View style={styles.banner} testID="failed-payment-banner">
      <RatsText
        translate={false}
        text={`${failedPayments.length} Failed Payment${failedPayments.length > 1 ? 's' : ''}`}
        style={styles.header}
      />
      {failedPayments.map(p => (
        <FailedPaymentRow
          key={p.id}
          payment={p}
          guestName={guestNames[p.guestId] ?? 'Unknown Resident'}
          houseId={houseId}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: color.red,
    borderRadius: 6,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    padding: normalize(12),
  },
  header: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(6),
    borderTopWidth: 1,
    borderTopColor: '#FDEEBA',
  },
  rowBody: { flex: 1 },
  guestName: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: color.dark_grey,
  },
  detail: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  resolveBtn: {
    backgroundColor: color.green,
    borderRadius: 4,
    paddingHorizontal: normalize(10),
    paddingVertical: normalize(6),
    marginLeft: normalize(8),
  },
  btnDisabled: { opacity: 0.5 },
  resolveBtnText: {
    fontSize: fontSize.small,
    color: color.white,
    fontWeight: '600',
  },
});

export default FailedPaymentBanner;
```

- [ ] **Step 5: Update `PaymentDashboard.tsx` call site**

In `src/screens/HouseSettings/PaymentDashboard.tsx`, the `FailedPaymentBanner` call currently passes `failedPayments` and `userId`. It needs to pass `houseId` and `guestNames` instead.

First, grep for the existing call site:

```bash
grep -n "FailedPaymentBanner" /Users/marcusklein/dev/rats-v2/src/screens/HouseSettings/PaymentDashboard.tsx
```

Then update the props. The `house?.id` is already in scope. Build a `guestNames` map from the Redux guest list:

```tsx
// Near the top of the component (after houseId/guests are available):
const guestNames: Record<string, string> = useMemo(
  () =>
    Object.fromEntries(
      guestList.map((g: any) => [
        g.id,
        g.displayName || `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim(),
      ]),
    ),
  [guestList],
);

// Replace the existing FailedPaymentBanner usage with:
<FailedPaymentBanner
  failedPayments={failedPayments}
  houseId={house?.id ?? ''}
  guestNames={guestNames}
/>;
```

Check whether `guestList` is already computed in the component (look for `useAppSelector` for guests near the top of `PaymentDashboard.tsx`). If `guestList` doesn't exist yet, add:

```tsx
const guestList = useAppSelector((s: any) =>
  Array.isArray(s.guests.guests)
    ? s.guests.guests
    : Object.values(s.guests.guests ?? {}),
);
```

- [ ] **Step 6: Run tests and TypeScript check**

```bash
yarn test src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx --no-coverage 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -E "FailedPaymentBanner|PaymentDashboard" | head -15
```

Expected: PASS on tests; no TS errors. Fix any type errors before committing.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Payments/FailedPaymentBanner.tsx \
        src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx \
        src/screens/HouseSettings/PaymentDashboard.tsx
git commit -m "fix(payments): replace broken FailedPaymentBanner CTA with per-payment resolve actions"
```

---

## Self-Review

### Spec Coverage

| Spec requirement                                            | Covered by                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| Admin sees failed payments highlighted on payment dashboard | Existing (FailedPaymentBanner already in PaymentDashboard) |
| Can mark payment resolved with one tap (offline/cash)       | Task 3 — "Mark Resolved" per-row button                    |
| Fix broken "Fix Payment" → SubscriptionHandler navigation   | Task 3 — removed; replaced with inline action              |
| Service function for marking resolved                       | Task 1 — `markPaymentResolvedOffline()`                    |
| React Query mutation + cache invalidation                   | Task 2 — `useMarkPaymentResolved`                          |

### Gaps Intentionally Excluded

- **Stripe PaymentIntent retry**: Not included. Retry-via-Stripe requires the guest to have a valid payment method on file; sober living operators overwhelmingly resolve payment failures by collecting cash. Retry can be added as a future enhancement if operators request it.
- **Guest notification on resolution**: Not included. The guest sees their payment history via `PaymentHistory.tsx`; a push notification is a P3 enhancement.

### Acceptance Criteria

- [ ] Admin opens PaymentDashboard → sees amber "N Failed Payments" banner with per-row guest name, amount, date
- [ ] Admin taps "Mark Resolved" → confirmation Alert → taps "Mark Resolved" → payment disappears from banner on next fetch
- [ ] No "Fix Payment" button navigating to SubscriptionHandler

---

## Execution Options

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute in this session with `superpowers:executing-plans`.

Which approach?
