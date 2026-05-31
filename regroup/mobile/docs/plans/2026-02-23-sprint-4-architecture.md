# Sprint 4 Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce bundle size and improve maintainability by splitting two oversized screens, replacing wildcard lodash imports with named imports across 40+ files, and documenting all required Firestore composite indexes.

**Architecture:** Each oversized screen is split along a clear coordinator/presentational boundary — the parent screen keeps Redux selectors and navigation, extracted components receive only the props they actually render. Lodash migrations are file-by-file, replacing `import _ from 'lodash'` with individual named imports so Metro's tree-shaker can drop unused functions. Index documentation captures every WHERE + orderBy combination that Firestore requires a composite index for.

**Tech Stack:** React Native, TypeScript 5, Redux Toolkit, React Query, Firebase Firestore, Jest + @testing-library/react-native, Metro bundler.

---

## Pre-flight

```bash
# Verify TypeScript baseline is clean before starting
npx tsc --noEmit
# Expected: zero errors

# Verify test suite passes
npx jest --no-coverage --passWithNoTests
# Expected: all green
```

---

## Task 1: Split `RentPaymentScreen.tsx` (667 lines)

### Context

`src/screens/RentPayment/RentPaymentScreen.tsx` is 667 lines. It contains three well-defined units:

1. **`StatusBadge`** (lines 63–92) — pure display component, already defined inline
2. **`PaymentRow`** (lines 94–121) — pure display component, already defined inline
3. The screen itself mixes query data, Stripe state, navigation, and all UI

The plan is:
- Extract `PaymentStatusBadge` as a standalone file (replaces the inline `StatusBadge`)
- Extract `PaymentRow` as a standalone file
- Leave `RentPaymentScreen.tsx` as the coordinator that imports both

The `formatCurrency` helper is already exported from the screen; after extraction it must remain exported from the screen (other callers may use it) and also be importable by `PaymentRow` directly from the screen file (no circular dep — PaymentRow imports from screen helpers, not the screen component itself). A cleaner approach: move `formatCurrency` to a shared `src/screens/RentPayment/rentPaymentHelpers.ts` file, import it everywhere.

---

### Step 1.1 — Write failing test for `PaymentStatusBadge`

**File to create:** `src/screens/RentPayment/__tests__/PaymentStatusBadge.test.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import PaymentStatusBadge from '../PaymentStatusBadge';

describe('PaymentStatusBadge', () => {
  it('renders completed status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="completed" />);
    expect(getByTestId('payment-status-badge-completed')).toBeTruthy();
  });

  it('renders pending status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="pending" />);
    expect(getByTestId('payment-status-badge-pending')).toBeTruthy();
  });

  it('renders failed status with testID', () => {
    const { getByTestId } = render(<PaymentStatusBadge status="failed" />);
    expect(getByTestId('payment-status-badge-failed')).toBeTruthy();
  });

  it('displays Paid label for completed status', () => {
    const { getByText } = render(<PaymentStatusBadge status="completed" />);
    expect(getByText('Paid')).toBeTruthy();
  });

  it('displays Pending label for pending status', () => {
    const { getByText } = render(<PaymentStatusBadge status="pending" />);
    expect(getByText('Pending')).toBeTruthy();
  });

  it('displays Failed label for failed status', () => {
    const { getByText } = render(<PaymentStatusBadge status="failed" />);
    expect(getByText('Failed')).toBeTruthy();
  });
});
```

**Run — expect failure (module not found):**
```bash
npx jest src/screens/RentPayment/__tests__/PaymentStatusBadge.test.tsx --no-coverage
# Expected: FAIL — Cannot find module '../PaymentStatusBadge'
```

---

### Step 1.2 — Create `rentPaymentHelpers.ts`

**File to create:** `src/screens/RentPayment/rentPaymentHelpers.ts`

```typescript
/** Format a number as a USD dollar string, e.g. 150 → "$150.00" */
export function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

/** Derive a user-friendly date string from an ISO timestamp */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
```

---

### Step 1.3 — Create `PaymentStatusBadge.tsx`

**File to create:** `src/screens/RentPayment/PaymentStatusBadge.tsx`

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, fontFamily, normalize } from '../../styles/theme';
import { RentPayment } from '../../services/payment';

export interface PaymentStatusBadgeProps {
  status: RentPayment['status'];
}

const STATUS_COLORS: Record<RentPayment['status'], string> = {
  completed: color.green,
  pending: color.yellow,
  failed: color.red,
};

const STATUS_LABELS: Record<RentPayment['status'], string> = {
  completed: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
};

const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({ status }) => (
  <View
    style={[
      styles.badge,
      { backgroundColor: STATUS_COLORS[status] + '22', borderColor: STATUS_COLORS[status] },
    ]}
    testID={`payment-status-badge-${status}`}>
    <RatsText
      translate={false}
      text={STATUS_LABELS[status]}
      style={[styles.badgeText, { color: STATUS_COLORS[status] }]}
    />
  </View>
);

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: normalize(8),
    paddingVertical: normalize(2),
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: fontSize.extraSmall,
    fontFamily: fontFamily.bold,
  },
});

export default PaymentStatusBadge;
```

**Run — expect pass:**
```bash
npx jest src/screens/RentPayment/__tests__/PaymentStatusBadge.test.tsx --no-coverage
# Expected: PASS — 6 tests pass
```

---

### Step 1.4 — Write failing test for `PaymentRow`

**File to create:** `src/screens/RentPayment/__tests__/PaymentRow.test.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import PaymentRow from '../PaymentRow';
import { RentPayment } from '../../../services/payment';

const mockPayment: RentPayment = {
  id: 'pay-1',
  guestId: 'guest-1',
  houseId: 'house-1',
  amount: 150,
  status: 'completed',
  description: 'Rent Payment',
  createdAt: '2026-01-15T10:00:00Z',
};

describe('PaymentRow', () => {
  it('renders the payment-history-row testID', () => {
    const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
    expect(getByTestId('payment-history-row')).toBeTruthy();
  });

  it('displays the formatted currency amount', () => {
    const { getByText } = render(<PaymentRow payment={mockPayment} />);
    expect(getByText('$150.00')).toBeTruthy();
  });

  it('displays the description', () => {
    const { getByText } = render(<PaymentRow payment={mockPayment} />);
    expect(getByText('Rent Payment')).toBeTruthy();
  });

  it('falls back to Rent Payment when description is undefined', () => {
    const { getByText } = render(
      <PaymentRow payment={{ ...mockPayment, description: undefined }} />,
    );
    expect(getByText('Rent Payment')).toBeTruthy();
  });

  it('renders the status badge', () => {
    const { getByTestId } = render(<PaymentRow payment={mockPayment} />);
    expect(getByTestId('payment-status-badge-completed')).toBeTruthy();
  });
});
```

**Run — expect failure (module not found):**
```bash
npx jest src/screens/RentPayment/__tests__/PaymentRow.test.tsx --no-coverage
# Expected: FAIL — Cannot find module '../PaymentRow'
```

---

### Step 1.5 — Create `PaymentRow.tsx`

**File to create:** `src/screens/RentPayment/PaymentRow.tsx`

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { RatsText } from '../../components/rats-text';
import { color, fontSize, fontFamily, normalize, ROW } from '../../styles/theme';
import { RentPayment } from '../../services/payment';
import PaymentStatusBadge from './PaymentStatusBadge';
import { formatCurrency, formatDate } from './rentPaymentHelpers';

export interface PaymentRowProps {
  payment: RentPayment;
}

const PaymentRow: React.FC<PaymentRowProps> = ({ payment }) => (
  <View style={styles.paymentRow} testID="payment-history-row">
    <View style={{ flex: 1 }}>
      <RatsText
        translate={false}
        text={payment.description ?? 'Rent Payment'}
        style={styles.paymentDescription}
      />
      <RatsText
        translate={false}
        text={formatDate(payment.createdAt)}
        style={styles.paymentDate}
      />
    </View>
    <View style={styles.paymentRight}>
      <RatsText
        translate={false}
        text={formatCurrency(payment.amount)}
        style={styles.paymentAmount}
      />
      <PaymentStatusBadge status={payment.status} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: normalize(10),
    borderBottomWidth: 1,
    borderBottomColor: color.light_grey,
  },
  paymentDescription: {
    fontSize: fontSize.regular,
    color: color.black,
    fontFamily: fontFamily.bold,
  },
  paymentDate: {
    fontSize: fontSize.small,
    color: color.grey,
    marginTop: normalize(2),
  },
  paymentRight: {
    alignItems: 'flex-end',
  },
  paymentAmount: {
    fontSize: fontSize.regular,
    fontFamily: fontFamily.bold,
    color: color.dark_grey,
    marginBottom: normalize(4),
  },
});

export default PaymentRow;
```

