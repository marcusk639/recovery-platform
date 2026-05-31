# Guest Lifecycle & Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the guest lifecycle with a formal discharge flow (P1-1), per-resident balance aging in the existing BalanceDashboard (P1-3), and bulk CSV guest import (P1-5).

**Architecture:** Three loosely-coupled features in the guest domain. Each is independently shippable. Discharge adds a new `GuestStatus` value and a modal. Balance aging augments the existing `BalanceDashboard` screen. Bulk import is a new screen with CSV parsing and batch Firestore writes.

**Tech Stack:** React Native 0.72, Firebase Firestore (batch writes), React Query v5, TypeScript, Jest, `react-native-document-picker` for file selection, `date-fns` for date math.

**Billing constraint:** Not applicable to this plan — no payment collection. If discharge ever triggers a balance settlement, that action must route through the rats-web WebView, not native Stripe.

---

## File Structure

| Action | Path                                                               | Responsibility                                  |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------- |
| Modify | `src/entities/Guest.tsx`                                           | Add `'discharged' \| 'archived'` to GuestStatus |
| Modify | `src/services/guest.tsx`                                           | Add `dischargeGuest` function                   |
| Modify | `src/services/__tests__/guest.test.ts`                             | Tests for dischargeGuest                        |
| Create | `src/screens/GuestOverview/DischargeGuestModal.tsx`                | Confirm + set discharge date modal              |
| Create | `src/screens/GuestOverview/__tests__/DischargeGuestModal.test.tsx` | Modal tests                                     |
| Modify | `src/screens/GuestOverview/GuestHome.tsx`                          | Add "Discharge Resident" action (admin-only)    |
| Create | `src/screens/BalanceDashboard/BalanceAgingView.tsx`                | Per-guest aging rows                            |
| Create | `src/screens/BalanceDashboard/__tests__/BalanceAgingView.test.tsx` | View tests                                      |
| Modify | `src/screens/BalanceDashboard/BalanceDashboard.tsx`                | Embed BalanceAgingView                          |
| Create | `src/services/guestImport.ts`                                      | CSV parse + batch Firestore write               |
| Create | `src/services/__tests__/guestImport.test.ts`                       | Import service tests                            |
| Create | `src/screens/GuestImport/GuestImportScreen.tsx`                    | File picker + import UI                         |
| Create | `src/screens/GuestImport/__tests__/GuestImportScreen.test.tsx`     | Screen tests                                    |
| Modify | `src/navigation/types.ts`                                          | Add `GuestImport` route                         |
| Modify | `src/navigation/navigators.tsx`                                    | Register GuestImportScreen                      |

---

## Part A — Guest Discharge (P1-1)

### Task 1: Extend GuestStatus Type

**Files:**

- Modify: `src/entities/Guest.tsx`

- [ ] **Step 1: Update GuestStatus**

In `src/entities/Guest.tsx`, change line 7:

```typescript
// Before
export type GuestStatus = 'active' | 'inactive' | 'expelled';

// After
export type GuestStatus =
  | 'active'
  | 'inactive'
  | 'expelled'
  | 'discharged'
  | 'archived';
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npm test -- --testPathPattern="Guest|guest" --no-coverage
```

Expected: All existing guest tests still PASS (the union type is additive, no breakage)

- [ ] **Step 3: Commit**

```bash
git add src/entities/Guest.tsx
git commit -m "feat(guest): add discharged and archived to GuestStatus"
```

---

### Task 2: Add dischargeGuest Service Function

**Files:**

- Modify: `src/services/__tests__/guest.test.ts`
- Modify: `src/services/guest.tsx`

- [ ] **Step 1: Write failing test**

Add to the existing `src/services/__tests__/guest.test.ts` file (inside a new `describe` block at the end):

```typescript
describe('dischargeGuest', () => {
  it('sets status to discharged and records moveOutDate', async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    // The mock for guestCollection.doc().update already exists in the file setup
    // Verify it is called with the right fields
    await dischargeGuest('guest-1', '2026-05-20', 'admin-note');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'discharged',
        moveOutDate: '2026-05-20',
      }),
    );
  });

  it('throws a user-friendly error when Firestore fails', async () => {
    mockUpdate.mockRejectedValue(new Error('network'));
    await expect(dischargeGuest('guest-1', '2026-05-20')).rejects.toThrow(
      'Failed to discharge resident',
    );
  });
});
```

