# Payment UX & Reporting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface failed payments to operators with a one-tap path to fix them (P1-2), and let operators export payment history and EES records as CSV (P1-4).

**Architecture:**

- P1-2: A `useFailedPayments` query checks for `status: 'failed'` entries in the `payments` collection for the house. A `FailedPaymentBanner` component renders at the top of `PaymentDashboard`. The "Fix Payment" CTA navigates to the existing `Routes.SubscriptionHandler` WebView pointing at `https://regroup-app.com/my-account` — this satisfies the billing constraint.
- P1-4: Two new export functions in `src/services/reportExport.ts` generate CSV strings. An "Export CSV" button on `PaymentHistory` uses `react-native`'s `Share` API to share the CSV string directly — no file system required.

**Tech Stack:** React Native 0.72, Firebase Firestore, React Query v5, TypeScript, Jest, `Share` from `react-native` (built-in)

**CRITICAL billing constraint:** Any action that collects or retries a payment MUST open the rats-web app in a WebView (or browser). Do NOT call Stripe directly from native code. The `Fix Payment` button MUST navigate to `Routes.SubscriptionHandler` or equivalent WebView.

---

## File Structure

| Action | Path                                                          | Responsibility                                        |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| Modify | `src/state/queries/paymentQueries.ts`                         | Add `useFailedPayments` hook                          |
| Modify | `src/state/queries/__tests__/paymentQueries.test.ts`          | Tests for new hook                                    |
| Create | `src/screens/Payments/FailedPaymentBanner.tsx`                | Banner with "Fix Payment" CTA                         |
| Create | `src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx` | Banner tests                                          |
| Modify | `src/screens/Payments/PaymentDashboard.tsx`                   | Embed FailedPaymentBanner                             |
| Modify | `src/services/reportExport.ts`                                | Add `exportPaymentHistoryCSV` + `exportEESHistoryCSV` |
| Modify | `src/services/__tests__/reportExport.test.ts`                 | CSV export tests                                      |
| Modify | `src/screens/Payments/PaymentHistory.tsx`                     | Add "Export CSV" button                               |

---

## Part A — Payment Failure Recovery UI (P1-2)

### Task 1: Add useFailedPayments Query Hook

**Files:**

- Modify: `src/state/queries/__tests__/paymentQueries.test.ts`
- Modify: `src/state/queries/paymentQueries.ts`

- [ ] **Step 1: Write failing tests**

Add to the existing `src/state/queries/__tests__/paymentQueries.test.ts` file:

```typescript
// Add this import at top (merge with existing imports)
import { useFailedPayments, paymentKeys } from '../paymentQueries';

describe('useFailedPayments', () => {
  it('fetches failed payments for a house', async () => {
    const failedPayment = {
      id: 'pay-1',
      guestId: 'guest-1',
      houseId: 'house-1',
      amount: 500,
      status: 'failed',
      createdAt: new Date().toISOString(),
    };
    mockedListHousePayments.mockResolvedValue([failedPayment]);

    const { result } = renderHook(() => useFailedPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].status).toBe('failed');
  });

  it('returns empty array when no failed payments', async () => {
    mockedListHousePayments.mockResolvedValue([]);
    const { result } = renderHook(() => useFailedPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it('does not fetch when houseId is empty', () => {
    const { result } = renderHook(() => useFailedPayments(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
```

> **Note:** Check the existing test file for how `mockedListHousePayments` and the `wrapper` are defined. Add `mockedListHousePayments` to the import mock if needed. The `listHousePayments` function is in `src/services/payments.ts`.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="paymentQueries" --no-coverage
```

Expected: FAIL — "useFailedPayments is not exported"

- [ ] **Step 3: Add hook to paymentQueries.ts**

In `src/state/queries/paymentQueries.ts`, add after the existing `useGuestBalances` hook:

```typescript
import { listHousePayments, RentPayment } from '../../services/payments';

export const useFailedPayments = (houseId: string) =>
  useQuery({
    queryKey: [...paymentKeys.housePayments(houseId), 'failed'],
    queryFn: async (): Promise<RentPayment[]> => {
      const all = await listHousePayments(houseId, 100);
      return all.filter(p => p.status === 'failed');
    },
    enabled: !!houseId,
    staleTime: 30_000,
  });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="paymentQueries" --no-coverage