**Run — expect pass:**
```bash
npx jest src/screens/RentPayment/__tests__/PaymentRow.test.tsx --no-coverage
# Expected: PASS — 5 tests pass
```

---

### Step 1.6 — Update `RentPaymentScreen.tsx` to use extracted components

Replace the inline `StatusBadge`, `PaymentRow`, `formatCurrency`, and `formatDate` definitions in `RentPaymentScreen.tsx` with imports from the new files.

**Before (lines 40–121 in `src/screens/RentPayment/RentPaymentScreen.tsx`):**
```typescript
// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number as a USD dollar string, e.g. 150 → "$150.00" */
export function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

/** Derive a user-friendly date string from an ISO timestamp */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: RentPayment['status'];
}

const STATUS_COLORS: Record<RentPayment['status'], string> = {
  completed: color.green,
  pending: color.yellow,
  failed: color.red,
};

const STATUS_LABELS: Record<RentPayment['status'], string> = {
  completed: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => (
  <View
    style={[
      styles.badge,
      { backgroundColor: STATUS_COLORS[status] + '22', borderColor: STATUS_COLORS[status] },
    ]}
    testID={`payment-status-badge-${status}`}>
    <RatsText
      translate={false}
      text={STATUS_LABELS[status]}
      style={[styles.badgeText, { color: STATUS_COLORS[status] }]}
    />
  </View>
);

interface PaymentRowProps {
  payment: RentPayment;
}

const PaymentRow: React.FC<PaymentRowProps> = ({ payment }) => (
  <View style={styles.paymentRow} testID="payment-history-row">
    <View style={{ flex: 1 }}>
      <RatsText
        translate={false}
        text={payment.description ?? 'Rent Payment'}
        style={styles.paymentDescription}
      />
      <RatsText
        translate={false}
        text={formatDate(payment.createdAt)}
        style={styles.paymentDate}
      />
    </View>
    <View style={styles.paymentRight}>
      <RatsText
        translate={false}
        text={formatCurrency(payment.amount)}
        style={styles.paymentAmount}
      />
      <StatusBadge status={payment.status} />
    </View>
  </View>
);
```

**After (replace the entire helpers + sub-components section with):**
```typescript
// ─── Helpers & Sub-components (extracted) ─────────────────────────────────────

export { formatCurrency } from './rentPaymentHelpers';
import { formatCurrency } from './rentPaymentHelpers';
import PaymentRow from './PaymentRow';
```

> NOTE: The `export { formatCurrency }` re-export preserves the public API for any callers that import `formatCurrency` from `RentPaymentScreen`. If no external callers use it, the re-export can be omitted — verify with:
> ```bash
> grep -rn "from.*RentPaymentScreen" src --include="*.ts" --include="*.tsx"
> ```

Also remove from `RentPaymentScreen.tsx` the now-unused style keys `badge`, `badgeText`, `paymentRow`, `paymentDescription`, `paymentDate`, `paymentRight`, `paymentAmount` since those styles now live in the extracted files.

**Run all three test files:**
```bash
npx jest src/screens/RentPayment/ --no-coverage
# Expected: PASS — all tests in PaymentStatusBadge.test.tsx, PaymentRow.test.tsx, and any existing RentPaymentScreen tests
```

**TypeScript check:**
```bash
npx tsc --noEmit
# Expected: zero errors
```

**Commit:**
```bash
git add src/screens/RentPayment/rentPaymentHelpers.ts \
        src/screens/RentPayment/PaymentStatusBadge.tsx \
        src/screens/RentPayment/PaymentRow.tsx \
        src/screens/RentPayment/__tests__/PaymentStatusBadge.test.tsx \
        src/screens/RentPayment/__tests__/PaymentRow.test.tsx \
        src/screens/RentPayment/RentPaymentScreen.tsx
git commit -m "refactor(RentPayment): extract PaymentStatusBadge and PaymentRow into standalone files"
```

---

## Task 2: Split `MeetingSearch.tsx` (595 lines)

### Context

`src/screens/StatUpdates/MeetingSearch.tsx` is 595 lines. The file is already well-structured with named render functions. The natural split is:

- **`MeetingSearch.tsx`** — coordinator: Redux hooks, `useMeetingSearch` hook, `openFilters`, `renderHeader`, navigation. Target: ~120 lines.
- **`MeetingSearchBar.tsx`** — the search input section: `renderSearchBar` logic, location filter display. Receives `filters`, `setSearchTerm`, `setLocation`, `openFilters` as props.
- **`MeetingResultsList.tsx`** — results list: all `renderMeeting*` callbacks, `meetingShouldRender`, `renderMeetings`, `renderMeetingList`. Receives `meetings`, `filters`, `searchTerm`, `checkInto`, `guestAttendedMeeting`, `isMeetingDay`, `isMeetingTime`, `userAsGuest`.

The only lodash usage is `_.isEmpty(userAsGuest)` at line 454 — replace with `Object.keys(userAsGuest).length === 0` or `!userAsGuest` depending on the type of `userAsGuest` (it is a `Guest` object from Redux, so check with `Object.keys`).

---

### Step 2.1 — Write failing test for `MeetingSearchBar`

**File to create:** `src/screens/StatUpdates/__tests__/MeetingSearchBar.test.tsx`

```typescript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MeetingSearchBar from '../MeetingSearchBar';
import { MeetingFilters } from '../MeetingFilterForm';

const defaultFilters: MeetingFilters = {
  day: 'all',
  type: 'all',
  location: undefined,
};

describe('MeetingSearchBar', () => {
  it('renders the search bar', () => {
    const { getByPlaceholderText } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={jest.fn()}
        setLocation={jest.fn()}
        onFilter={jest.fn()}
      />,
    );
    expect(getByPlaceholderText('Search meeting name or hour...')).toBeTruthy();
  });

  it('calls onFilter when filter button is pressed', () => {
    const onFilter = jest.fn();
    const { getByTestId } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={jest.fn()}
        setLocation={jest.fn()}
        onFilter={onFilter}
      />,
    );
    fireEvent.press(getByTestId('meeting-filter-button'));
    expect(onFilter).toHaveBeenCalledTimes(1);
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByPlaceholderText } = render(
      <MeetingSearchBar
        filters={defaultFilters}
        onChangeText={onChangeText}
        setLocation={jest.fn()}
        onFilter={jest.fn()}
      />,
    );
    fireEvent.changeText(getByPlaceholderText('Search meeting name or hour...'), 'serenity');
    expect(onChangeText).toHaveBeenCalledWith('serenity');
  });
});
```

