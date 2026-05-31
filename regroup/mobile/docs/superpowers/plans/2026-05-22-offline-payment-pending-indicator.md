# Offline Payment Pending Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an amber warning indicator when a resident rent payment has been in `status: 'pending'` for more than 24 hours — a sign of a stuck Stripe webhook or network failure. Surfaced in two places: a `StalePendingBanner` in `PaymentDashboard`, and an amber clock icon on rows in `PaymentHistory`. No new Firestore writes — purely a read-only UI change.

**Architecture:** A new `useStalePendingPayments(houseId)` React Query hook filters `listHousePayments` results to pending payments older than 24 hours. A new `StalePendingBanner` component mirrors the structure of `FailedPaymentBanner` but is amber-themed and provides a "Contact Support" mailto CTA. `PaymentHistory.tsx`'s `renderItem` gets an inline stale-pending guard using a shared `STALE_THRESHOLD_MS` constant.

**Tech Stack:** React Native, Cloud Function–backed `listHousePayments`, React Query v5 (TanStack), existing `FailedPaymentBanner` pattern.

---

## Existing Codebase Context

Before touching any file, understand these facts:

- `RentPayment` (in `src/services/payments.ts:14`) has `status: 'pending' | 'succeeded' | 'failed' | 'resolved_offline'` and `createdAt: string` (ISO 8601).
- `listHousePayments(houseId, limit)` (in `src/services/payments.ts:176`) calls the `listHousePayments` Cloud Function and returns `HousePaymentRecord[]`. Both `HousePaymentRecord` and `RentPayment` have `status` and `createdAt` fields — the hook annotates its return as `RentPayment[]` (same cast pattern used in `useFailedPayments`).
- `useFailedPayments` at `src/state/queries/paymentQueries.ts:167` is the direct model for the new hook.
- `paymentKeys.housePayments(houseId)` produces `['payments', 'house', houseId]`.
- `FailedPaymentBanner.tsx` at `src/screens/Payments/FailedPaymentBanner.tsx` is the model for `StalePendingBanner`.
- `PaymentDashboard.tsx` at `src/screens/HouseSettings/PaymentDashboard.tsx` renders `<FailedPaymentBanner>` at line 219 — the new banner goes directly below it.
- `PaymentHistory.tsx` at `src/screens/Payments/PaymentHistory.tsx` uses `PaymentRecord` (CF type, not `RentPayment`) — it has `status` and `createdAt` fields so the stale check logic is the same.
- `color.yellow` is `'#ffbf00'` (amber/gold). Use `'#FFF8E1'` as the amber banner background (lighter amber wash). The amber accent border is `color.yellow`.
- `color`, `normalize`, `fontSize`, `fontFamily`, `CARD_STYLE` are imported from `'../../styles/theme'` (the file extension is `.tsx` on disk but TypeScript resolves it without the extension).
- Theme path from `src/screens/Payments/` is `'../../styles/theme'`.
- Theme path from `src/state/queries/` is not needed (no theme usage there).
- `logException` is at `'../../util/logging'` from `src/screens/Payments/`.
- `toDateSafe` is at `'../../util/firestore'`.
- `format` comes from `'date-fns'`.
- Jest mock pattern: self-contained `jest.mock` factory at the top of each test file. Private mock references use `_mock` prefix on the factory object.
- Test runner: `yarn test <path> --no-coverage`

---

## File Structure

**Modify:**

- `src/state/queries/paymentQueries.ts` — add `useStalePendingPayments` hook after `useFailedPayments`
- `src/state/queries/__tests__/paymentQueries.test.ts` — add `useStalePendingPayments` test block
- `src/screens/HouseSettings/PaymentDashboard.tsx` — import `useStalePendingPayments` + `StalePendingBanner`; add banner below `<FailedPaymentBanner>`
- `src/screens/Payments/PaymentHistory.tsx` — add stale-pending clock icon to `renderItem`

**Create:**