```

Expected: All PASS (existing + 3 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/state/queries/paymentQueries.ts src/state/queries/__tests__/paymentQueries.test.ts
git commit -m "feat(payments): add useFailedPayments React Query hook"
```

---

### Task 2: Build FailedPaymentBanner

**Files:**

- Create: `src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx`
- Create: `src/screens/Payments/FailedPaymentBanner.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FailedPaymentBanner from '../FailedPaymentBanner';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const fakeFailedPayment = {
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 500,
  status: 'failed' as const,
  description: 'Rent Payment',
  createdAt: '2026-05-01T00:00:00.000Z',
};

it('renders nothing when there are no failed payments', () => {
  const { queryByTestId } = render(
    <FailedPaymentBanner failedPayments={[]} userId="user-1" />,
  );
  expect(queryByTestId('failed-payment-banner')).toBeNull();
});

it('renders banner when failed payments exist', () => {
  const { getByTestId, getByText } = render(
    <FailedPaymentBanner
      failedPayments={[fakeFailedPayment]}
      userId="user-1"
    />,
  );
  expect(getByTestId('failed-payment-banner')).toBeTruthy();
  expect(getByText(/payment failed/i)).toBeTruthy();
});

it('shows count when multiple payments failed', () => {
  const two = [fakeFailedPayment, { ...fakeFailedPayment, id: 'pay-2' }];
  const { getByText } = render(
    <FailedPaymentBanner failedPayments={two} userId="user-1" />,
  );
  expect(getByText(/2 payment/i)).toBeTruthy();
});

it('navigates to SubscriptionHandler on "Fix Payment" press', () => {
  const { getByTestId } = render(
    <FailedPaymentBanner
      failedPayments={[fakeFailedPayment]}
      userId="user-1"
    />,
  );
  fireEvent.press(getByTestId('fix-payment-button'));
  expect(mockNavigate).toHaveBeenCalledWith('subscriptionHandler');
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="FailedPaymentBanner" --no-coverage
```

Expected: FAIL — "Cannot find module '../FailedPaymentBanner'"

- [ ] **Step 3: Implement FailedPaymentBanner**

```typescript
// src/screens/Payments/FailedPaymentBanner.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Routes } from '../../navigation/types';
import { RentPayment } from '../../services/payments';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';

interface Props {
  failedPayments: RentPayment[];
  userId: string;
}

const FailedPaymentBanner: React.FC<Props> = ({ failedPayments }) => {
  const navigation = useNavigation<any>();

  if (failedPayments.length === 0) return null;

  const count = failedPayments.length;
  const label =
    count === 1
      ? '1 payment failed — tap to resolve'
      : `${count} payments failed — tap to resolve`;

  return (
    <View style={styles.banner} testID="failed-payment-banner">
      <View style={styles.textCol}>
        <RatsText
          translate={false}
          text="Payment Failed"
          style={styles.title}
        />
        <RatsText translate={false} text={label} style={styles.body} />
      </View>
      <TouchableOpacity
        style={styles.fixButton}
        onPress={() => navigation.navigate(Routes.SubscriptionHandler)}
        testID="fix-payment-button">
        <RatsText
          translate={false}
          text="Fix Payment"
          style={styles.fixLabel}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: color.red,
    paddingHorizontal: normalize(16),
    paddingVertical: normalize(12),
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    borderRadius: 6,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(2),
  },
  body: { fontSize: fontSize.small, color: color.grey },
  fixButton: {
    backgroundColor: color.red,
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(8),
    borderRadius: 6,
    marginLeft: normalize(12),
  },
  fixLabel: { fontSize: fontSize.small, color: color.white, fontWeight: '600' },
});

export default FailedPaymentBanner;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="FailedPaymentBanner" --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/screens/Payments/FailedPaymentBanner.tsx src/screens/Payments/__tests__/FailedPaymentBanner.test.tsx
git commit -m "feat(payments): add FailedPaymentBanner with WebView billing CTA"
```

---

### Task 3: Wire Banner into PaymentDashboard

**Files:**

- Modify: `src/screens/Payments/PaymentDashboard.tsx`

- [ ] **Step 1: Add the banner to PaymentDashboard**

In `src/screens/Payments/PaymentDashboard.tsx`, add:

```typescript
// Imports to add
import FailedPaymentBanner from './FailedPaymentBanner';
import { useFailedPayments } from '../../state/queries/paymentQueries';
import { useData } from '../../context/DataContext';

// Inside the component body, after existing hook calls
const { house, user } = useData();
const { data: failedPayments = [] } = useFailedPayments(house?.id ?? '');

// In JSX — add as the first child of the screen's ScrollView or container
<FailedPaymentBanner failedPayments={failedPayments} userId={user?.id ?? ''} />;
```

> **Note:** Check PaymentDashboard.tsx for the exact container structure (ScrollView vs View) and where the leading content begins. The banner should appear at the very top, above the balance summary cards.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/screens/Payments/PaymentDashboard.tsx
git commit -m "feat(payments): embed FailedPaymentBanner in PaymentDashboard"
```

---

## Part B — CSV Export (P1-4)

### Task 4: Add CSV Export Functions to reportExport.ts

**Files:**

- Modify: `src/services/__tests__/reportExport.test.ts` (create if it doesn't exist)
- Modify: `src/services/reportExport.ts`

- [ ] **Step 1: Write failing tests**

Create or append to `src/services/__tests__/reportExport.test.ts`:

```typescript
import { exportPaymentHistoryCSV } from '../reportExport';
import { RentPayment } from '../payments';

const makePayment = (overrides: Partial<RentPayment> = {}): RentPayment => ({
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 500,
  status: 'succeeded',
  description: 'Rent Payment',
  createdAt: '2026-05-01T10:00:00.000Z',
  ...overrides,
});