**Run — expect failure (module not found):**
```bash
npx jest src/screens/StatUpdates/__tests__/MeetingSearchBar.test.tsx --no-coverage
# Expected: FAIL — Cannot find module '../MeetingSearchBar'
```

---

### Step 2.2 — Write failing test for `MeetingResultsList`

**File to create:** `src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import MeetingResultsList from '../MeetingResultsList';
import { RatsMeeting } from '../../../entities/Meeting';
import { MeetingFilters } from '../MeetingFilterForm';

const mockMeeting: RatsMeeting = {
  id: 'meeting-1',
  name: 'Serenity Group',
  type: 'AA',
  day: 'monday',
  time: '19:00',
  street: '123 Main St',
  city: 'Denver',
  state: 'CO',
  zip: '80201',
  online: false,
};

const defaultFilters: MeetingFilters = { day: 'all', type: 'all', location: undefined };

describe('MeetingResultsList', () => {
  it('renders the meetings list testID', () => {
    const { getByTestId } = render(
      <MeetingResultsList
        meetings={[mockMeeting]}
        filters={defaultFilters}
        searchTerm=""
        checkInto={jest.fn()}
        guestAttendedMeeting={jest.fn(() => false)}
        isMeetingDay={jest.fn(() => true)}
        isMeetingTime={jest.fn(() => true)}
        userAsGuest={null}
      />,
    );
    expect(getByTestId('meetings-list')).toBeTruthy();
  });

  it('renders a meeting name in the list', () => {
    const { getByText } = render(
      <MeetingResultsList
        meetings={[mockMeeting]}
        filters={defaultFilters}
        searchTerm=""
        checkInto={jest.fn()}
        guestAttendedMeeting={jest.fn(() => false)}
        isMeetingDay={jest.fn(() => true)}
        isMeetingTime={jest.fn(() => true)}
        userAsGuest={null}
      />,
    );
    expect(getByText('Serenity Group')).toBeTruthy();
  });
});
```

**Run — expect failure (module not found):**
```bash
npx jest src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx --no-coverage
# Expected: FAIL — Cannot find module '../MeetingResultsList'
```

---

### Step 2.3 — Create `MeetingSearchBar.tsx`

Extract the `renderSearchBar` logic from `MeetingSearch.tsx` (lines 169–187).

**File to create:** `src/screens/StatUpdates/MeetingSearchBar.tsx`

```typescript
import React from 'react';
import { CARD_STYLE, normalize } from '../../styles/theme';
import RatsSearchBar from '../../components/rats-search-bar';
import { MeetingFilters } from './MeetingFilterForm';

export interface MeetingSearchBarProps {
  filters: MeetingFilters;
  onChangeText: (text: string) => void;
  setLocation: (location: any) => void;
  onFilter: () => void;
}

const MeetingSearchBar: React.FC<MeetingSearchBarProps> = ({
  filters,
  onChangeText,
  setLocation,
  onFilter,
}) => {
  const locationFilter =
    filters.location && filters.location.city && filters.location.state
      ? filters.location.city + ', ' + filters.location.state
      : null;

  return (
    <RatsSearchBar
      container={{ ...CARD_STYLE, paddingVertical: normalize(0) }}
      address
      showCurrentLocation
      value={locationFilter as string}
      onChangeText={onChangeText}
      setLocation={setLocation}
      onFilter={onFilter}
      filterTestID="meeting-filter-button"
      placeholder="Search meeting name or hour..."
    />
  );
};

export default MeetingSearchBar;
```

> Note: `filterTestID="meeting-filter-button"` requires `RatsSearchBar` to forward a `filterTestID` prop to its filter button. Check `src/components/rats-search-bar` — if this prop does not exist, add it or test the filter button by its existing testID. Adjust the test in Step 2.1 accordingly.

**Run — expect pass:**
```bash
npx jest src/screens/StatUpdates/__tests__/MeetingSearchBar.test.tsx --no-coverage
# Expected: PASS (or adjust testID strategy based on RatsSearchBar implementation)
```

---

### Step 2.4 — Create `MeetingResultsList.tsx`

Extract all meeting rendering logic from `MeetingSearch.tsx` (lines 207–563).

**File to create:** `src/screens/StatUpdates/MeetingResultsList.tsx`