- `src/screens/Payments/StalePendingBanner.tsx`
- `src/screens/Payments/__tests__/StalePendingBanner.test.tsx`

---

## Task 1 — Add `useStalePendingPayments` hook

**File:** `src/state/queries/paymentQueries.ts`

### Step 1.1 — Write the failing test first

Append a new `describe('useStalePendingPayments')` block to `src/state/queries/__tests__/paymentQueries.test.ts` after the existing `useFailedPayments` block.

- [ ] Open `src/state/queries/__tests__/paymentQueries.test.ts`
- [ ] Import `useStalePendingPayments` in the existing import at the top of the file (add it to the named imports from `'../paymentQueries'`)
- [ ] Append this test block before the final closing `});` of the top-level `describe('paymentQueries')`:

```typescript
// ─── useStalePendingPayments ─────────────────────────────────────────────────

describe('useStalePendingPayments', () => {
  const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  const _mockRecentPending: RentPayment = {
    id: 'pay-recent-pending',
    guestId: 'guest-1',
    houseId: 'house-1',
    amount: 60000,
    status: 'pending',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago — NOT stale
    description: 'Rent Payment',
  };

  const _mockStalePending: RentPayment = {
    id: 'pay-stale-pending',
    guestId: 'guest-2',
    houseId: 'house-1',
    amount: 70000,
    status: 'pending',
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago — stale
    description: 'Rent Payment',
  };

  const _mockSucceeded: RentPayment = {
    ...mockPayment,
    id: 'pay-succeeded',
    status: 'succeeded',
  };

  it('returns only pending payments older than 24 hours', async () => {
    (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
      _mockStalePending,
      _mockRecentPending,
      _mockSucceeded,
    ]);

    const { result } = renderHook(() => useStalePendingPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('pay-stale-pending');
  });

  it('returns empty array when all pending payments are recent', async () => {
    (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
      _mockRecentPending,
    ]);

    const { result } = renderHook(() => useStalePendingPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(0);
  });

  it('returns empty array when there are no payments at all', async () => {
    (paymentService.listHousePayments as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(() => useStalePendingPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(0);
  });

  it('does not fetch when houseId is empty', () => {
    const { result } = renderHook(() => useStalePendingPayments(''), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('excludes succeeded and failed payments regardless of age', async () => {
    const _oldSucceeded: RentPayment = {
      ...mockPayment,
      id: 'pay-old-succeeded',
      status: 'succeeded',
      createdAt: new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString(),
    };
    const _oldFailed: RentPayment = {
      ...mockPayment,
      id: 'pay-old-failed',
      status: 'failed',
      createdAt: new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString(),
    };
    (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
      _oldSucceeded,
      _oldFailed,
      _mockStalePending,
    ]);

    const { result } = renderHook(() => useStalePendingPayments('house-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('pay-stale-pending');
  });

  it('uses the correct query key', async () => {
    (paymentService.listHousePayments as jest.Mock).mockResolvedValue([]);

    const { result } = renderHook(() => useStalePendingPayments('house-99'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData([
      ...paymentKeys.housePayments('house-99'),
      'stale-pending',
    ]);
    expect(cached).toEqual([]);
  });
});
```

- [ ] Run `yarn test src/state/queries/__tests__/paymentQueries.test.ts --no-coverage` — confirm the new block **fails** with `useStalePendingPayments is not a function` or similar import error.

### Step 1.2 — Implement `useStalePendingPayments`

- [ ] Open `src/state/queries/paymentQueries.ts`
- [ ] After the `useFailedPayments` export (line 176) and before the `useMarkPaymentResolved` comment block, insert:

