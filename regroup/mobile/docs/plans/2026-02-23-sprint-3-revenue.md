# Sprint 3 Revenue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate the Oxford House module behind a subscription flag, add payment amount presets to reduce friction, and schedule rent-due push notifications for guests with an outstanding balance.

**Architecture:** Each task is independently committable and touches only the minimum surface area required — no new abstractions, no new files unless a test file is needed. The paywall reads from the existing `OperatorSubscription` class already stored in `user.subscriptionMetadata`. The presets slot into the existing `ResidentPayment` card above the `TextInput` that already exists at line 292. The notification piggybacks on `react-native-push-notification` via the existing `NotificationService` class in `src/services/notifications/service.ts`.

**Tech Stack:** React Native, TypeScript (strict), Redux Toolkit, Jest + `@testing-library/react-native`, `react-native-push-notification`

---

## Task 1: Oxford House Premium Tier Paywall

**Commit target:** `feat(oxford): gate OxfordDashboard behind oxfordEnabled subscription flag`

### Step 1.1 — Write the failing test

**File:** `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx` (new file)

Create this file:

```tsx
/**
 * OxfordDashboard paywall tests
 *
 * Covers:
 *  - Shows upgrade prompt when oxfordEnabled is false / missing
 *  - Shows dashboard content when oxfordEnabled is true
 */

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: jest.fn(() => Promise.resolve()),
        update: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
        collection: jest.fn().mockReturnThis(),
      })),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve({ docs: [] })),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn(() => Promise.resolve()),
    })),
  },
}));

jest.mock('../../../../state/queries/oxfordQueries', () => ({
  useOfficers: () => ({ data: [] }),
  useBusinessMeetings: () => ({ data: [] }),
  useEESTransactions: () => ({ data: [] }),
}));

jest.mock('../../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../../components/rats-text', () => ({
  RatsText: ({ text, testID }: any) => {
    const { Text } = require('react-native');
    return <Text testID={testID}>{text}</Text>;
  },
}));

jest.mock('../../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryFontFamily: 'System',
      secondaryFontFamily: 'System',
      primaryColor: '#000',
      secondaryColor: '#fff',
      tertiaryColor: '#ccc',
      backgroundColor: '#fff',
      textColor: '#000',
      logoTintColor: '#fff',
    },
  }),
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import OxfordDashboard from '../OxfordDashboard';

const makeStore = (oxfordEnabled: boolean) =>
  configureStore({
    reducer: {
      housesRTK: () => ({
        selectedHouse: { id: 'h1', houseType: 'oxford' },
      }),
      userRTK: () => ({
        user: {
          subscriptionMetadata: { oxfordEnabled },
        },
      }),
    },
  });

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

describe('OxfordDashboard paywall', () => {
  it('shows upgrade prompt when oxfordEnabled is false', () => {
    const store = makeStore(false);
    const { getByTestId } = render(
      <Provider store={store}>
        <OxfordDashboard navigation={navigation} />
      </Provider>,
    );
    expect(getByTestId('oxford-upgrade-prompt')).toBeTruthy();
  });

  it('shows upgrade prompt when oxfordEnabled is missing', () => {
    const store = configureStore({
      reducer: {
        housesRTK: () => ({
          selectedHouse: { id: 'h1', houseType: 'oxford' },
        }),
        userRTK: () => ({
          user: { subscriptionMetadata: {} },
        }),
      },
    });
    const { getByTestId } = render(
      <Provider store={store}>
        <OxfordDashboard navigation={navigation} />
      </Provider>,
    );
    expect(getByTestId('oxford-upgrade-prompt')).toBeTruthy();
  });

  it('shows dashboard content when oxfordEnabled is true', () => {
    const store = makeStore(true);
    const { getByTestId } = render(
      <Provider store={store}>
        <OxfordDashboard navigation={navigation} />
      </Provider>,
    );
    expect(getByTestId('oxford-dashboard-content')).toBeTruthy();
  });
});
```

**Run (expect FAIL — `oxford-upgrade-prompt` not found):**