describe('exportPaymentHistoryCSV', () => {
  it('returns a CSV string with header row', () => {
    const csv = exportPaymentHistoryCSV([makePayment()], {});
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Date');
    expect(lines[0]).toContain('Guest');
    expect(lines[0]).toContain('Amount');
    expect(lines[0]).toContain('Status');
  });

  it('formats each payment as a data row', () => {
    const guestNames: Record<string, string> = { 'guest-1': 'Jane Smith' };
    const csv = exportPaymentHistoryCSV([makePayment()], guestNames);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('Jane Smith');
    expect(lines[1]).toContain('500');
    expect(lines[1]).toContain('succeeded');
  });

  it('handles unknown guest IDs gracefully', () => {
    const csv = exportPaymentHistoryCSV([makePayment()], {});
    expect(csv).toContain('guest-1');
  });

  it('returns only the header when given an empty array', () => {
    const csv = exportPaymentHistoryCSV([], {});
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="reportExport" --no-coverage
```

Expected: FAIL — "exportPaymentHistoryCSV is not a function" (or no test file found)

- [ ] **Step 3: Implement CSV export functions in reportExport.ts**

In `src/services/reportExport.ts`, append after the existing `exportWeeklyReportPDF` function:

```typescript
import { RentPayment } from './payments';
import { format, parseISO } from 'date-fns';

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates a CSV string for a payment history export.
 * guestNames maps guestId → display name for the name column.
 */
export function exportPaymentHistoryCSV(
  payments: RentPayment[],
  guestNames: Record<string, string>,
): string {
  const header = ['Date', 'Guest', 'Amount ($)', 'Status', 'Description'].join(
    ',',
  );
  const rows = payments.map(p => {
    const date = p.createdAt
      ? format(parseISO(p.createdAt as string), 'yyyy-MM-dd')
      : '';
    const guest = escapeCsvField(guestNames[p.guestId] ?? p.guestId);
    const amount = String(p.amount ?? '');
    const status = escapeCsvField(p.status);
    const description = escapeCsvField(p.description ?? '');
    return [date, guest, amount, status, description].join(',');
  });
  return [header, ...rows].join('\n');
}

export interface EESRecord {
  id: string;
  guestId: string;
  type: string;
  amount: number;
  date: string;
  notes?: string;
}

/**
 * Generates a CSV string for an EES (Emergency Expense Sharing) export.
 */
export function exportEESHistoryCSV(
  records: EESRecord[],
  guestNames: Record<string, string>,
): string {
  const header = ['Date', 'Guest', 'Type', 'Amount ($)', 'Notes'].join(',');
  const rows = records.map(r => {
    const date = r.date ? format(parseISO(r.date), 'yyyy-MM-dd') : '';
    const guest = escapeCsvField(guestNames[r.guestId] ?? r.guestId);
    const type = escapeCsvField(r.type);
    const amount = String(r.amount ?? '');
    const notes = escapeCsvField(r.notes ?? '');
    return [date, guest, type, amount, notes].join(',');
  });
  return [header, ...rows].join('\n');
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="reportExport" --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/reportExport.ts src/services/__tests__/reportExport.test.ts
git commit -m "feat(export): add exportPaymentHistoryCSV and exportEESHistoryCSV to reportExport"
```

---

### Task 5: Add Export Button to PaymentHistory Screen

**Files:**

- Modify: `src/screens/Payments/PaymentHistory.tsx`

- [ ] **Step 1: Add export handler**

In `src/screens/Payments/PaymentHistory.tsx`, add:

```typescript
// Imports
import { Share } from 'react-native';
import { exportPaymentHistoryCSV } from '../../services/reportExport';
import { logException } from '../../util/logging';

// Inside the component, after payments data is available
const handleExportCSV = async () => {
  try {
    // Build a guestId → name map from the loaded payments or guest list
    const guestNames: Record<string, string> = {};
    (payments ?? []).forEach(p => {
      // If your payment records include guestName or you have a guest list, populate here
      // Fall back to guestId if name is unavailable
      guestNames[p.guestId] = guestNames[p.guestId] ?? p.guestId;
    });

    const csv = exportPaymentHistoryCSV(payments ?? [], guestNames);
    await Share.share({
      message: csv,
      title: 'Payment History Export',
    });
  } catch (error) {
    logException(error);
  }
};
```

- [ ] **Step 2: Add export button to JSX**

In the header or top of the screen content (following existing button patterns):

```typescript
<RatsButton
  title="Export CSV"
  onPress={handleExportCSV}
  light
  containerStyle={styles.exportButton}
  testID="export-csv-button"
/>
```

> **Note:** Check PaymentHistory.tsx for the exact data variable name holding the loaded payments (it may be `payments`, `data`, or similar from a React Query hook call). Also check whether guest names are available in the payment records or need to be looked up from the guest list. Adjust `guestNames` population accordingly.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Run the payment screen tests**

```bash
npm test -- --testPathPattern="PaymentHistory" --no-coverage
```

Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/screens/Payments/PaymentHistory.tsx
git commit -m "feat(export): add Export CSV button to PaymentHistory screen"
```

---

### Task 6: Full Suite + Smoke Test

- [ ] **Step 1: Run all unit tests**

```bash
npm test -- --no-coverage
```

Expected: All PASS

- [ ] **Step 2: TypeScript**

```bash
npx tsc --noEmit
```

Expected: Clean

- [ ] **Step 3: Manual smoke test**

```
1. Launch on simulator: npm run ios
2. Log in as admin with a house that has payments
3. Navigate to Payments tab → PaymentDashboard
4. Seed a payment with status: 'failed' in Firestore emulator for this house
5. Verify FailedPaymentBanner appears at top with count and "Fix Payment" button
6. Tap "Fix Payment" → should open the SubscriptionHandler WebView
7. Navigate to Payment History
8. Tap "Export CSV" → Share sheet should appear with CSV content
9. Verify CSV has header row: Date, Guest, Amount, Status, Description
```

---

### Acceptance Criteria

**P1-2 (Payment Failure Recovery):**

- [ ] `PaymentDashboard` shows `FailedPaymentBanner` when any payment has `status: 'failed'`
- [ ] Banner is hidden when all payments are `succeeded` or `pending`
- [ ] Banner shows count: "1 payment failed" or "N payments failed"
- [ ] "Fix Payment" button navigates to `Routes.SubscriptionHandler` (rats-web WebView) — no native Stripe call
- [ ] Banner re-queries on 30-second stale interval

**P1-4 (CSV Export):**

- [ ] `exportPaymentHistoryCSV` produces valid CSV with correct header
- [ ] Each payment appears as one row with date, guest, amount, status, description
- [ ] Fields containing commas or quotes are properly escaped
- [ ] Empty array produces header-only CSV (no crash)
- [ ] "Export CSV" button on PaymentHistory opens Share sheet with CSV content
- [ ] All new tests pass; no regressions