```typescript
// ─── Stale Pending Payments ───────────────────────────────────────────────────

/** Payments stuck in `pending` for more than 24 hours — likely a missed webhook. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export const useStalePendingPayments = (houseId: string) =>
  useQuery({
    queryKey: [...paymentKeys.housePayments(houseId), 'stale-pending'],
    queryFn: async (): Promise<RentPayment[]> => {
      const all = await listHousePayments(houseId, 100);
      const cutoff = Date.now() - STALE_THRESHOLD_MS;
      return all.filter(
        p => p.status === 'pending' && new Date(p.createdAt).getTime() < cutoff,
      );
    },
    enabled: !!houseId,
    staleTime: 30_000,
  });
```

- [ ] Run `yarn test src/state/queries/__tests__/paymentQueries.test.ts --no-coverage` — all tests must pass (GREEN).

---

## Task 2 — Create `StalePendingBanner` component

**File:** `src/screens/Payments/StalePendingBanner.tsx`

### Step 2.1 — Write the failing test first

- [ ] Create `src/screens/Payments/__tests__/StalePendingBanner.test.tsx`:

```typescript
// src/screens/Payments/__tests__/StalePendingBanner.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const _mockOpenURL = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: _mockOpenURL,
  canOpenURL: jest.fn().mockResolvedValue(true),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

import { RentPayment } from '../../../services/payments';

const _stalePending: RentPayment = {
  id: 'pay-stale-001',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 75000,
  status: 'pending',
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  description: 'Monthly Rent',
};

const _stalePending2: RentPayment = {
  ..._stalePending,
  id: 'pay-stale-002',
  guestId: 'guest-2',
};

const _guestNames: Record<string, string> = {
  'guest-1': 'Alice Smith',
  'guest-2': 'Bob Jones',
};

import StalePendingBanner from '../StalePendingBanner';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StalePendingBanner', () => {
  it('renders nothing when stalePendingPayments is empty', () => {
    const { queryByTestId } = render(
      <StalePendingBanner stalePendingPayments={[]} guestNames={_guestNames} />,
    );
    expect(queryByTestId('stale-pending-banner')).toBeNull();
  });

  it('renders the banner when there are stale pending payments', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-banner')).toBeTruthy();
  });

  it('renders a row for each stale pending payment', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending, _stalePending2]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-row-pay-stale-001')).toBeTruthy();
    expect(getByTestId('stale-pending-row-pay-stale-002')).toBeTruthy();
  });

  it('shows the singular header for one payment', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('1 Payment Pending 24h+')).toBeTruthy();
  });

  it('shows the plural header for multiple payments', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending, _stalePending2]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('2 Payments Pending 24h+')).toBeTruthy();
  });

  it('shows guest name, formatted amount, and date for each row', () => {
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('Alice Smith')).toBeTruthy();
    expect(getByText(/\$750\.00/)).toBeTruthy();
  });

  it('shows "Unknown Resident" for an unrecognized guestId', () => {
    const unknownPayment: RentPayment = {
      ..._stalePending,
      id: 'pay-stale-unknown',
      guestId: 'guest-unknown',
    };
    const { getByText } = render(
      <StalePendingBanner
        stalePendingPayments={[unknownPayment]}
        guestNames={_guestNames}
      />,
    );
    expect(getByText('Unknown Resident')).toBeTruthy();
  });

  it('renders the "Contact Support" button', () => {
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    expect(getByTestId('stale-pending-contact-support')).toBeTruthy();
  });

  it('calls Linking.openURL with the support mailto when "Contact Support" is pressed', () => {
    const { Linking } = require('react-native');
    const { getByTestId } = render(
      <StalePendingBanner
        stalePendingPayments={[_stalePending]}
        guestNames={_guestNames}
      />,
    );
    fireEvent.press(getByTestId('stale-pending-contact-support'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'mailto:support@regroup-app.com?subject=Stuck%20Pending%20Payment',
    );
  });
});
```

- [ ] Run `yarn test src/screens/Payments/__tests__/StalePendingBanner.test.tsx --no-coverage` — confirm the tests **fail** (file does not exist yet).

### Step 2.2 — Implement `StalePendingBanner`

- [ ] Create `src/screens/Payments/StalePendingBanner.tsx`:

```typescript
// src/screens/Payments/StalePendingBanner.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { format } from 'date-fns';
import { RentPayment } from '../../services/payments';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';
import { toDateSafe } from '../../util/firestore';
import { logException } from '../../util/logging';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORT_EMAIL = 'support@regroup-app.com';
const SUPPORT_MAILTO =
  'mailto:' + SUPPORT_EMAIL + '?subject=Stuck%20Pending%20Payment';

const AMBER_BG = '#FFF8E1';
const AMBER_ROW_BORDER = '#FFE082';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  stalePendingPayments: RentPayment[];
  guestNames: Record<string, string>;
}

interface RowProps {
  payment: RentPayment;
  guestName: string;
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const StalePendingRow: React.FC<RowProps> = ({ payment, guestName }) => {
  const date = toDateSafe(payment.createdAt);
  const dateStr = date ? format(date, 'MMM d') : '';

  return (
    <View style={styles.row} testID={`stale-pending-row-${payment.id}`}>
      <RatsText translate={false} text={guestName} style={styles.guestName} />
      <RatsText
        translate={false}
        text={`$${(payment.amount / 100).toFixed(2)} · ${
          payment.description ?? 'Rent'
        } · ${dateStr}`}
        style={styles.detail}
      />
    </View>
  );
};

// ─── Banner ───────────────────────────────────────────────────────────────────

const StalePendingBanner: React.FC<Props> = ({
  stalePendingPayments,
  guestNames,
}) => {
  if (stalePendingPayments.length === 0) return null;

  const count = stalePendingPayments.length;
  const headerText = `${count} Payment${count > 1 ? 's' : ''} Pending 24h+`;

  const handleContactSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_MAILTO);
    } catch (err) {
      logException(err);
    }
  };

  return (
    <View style={styles.banner} testID="stale-pending-banner">
      <RatsText translate={false} text={headerText} style={styles.header} />
      <RatsText
        translate={false}
        text="These payments have been pending for over 24 hours. This may indicate a missed Stripe webhook."
        style={styles.subtitle}
      />
      {stalePendingPayments.map(p => (
        <StalePendingRow
          key={p.id}
          payment={p}
          guestName={guestNames[p.guestId] ?? 'Unknown Resident'}
        />
      ))}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={handleContactSupport}
        testID="stale-pending-contact-support">
        <RatsText
          translate={false}
          text="Contact Support"
          style={styles.ctaText}
        />
      </TouchableOpacity>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  banner: {
    backgroundColor: AMBER_BG,
    borderLeftWidth: 4,
    borderLeftColor: color.yellow,
    borderRadius: 6,
    marginHorizontal: normalize(16),
    marginBottom: normalize(12),
    padding: normalize(12),
  },
  header: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
  subtitle: {
    fontSize: fontSize.small,
    color: color.grey,
    marginBottom: normalize(8),
  },
  row: {
    paddingVertical: normalize(6),
    borderTopWidth: 1,
    borderTopColor: AMBER_ROW_BORDER,
  },
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
  ctaButton: {
    marginTop: normalize(10),
    alignSelf: 'flex-start',
    backgroundColor: color.yellow,
    borderRadius: 4,
    paddingHorizontal: normalize(12),
    paddingVertical: normalize(6),
  },
  ctaText: {
    fontSize: fontSize.small,
    color: color.white,
    fontWeight: '600',
  },
});

export default StalePendingBanner;
```

- [ ] Run `yarn test src/screens/Payments/__tests__/StalePendingBanner.test.tsx --no-coverage` — all tests must pass (GREEN).

---

## Task 3 — Wire `StalePendingBanner` into `PaymentDashboard`

**File:** `src/screens/HouseSettings/PaymentDashboard.tsx`

### Step 3.1 — Write the failing test additions

> The existing `PaymentDashboard.test.tsx` lives at `src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx`. Read it before editing so you know the existing mock structure.