```bash
npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx --no-coverage
```

---

### Step 1.2 — Add `oxfordEnabled` to `OperatorSubscription`

**File:** `src/entities/User.tsx`

**Before (line 18-32):**

```ts
export class OperatorSubscription {
  subscriptionId: string = '';
  currentPeriodEnd: number = 0;
  customerId: string = '';
  status: string = '';
  items: {
    houseItemId: string;
    guestItemId: string;
  } = { guestItemId: '', houseItemId: '' };
  houses: {
    [houseId: string]: {
      numberOfGuests: number;
    };
  } = {};
}
```

**After:**

```ts
export class OperatorSubscription {
  subscriptionId: string = '';
  currentPeriodEnd: number = 0;
  customerId: string = '';
  status: string = '';
  items: {
    houseItemId: string;
    guestItemId: string;
  } = { guestItemId: '', houseItemId: '' };
  houses: {
    [houseId: string]: {
      numberOfGuests: number;
    };
  } = {};
  oxfordEnabled: boolean = false;
}
```

---

### Step 1.3 — Add the paywall gate to `OxfordDashboard`

**File:** `src/screens/Oxford/OxfordDashboard.tsx`

**Before (line 21-22, imports from state):**

```ts
import { useAppSelector } from '../../state/store';
import {
```

**After — add a second selector import line (no change to existing imports, just add after the useAppSelector import block):**

The existing import block at lines 21-26 stays. The changes are in the component body and JSX only.

**Before (line 43-71, the component open and the non-oxford guard):**

```ts
const OxfordDashboard: React.FC<Props> = ({ navigation }) => {
  const house = useAppSelector(state => state.housesRTK.selectedHouse);

  const houseId = house?.id ?? '';

  const officersQuery = useOfficers(houseId, !!houseId);
  const meetingsQuery = useBusinessMeetings(houseId, !!houseId);
  const transactionsQuery = useEESTransactions(houseId, !!houseId);

  const activeOfficers = (officersQuery.data ?? []).filter(o => o.isActive);
  const upcomingMeetings = (meetingsQuery.data ?? [])
    .filter(m => !m.actualDate)
    .slice(0, 3);
  const recentTransactions = (transactionsQuery.data ?? []).slice(0, 5);

  if (!house || house.houseType !== 'oxford') {
    return (
      <View style={styles.container}>
        <ScreenHeader header="Oxford House" renderBackButton />
        <View style={styles.emptyState}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={styles.emptyText}
            translate={false}
          />
        </View>
      </View>
    );
  }
```

**After:**

```ts
const OxfordDashboard: React.FC<Props> = ({ navigation }) => {
  const house = useAppSelector(state => state.housesRTK.selectedHouse);
  const subscriptionMetadata = useAppSelector(
    (state: any) => state.userRTK.user?.subscriptionMetadata,
  );

  const houseId = house?.id ?? '';

  const officersQuery = useOfficers(houseId, !!houseId);
  const meetingsQuery = useBusinessMeetings(houseId, !!houseId);
  const transactionsQuery = useEESTransactions(houseId, !!houseId);

  const activeOfficers = (officersQuery.data ?? []).filter(o => o.isActive);
  const upcomingMeetings = (meetingsQuery.data ?? [])
    .filter(m => !m.actualDate)
    .slice(0, 3);
  const recentTransactions = (transactionsQuery.data ?? []).slice(0, 5);

  if (!house || house.houseType !== 'oxford') {
    return (
      <View style={styles.container}>
        <ScreenHeader header="Oxford House" renderBackButton />
        <View style={styles.emptyState}>
          <RatsText
            text="Oxford House features are not enabled for this house."
            style={styles.emptyText}
            translate={false}
          />
        </View>
      </View>
    );
  }

  if (!subscriptionMetadata?.oxfordEnabled) {
    return (
      <View style={styles.container} testID="oxford-upgrade-prompt">
        <ScreenHeader header="Oxford House" renderBackButton />
        <View style={styles.emptyState}>
          <RatsText
            text="Oxford House features require an Oxford Plan subscription."
            style={styles.emptyText}
            translate={false}
          />
          <TouchableOpacity
            testID="oxford-upgrade-button"
            onPress={() => {
              const { Linking } = require('react-native');
              Linking.openURL('https://regroup-app.com/my-account');
            }}
            style={styles.upgradeButton}>
            <RatsText
              text="Upgrade to Oxford Plan"
              style={styles.upgradeButtonText}
              translate={false}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
```