> **Note:** Check the existing `guest.test.ts` mock setup to confirm the exact variable names for `mockUpdate` and `mockDoc` before adding. Match the file's existing mock pattern.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="services/__tests__/guest" --no-coverage
```

Expected: FAIL — "dischargeGuest is not a function"

- [ ] **Step 3: Implement dischargeGuest in guest.tsx**

In `src/services/guest.tsx`, add the function after the existing `updateGuest` function:

```typescript
export async function dischargeGuest(
  guestId: string,
  moveOutDate: string,
  notes?: string,
): Promise<void> {
  try {
    await guestCollection.doc(guestId).update({
      status: 'discharged' as GuestStatus,
      moveOutDate,
      ...(notes ? { intakeNotes: notes } : {}),
      lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to discharge resident. Please try again.');
  }
}
```

Also add the import at top of guest.tsx if not already present:

```typescript
import { GuestStatus } from '../entities/Guest';
import FirebaseFirestore from '@react-native-firebase/firestore';
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="services/__tests__/guest" --no-coverage
```

Expected: PASS (all existing + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/guest.tsx src/services/__tests__/guest.test.ts
git commit -m "feat(guest): add dischargeGuest service function"
```

---

### Task 3: Build DischargeGuestModal

**Files:**

- Create: `src/screens/GuestOverview/__tests__/DischargeGuestModal.test.tsx`
- Create: `src/screens/GuestOverview/DischargeGuestModal.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/screens/GuestOverview/__tests__/DischargeGuestModal.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DischargeGuestModal from '../DischargeGuestModal';
import * as guestService from '../../../services/guest';

jest.mock('../../../services/guest');
const mockedDischarge = guestService.dischargeGuest as jest.MockedFunction<
  typeof guestService.dischargeGuest
>;

const mockOnClose = jest.fn();
const mockOnSuccess = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockedDischarge.mockResolvedValue(undefined);
});

it('renders guest name in the confirmation prompt', () => {
  const { getByText } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  expect(getByText(/Jane Smith/)).toBeTruthy();
});

it('calls dischargeGuest with guestId and selected date on confirm', async () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('confirm-discharge-button'));
  await waitFor(() =>
    expect(mockedDischarge).toHaveBeenCalledWith(
      'guest-1',
      expect.any(String),
      undefined,
    ),
  );
  expect(mockOnSuccess).toHaveBeenCalled();
});

it('calls onClose when Cancel pressed', () => {
  const { getByTestId } = render(
    <DischargeGuestModal
      visible
      guestId="guest-1"
      guestName="Jane Smith"
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
    />,
  );
  fireEvent.press(getByTestId('cancel-discharge-button'));
  expect(mockOnClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="DischargeGuestModal" --no-coverage
```

Expected: FAIL — "Cannot find module '../DischargeGuestModal'"

- [ ] **Step 3: Implement DischargeGuestModal**

```typescript
// src/screens/GuestOverview/DischargeGuestModal.tsx
import React, { useState } from 'react';
import { View, Modal, StyleSheet, TextInput } from 'react-native';
import { format } from 'date-fns';
import { dischargeGuest } from '../../services/guest';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import { color, normalize, fontSize } from '../../styles/theme';
import { logException } from '../../util/logging';

interface Props {
  visible: boolean;
  guestId: string;
  guestName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DischargeGuestModal: React.FC<Props> = ({
  visible,
  guestId,
  guestName,
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const moveOutDate = format(new Date(), 'yyyy-MM-dd');

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await dischargeGuest(guestId, moveOutDate, notes || undefined);
      onSuccess();
    } catch (error) {
      logException(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <RatsText
            translate={false}
            text="Discharge Resident"
            style={styles.title}
          />
          <RatsText
            translate={false}
            text={`This will mark ${guestName} as discharged with a move-out date of ${format(
              new Date(),
              'MMMM d, yyyy',
            )}.`}
            style={styles.body}
          />
          <TextInput
            style={styles.input}
            placeholder="Discharge notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <View style={styles.actions}>
            <RatsButton
              title="Confirm Discharge"
              onPress={handleConfirm}
              loading={loading}
              containerStyle={styles.confirmBtn}
              testID="confirm-discharge-button"
            />
            <RatsButton
              title="Cancel"
              onPress={onClose}
              light
              containerStyle={styles.cancelBtn}
              testID="cancel-discharge-button"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: normalize(24),
  },
  dialog: {
    backgroundColor: color.white,
    borderRadius: 12,
    padding: normalize(24),
    width: '100%',
  },
  title: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(12),
  },
  body: {
    fontSize: fontSize.regular,
    color: color.grey,
    marginBottom: normalize(16),
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: color.light_grey,
    borderRadius: 8,
    padding: normalize(12),
    minHeight: normalize(64),
    fontSize: fontSize.regular,
    marginBottom: normalize(16),
  },
  actions: { gap: normalize(8) },
  confirmBtn: { backgroundColor: color.red },
  cancelBtn: {},
});

export default DischargeGuestModal;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="DischargeGuestModal" --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Wire modal into GuestHome**

In `src/screens/GuestOverview/GuestHome.tsx` (or wherever the admin action buttons are), add:

```typescript
// Import
import DischargeGuestModal from './DischargeGuestModal';

// State
const [showDischarge, setShowDischarge] = useState(false);

// JSX — add alongside other admin-only actions
{
  isAdmin && (
    <RatsButton
      title="Discharge Resident"
      onPress={() => setShowDischarge(true)}
      light
      testID="discharge-resident-button"
    />
  );
}
<DischargeGuestModal
  visible={showDischarge}
  guestId={guest?.id ?? ''}
  guestName={guest?.displayName ?? ''}
  onClose={() => setShowDischarge(false)}
  onSuccess={() => {
    setShowDischarge(false);
    navigation.goBack();
  }}
/>;
```

> **Note:** Check GuestHome.tsx for how `isAdmin` is derived (typically from `useData()`) and match the existing button pattern.

- [ ] **Step 6: Run full guest tests**

```bash
npm test -- --testPathPattern="GuestOverview|GuestHome|DischargeGuest" --no-coverage
```

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/GuestOverview/DischargeGuestModal.tsx src/screens/GuestOverview/__tests__/DischargeGuestModal.test.tsx src/screens/GuestOverview/GuestHome.tsx
git commit -m "feat(guest): add discharge modal and admin action in GuestHome"
```

---

## Part B — Balance Aging View (P1-3)

### Task 4: Build BalanceAgingView Component

**Files:**

- Create: `src/screens/BalanceDashboard/__tests__/BalanceAgingView.test.tsx`
- Create: `src/screens/BalanceDashboard/BalanceAgingView.tsx`
- Modify: `src/screens/BalanceDashboard/BalanceDashboard.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/screens/BalanceDashboard/__tests__/BalanceAgingView.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import BalanceAgingView from '../BalanceAgingView';

const makeRow = (
  name: string,
  balance: number,
  lastPaymentDate: string | null,
) => ({
  guestId: `guest-${name}`,
  guestName: name,
  totalOwed: balance,
  lastPaymentDate,
});

it('shows guest name and balance for each row', () => {
  const rows = [makeRow('Alice', 500, '2026-04-01')];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText('Alice')).toBeTruthy();
  expect(getByText('$500')).toBeTruthy();
});

it('shows "No payment" label when lastPaymentDate is null', () => {
  const rows = [makeRow('Bob', 200, null)];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/No payment/i)).toBeTruthy();
});

it('shows overdue days based on last payment date', () => {
  // Bob last paid 45 days ago
  const fortyFiveDaysAgo = new Date();
  fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
  const rows = [makeRow('Bob', 200, fortyFiveDaysAgo.toISOString())];
  const { getByText } = render(<BalanceAgingView rows={rows} />);
  expect(getByText(/45 days/)).toBeTruthy();
});

it('renders empty state when no rows', () => {
  const { getByText } = render(<BalanceAgingView rows={[]} />);
  expect(getByText(/All balances current/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="BalanceAgingView" --no-coverage
```

Expected: FAIL — "Cannot find module '../BalanceAgingView'"

- [ ] **Step 3: Implement BalanceAgingView**

```typescript
// src/screens/BalanceDashboard/BalanceAgingView.tsx
import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { differenceInDays, parseISO } from 'date-fns';
import { RatsText } from '../../components/rats-text';
import { color, normalize, fontSize } from '../../styles/theme';

export interface AgingRow {
  guestId: string;
  guestName: string;
  totalOwed: number;
  lastPaymentDate: string | null;
}

interface Props {
  rows: AgingRow[];
}

function getDaysOverdue(lastPaymentDate: string | null): number | null {
  if (!lastPaymentDate) return null;
  return differenceInDays(new Date(), parseISO(lastPaymentDate));
}

function agingColor(days: number | null): string {
  if (days === null) return color.red;
  if (days > 30) return color.red;
  if (days > 14) return color.orange ?? '#FF8C00';
  return color.dark_grey;
}

const BalanceAgingView: React.FC<Props> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <RatsText
          translate={false}
          text="All balances current"
          style={styles.emptyText}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      scrollEnabled={false}
      keyExtractor={item => item.guestId}
      renderItem={({ item }) => {
        const days = getDaysOverdue(item.lastPaymentDate);
        const labelText =
          days === null
            ? 'No payment on record'
            : `${days} days since last payment`;
        return (
          <View style={styles.row}>
            <View style={styles.nameCol}>
              <RatsText
                translate={false}
                text={item.guestName}
                style={styles.name}
              />
              <RatsText
                translate={false}
                text={labelText}
                style={[styles.aging, { color: agingColor(days) }]}
              />
            </View>
            <RatsText
              translate={false}
              text={`$${item.totalOwed}`}
              style={[styles.balance, { color: agingColor(days) }]}
            />
          </View>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  nameCol: { flex: 1 },
  name: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontWeight: '600',
  },
  aging: { fontSize: fontSize.small, marginTop: normalize(2) },
  balance: {
    fontSize: fontSize.regular,
    fontWeight: '700',
    minWidth: normalize(60),
    textAlign: 'right',
  },
  empty: { padding: normalize(24), alignItems: 'center' },
  emptyText: { fontSize: fontSize.regular, color: color.grey },
});

export default BalanceAgingView;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="BalanceAgingView" --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Embed BalanceAgingView in BalanceDashboard**

In `src/screens/BalanceDashboard/BalanceDashboard.tsx`, import and add the component below the existing summary cards. The data source is the existing `useGuestBalances` hook (from `paymentQueries.ts`) which returns `{ guestName, totalPaid, lastPaymentDate }` per guest. Map that to `AgingRow`:

```typescript
import BalanceAgingView, { AgingRow } from './BalanceAgingView';

// Inside the component, after the existing balance data fetch
const agingRows: AgingRow[] = (guestBalances ?? [])
  .filter(g => g.totalOwed > 0)
  .map(g => ({
    guestId: g.guestId,
    guestName: g.guestName,
    totalOwed: g.totalOwed,
    lastPaymentDate: g.lastPaymentDate,
  }));

// In JSX, below the existing summary section
<RatsText translate={false} text="Outstanding Balances" style={styles.sectionHeader} />
<BalanceAgingView rows={agingRows} />
```

> **Note:** Check BalanceDashboard.tsx to confirm the exact hook name and data shape. The `useGuestBalances` hook is defined in `src/state/queries/paymentQueries.ts` around line 100. The return shape has `guestId`, `guestName`, `totalOwed`, `lastPaymentDate`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/BalanceDashboard/BalanceAgingView.tsx src/screens/BalanceDashboard/__tests__/BalanceAgingView.test.tsx src/screens/BalanceDashboard/BalanceDashboard.tsx
git commit -m "feat(payments): add per-guest balance aging view to BalanceDashboard"
```

---

## Part C — Bulk Guest Import via CSV (P1-5)

### Task 5: Write Guest Import Service

**Files:**

- Create: `src/services/__tests__/guestImport.test.ts`
- Create: `src/services/guestImport.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/services/__tests__/guestImport.test.ts
import {
  parseGuestCsv,
  importGuestsFromRows,
  GuestImportRow,
} from '../guestImport';

describe('parseGuestCsv', () => {
  it('parses a valid CSV string into import rows', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      'Jane,Smith,jane@example.com,2025-01-15,Alcohol',
      'Bob,Jones,bob@example.com,2024-06-01,Opioids',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      sobrietyDate: '2025-01-15',
      drugOfChoice: 'Alcohol',
    });
  });

  it('skips rows missing required fields', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      ',Smith,jane@example.com,2025-01-15,Alcohol', // missing firstName
      'Bob,Jones,bad-email,2024-06-01,Opioids', // invalid email
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows).toHaveLength(0);
  });

  it('trims whitespace from values', () => {
    const csv = [
      'firstName,lastName,email,sobrietyDate,drugOfChoice',
      ' Jane , Smith , jane@example.com , 2025-01-15 , Alcohol ',
    ].join('\n');

    const rows = parseGuestCsv(csv);
    expect(rows[0].firstName).toBe('Jane');
    expect(rows[0].email).toBe('jane@example.com');
  });
});

describe('importGuestsFromRows', () => {
  const mockBatch = {
    set: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  const mockDoc = jest.fn(() => ({ id: 'new-guest-id' }));

  jest.mock('../../firebase-setup', () => ({
    firestore: {
      batch: jest.fn(() => mockBatch),
      collection: jest.fn(() => ({ doc: mockDoc })),
    },
  }));

  it('returns count of guests imported', async () => {
    const rows: GuestImportRow[] = [
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        sobrietyDate: '2025-01-15',
        drugOfChoice: 'Alcohol',
      },
    ];
    const count = await importGuestsFromRows('house-1', rows);
    expect(count).toBe(1);
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('returns 0 when given empty rows', async () => {
    const count = await importGuestsFromRows('house-1', []);
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="guestImport" --no-coverage
```

Expected: FAIL — "Cannot find module '../guestImport'"

- [ ] **Step 3: Implement guestImport service**

```typescript
// src/services/guestImport.ts
import { firestore } from '../../firebase-setup';
import FirebaseFirestore from '@react-native-firebase/firestore';
import { guestCollection } from './guest';
import { createGuestId } from './guest';
import { logException } from '../util/logging';

export interface GuestImportRow {
  firstName: string;
  lastName: string;
  email: string;
  sobrietyDate: string;
  drugOfChoice: string;
  phoneNumber?: string;
  moveInDate?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'sobrietyDate',
  'drugOfChoice',
];

export function parseGuestCsv(csvText: string): GuestImportRow[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingHeaders.join(', ')}`,
    );
  }

  const rows: GuestImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] ?? '';
    });

    const {
      firstName,
      lastName,
      email,
      sobrietyDate,
      drugOfChoice,
      phoneNumber,
      moveInDate,
    } = record;
    if (!firstName || !lastName || !email || !sobrietyDate || !drugOfChoice)
      continue;
    if (!EMAIL_REGEX.test(email)) continue;

    rows.push({
      firstName,
      lastName,
      email,
      sobrietyDate,
      drugOfChoice,
      phoneNumber,
      moveInDate,
    });
  }
  return rows;
}