```typescript
import React, { useCallback, Fragment } from 'react';
import {
  View,
  Dimensions,
  ListRenderItemInfo,
  Linking,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  color,
  normalize,
  fontSize,
  ROW,
  CARD_STYLE,
  fontFamily,
} from '../../styles/theme';
import { RatsMeeting, MeetingType } from '../../entities/Meeting';
import { Guest } from '../../entities/Guest';
import { RatsIcon, ClickableIcon } from '../../components/rats-icon';
import { RatsText } from '../../components/rats-text';
import { RatsFlatList } from '../../components/rats-flat-list';
import { RatsImage } from '../../components/rats-image';
import RatsButton from '../../components/rats-button/rats-button';
import { aaLogo, naLogo, crLogo } from '../../../assets';
import {
  militaryTimeToDate,
  getFormattedTime,
  militaryTimeToStandard,
} from '../../util/display';
import { MeetingFilters } from './MeetingFilterForm';
import { WeekDay, MEETING_DESCRIPTION_TEXT } from './MeetingSearch';

export interface MeetingResultsListProps {
  meetings: RatsMeeting[];
  filters: MeetingFilters;
  searchTerm: string;
  checkInto: (meeting: RatsMeeting) => void;
  guestAttendedMeeting: (meeting: RatsMeeting) => boolean;
  isMeetingDay: (meeting: RatsMeeting) => boolean;
  isMeetingTime: (time: string) => boolean;
  userAsGuest: Guest | null | undefined;
}

const MeetingResultsList: React.FC<MeetingResultsListProps> = ({
  meetings,
  filters,
  searchTerm,
  checkInto,
  guestAttendedMeeting,
  isMeetingDay,
  isMeetingTime,
  userAsGuest,
}) => {
  const renderMeetingTime = useCallback((time: string) => (
    <RatsText
      translate={false}
      text={getFormattedTime(militaryTimeToDate(time))}
      style={{ fontSize: fontSize.regular, fontFamily: fontFamily.bold }}
    />
  ), []);

  const renderMeetingImage = useCallback((meetingType: MeetingType) => {
    let source = null;
    if (meetingType === 'AA') source = aaLogo;
    if (meetingType === 'NA') source = naLogo;
    if (meetingType === 'Celebrate Recovery') source = crLogo;
    return (
      <Fragment>
        {source && (
          <RatsImage
            style={{ width: normalize(55), height: normalize(55) }}
            source={source}
          />
        )}
        {source === null && (
          <View style={{ justifyContent: 'center', alignItems: 'center' }}>
            <RatsIcon
              name="user-friends"
              size={normalize(35)}
              style={{ marginLeft: normalize(5) }}
            />
          </View>
        )}
      </Fragment>
    );
  }, []);

  const renderMeetingHeading = useCallback((meeting: RatsMeeting) => (
    <View style={{ justifyContent: 'center', flex: 1, marginLeft: normalize(10) }}>
      <RatsText
        text={meeting.name}
        style={{ fontSize: fontSize.medium_large, fontFamily: fontFamily.bold }}
      />
      <RatsText
        text={meeting.type + ' Meeting'}
        style={{ fontSize: fontSize.regular_medium, color: color.grey }}
      />
    </View>
  ), []);

  const renderAAMeetingDescription = useCallback((meeting: RatsMeeting) => {
    const meetingTime =
      meeting.time ||
      (meeting.daysAndTimes && filters.day !== 'all'
        ? meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes]
        : undefined);
    return (
      <Fragment>
        {renderMeetingTime(meetingTime || '')}
        {!meeting.online && (
          <Fragment>
            <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.street} />
            <RatsText
              style={MEETING_DESCRIPTION_TEXT}
              text={`${meeting.city}, ${meeting.state} ${meeting.zip}`}
            />
          </Fragment>
        )}
        {meeting.online && (
          <Fragment>
            <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.link} />
            <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.onlineNotes} />
          </Fragment>
        )}
        {meeting.locationName && (
          <RatsText style={MEETING_DESCRIPTION_TEXT} text={meeting.locationName} />
        )}
      </Fragment>
    );
  }, [renderMeetingTime, filters]);

  const renderNAMeetingDescription = useCallback((meeting: RatsMeeting) => {
    const meetingKey = meeting.name + meeting.Location?.toString() + meeting.time + meeting.day;
    return (
      <Fragment key={meetingKey}>
        {meeting.online && (
          <Fragment>
            {renderMeetingTime(meeting.time)}
            <RatsText style={MEETING_DESCRIPTION_TEXT} translate={false} text={meeting.link} />
            <RatsText style={MEETING_DESCRIPTION_TEXT} translate={false} text={meeting.onlineNotes} />
          </Fragment>
        )}
        {!meeting.online &&
          meeting.Location?.map((location, index) => {
            if (index === 0) {
              return <Fragment key={meetingKey}>{renderMeetingTime(meeting.time)}</Fragment>;
            }
            return (
              <RatsText
                style={MEETING_DESCRIPTION_TEXT}
                translate={false}
                key={location}
                text={location}
              />
            );
          })}
      </Fragment>
    );
  }, [renderMeetingTime]);

  const renderCheckInButton = useCallback((meeting: RatsMeeting) => {
    const meetingTime =
      meeting.time ||
      (meeting.daysAndTimes && filters.day !== 'all'
        ? meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes]
        : undefined);
    const disabled =
      guestAttendedMeeting(meeting) ||
      !isMeetingDay(meeting) ||
      !isMeetingTime(meetingTime || '');
    return (
      <RatsButton
        testID="add-meeting-button"
        onPress={() => checkInto(meeting)}
        title="CHECK IN"
        containerStyle={{
          backgroundColor: color.white,
          borderColor: color.baby_blue,
          borderWidth: 1.5,
        }}
        style={{ color: color.baby_blue }}
        disabled={disabled}
      />
    );
  }, [guestAttendedMeeting, isMeetingDay, isMeetingTime, filters, checkInto]);

  const linkToDirections = useCallback((meeting: RatsMeeting) => () => {
    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=${meeting.lat},${meeting.lng}`;
    Linking.canOpenURL(url)
      .then(supported => {
        if (!supported) Alert.alert('Not supported on this device');
        else return Linking.openURL(url);
      })
      .catch(() => Alert.alert('Something went wrong'));
  }, []);

  const renderMeeting = useCallback((meeting: RatsMeeting, index: number) => {
    const width = Dimensions.get('screen').width;
    const hasGuest = userAsGuest != null && Object.keys(userAsGuest).length > 0;
    return (
      <View
        key={index}
        style={[
          CARD_STYLE,
          { width, paddingVertical: normalize(15), paddingHorizontal: normalize(15) },
        ]}>
        <View style={[ROW]}>
          {renderMeetingImage(meeting.type)}
          {renderMeetingHeading(meeting)}
          {!meeting.online && (
            <View>
              <ClickableIcon
                containerProps={{ onPress: linkToDirections(meeting) }}
                iconProps={{
                  name: 'directions',
                  size: normalize(40),
                  style: { color: color.baby_blue, alignSelf: 'center' },
                }}
              />
              <RatsText text="Directions" style={{ color: color.baby_blue }} />
            </View>
          )}
          {meeting.online && (
            <View>
              <ClickableIcon
                containerProps={{ onPress: () => Clipboard.setString(meeting.link!) }}
                iconProps={{
                  name: 'clipboard',
                  size: normalize(40),
                  style: { color: color.baby_blue, alignSelf: 'center' },
                }}
              />
              <RatsText text="Copy Link" style={{ color: color.baby_blue }} />
            </View>
          )}
        </View>
        <View style={{ width: '100%', paddingVertical: normalize(10), paddingHorizontal: normalize(5) }}>
          {(meeting.type === 'AA' || meeting.type === 'Custom' || meeting.type === 'Celebrate Recovery') &&
            renderAAMeetingDescription(meeting)}
          {meeting.type === 'NA' && renderNAMeetingDescription(meeting)}
        </View>
        {hasGuest && (
          <View style={{ paddingHorizontal: normalize(5) }}>
            {renderCheckInButton(meeting)}
          </View>
        )}
      </View>
    );
  }, [
    userAsGuest,
    renderMeetingImage,
    renderMeetingHeading,
    linkToDirections,
    renderAAMeetingDescription,
    renderNAMeetingDescription,
    renderCheckInButton,
  ]);

  const meetingShouldRender = useCallback((meeting: RatsMeeting): boolean => {
    let shouldRender = true;
    if (filters.day !== 'all') {
      if (meeting.day) shouldRender = shouldRender && filters.day === meeting.day;
      if (meeting.daysAndTimes) {
        const dayTimes = meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes];
        shouldRender = shouldRender && !!dayTimes && dayTimes.length > 0;
      }
    }
    if (filters.type && filters.type !== 'all') {
      shouldRender = shouldRender && filters.type === meeting.type;
    }
    if (searchTerm && searchTerm.length) {
      const isNumericSearch = !isNaN(parseInt(searchTerm));
      if (isNumericSearch && meeting.time) {
        shouldRender = shouldRender && militaryTimeToStandard(meeting.time).includes(searchTerm);
      } else {
        shouldRender =
          shouldRender && meeting.name.toLowerCase().includes(searchTerm.toLowerCase());
      }
    }
    return shouldRender;
  }, [filters, searchTerm]);

  const renderMeetingListItem = useCallback(
    (info: ListRenderItemInfo<RatsMeeting>) => renderMeeting(info.item, info.index),
    [renderMeeting],
  );

  const sortedMeetings = React.useMemo(() => {
    const getMeetingTimeForSort = (meeting: RatsMeeting): string => {
      if (meeting.time) return meeting.time;
      if (meeting.daysAndTimes && filters.day !== 'all') {
        return meeting.daysAndTimes[filters.day as keyof typeof meeting.daysAndTimes] || '00:00';
      }
      return '00:00';
    };
    return meetings
      .filter(m => meetingShouldRender(m))
      .sort((a, b) => {
        const aTime = getMeetingTimeForSort(a);
        const bTime = getMeetingTimeForSort(b);
        const aHour = parseInt(aTime.split(':')[0]) || 0;
        const bHour = parseInt(bTime.split(':')[0]) || 0;
        if (aHour === bHour) {
          const aMin = parseInt(aTime.split(':')[1]) || 0;
          const bMin = parseInt(bTime.split(':')[1]) || 0;
          return aMin - bMin;
        }
        return aHour - bHour;
      });
  }, [meetings, meetingShouldRender, filters]);

  return (
    <RatsFlatList<RatsMeeting>
      testID="meetings-list"
      scrollEnabled
      renderItem={renderMeetingListItem}
      data={sortedMeetings}
      keyExtractor={(item, index) => index.toString()}
      removeClippedSubviews={true}
      initialNumToRender={5}
      maxToRenderPerBatch={1}
      updateCellsBatchingPeriod={100}
      windowSize={7}
      ItemSeparatorComponent={() => <View style={{ height: normalize(5) }} />}
    />
  );
};