Also wrap the main dashboard return JSX with `testID="oxford-dashboard-content"` on the outermost `ScrollView`. Locate the existing `<ScrollView` in the component return (after line 71) and add `testID="oxford-dashboard-content"` to it.

Add to `StyleSheet.create(...)` at the bottom of the file:

```ts
upgradeButton: {
  marginTop: normalize(20),
  backgroundColor: color.baby_blue,
  borderRadius: 8,
  paddingVertical: normalize(12),
  paddingHorizontal: normalize(24),
  alignSelf: 'center',
},
upgradeButtonText: {
  color: color.white,
  fontSize: fontSize.medium,
  fontFamily: fontFamily.bold,
},
```

> Note: `color.white` and `fontFamily.bold` — verify these exist in `src/styles/theme.ts`. If `color.white` is not present use `'#FFFFFF'` as a literal.

---

### Step 1.4 — Run tests (expect PASS) and TypeScript check

```bash
npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx --no-coverage
```

Expected output: `3 passed, 3 total`

```bash
npx tsc --noEmit
```

Expected output: no errors.

---

### Step 1.5 — Commit

```
feat(oxford): gate OxfordDashboard behind oxfordEnabled subscription flag

Add `oxfordEnabled: boolean` to OperatorSubscription. OxfordDashboard now
shows an upgrade prompt with a link to regroup-app.com/my-account when the
operator's subscription does not include oxford access.
```

---

## Task 2: Payment Amount Presets in ResidentPayment

**Commit target:** `feat(payments): add Pay Full Due / Half / Custom preset buttons`

### Step 2.1 — Write the failing test

**File:** `src/screens/Payments/__tests__/ResidentPayment.test.tsx`

Append the following `describe` block **after** the last existing test in the file. Do not remove any existing tests.

```tsx
describe('Amount preset buttons', () => {
  // Helper: build a store where guest.rentOwed is configurable
  const makeStoreWithRentOwed = (rentOwed: number) =>
    configureStore({
      reducer: {
        guestsRTK: () => ({
          selectedGuest: {
            id: 'g1',
            firstName: 'Jane',
            lastName: 'Doe',
            rentOwed,
          },
        }),
        housesRTK: () => ({
          selectedHouse: { id: 'h1', name: 'Test House' },
        }),
      },
    });

  it('shows Pay Full Due and Half buttons when rentOwed > 0', () => {
    const store = makeStoreWithRentOwed(10000); // $100.00 in cents
    const { getByTestId } = render(
      <Provider store={store}>
        <ResidentPayment navigation={{ goBack: jest.fn() } as any} />
      </Provider>,
    );
    expect(getByTestId('preset-full-due')).toBeTruthy();
    expect(getByTestId('preset-half')).toBeTruthy();
  });

  it('shows only Custom button when rentOwed === 0', () => {
    const store = makeStoreWithRentOwed(0);
    const { getByTestId, queryByTestId } = render(
      <Provider store={store}>
        <ResidentPayment navigation={{ goBack: jest.fn() } as any} />
      </Provider>,
    );
    expect(getByTestId('preset-custom')).toBeTruthy();
    expect(queryByTestId('preset-full-due')).toBeNull();
    expect(queryByTestId('preset-half')).toBeNull();
  });

  it('tapping Pay Full Due sets the amount input to rentOwed in dollars', async () => {
    const store = makeStoreWithRentOwed(10000); // $100.00
    const { getByTestId } = render(
      <Provider store={store}>
        <ResidentPayment navigation={{ goBack: jest.fn() } as any} />
      </Provider>,
    );
    const fullDueButton = getByTestId('preset-full-due');
    fireEvent.press(fullDueButton);
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('100.00');
  });

  it('tapping Half sets the amount input to floor(rentOwed/2) in dollars', async () => {
    const store = makeStoreWithRentOwed(10100); // $101.00, half = $50.00
    const { getByTestId } = render(
      <Provider store={store}>
        <ResidentPayment navigation={{ goBack: jest.fn() } as any} />
      </Provider>,
    );
    fireEvent.press(getByTestId('preset-half'));
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('50.00');
  });

  it('tapping Custom clears the amount input', async () => {
    const store = makeStoreWithRentOwed(10000);
    const { getByTestId } = render(
      <Provider store={store}>
        <ResidentPayment navigation={{ goBack: jest.fn() } as any} />
      </Provider>,
    );
    // First set a value via Full Due
    fireEvent.press(getByTestId('preset-full-due'));
    // Then press Custom to clear
    fireEvent.press(getByTestId('preset-custom'));
    const input = getByTestId('payment-amount-input');
    expect(input.props.value).toBe('');
  });
});
```