export async function importGuestsFromRows(
  houseId: string,
  rows: GuestImportRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const BATCH_LIMIT = 499;
  let imported = 0;

  try {
    for (let start = 0; start < rows.length; start += BATCH_LIMIT) {
      const batch = firestore.batch();
      const slice = rows.slice(start, start + BATCH_LIMIT);
      for (const row of slice) {
        const docRef = guestCollection.doc(createGuestId());
        batch.set(docRef, {
          ...row,
          id: docRef.id,
          houseId,
          displayName: `${row.firstName} ${row.lastName}`,
          status: 'active',
          isAdmin: false,
          infoEntered: false,
          hasJob: false,
          rentOwed: 0,
          choreFees: 0,
          dailyHabit: 0,
          supporters: [],
          jobs: [],
          version: 0,
          phase: 'default',
          step: 1,
          createdDate: new Date().toISOString(),
          lastUpdated: FirebaseFirestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
      imported += slice.length;
    }
    return imported;
  } catch (error) {
    logException(error);
    throw new Error(
      'Guest import failed. Please check your CSV and try again.',
    );
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest --testPathPattern="guestImport" --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/guestImport.ts src/services/__tests__/guestImport.test.ts
git commit -m "feat(import): add CSV guest import service with batch Firestore writes"
```

---

### Task 6: Build GuestImportScreen

**Files:**

- Create: `src/screens/GuestImport/__tests__/GuestImportScreen.test.tsx`
- Create: `src/screens/GuestImport/GuestImportScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/navigators.tsx`

- [ ] **Step 1: Install react-native-document-picker (if not present)**

```bash
grep "react-native-document-picker" package.json
```

If not found:

```bash
npm install react-native-document-picker
cd ios && pod install && cd ..
```

- [ ] **Step 2: Write failing tests**

```typescript
// src/screens/GuestImport/__tests__/GuestImportScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import GuestImportScreen from '../GuestImportScreen';
import * as DocumentPicker from 'react-native-document-picker';
import * as importService from '../../../services/guestImport';
import { useData } from '../../../context/DataContext';

jest.mock('react-native-document-picker');
jest.mock('../../../services/guestImport');
jest.mock('../../../context/DataContext');
jest.mock('react-native-fs', () => ({ readFile: jest.fn() }));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

(useData as jest.Mock).mockReturnValue({ house: { id: 'house-1' } });
(importService.parseGuestCsv as jest.Mock).mockReturnValue([
  {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    sobrietyDate: '2025-01-15',
    drugOfChoice: 'Alcohol',
  },
]);
(importService.importGuestsFromRows as jest.Mock).mockResolvedValue(1);

it('shows pick CSV button', () => {
  const { getByTestId } = render(<GuestImportScreen />);
  expect(getByTestId('pick-csv-button')).toBeTruthy();
});

it('shows preview after file picked and parsed', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([
    { uri: 'file://test.csv', name: 'test.csv' },
  ]);
  const RNFS = require('react-native-fs');
  RNFS.readFile.mockResolvedValue(
    'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol',
  );

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => expect(getByText('Jane Smith')).toBeTruthy());
});

it('imports guests and shows success count', async () => {
  (DocumentPicker.pick as jest.Mock).mockResolvedValue([
    { uri: 'file://test.csv', name: 'test.csv' },
  ]);
  const RNFS = require('react-native-fs');
  RNFS.readFile.mockResolvedValue(
    'firstName,lastName,email,sobrietyDate,drugOfChoice\nJane,Smith,jane@example.com,2025-01-15,Alcohol',
  );

  const { getByTestId, getByText } = render(<GuestImportScreen />);
  fireEvent.press(getByTestId('pick-csv-button'));
  await waitFor(() => getByTestId('import-button'));
  fireEvent.press(getByTestId('import-button'));
  await waitFor(() => expect(getByText(/1 resident/i)).toBeTruthy());
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npx jest --testPathPattern="GuestImportScreen" --no-coverage
```

Expected: FAIL — "Cannot find module '../GuestImportScreen'"

- [ ] **Step 4: Implement GuestImportScreen**

```typescript
// src/screens/GuestImport/GuestImportScreen.tsx
import React, { useState } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { useNavigation } from '@react-navigation/native';
import {
  parseGuestCsv,
  importGuestsFromRows,
  GuestImportRow,
} from '../../services/guestImport';
import { useData } from '../../context/DataContext';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { color, normalize, fontSize } from '../../styles/theme';
import { logException } from '../../util/logging';

const GuestImportScreen: React.FC = () => {
  const navigation = useNavigation();
  const { house } = useData();
  const [rows, setRows] = useState<GuestImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handlePickFile = async () => {
    try {
      const [file] = await DocumentPicker.pick({
        type: [DocumentPicker.types.plainText],
      });
      const content = await RNFS.readFile(file.uri, 'utf8');
      const parsed = parseGuestCsv(content);
      setRows(parsed);
      setParseError(null);
      setImportedCount(null);
    } catch (error) {
      if (!DocumentPicker.isCancel(error)) {
        setParseError('Could not read file. Make sure it is a valid CSV.');
        logException(error);
      }
    }
  };

  const handleImport = async () => {
    if (!house?.id || rows.length === 0) return;
    setLoading(true);
    try {
      const count = await importGuestsFromRows(house.id, rows);
      setImportedCount(count);
      setRows([]);
    } catch (error) {
      Alert.alert('Import Failed', 'Please check your CSV and try again.');
      logException(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <RatsLoadingIndicator />;

  return (
    <View style={styles.container}>
      <RatsText
        translate={false}
        text="Import Residents from CSV"
        style={styles.header}
      />
      <RatsText
        translate={false}
        text="Required columns: firstName, lastName, email, sobrietyDate, drugOfChoice"
        style={styles.hint}
      />

      <RatsButton
        title="Pick CSV File"
        onPress={handlePickFile}
        containerStyle={styles.pickBtn}
        testID="pick-csv-button"
      />

      {parseError && (
        <RatsText translate={false} text={parseError} style={styles.error} />
      )}

      {importedCount !== null && (
        <View style={styles.successBox}>
          <RatsText
            translate={false}
            text={`Successfully imported ${importedCount} resident${
              importedCount !== 1 ? 's' : ''
            }`}
            style={styles.success}
          />
        </View>
      )}

      {rows.length > 0 && (
        <>
          <RatsText
            translate={false}
            text={`${rows.length} residents ready to import`}
            style={styles.preview}
          />
          <FlatList
            data={rows.slice(0, 10)}
            keyExtractor={(_, idx) => String(idx)}
            renderItem={({ item }) => (
              <RatsText
                translate={false}
                text={`${item.firstName} ${item.lastName} — ${item.email}`}
                style={styles.row}
              />
            )}
          />
          {rows.length > 10 && (
            <RatsText
              translate={false}
              text={`... and ${rows.length - 10} more`}
              style={styles.more}
            />
          )}
          <RatsButton
            title={`Import ${rows.length} Residents`}
            onPress={handleImport}
            containerStyle={styles.importBtn}
            testID="import-button"
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.white, padding: normalize(20) },
  header: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  hint: {
    fontSize: fontSize.small,
    color: color.grey,
    marginBottom: normalize(20),
    lineHeight: 20,
  },
  pickBtn: { marginBottom: normalize(16) },
  error: {
    fontSize: fontSize.regular,
    color: color.red,
    marginBottom: normalize(12),
  },
  successBox: {
    backgroundColor: '#E8F5E9',
    padding: normalize(16),
    borderRadius: 8,
    marginBottom: normalize(12),
  },
  success: { fontSize: fontSize.regular, color: '#2E7D32', fontWeight: '600' },
  preview: {
    fontSize: fontSize.regular,
    color: color.dark_grey,
    fontWeight: '600',
    marginBottom: normalize(8),
  },
  row: {
    fontSize: fontSize.small,
    color: color.grey,
    paddingVertical: normalize(4),
  },
  more: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(4),
  },
  importBtn: { marginTop: normalize(16) },
});

export default GuestImportScreen;
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx jest --testPathPattern="GuestImportScreen" --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 6: Add route + register screen**

In `src/navigation/types.ts`, add to the `Routes` enum:

```typescript
  GuestImport = 'guestImport',
```

And to `RootStackParamList`:

```typescript
  [Routes.GuestImport]: undefined;
```

In `src/navigation/navigators.tsx`, add import and registration:

```typescript
import GuestImportScreen from '../screens/GuestImport/GuestImportScreen';

// In RootStack.Navigator:
<RootStack.Screen name={Routes.GuestImport} component={GuestImportScreen} />;
```

Add an entry point in HouseSummary (admin-only):

```typescript
<RatsButton
  title="Import Residents (CSV)"
  onPress={() => navigation.navigate(Routes.GuestImport)}
  light
  testID="import-residents-button"
/>
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/screens/GuestImport/ src/navigation/types.ts src/navigation/navigators.tsx src/screens/HouseSummary/HouseSummary.tsx
git commit -m "feat(import): add GuestImportScreen with CSV parsing and bulk write"
```

---

### Task 7: Full Suite + Acceptance Check

- [ ] **Step 1: Run all tests**

```bash
npm test -- --no-coverage
```

Expected: All PASS

- [ ] **Step 2: TypeScript**

```bash
npx tsc --noEmit
```

Expected: Clean

---

### Acceptance Criteria

- [ ] Admin tapping "Discharge Resident" on GuestHome opens confirmation modal with move-out date pre-set to today
- [ ] Confirming discharge sets guest.status = 'discharged' and guest.moveOutDate in Firestore
- [ ] BalanceDashboard shows a per-guest aging section with days since last payment (red > 30 days, orange > 14 days)
- [ ] Guests with zero balance are excluded from the aging view
- [ ] Admin can pick a CSV file and see a preview of parsed rows
- [ ] Import creates guest documents in Firestore via batch write (max 499 per batch)
- [ ] Invalid rows (missing fields, bad email) are silently skipped with no crash
- [ ] All new tests pass; no regressions