- [ ] Open `src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx` and read its current mock setup.
- [ ] In the existing `jest.mock('../../state/queries/paymentQueries', ...)` factory, add `useStalePendingPayments: jest.fn(() => ({ data: [] }))` to the mock object.
- [ ] Add two new test cases to the describe block:

```typescript
it('renders StalePendingBanner when there are stale pending payments', () => {
  const {
    useStalePendingPayments,
  } = require('../../state/queries/paymentQueries');
  (useStalePendingPayments as jest.Mock).mockReturnValue({
    data: [
      {
        id: 'pay-stale-1',
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 50000,
        status: 'pending',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        description: 'Rent Payment',
      },
    ],
  });
  // Re-render after mock update
  const { getByTestId } = render(
    <PaymentDashboard navigation={mockNavigation} />,
  );
  expect(getByTestId('stale-pending-banner')).toBeTruthy();
});

it('does not render StalePendingBanner when stalePendingPayments is empty', () => {
  const {
    useStalePendingPayments,
  } = require('../../state/queries/paymentQueries');
  (useStalePendingPayments as jest.Mock).mockReturnValue({ data: [] });
  const { queryByTestId } = render(
    <PaymentDashboard navigation={mockNavigation} />,
  );
  expect(queryByTestId('stale-pending-banner')).toBeNull();
});
```

- [ ] Run `yarn test src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx --no-coverage` — confirm the new tests **fail**.

### Step 3.2 — Implement the changes in `PaymentDashboard`

- [ ] Open `src/screens/HouseSettings/PaymentDashboard.tsx`
- [ ] Add `useStalePendingPayments` to the existing paymentQueries import:

```typescript
import {
  paymentKeys,
  useFailedPayments,
  useStalePendingPayments,
} from '../../state/queries/paymentQueries';
```

- [ ] Add `StalePendingBanner` import after the `FailedPaymentBanner` import:

```typescript
import FailedPaymentBanner from '../Payments/FailedPaymentBanner';
import StalePendingBanner from '../Payments/StalePendingBanner';
```

- [ ] Inside the `PaymentDashboard` component body, add the hook call directly after the `useFailedPayments` line:

```typescript
const { data: failedPayments = [] } = useFailedPayments(house?.id ?? '');
const { data: stalePendingPayments = [] } = useStalePendingPayments(
  house?.id ?? '',
);
```

- [ ] In the JSX return, add `<StalePendingBanner>` directly after `<FailedPaymentBanner>`:

```tsx
        <FailedPaymentBanner
          failedPayments={failedPayments}
          houseId={house?.id ?? ''}
          guestNames={guestNames}
        />
        <StalePendingBanner
          stalePendingPayments={stalePendingPayments}
          guestNames={guestNames}
        />
```

- [ ] Run `yarn test src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx --no-coverage` — all tests must pass (GREEN).

---

## Task 4 — Add stale-pending clock indicator to `PaymentHistory`

**File:** `src/screens/Payments/PaymentHistory.tsx`

`PaymentHistory` uses `PaymentRecord` (CF-backed type), not `RentPayment`. `PaymentRecord` has `status: 'succeeded' | 'pending' | 'failed'` and `createdAt: string` — both are present so the stale check works identically.

### Step 4.1 — Write the failing test additions

> The existing tests for `PaymentHistory` live at `src/screens/Payments/__tests__/ResidentPayment.test.tsx` (covers the older `ResidentPayment` component). There is no dedicated `PaymentHistory.test.tsx`. Create one.

- [ ] Create `src/screens/Payments/__tests__/PaymentHistory.test.tsx`:

```typescript
// src/screens/Payments/__tests__/PaymentHistory.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../../services/payments', () => ({
  listPayments: jest.fn(),
}));

jest.mock('../../../services/reportExport', () => ({
  exportPaymentHistoryCSV: jest.fn(() => 'csv-data'),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

jest.mock('../../../state/store', () => ({
  useAppSelector: jest.fn((selector: any) =>
    selector({
      guests: {
        selectedGuest: {
          id: 'guest-1',
          firstName: 'Alice',
          lastName: 'Smith',
          displayName: 'Alice Smith',
        },
      },
      houses: {
        selectedHouse: { id: 'house-1' },
      },
    }),
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

import { PaymentRecord } from '../../../services/payments';

const _recentPending: PaymentRecord = {
  id: 'pay-recent',
  amount: 50000,
  currency: 'usd',
  status: 'pending',
  description: 'Monthly Rent',
  createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
};

const _stalePending: PaymentRecord = {
  id: 'pay-stale',
  amount: 50000,
  currency: 'usd',
  status: 'pending',
  description: 'Monthly Rent',
  createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
};

const _succeeded: PaymentRecord = {
  id: 'pay-ok',
  amount: 50000,
  currency: 'usd',
  status: 'succeeded',
  description: 'Monthly Rent',
  createdAt: new Date().toISOString(),
};

import * as paymentsService from '../../../services/payments';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockNavigation: any = { navigate: jest.fn(), goBack: jest.fn() };

// ─── Tests ───────────────────────────────────────────────────────────────────

import PaymentHistory from '../PaymentHistory';

describe('PaymentHistory — stale pending indicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows stale-pending clock icon for a payment pending >24h', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _stalePending,
    ]);

    const { findByTestId } = render(
      <PaymentHistory navigation={mockNavigation} />,
    );
    await findByTestId('stale-clock-pay-stale');
  });

  it('does not show stale-pending clock icon for a recent pending payment', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([
      _recentPending,
    ]);

    const { queryByTestId, findByText } = render(
      <PaymentHistory navigation={mockNavigation} />,
    );
    await findByText('Monthly Rent'); // wait for render
    expect(queryByTestId('stale-clock-pay-recent')).toBeNull();
  });

  it('does not show stale-pending clock icon for a succeeded payment', async () => {
    (paymentsService.listPayments as jest.Mock).mockResolvedValue([_succeeded]);

    const { queryByTestId, findByText } = render(
      <PaymentHistory navigation={mockNavigation} />,
    );
    await findByText('Monthly Rent');
    expect(queryByTestId('stale-clock-pay-ok')).toBeNull();
  });
});
```