> Note: `configureStore`, `fireEvent`, and `Provider` must already be imported in the test file. Check the existing imports at the top of `ResidentPayment.test.tsx` and add any that are missing.

**Run (expect FAIL — testIDs not found):**

```bash
npx jest src/screens/Payments/__tests__/ResidentPayment.test.tsx --no-coverage
```

---

### Step 2.2 — Implement the preset buttons

**File:** `src/screens/Payments/ResidentPayment.tsx`

**Where:** Inside the `// Amount section` card, immediately before the `<TextInput` at line 292. The insert point is after the `<RatsText text="Amount ($)" .../>` label (line 288-291) and before the `<TextInput` (line 292).

**Before (lines 287-307):**

```tsx
          <RatsText
            translate={false}
            text="Amount ($)"
            style={styles.label}
          />
          <TextInput
            testID="payment-amount-input"
            style={[
              styles.input,
              !amountIsValid && amountInput.length > 0 && styles.inputError,
            ]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.grey}
            value={amountInput}
            onChangeText={setAmountInput}
            editable={!isBusy && paramAmountCents === null}
            returnKeyType="done"
            accessibilityLabel="Payment amount in dollars"
          />
```

**After:**

```tsx
          <RatsText
            translate={false}
            text="Amount ($)"
            style={styles.label}
          />

          {/* Quick-select preset buttons */}
          <View style={styles.presetRow}>
            {(guest?.rentOwed ?? 0) > 0 && (
              <>
                <TouchableOpacity
                  testID="preset-full-due"
                  style={styles.presetButton}
                  onPress={() =>
                    setAmountInput((guest.rentOwed / 100).toFixed(2))
                  }>
                  <RatsText
                    translate={false}
                    text="Pay Full Due"
                    style={styles.presetButtonText}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  testID="preset-half"
                  style={styles.presetButton}
                  onPress={() =>
                    setAmountInput(
                      (Math.floor(guest.rentOwed / 2) / 100).toFixed(2),
                    )
                  }>
                  <RatsText
                    translate={false}
                    text="Half"
                    style={styles.presetButtonText}
                  />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              testID="preset-custom"
              style={styles.presetButton}
              onPress={() => setAmountInput('')}>
              <RatsText
                translate={false}
                text="Custom"
                style={styles.presetButtonText}
              />
            </TouchableOpacity>
          </View>

          <TextInput
            testID="payment-amount-input"
            style={[
              styles.input,
              !amountIsValid && amountInput.length > 0 && styles.inputError,
            ]}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={color.grey}
            value={amountInput}
            onChangeText={setAmountInput}
            editable={!isBusy}
            returnKeyType="done"
            accessibilityLabel="Payment amount in dollars"
          />
```

> Note: `editable` changed from `!isBusy && paramAmountCents === null` to `!isBusy` so the preset buttons can update a pre-filled param amount. Verify this does not break existing tests; if it does, restore the old `editable` condition and make the presets only render when `paramAmountCents === null`.