export default MeetingResultsList;
```

**Run — expect pass:**
```bash
npx jest src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx --no-coverage
# Expected: PASS — 2 tests pass
```

---

### Step 2.5 — Update `MeetingSearch.tsx` to use extracted components

The coordinator keeps: Redux hooks, `useMeetingSearch`, `openFilters`, `renderHeader`, `renderHelp`, the main return JSX. Remove all `renderMeeting*`, `meetingShouldRender`, and `renderSearchBar` logic.

**Before (complete file ~595 lines)**

**After (target ~120 lines):**

```typescript
// Phase 3.3: Migrated from 5 HOC layers to Context hooks
// Phase 4.1: Extracted business logic to useMeetingSearch hook
// Phase 4.2: Completed RTK migration - component now uses Redux hooks directly
// Phase 4.3 (Sprint 4): Extracted MeetingSearchBar and MeetingResultsList
import React, { useCallback, TextStyle } from 'react';
import { View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMeetingSearch } from './MeetingSearch/useMeetingSearch';
import { useNotification } from '../../context';
import { useAppSelector, useAppDispatch } from '../../state/store';
import {
  searchForMeetings as searchForMeetingsThunk,
  checkIntoMeeting as checkIntoMeetingThunk,
} from '../../state/slices/meetingsSlice';
import { MeetingSearchInput } from '../../entities/Meeting';
import { color, fontSize } from '../../styles/theme';
import ScreenHeader from '../../components/screen-header';
import HelpIcon from '../../components/help-icon';
import EmptyScreen from '../../components/empty-screen';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import { MeetingFilterForm } from './MeetingFilterForm';
import MeetingSearchBar from './MeetingSearchBar';
import MeetingResultsList from './MeetingResultsList';

export type WeekDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'all';

export const MEETING_DESCRIPTION_TEXT: TextStyle = {
  fontSize: fontSize.regular_medium,
};

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const MeetingSearch: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const meetings = useAppSelector(state => state.meetingsRTK.meetings);
  const searchingForMeetings = useAppSelector(state => state.meetingsRTK.searchingForMeetings);
  const checkingIn = useAppSelector(state => state.meetingsRTK.checkingIn);
  const checkInSuccessful = useAppSelector(state => state.meetingsRTK.checkInSuccessful);
  const checkInError = useAppSelector(state => state.meetingsRTK.checkInError || '');

  const searchForMeetings = useCallback(
    (input: MeetingSearchInput) => dispatch(searchForMeetingsThunk(input)),
    [dispatch],
  );
  const checkIntoMeeting = useCallback(
    (meeting: any, checkInInput: any) =>
      dispatch(checkIntoMeetingThunk({ checkInInput, meeting })),
    [dispatch],
  );

  const meetingSearch = useMeetingSearch({
    searchForMeetings,
    checkIntoMeeting,
    searchingForMeetings,
    checkingIn,
    checkInSuccessful,
    checkInError,
    meetings,
    navigation,
  });

  const {
    searchTerm,
    filters,
    userAsGuest,
    setSearchTerm,
    checkInto,
    noMeetingsFound,
    guestAttendedMeeting,
    isMeetingDay,
    isMeetingTime,
    showFormModal,
    dismissFormModal,
    setSearchFilters,
    showPopover,
  } = meetingSearch;

  const { setPopoverRef } = useNotification();

  const openFilters = useCallback(() => {
    showFormModal(
      <MeetingFilterForm
        dismissModal={dismissFormModal}
        setSearchFilters={setSearchFilters}
        filters={filters}
      />,
    );
  }, [showFormModal, dismissFormModal, setSearchFilters, filters]);

  const renderHelp = useCallback(() => {
    showPopover(
      'MEETING SEARCH',
      'Here you can search for meetings in any area by selecting a search location in the filters. Residents can check into meetings here.',
    );
  }, [showPopover]);

  return (
    <View style={{ flex: 1, backgroundColor: color.light_grey }}>
      <ScreenHeader
        renderBackButton
        container={{ marginBottom: 1 }}
        icon={<HelpIcon setRef={setPopoverRef} helpFn={renderHelp} />}
        header="Find Meetings"
      />
      <MeetingSearchBar
        filters={filters}
        onChangeText={setSearchTerm}
        setLocation={meetingSearch.setLocation}
        onFilter={openFilters}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: -50 }}>
        {!searchingForMeetings && noMeetingsFound() && (
          <EmptyScreen
            icon="folder-open"
            buttonTitle="CHANGE FILTERS"
            onPress={openFilters}
            message="No meetings found. Try changing the search filters."
          />
        )}
        {searchingForMeetings && (
          <RatsLoadingIndicator containerStyle={{ backgroundColor: undefined }} />
        )}
        {!searchingForMeetings && !noMeetingsFound() && (
          <MeetingResultsList
            meetings={meetings}
            filters={filters}
            searchTerm={searchTerm}
            checkInto={checkInto}
            guestAttendedMeeting={guestAttendedMeeting}
            isMeetingDay={isMeetingDay}
            isMeetingTime={isMeetingTime}
            userAsGuest={userAsGuest}
          />
        )}
      </View>
    </View>
  );
};

export default MeetingSearch;
```

**Run:**
```bash
npx jest src/screens/StatUpdates/ --no-coverage
npx tsc --noEmit
# Expected: zero errors, all tests pass
```

**Commit:**
```bash
git add src/screens/StatUpdates/MeetingSearchBar.tsx \
        src/screens/StatUpdates/MeetingResultsList.tsx \
        src/screens/StatUpdates/__tests__/MeetingSearchBar.test.tsx \
        src/screens/StatUpdates/__tests__/MeetingResultsList.test.tsx \
        src/screens/StatUpdates/MeetingSearch.tsx