- [ ] Run `yarn test src/screens/Payments/__tests__/PaymentHistory.test.tsx --no-coverage` — confirm tests **fail** (testIDs don't exist yet).

### Step 4.2 — Implement the stale-pending indicator in `PaymentHistory`

- [ ] Open `src/screens/Payments/PaymentHistory.tsx`
- [ ] Add the threshold constant near the top of the file, after the imports:

```typescript
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
```

- [ ] Update the `renderItem` function to detect stale pending rows and show an amber clock indicator. Replace the existing `renderItem`:

```typescript
const renderItem = ({ item }: { item: PaymentRecord }) => {
  const succeeded = item.status === 'succeeded';
  const isStalePending =
    item.status === 'pending' &&
    Date.now() - new Date(item.createdAt).getTime() > STALE_THRESHOLD_MS;

  return (
    <View
      style={[
        CARD_STYLE,
        styles.paymentCard,
        {
          borderLeftColor: isStalePending
            ? '#F59E0B'
            : succeeded
            ? color.green
            : color.red,
        },
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
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: isStalePending
                    ? '#F59E0B'
                    : succeeded
                    ? color.green
                    : color.red,
                },
              ]}>
              <RatsText
                translate={false}
                text={item.status.toUpperCase()}
                style={styles.statusText}
              />
            </View>
            {isStalePending && (
              <View
                testID={`stale-clock-${item.id}`}
                style={styles.staleClockBadge}>
                <RatsText
                  translate={false}
                  text="⏰ 24h+"
                  style={styles.staleClockText}
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};
```

- [ ] Add the new styles to the `StyleSheet.create` block:

```typescript
  badgeRow: {
    alignItems: 'flex-end',
    marginTop: normalize(4),
  },
  staleClockBadge: {
    marginTop: normalize(4),
    paddingHorizontal: normalize(6),
    paddingVertical: normalize(2),
    borderRadius: normalize(4),
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  staleClockText: {
    fontSize: fontSize.extraSmall,
    color: '#92400E',
  },
```

- [ ] Run `yarn test src/screens/Payments/__tests__/PaymentHistory.test.tsx --no-coverage` — all tests must pass (GREEN).

---

## Task 5 — Full regression pass

- [ ] Run the entire payment-related test suite:

```bash
yarn test src/state/queries/__tests__/paymentQueries.test.ts \
         src/screens/Payments/__tests__/StalePendingBanner.test.tsx \
         src/screens/Payments/__tests__/PaymentHistory.test.tsx \
         src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx \
         --no-coverage
```

All suites must be green before proceeding to commit.

---

## Task 6 — Commit

- [ ] Stage exactly the files changed by this plan:

```bash
git add \
  src/state/queries/paymentQueries.ts \
  src/state/queries/__tests__/paymentQueries.test.ts \
  src/screens/Payments/StalePendingBanner.tsx \
  src/screens/Payments/__tests__/StalePendingBanner.test.tsx \
  src/screens/HouseSettings/PaymentDashboard.tsx \
  src/screens/HouseSettings/__tests__/PaymentDashboard.test.tsx \
  src/screens/Payments/PaymentHistory.tsx \
  src/screens/Payments/__tests__/PaymentHistory.test.tsx
```

- [ ] Commit:

```
feat(payments): add stale pending payment indicator for payments >24h

Adds useStalePendingPayments hook, StalePendingBanner component, and
a clock badge on PaymentHistory rows to surface Stripe webhook delays
before they escalate to disputes. Read-only UI — no Firestore writes.
```

---

## Implementation Notes

### Why `HousePaymentRecord` cast to `RentPayment[]` works

`listHousePayments` returns `HousePaymentRecord[]` (a Cloud Function–backed record), but `useFailedPayments` already annotates its return as `Promise<RentPayment[]>`. Both types share `status`, `createdAt`, `amount`, `guestId`, `id`, and `description`. The cast is intentional — follow the same pattern in `useStalePendingPayments`.

### Why `PaymentHistory` uses its own threshold constant

`PaymentHistory` uses `PaymentRecord` (from `listPayments`, not `listHousePayments`) and does not import from `paymentQueries`. Rather than adding a cross-layer import for a single constant, each file defines `STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000` locally. If this diverges in the future, extract it to `src/util/payments.ts`.

### Why no `PaymentStatusBadge` changes are needed

`PaymentStatusBadge` at `src/screens/RentPayment/PaymentStatusBadge.tsx` already handles `pending` with `color.yellow` and the label `'Pending'` (lines 13 and 20). No change is required.

### Amber color values used

| Purpose                      | Value                                                  |
| ---------------------------- | ------------------------------------------------------ |
| Banner background            | `'#FFF8E1'` (very light amber wash)                    |
| Border accent / badge        | `color.yellow` = `'#ffbf00'`                           |
| Left border on payment cards | `'#F59E0B'` (Tailwind amber-500, matches prompt spec)  |
| Row divider in banner        | `'#FFE082'`                                            |
| Clock badge text             | `'#92400E'` (Tailwind amber-900, readable on light bg) |
| CTA button                   | `color.yellow` = `'#ffbf00'`                           |

### Query key structure

```
useStalePendingPayments('house-1')
  → ['payments', 'house', 'house-1', 'stale-pending']

useFailedPayments('house-1')
  → ['payments', 'house', 'house-1', 'failed']
```

Both are scoped under `paymentKeys.housePayments(houseId)` so a full house-payments invalidation (e.g. on dashboard focus) refreshes them automatically.