Add to `StyleSheet.create(...)`:

```ts
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: normalize(8),
    marginBottom: normalize(8),
  },
  presetButton: {
    borderWidth: 1,
    borderColor: color.baby_blue,
    borderRadius: 6,
    paddingVertical: normalize(6),
    paddingHorizontal: normalize(12),
  },
  presetButtonText: {
    fontSize: fontSize.small,
    color: color.baby_blue,
  },
```

> Note: `gap` in StyleSheet requires React Native >= 0.71. If the project targets an older RN version, replace `gap: normalize(8)` with `marginRight: normalize(8)` and add `marginBottom: normalize(8)` to `presetButton`.

---

### Step 2.3 — Run tests (expect PASS) and TypeScript check

```bash
npx jest src/screens/Payments/__tests__/ResidentPayment.test.tsx --no-coverage
```

Expected output: all tests pass (existing + 5 new).

```bash
npx tsc --noEmit
```

Expected output: no errors.

---

### Step 2.4 — Commit

```
feat(payments): add Pay Full Due / Half / Custom preset buttons to ResidentPayment

Preset buttons above the amount input set the value to the resident's full
outstanding balance, half that balance, or clear for manual entry. When
rentOwed is zero only the Custom button is shown.
```

---

## Task 3: Payment Reminders via Push Notifications

**Commit target:** `feat(notifications): schedule rent reminder 3 days before Monday due date`

### Step 3.1 — Write the failing test

**File:** `src/screens/Profile/__tests__/GuestHome.test.tsx`

Open the existing file and append the following describe block after the last existing test. Do not remove any existing tests.

First confirm `react-native-push-notification` is mocked at the top of the file. If it is not, add this mock near the other `jest.mock` calls:

```ts
jest.mock('react-native-push-notification', () => ({
  localNotificationSchedule: jest.fn(),
  cancelLocalNotification: jest.fn(),
  getApplicationIconBadgeNumber: jest.fn(),
  setApplicationIconBadgeNumber: jest.fn(),
  getChannels: jest.fn(),
  createChannel: jest.fn(),
  checkPermissions: jest.fn(),
}));
```

Also mock the notification service module:

```ts
const mockScheduleRentReminder = jest.fn();
const mockCancelRentReminder = jest.fn();

jest.mock('../../../services/notifications/rentReminder', () => ({
  scheduleRentReminder: (...args: any[]) => mockScheduleRentReminder(...args),
  cancelRentReminder: (...args: any[]) => mockCancelRentReminder(...args),
}));
```

Then append the test block:

```tsx
describe('Rent reminder notification scheduling', () => {
  beforeEach(() => {
    mockScheduleRentReminder.mockClear();
  });

  it('schedules a rent reminder when guest has rentOwed > 0', () => {
    // Render GuestHome with a guest that has outstanding rent
    // The useEffect should call scheduleRentReminder on mount
    const store = makeStore({
      guest: { ...defaultGuest, rentOwed: 5000 },
      house: defaultHouse,
    });
    render(
      <Provider store={store}>
        <GuestHome navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any} />
      </Provider>,
    );
    expect(mockScheduleRentReminder).toHaveBeenCalledWith(
      expect.objectContaining({ id: defaultGuest.id }),
    );
  });

  it('does not schedule a reminder when rentOwed === 0', () => {
    const store = makeStore({
      guest: { ...defaultGuest, rentOwed: 0 },
      house: defaultHouse,
    });
    render(
      <Provider store={store}>
        <GuestHome navigation={{ navigate: jest.fn(), goBack: jest.fn() } as any} />
      </Provider>,
    );
    expect(mockScheduleRentReminder).not.toHaveBeenCalled();
  });
});
```

> Note: `makeStore`, `defaultGuest`, and `defaultHouse` are helpers that likely already exist in the test file. Read the full test file first and adapt the helper names to match what is already there. If no helper exists, define minimal ones inline.