git commit -m "refactor(MeetingSearch): extract MeetingSearchBar and MeetingResultsList into standalone files"
```

---

## Task 3: Replace Wildcard Lodash Imports with Named Imports

### Context

40 files import lodash as a wildcard (`import _ from 'lodash'` or `import * as _ from 'lodash'`). Metro cannot tree-shake wildcard imports, so the entire ~70KB lodash library is bundled regardless of usage.

**Approach:** Migrate file-by-file. Each file gets its own mini-commit. Do not change runtime behavior — only the import syntax.

**Function inventory found in the codebase:**

| Lodash fn | Files using it |
|---|---|
| `_.cloneDeep` | house.tsx, guest.tsx, PhaseConfigForm.tsx, usePhaseSetup.ts, ManagerSetup.tsx, ChoreSetup.tsx, NewAccountForm.tsx, SignUpForm.tsx, useBedsManagement.ts, RoomForm.tsx, HouseConfigForm.tsx, NewMeeting.tsx, useBaseActivityScreen.ts, meeting.ts, setup-wizard.ts, users.tsx |
| `_.each` | house.tsx, guest.tsx, AssignGuest.tsx, ContactScreen.tsx, PhaseConfigSetup → none, usePhaseSetup.ts, ManagerSetup.tsx, ChoreSetup.tsx, setup-wizard.ts, HouseConfigForm.tsx, PhaseCustomization.tsx |
| `_.map` | house.tsx, OrgSetup.tsx, Personal.tsx, HouseConfigFormView.tsx, HouseConfigForm.tsx, ChoreSetup.tsx, Beds.tsx, ContactScreen.tsx, IntroHouseSummary.tsx, AddManager.tsx, rats-step-indicator/index.tsx, PhaseCustomization.tsx, setup-wizard.ts |
| `_.filter` | house.tsx, HouseSearchScreen.tsx, Beds.tsx |
| `_.find` | house.tsx, guest.tsx, PhaseConfigForm.tsx, usePhaseSetup.ts |
| `_.some` | HouseConfigFormView.tsx |
| `_.keyBy` | guest.tsx (services) |
| `_.isEmpty` | PhaseConfigForm.tsx, usePhaseSetup.ts, ManagerSetup.tsx, ChoreSetup.tsx, NewAccountForm.tsx, HouseSearchScreen.tsx, HouseConfigFormView.tsx, MeetingSearch.tsx → removed by Task 2 |
| `_.isEqual` | guest.tsx |
| `_.isNil` | IntroHouseSummary.tsx |
| `_.size` | guest.tsx, HouseSummary.tsx, ManagerSetup.tsx, ChoreSetup.tsx, HouseSearchScreen.tsx, Beds.tsx, rats-step-indicator |
| `_.keys` | usePhaseSetup.ts |
| `_.sortBy` | house.tsx, Beds.tsx |
| `_.toArray` | Complaints.tsx |
| `_.extend` | users.tsx |
| `_.uniq` | (check if used) |
| `_.forEach` | ChoreSetup.tsx |

---

### Step 3.1 — Batch 1: Service files (highest impact, shared by many screens)

**Files:**
- `src/services/guest.tsx` — uses `_.keyBy`, `_.cloneDeep`, `_.isEqual`, `_.find`
- `src/services/meeting.ts` — uses `_.cloneDeep`
- `src/services/setup-wizard.ts` — uses `_.each`, `_.cloneDeep`, `_.map`
- `src/services/users.tsx` — uses `_.cloneDeep`, `_.extend`

**Before → After for `src/services/guest.tsx`:**
```typescript
// Before
import _ from 'lodash';
// ...
return _.keyBy(result, 'id') as Guests;
// line 224
const guestPhase = _.find(house.phases, phase => phase.name === guest.id);
// line 335
const isSelectedJob = _.isEqual(selectedJob, j);
// line 445
const updatedGuest = _.cloneDeep(guest);
// line 452
const updatedGuest = _.cloneDeep(guest);

// After
import { keyBy, find, isEqual, cloneDeep } from 'lodash';
//
return keyBy(result, 'id') as Guests;
const guestPhase = find(house.phases, phase => phase.name === guest.id);
const isSelectedJob = isEqual(selectedJob, j);
const updatedGuest = cloneDeep(guest);
const updatedGuest = cloneDeep(guest);
```

**Before → After for `src/services/meeting.ts`:**
```typescript
// Before
import _ from 'lodash';
// line 25
return crud.create<RatsMeeting>(meetingCollection, _.cloneDeep(meeting));

// After
import { cloneDeep } from 'lodash';
return crud.create<RatsMeeting>(meetingCollection, cloneDeep(meeting));
```

**Before → After for `src/services/setup-wizard.ts`:**
```typescript
// Before
import _ from 'lodash';
// usage: _.each, _.cloneDeep, _.map

// After
import { each, cloneDeep, map } from 'lodash';
// replace all _.each → each, _.cloneDeep → cloneDeep, _.map → map
```

**Before → After for `src/services/users.tsx`:**
```typescript
// Before
import * as _ from 'lodash';
// line 80
const user = _.cloneDeep(_user);
// line 94
const user = _.extend(_user, values);

// After
import { cloneDeep, extend } from 'lodash';
const user = cloneDeep(_user);
const user = extend(_user, values);
```

**Verify:**
```bash
npx tsc --noEmit
npx jest src/services/ --no-coverage
# Expected: zero errors, all tests pass
```

**Commit:**
```bash
git add src/services/guest.tsx src/services/meeting.ts src/services/setup-wizard.ts src/services/users.tsx
git commit -m "refactor(services): replace wildcard lodash imports with named imports"
```

---

### Step 3.2 — Batch 2: Utility files

**Files:**
- `src/util/house.tsx` — uses `_.map`, `_.each`, `_.cloneDeep`, `_.filter`, `_.find`, `_.some`, `_.sortBy`
- `src/util/guest.tsx` — uses `_.each`, `_.cloneDeep`, `_.size`, `_.isEqual`

**Before → After for `src/util/house.tsx`:**
```typescript
// Before
import _ from 'lodash';

// After
import { map, each, cloneDeep, filter, find, some, sortBy } from 'lodash';
// Replace all _.map → map, _.each → each, etc.
```

**Before → After for `src/util/guest.tsx`:**
```typescript
// Before
import _ from 'lodash';

// After
import { each, cloneDeep, size, isEqual } from 'lodash';
```

**Verify:**
```bash
npx tsc --noEmit
# Expected: zero errors
```

**Commit:**
```bash
git add src/util/house.tsx src/util/guest.tsx
git commit -m "refactor(util): replace wildcard lodash imports with named imports"
```

---

### Step 3.3 — Batch 3: Hooks

**Files:**
- `src/hooks/useBaseActivityScreen.ts` — uses `_.cloneDeep`

**Before → After:**
```typescript
// Before
import _ from 'lodash';
// lines 162, 195, 294, 320, 354
dispute = _.cloneDeep(disputes[activity.disputeId]);
const updatedGuest = _.cloneDeep(activityGuest);
// etc.

// After
import { cloneDeep } from 'lodash';
dispute = cloneDeep(disputes[activity.disputeId]);
const updatedGuest = cloneDeep(activityGuest);
// etc.
```

**Verify:**
```bash
npx tsc --noEmit
npx jest src/hooks/ --no-coverage
# Expected: zero errors
```

**Commit:**
```bash
git add src/hooks/useBaseActivityScreen.ts
git commit -m "refactor(hooks): replace wildcard lodash import in useBaseActivityScreen"
```

---

### Step 3.4 — Batch 4: Components

**Files:**
- `src/components/rats-step-indicator/index.tsx` — uses `_.size`, `_.map`
- `src/components/rats-text-input/rats-text-input.tsx` — import present, check actual usage
- `src/components/rats-image-picker/index.tsx` — import present, check actual usage

**Before → After for `rats-step-indicator/index.tsx`:**
```typescript
// Before
import _ from 'lodash';
// line 49: width / _.size(labels)
// line 73: _.map(labels, ...)

// After
import { size, map } from 'lodash';
// width / size(labels)
// map(labels, ...)
```

For `rats-text-input` and `rats-image-picker`: grep confirmed the import exists but no `_.method` calls were found. These are likely unused imports. Remove the import line entirely.

```typescript
// Before
import _ from 'lodash'; // line 24 in rats-text-input.tsx

// After
// (remove the import — it is unused)
```

**Verify:**
```bash
npx tsc --noEmit
npx jest src/components/ --no-coverage
# Expected: zero errors
```

**Commit:**
```bash
git add src/components/rats-step-indicator/index.tsx \
        src/components/rats-text-input/rats-text-input.tsx \
        src/components/rats-image-picker/index.tsx