**Run (expect FAIL — module `rentReminder` does not exist):**

```bash
npx jest src/screens/Profile/__tests__/GuestHome.test.tsx --no-coverage
```

---

### Step 3.2 — Create the `rentReminder` notification helper

**File:** `src/services/notifications/rentReminder.ts` (new file)

```ts
/**
 * rentReminder.ts
 *
 * Schedules (and cancels) a local push notification reminding a guest that
 * rent is due in 3 days (i.e., on the Monday of the current week).
 *
 * The notification ID is deterministic per guest so re-scheduling is
 * idempotent and cancellation is precise.
 */

import PushNotification from 'react-native-push-notification';
import { Guest } from '../../entities/Guest';

const CHANNEL_ID = 'default-channel-id';

/**
 * Returns a stable numeric notification ID derived from the guest ID string.
 * Uses a simple hash so it fits in a 32-bit integer and is always the same
 * for the same guest.
 */
function guestNotificationId(guestId: string): number {
  let hash = 0;
  for (let i = 0; i < guestId.length; i++) {
    hash = (hash << 5) - hash + guestId.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash) % 2_000_000_000; // stay well within 32-bit range
}

/**
 * Returns the Date for 3 days before the next Monday (or the coming Monday
 * if today is before Friday). Rent is due Monday; we notify on Friday.
 *
 * Simplified rule: schedule for the nearest upcoming Friday at 09:00 local.
 */
function nextFridayAt9am(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  // Days until Friday (5). If today is Friday or later, aim for next Friday.
  const daysUntilFriday = ((5 - day + 7) % 7) || 7;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(9, 0, 0, 0);
  return friday;
}

/**
 * Schedules a "Rent Reminder" notification for the guest.
 * Safe to call on every GuestHome mount — the OS deduplicates by ID.
 *
 * Only call when guest.rentOwed > 0.
 */
export function scheduleRentReminder(guest: Guest): void {
  PushNotification.localNotificationSchedule({
    id: guestNotificationId(guest.id),
    channelId: CHANNEL_ID,
    title: 'Rent Reminder',
    message: 'Your rent payment is due in 3 days. Tap to pay now.',
    date: nextFridayAt9am(),
    userInfo: { screen: 'residentPayment', guestId: guest.id },
    allowWhileIdle: true,
  });
}

/**
 * Cancels the rent reminder for the guest (call after successful payment).
 */
export function cancelRentReminder(guest: Guest): void {
  PushNotification.cancelLocalNotification(
    String(guestNotificationId(guest.id)),
  );
}
```

---

### Step 3.3 — Wire scheduling into `GuestHome`

**File:** `src/screens/Profile/GuestHome.tsx`

**Before (imports block — after line 64, the reportExport import):**

```ts
// Report export
import { exportWeeklyReportPDF } from '../../services/reportExport';
```

**After:**

```ts
// Report export
import { exportWeeklyReportPDF } from '../../services/reportExport';

// Notifications
import {
  scheduleRentReminder,
  cancelRentReminder,
} from '../../services/notifications/rentReminder';
```

**Before (inside `GuestHome` component, after line 187 — the `useState(false)` for exportingPDF):**

```ts
  // Local state for PDF export
  const [exportingPDF, setExportingPDF] = useState(false);
```

**After:**

```ts
  // Local state for PDF export
  const [exportingPDF, setExportingPDF] = useState(false);

  // Schedule rent reminder on mount when guest has outstanding balance
  const guestId = currentGuest?.id;
  const rentOwed = currentGuest?.rentOwed ?? 0;
  React.useEffect(() => {
    if (currentGuest && rentOwed > 0) {
      scheduleRentReminder(currentGuest);
    }
  }, [guestId, rentOwed]); // re-schedule if guest or balance changes
```

> Note: `currentGuest` is defined later in the component at line 200. Because hooks must be called unconditionally, the `useEffect` must be placed after `currentGuest` is resolved. In the current file structure, `currentGuest` is declared at line 200 and the early returns are at lines 227-241. The `useEffect` must be called before those early returns. Place it immediately after line 204 (`const { summary } = useWeekSummary(...)`), using the same pattern as the compliance check hook which is also called before the early returns.