git commit -m "refactor(components): replace wildcard lodash imports with named imports"
```

---

### Step 3.5 — Batch 5: Screens — SetupWizards group

**Files:**
- `src/screens/SetupWizards/OrgSetup.tsx` — `_.each`, `_.map`
- `src/screens/SetupWizards/ManagerSetup.tsx` — `_.size`, `_.cloneDeep`, `_.each`, `_.isEmpty`
- `src/screens/SetupWizards/ChoreSetup.tsx` — `_.cloneDeep`, `_.forEach`, `_.map`, `_.isEmpty`
- `src/screens/SetupWizards/PhaseSetup/PhaseConfigForm.tsx` — `_.cloneDeep`, `_.find`, `_.each`
- `src/screens/SetupWizards/PhaseSetup/PhaseConfigSetup.tsx` — import exists, no usage found (remove)
- `src/screens/SetupWizards/PhaseSetup/hooks/usePhaseConfigView.ts` — `_.map`
- `src/screens/SetupWizards/PhaseSetup/hooks/usePhaseSetup.ts` — `_.keys`, `_.cloneDeep`, `_.each`, `_.find`, `_.isEmpty`

**Pattern (apply to each file):**
```typescript
// Before
import _ from 'lodash';

// After (example for ManagerSetup.tsx)
import { size, cloneDeep, each, isEmpty } from 'lodash';
// Then replace _.size → size, _.cloneDeep → cloneDeep, etc.
```

**Verify:**
```bash
npx tsc --noEmit
# Expected: zero errors
```

**Commit:**
```bash
git add src/screens/SetupWizards/
git commit -m "refactor(SetupWizards): replace wildcard lodash imports with named imports"
```

---

### Step 3.6 — Batch 6: Screens — Beds group

**Files:**
- `src/screens/Beds/Beds.tsx` — `_.size`, `_.filter`, `_.map`, `_.sortBy`
- `src/screens/Beds/AssignGuest.tsx` — `_.each`, `_.map`
- `src/screens/Beds/hooks/useBedsManagement.ts` — `_.cloneDeep`
- `src/screens/Beds/RoomForm.tsx` — `_.cloneDeep`, `_.map`

**Pattern:**
```typescript
// Before
import _ from 'lodash';

// After (Beds.tsx)
import { size, filter, map, sortBy } from 'lodash';
```

**Commit:**
```bash
git add src/screens/Beds/
git commit -m "refactor(Beds): replace wildcard lodash imports with named imports"
```

---

### Step 3.7 — Batch 7: Screens — HouseConfig group

**Files:**
- `src/screens/HouseConfig/HouseConfigFormView.tsx` — `_.some`, `_.map`, `_.isEmpty`
- `src/screens/HouseConfig/HouseConfigForm.tsx` — `_.each`, `_.cloneDeep`, `_.map`

**Pattern:**
```typescript
// Before
import * as _ from 'lodash';

// After (HouseConfigFormView.tsx)
import { some, map, isEmpty } from 'lodash';
```

**Commit:**
```bash
git add src/screens/HouseConfig/
git commit -m "refactor(HouseConfig): replace wildcard lodash imports with named imports"
```

---

### Step 3.8 — Batch 8: Remaining screens

**Files:**
- `src/screens/Personal/Personal.tsx` — `_.map`, `_.each`
- `src/screens/Complaints/Complaints.tsx` — `_.toArray`
- `src/screens/HouseChat/HouseChat.tsx` — import exists, grep found no usage (remove)
- `src/screens/NewAccount/NewAccountForm.tsx` — `_.isEmpty`, `_.cloneDeep`
- `src/screens/HouseOverview/HouseSummary/HouseSummary.tsx` — `_.size`
- `src/screens/HouseSearch/HouseSearchScreen.tsx` — `_.filter`, `_.size`, `_.isEmpty`
- `src/screens/SignUp/SignUpForm.tsx` — `_.cloneDeep`
- `src/screens/Contacts/ContactScreen.tsx` — `_.each`, `_.map`
- `src/screens/IntroHouseSummary/IntroHouseSummary.tsx` — `_.map`, `_.isNil`, `_.size`
- `src/screens/HousesOverview/HousesOverview.tsx` — import exists, check usage
- `src/screens/HouseSettings/AddManager.tsx` — `_.map`
- `src/screens/Profile/ProfileUpdate.tsx` — `_.cloneDeep`
- `src/screens/Profile/PhaseCustomization.tsx` — `_.map`, `_.each`
- `src/screens/GuestList/GuestList.tsx` — import exists, check usage
- `src/screens/GuestUpdate/GuestUpdateForm.tsx` — import exists, check usage
- `src/screens/Issues/Issues.tsx` — import exists, check usage
- `src/screens/StatUpdates/MeetingSearch.tsx` — `_.isEmpty` (will be removed by Task 2 already)
- `src/screens/StatUpdates/DayTimeWidget.tsx` — import exists, check usage
- `src/screens/StatUpdates/NewMeeting.tsx` — `_.cloneDeep`

**For files where grep showed no `_.method` calls:** Simply remove the import line.

**Pattern for `_.toArray` in Complaints.tsx:**
```typescript
// Before
import _ from 'lodash';
const complaints = house?.complaints ? _.toArray(house.complaints) : [];

// After
// No lodash import needed — use native Object.values
const complaints = house?.complaints ? Object.values(house.complaints) : [];
```

**Pattern for `_.isNil` in IntroHouseSummary.tsx:**
```typescript
// Before
const number = _.isNil(house.rating) ? 3 : house.rating;

// After (no lodash import for this)
const number = house.rating == null ? 3 : house.rating;
```

**Verify after all batch 8 files:**
```bash
npx tsc --noEmit
npx jest --no-coverage --passWithNoTests
# Expected: zero errors, all tests pass
```

**Commit:**
```bash
git add src/screens/Personal/ src/screens/Complaints/ src/screens/HouseChat/ \
        src/screens/NewAccount/ src/screens/HouseOverview/ src/screens/HouseSearch/ \
        src/screens/SignUp/ src/screens/Contacts/ src/screens/IntroHouseSummary/ \
        src/screens/HousesOverview/ src/screens/HouseSettings/ src/screens/Profile/ \
        src/screens/GuestList/ src/screens/GuestUpdate/ src/screens/Issues/ \
        src/screens/StatUpdates/DayTimeWidget.tsx src/screens/StatUpdates/NewMeeting.tsx
git commit -m "refactor(screens): replace wildcard lodash imports with named imports across remaining screens"
```

---

### Step 3.9 — Final verification: confirm no wildcard lodash imports remain

```bash
grep -rn "import \* as _\|import _ from 'lodash'" /Users/marcusklein/dev/rats-v2/src --include="*.ts" --include="*.tsx"
# Expected: zero matches (or only the commented-out line in Invites.tsx)
```

---

## Task 4: Document and Verify Firestore Composite Indexes

### Context

`firebase/firestore.indexes.json` already exists at `/Users/marcusklein/dev/rats-v2/firebase/firestore.indexes.json` with 11 indexes defined. The `useActivities.ts` hook builds queries that combine any subset of: `guestId`, `houseId`, `type`, `status`, `timestamp` range + `orderBy timestamp DESC`.

**Analysis of `useActivities.ts` query combinations (lines 51–90):**

The hook applies filters in this order with `orderBy('timestamp', 'desc')` always appended:

| guestId | houseId | type | status | startDate/endDate | Needs index? |
|---|---|---|---|---|---|
| Y | — | — | — | — | YES: `guestId + timestamp DESC` |
| — | Y | — | — | — | YES: `houseId + timestamp DESC` |
| Y | — | Y | — | — | YES: `guestId + type + timestamp DESC` |
| Y | — | — | Y | — | YES: `guestId + status + timestamp DESC` |
| — | Y | Y | — | — | YES: `houseId + type + timestamp DESC` |
| — | Y | — | Y | — | YES: `houseId + status + timestamp DESC` |
| Y | — | Y | Y | — | YES: `guestId + type + status + timestamp DESC` |
| — | Y | Y | Y | — | YES: `houseId + type + status + timestamp DESC` |
| Y | — | — | — | Y | YES: `guestId + timestamp >= + orderBy timestamp DESC` (same as guestId+timestamp) |
| — | Y | — | — | Y | YES: `houseId + timestamp >= + orderBy timestamp DESC` (same as houseId+timestamp) |

**All 8 combinations are already covered** in the existing `firebase/firestore.indexes.json`. No new indexes are required for the `activities` collection.

**Missing indexes to add:** The `getActivitiesOnce` function (lines 134–189) builds the same query patterns as the hook, so no additional indexes are needed there either.

**Additional collections to verify:**
- `week-summaries`: `guestId + houseId + startDate DESC` — already indexed
- `guest-reports`: `houseId + startDate DESC` — already indexed
- `na-meetings`: `day + geohash ASC` and `geohash + day ASC` — already indexed

---

### Step 4.1 — Create `docs/FIRESTORE_INDEXES.md`

**File to create:** `src/../docs/FIRESTORE_INDEXES.md` (i.e., `/Users/marcusklein/dev/rats-v2/docs/FIRESTORE_INDEXES.md`)

```markdown
# Firestore Composite Indexes

All indexes are defined in `firebase/firestore.indexes.json` and deployed via:
```bash
firebase deploy --only firestore:indexes
```

## `activities` Collection

The `useActivities` hook (`src/hooks/activity/useActivities.ts`) builds dynamic WHERE clauses.
Every combination of equality filters + `orderBy('timestamp', 'desc')` requires a composite index.

### Indexes Required

| # | Fields | Call site |
|---|---|---|
| 1 | `guestId ASC, timestamp DESC` | `useActivities({ guestId })` |
| 2 | `guestId ASC, status ASC, timestamp DESC` | `useActivities({ guestId, status })` |
| 3 | `guestId ASC, type ASC, timestamp DESC` | `useActivities({ guestId, type })` |
| 4 | `guestId ASC, type ASC, status ASC, timestamp DESC` | `useActivities({ guestId, type, status })` |
| 5 | `houseId ASC, timestamp DESC` | `useActivities({ houseId })` |
| 6 | `houseId ASC, status ASC, timestamp DESC` | `useActivities({ houseId, status })` |
| 7 | `houseId ASC, type ASC, timestamp DESC` | `useActivities({ houseId, type })` |
| 8 | `houseId ASC, type ASC, status ASC, timestamp DESC` | `useActivities({ houseId, type, status })` |

> Note: Firestore range queries (`>=`, `<=`) on `timestamp` combined with `orderBy('timestamp')` do NOT
> require a separate index from the base `field + timestamp` index. Firestore treats the range filter
> and orderBy on the same field as a single-field range scan.

### Status

All 8 indexes are currently defined in `firebase/firestore.indexes.json`. Status: DEPLOYED.

To verify deployment status:
```bash
firebase firestore:indexes
```

## `week-summaries` Collection

| Fields | Call site |
|---|---|
| `guestId ASC, houseId ASC, startDate DESC` | Week summary queries |

Status: DEPLOYED.

## `guest-reports` Collection

| Fields | Call site |
|---|---|
| `houseId ASC, startDate DESC` | Guest report queries |

Status: DEPLOYED.

## `na-meetings` Collection

| Fields | Call site |
|---|---|
| `day ASC, geohash ASC` | Meeting search by day |
| `geohash ASC, day ASC` | Meeting search by location |

Status: DEPLOYED.

## Adding a New Index

When a new query combination is needed:

1. Add the index to `firebase/firestore.indexes.json`
2. Update this document
3. Deploy: `firebase deploy --only firestore:indexes`
4. Monitor: Firestore console → Indexes tab

## Warning Signs

If you see this error in production logs:
```
FirebaseError: The query requires an index.
```
The URL in the error links directly to the Firebase console to create the missing index. Copy the
generated index JSON into `firebase/firestore.indexes.json` and redeploy.
```

**Commit:**
```bash
git add docs/FIRESTORE_INDEXES.md
git commit -m "docs(firestore): document all required composite indexes for activities and related collections"
```

---

## Final Verification

```bash
# 1. TypeScript clean
npx tsc --noEmit
# Expected: zero errors

# 2. Full test suite
npx jest --no-coverage --passWithNoTests
# Expected: all green

# 3. No wildcard lodash imports remain
grep -rn "import \* as _\|import _ from 'lodash'" /Users/marcusklein/dev/rats-v2/src --include="*.ts" --include="*.tsx"
# Expected: zero matches (excluding commented-out lines)

# 4. Confirm RentPaymentScreen is now under 200 lines
wc -l /Users/marcusklein/dev/rats-v2/src/screens/RentPayment/RentPaymentScreen.tsx
# Expected: < 220

# 5. Confirm MeetingSearch.tsx is now under 150 lines
wc -l /Users/marcusklein/dev/rats-v2/src/screens/StatUpdates/MeetingSearch.tsx
# Expected: < 150

# 6. New files exist
ls /Users/marcusklein/dev/rats-v2/src/screens/RentPayment/
# Expected: PaymentStatusBadge.tsx, PaymentRow.tsx, rentPaymentHelpers.ts, RentPaymentScreen.tsx, __tests__/

ls /Users/marcusklein/dev/rats-v2/src/screens/StatUpdates/
# Expected: MeetingSearchBar.tsx, MeetingResultsList.tsx, MeetingSearch.tsx, __tests__/

ls /Users/marcusklein/dev/rats-v2/docs/
# Expected: FIRESTORE_INDEXES.md, plans/
```

---

## Commit Summary

| # | Commit message | Files |
|---|---|---|
| 1 | `refactor(RentPayment): extract PaymentStatusBadge and PaymentRow into standalone files` | 6 files |
| 2 | `refactor(MeetingSearch): extract MeetingSearchBar and MeetingResultsList into standalone files` | 5 files |
| 3 | `refactor(services): replace wildcard lodash imports with named imports` | 4 files |
| 4 | `refactor(util): replace wildcard lodash imports with named imports` | 2 files |
| 5 | `refactor(hooks): replace wildcard lodash import in useBaseActivityScreen` | 1 file |
| 6 | `refactor(components): replace wildcard lodash imports with named imports` | 3 files |
| 7 | `refactor(SetupWizards): replace wildcard lodash imports with named imports` | 7 files |
| 8 | `refactor(Beds): replace wildcard lodash imports with named imports` | 4 files |
| 9 | `refactor(HouseConfig): replace wildcard lodash imports with named imports` | 2 files |
| 10 | `refactor(screens): replace wildcard lodash imports with named imports across remaining screens` | ~20 files |
| 11 | `docs(firestore): document all required composite indexes for activities and related collections` | 1 file |