Exact placement target — after:

```ts
  // Activity system: pre-fetch week summary (hooks must be called before early returns)
  const { startDate } = useCurrentWeek();
  const { summary } = useWeekSummary(currentGuest?.id, house?.id, startDate);
```

Insert:

```ts
  // Schedule a rent reminder for guests with an outstanding balance.
  // Must be above early returns so the hook call is unconditional.
  const _guestId = currentGuest?.id;
  const _rentOwed = currentGuest?.rentOwed ?? 0;
  React.useEffect(() => {
    if (currentGuest && _rentOwed > 0) {
      scheduleRentReminder(currentGuest as Guest);
    }
  }, [_guestId, _rentOwed]); // eslint-disable-line react-hooks/exhaustive-deps
```

---

### Step 3.4 — Wire cancellation into `ResidentPayment` after successful payment

**File:** `src/screens/Payments/ResidentPayment.tsx`

**Before (imports block at top of file):**

Add after the existing imports:

```ts
// Rent reminder cancellation
let cancelRentReminder: ((guest: any) => void) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  cancelRentReminder = require('../../services/notifications/rentReminder').cancelRentReminder;
} catch {
  // Notification service unavailable on this branch
}
```

**Before (Step 4 — success block, lines 213-215):**

```ts
    // Step 4 — success
    setSuccessAmountDisplay(formatCurrency(amountInCents));
    setPaymentState('success');
```

**After:**

```ts
    // Step 4 — success
    setSuccessAmountDisplay(formatCurrency(amountInCents));
    setPaymentState('success');
    // Cancel the rent reminder now that payment is confirmed
    if (cancelRentReminder && guest) {
      cancelRentReminder(guest);
    }
```

---

### Step 3.5 — Run tests (expect PASS) and TypeScript check

```bash
npx jest src/screens/Profile/__tests__/GuestHome.test.tsx --no-coverage
```

Expected output: all tests pass (existing + 2 new).

```bash
npx jest src/screens/Payments/__tests__/ResidentPayment.test.tsx --no-coverage
```

Expected output: all tests pass (no regressions from the cancellation addition).

```bash
npx tsc --noEmit
```

Expected output: no errors.

---

### Step 3.6 — Commit

```
feat(notifications): schedule rent reminder 3 days before Monday due date

Add rentReminder.ts service that uses react-native-push-notification to
schedule a "Rent Reminder" local notification on the Friday before rent is
due. GuestHome schedules it on mount when rentOwed > 0. ResidentPayment
cancels it after a successful Stripe payment.
```

---

## Full Test Run

After all three tasks are complete, run the full affected suite:

```bash
npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx \
         src/screens/Payments/__tests__/ResidentPayment.test.tsx \
         src/screens/Profile/__tests__/GuestHome.test.tsx \
         --no-coverage
```

Expected output: all tests pass, 0 failures.

```bash
npx tsc --noEmit
```

Expected output: no errors.

---

## File Change Summary

| File | Change |
|------|--------|
| `src/entities/User.tsx` | Add `oxfordEnabled: boolean = false` to `OperatorSubscription` |
| `src/screens/Oxford/OxfordDashboard.tsx` | Read `subscriptionMetadata.oxfordEnabled`; render upgrade prompt if false |
| `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx` | New — 3 paywall tests |
| `src/screens/Payments/ResidentPayment.tsx` | Add preset buttons above TextInput; cancel reminder on success |
| `src/screens/Payments/__tests__/ResidentPayment.test.tsx` | Append 5 preset button tests |
| `src/services/notifications/rentReminder.ts` | New — `scheduleRentReminder` and `cancelRentReminder` |
| `src/screens/Profile/GuestHome.tsx` | Import `scheduleRentReminder`; add `useEffect` above early returns |
| `src/screens/Profile/__tests__/GuestHome.test.tsx` | Append 2 notification scheduling tests |
