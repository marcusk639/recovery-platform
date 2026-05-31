# Week 0 Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all launch blockers and security P0s that block both parallel tracks from progressing safely.

**Architecture:** 8 independent, committable tasks. Each one is a bug fix or security patch. All tasks are in either rats-v2 (React Native) or regroup-functions/functions (Cloud Functions). No new abstractions — minimal surgical changes only. TDD throughout.

**Tech Stack:** React Native 0.72, TypeScript strict, Jest + `@testing-library/react-native`, Firebase Cloud Functions v2 (TypeScript), Firestore security rules

---

## Task 0: Verify Dual-Repo Deployment

**Files:**

- Read: `docs/plans/ACTIVE_PLAN.md` (Part 1 — Embedded functions section)

**Step 1: Confirm rats-v2/functions is gone**

```bash
ls /Users/marcusklein/dev/rats-v2/functions 2>/dev/null && echo "EXISTS — needs removal" || echo "GONE — OK"
```

Expected: `GONE — OK`

**Step 2: Update ACTIVE_PLAN if still says "Embedded functions/ present"**

In `docs/plans/ACTIVE_PLAN.md`, find the line:

```
### Embedded functions/ (in regroup-rn7 repo)
```

And replace the section with:

```markdown
### Embedded functions/ (RESOLVED)

- All 7 Stripe-specific functions were migrated to `regroup-functions/functions/src/callable/payments.ts`
- The `rats-v2/functions/` directory has been removed
- `regroup-functions` is the sole canonical deployment source
```

**Step 3: Commit**

```bash
git add docs/plans/ACTIVE_PLAN.md
git commit -m "docs: mark embedded functions resolved — regroup-functions is canonical"
```

---

## Task 1: Fix `subscriptionIsActive()` — Trialing Users Blocked

**Files:**

- Modify: `src/util/subscription.ts:17-19`
- Test: `src/util/__tests__/subscription.test.ts:109-136`

**Context:** `subscriptionIsActive()` returns `false` for `'trialing'` status. Every paywall in the app uses this function. Trial users hit every paywall and see a "subscription required" wall immediately after signing up. The existing test at line 120 _asserts this broken behavior_ — we fix the test first, then the implementation.

**Step 1: Update the failing test**

In `src/util/__tests__/subscription.test.ts`, find this test (around line 120):

```typescript
it('returns false when subscription status is "trialing"', () => {
  const user = makeUser({ status: 'trialing' });
  expect(subscriptionIsActive(user)).toBe(false);
});
```

Change it to:

```typescript
it('returns true when subscription status is "trialing"', () => {
  const user = makeUser({ status: 'trialing' });
  expect(subscriptionIsActive(user)).toBe(true);
});
```

**Step 2: Run the test to confirm it fails**

```bash
cd /Users/marcusklein/dev/rats-v2
npx jest src/util/__tests__/subscription.test.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `expect(received).toBe(expected)` — received `false`, expected `true`

**Step 3: Fix the implementation**

In `src/util/subscription.ts`, replace lines 17-19:

```typescript
// BEFORE
export const subscriptionIsActive = (user: User) => {
  return subscriptionStatus(user) === 'active';
};
```

```typescript
// AFTER
export const subscriptionIsActive = (user: User) => {
  const status = subscriptionStatus(user);
  return status === 'active' || status === 'trialing';
};
```

**Step 4: Run tests to confirm they pass**

```bash
npx jest src/util/__tests__/subscription.test.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS — all tests green

**Step 5: Audit paywall guards across the codebase**

```bash
grep -rn "subscriptionIsActive" src/ --include="*.tsx" --include="*.ts"
```

For each file found: confirm it uses `subscriptionIsActive(user)` (not a raw status check). No changes needed since the function now handles trialing. Document findings in a comment if any raw checks are found.

**Step 6: Commit**

```bash
git add src/util/subscription.ts src/util/__tests__/subscription.test.ts
git commit -m "fix(subscription): subscriptionIsActive returns true for trialing status"
```

---

## Task 2: Fix Oxford Upgrade CTA — Replace Linking.openURL with In-App Navigation

**Files:**

- Modify: `src/screens/Oxford/OxfordDashboard.tsx:134-143`
- Test: `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx` (create if not exists; add if exists)

**Context:** The "Start 14-Day Free Trial" button calls `Linking.openURL('https://regroup-app.com/my-account')`. This kicks the user out of the app to Safari, where they must re-authenticate on the web. Conversion abandonment is very high. Fix: navigate to `Routes.SubscriptionHandler`, the in-app WebView already built for this purpose.

**Step 1: Write the failing test**

Check if `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx` exists:

```bash
ls src/screens/Oxford/__tests__/OxfordDashboard.test.tsx 2>/dev/null && echo "exists" || echo "create"
```

If it does not exist, create `src/screens/Oxford/__tests__/OxfordDashboard.test.tsx`:

```typescript
// src/screens/Oxford/__tests__/OxfordDashboard.test.tsx

jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  TouchableOpacity: 'TouchableOpacity',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: any) => s },
  Linking: { openURL: jest.fn() },
}));

jest.mock('../../../firebase-setup', () => ({}));

jest.mock('../../../state/store', () => ({
  useAppSelector: jest.fn(),
}));

jest.mock('../../../state/queries/oxfordQueries', () => ({
  useOfficers: () => ({ data: [], isLoading: false }),
  useBusinessMeetings: () => ({ data: [], isLoading: false }),
  useEESTransactions: () => ({ data: [], isLoading: false }),
}));

jest.mock('../../../styles/theme', () => ({
  color: {},
  fontSize: {},
  normalize: (n: number) => n,
  CARD_STYLE: {},
}));

jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/rats-text', () => ({ RatsText: 'RatsText' }));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useAppSelector } from '../../../state/store';
import { Linking } from 'react-native';
import { Routes } from '../../../navigation/types';
import OxfordDashboard from '../OxfordDashboard';

const mockNavigate = jest.fn();

function renderWithProps(subscriptionMetadata: any, houseType = 'oxford') {
  (useAppSelector as jest.Mock).mockImplementation((selector: any) => {
    const state = {
      housesRTK: { selectedHouse: { id: 'house-1', houseType } },
      userRTK: { user: { subscriptionMetadata } },
    };
    return selector(state);
  });

  return render(
    <OxfordDashboard navigation={{ navigate: mockNavigate } as any} />,
  );
}

describe('OxfordDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows upgrade prompt when oxfordEnabled is false', () => {
    const { getByTestId } = renderWithProps({ oxfordEnabled: false });
    expect(getByTestId('oxford-upgrade-prompt')).toBeTruthy();
  });

  it('navigates in-app when upgrade button is pressed — does NOT call Linking.openURL', () => {
    const { getByTestId } = renderWithProps({ oxfordEnabled: false });
    fireEvent.press(getByTestId('oxford-upgrade-button'));

    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(Routes.SubscriptionHandler);
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `expect(Linking.openURL).not.toHaveBeenCalled()` — it was called

**Step 3: Fix the implementation**

In `src/screens/Oxford/OxfordDashboard.tsx`:

Remove `Linking` from the React Native import at line 16:

```typescript
// BEFORE
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
```

```typescript
// AFTER
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
```

Replace line 136 (`onPress` handler):

```typescript
// BEFORE
onPress={() => Linking.openURL('https://regroup-app.com/my-account')}
```

```typescript
// AFTER
onPress={() => navigation.navigate(Routes.SubscriptionHandler)}
```

**Step 4: Run tests to confirm they pass**

```bash
npx jest src/screens/Oxford/__tests__/OxfordDashboard.test.tsx --no-coverage 2>&1 | tail -15
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/screens/Oxford/OxfordDashboard.tsx src/screens/Oxford/__tests__/OxfordDashboard.test.tsx
git commit -m "fix(oxford): replace Linking.openURL with in-app navigation for upgrade CTA"
```

---

## Task 3: Fix Officer Name Display — userId vs guestId Mismatch

**Files:**

- Modify: `src/screens/Oxford/OfficerManagement.tsx:59-65`
- Test: `src/screens/Oxford/__tests__/OfficerManagement.test.tsx` (add test)

**Context:** `getGuestName(userId)` looks up `guests[userId]`. But `guests` is `state.guestsRTK.guests`, a `Record<string, Guest>` keyed by **Firestore document ID**. `officer.userId` stores the **Firebase Auth UID**. These are different values, so every officer name shows "Unknown". Fix: scan `Object.values(guests)` to find the guest whose `.userId` field matches the Auth UID.

**Step 1: Write the failing test**

Add to `src/screens/Oxford/__tests__/OfficerManagement.test.tsx` (create if needed):

```typescript
// src/screens/Oxford/__tests__/OfficerManagement.test.tsx

jest.mock('react-native', () => ({
  View: 'View',
  FlatList: 'FlatList',
  Alert: { alert: jest.fn() },
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (s: any) => s },
}));

jest.mock('../../../firebase-setup', () => ({}));
jest.mock('../../../services/oxford/officers', () => ({
  getOfficers: jest.fn().mockResolvedValue([]),
  setOfficer: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../state/store', () => ({ useAppSelector: jest.fn() }));
jest.mock('../../../styles/theme', () => ({
  color: {
    yellow: '#FFD700',
    green: '#00FF00',
    baby_blue: '#89CFF0',
    purple: '#800080',
  },
  normalize: (n: number) => n,
  fontSize: {},
}));
jest.mock('../../../components/rats-scroll-view', () => 'RatsScrollView');
jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/rats-interactable-section', () => 'Section');
jest.mock('../../../components/rats-button/rats-button', () => 'RatsButton');
jest.mock('../../../components/rats-text', () => ({ RatsText: 'RatsText' }));

import { useAppSelector } from '../../../state/store';
import React from 'react';
import { render } from '@testing-library/react-native';
import OfficerManagement from '../OfficerManagement';
import { getOfficers } from '../../../services/oxford/officers';

describe('OfficerManagement — getGuestName', () => {
  it('resolves officer name by Auth UID (userId field), not by Firestore doc ID key', async () => {
    // Guest doc ID is 'doc-abc', but Auth UID is 'auth-uid-123'
    const guests = {
      'doc-abc': {
        id: 'doc-abc',
        userId: 'auth-uid-123',
        firstName: 'Alice',
        lastName: 'Smith',
      },
    };

    (useAppSelector as jest.Mock).mockImplementation((selector: any) =>
      selector({
        housesRTK: { selectedHouse: { id: 'h1' } },
        guestsRTK: { guests },
      }),
    );

    (getOfficers as jest.Mock).mockResolvedValue([
      {
        role: 'president',
        userId: 'auth-uid-123',
        isActive: true,
        houseId: 'h1',
      },
    ]);

    const { findByText } = render(
      <OfficerManagement navigation={{ navigate: jest.fn() } as any} />,
    );

    // Should display "Alice Smith", not "Unknown"
    await findByText('Alice Smith');
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npx jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage 2>&1 | tail -15
```

Expected: FAIL — element with text "Alice Smith" not found (shows "Unknown")

**Step 3: Fix the implementation**

In `src/screens/Oxford/OfficerManagement.tsx`, replace `getGuestName` (lines 59-65):

```typescript
// BEFORE
const getGuestName = (userId: string): string => {
  const guest = guests[userId] as Guest | undefined;
  if (!guest) {
    return 'Unknown';
  }
  return `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Unknown';
};
```

```typescript
// AFTER — look up by the userId field, not by document key
const getGuestName = (userId: string): string => {
  const guest = Object.values(guests).find(
    (g: Guest) => g.userId === userId,
  ) as Guest | undefined;
  if (!guest) {
    return 'Unknown';
  }
  return `${guest.firstName || ''} ${guest.lastName || ''}`.trim() || 'Unknown';
};
```

**Step 4: Run tests to confirm they pass**

```bash
npx jest src/screens/Oxford/__tests__/OfficerManagement.test.tsx --no-coverage 2>&1 | tail -15
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/screens/Oxford/OfficerManagement.tsx src/screens/Oxford/__tests__/OfficerManagement.test.tsx
git commit -m "fix(oxford): resolve officer names by Auth UID field instead of Firestore doc key"
```

---

## Task 4: Fix BusinessMeetings Date Input — Replace TextInput with DatePicker

**Files:**

- Modify: `src/screens/Oxford/BusinessMeetings.tsx`
- Test: `src/screens/Oxford/__tests__/BusinessMeetings.test.tsx` (add date picker test)

**Context:** The "Scheduled Date" field is a raw `TextInput` with `placeholder="YYYY-MM-DD"`. Non-technical house presidents struggle with ISO format. `react-native-date-picker` is already installed (used by `RatsDatePicker`). Since `BusinessMeetings` uses `useState` (not Formik), use `DatePicker` from `react-native-date-picker` directly — same underlying package.

**Step 1: Locate the TextInput section**

```bash
grep -n "TextInput\|scheduledDate\|YYYY-MM-DD" src/screens/Oxford/BusinessMeetings.tsx
```

Confirm the `TextInput` for date is present and `scheduledDate` is a string state.

**Step 2: Write the failing test**

Create/add to `src/screens/Oxford/__tests__/BusinessMeetings.test.tsx`:

```typescript
// Verify: date picker modal component is rendered, not a raw TextInput for the date
import React from 'react';
import { render } from '@testing-library/react-native';
// ... (standard mocks matching the file's imports)

it('renders DatePicker for scheduled date, not a raw TextInput', () => {
  // render BusinessMeetings with showCreateForm=true
  // assert: queryByPlaceholderText('YYYY-MM-DD') is null
  // assert: UNSAFE_getByType(DatePicker) is not null
});
```

Note: For the full mock setup, mirror the mock structure from `OfficerManagement.test.tsx` above plus add mocks for `moment`, `react-native-date-picker`, and `businessMeetings` service.

**Step 3: Update state and imports in `BusinessMeetings.tsx`**

At the top of `BusinessMeetings.tsx`, change the import:

```typescript
// ADD
import DatePicker from 'react-native-date-picker';
```

Change the `scheduledDate` state from string to `Date`:

```typescript
// BEFORE
const [scheduledDate, setScheduledDate] = useState(
  moment().add(7, 'days').format('YYYY-MM-DD'),
);
```

```typescript
// AFTER
const [scheduledDate, setScheduledDate] = useState<Date>(
  moment().add(7, 'days').toDate(),
);
const [datePickerOpen, setDatePickerOpen] = useState(false);
```

Update `handleCreate` to format the date when passing to the service:

```typescript
// Where scheduledDate is passed to createBusinessMeeting, format it:
scheduledDate: moment(scheduledDate).format('YYYY-MM-DD'),
```

**Step 4: Replace the TextInput JSX**

Find the TextInput block for the date (around lines 171-183) and replace with:

```tsx
{/* Date picker trigger */}
<RatsText
  text="Scheduled Date"
  style={{ fontSize: fontSize.small, color: color.dark_grey, marginBottom: normalize(4) }}
  translate={false}
/>
<TouchableOpacity
  onPress={() => setDatePickerOpen(true)}
  style={{
    borderWidth: 1,
    borderColor: color.medium_grey,
    borderRadius: normalize(4),
    padding: normalize(10),
    marginBottom: normalize(16),
  }}>
  <RatsText
    text={moment(scheduledDate).format('MMMM D, YYYY')}
    style={{ fontSize: fontSize.regular, color: color.black }}
    translate={false}
  />
</TouchableOpacity>
<DatePicker
  modal
  open={datePickerOpen}
  date={scheduledDate}
  mode="date"
  minimumDate={new Date()}
  onConfirm={(date) => {
    setDatePickerOpen(false);
    setScheduledDate(date);
  }}
  onCancel={() => setDatePickerOpen(false)}
/>
```

Also add `TouchableOpacity` to the React Native import if not already there.

**Step 5: Run tests**

```bash
npx jest src/screens/Oxford/__tests__/BusinessMeetings.test.tsx --no-coverage 2>&1 | tail -15
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/screens/Oxford/BusinessMeetings.tsx src/screens/Oxford/__tests__/BusinessMeetings.test.tsx
git commit -m "fix(oxford): replace raw TextInput with DatePicker for meeting date field"
```

---

## Task 5: Add House Membership Authorization to `listPayments`

**Files:**

- Modify: `regroup-functions/functions/src/callable/payments.ts:129-173`
- Test: `regroup-functions/functions/src/__tests__/payments.test.ts` (add test)

**Context:** `listPayments` only checks `request.auth` (any authenticated user can call it with any `houseId`/`guestId`). A signed-in user from House A can list payment history for residents in House B. Fix: verify the caller is an admin or guest of `houseId` using the Firebase custom claims (`request.auth.token.admin`, `request.auth.token.guest`).

**Step 1: Write the failing test**

In `regroup-functions/functions/src/__tests__/payments.test.ts`, add:

```typescript
describe('listPayments — authorization', () => {
  it('throws permission-denied when caller is not a member of the house', async () => {
    const { listPayments } = require('../callable/payments');

    // Caller is authenticated but has no claims for 'house-999'
    const result = await callFunction(listPayments, {
      auth: { uid: 'outsider-uid', token: { admin: {}, guest: {} } },
      data: { guestId: 'g1', houseId: 'house-999' },
    });

    expect(result.error?.status).toBe('PERMISSION_DENIED');
  });

  it('allows call when caller is an admin of the house', async () => {
    const { listPayments } = require('../callable/payments');

    const result = await callFunction(listPayments, {
      auth: {
        uid: 'admin-uid',
        token: { admin: { 'house-1': true }, guest: {} },
      },
      data: { guestId: 'g1', houseId: 'house-1' },
    });

    // Should not throw permission-denied (may return empty list if Stripe mock returns nothing)
    expect(result.error?.status).not.toBe('PERMISSION_DENIED');
  });
});
```

(Use the existing `callFunction` test helper already established in the test file.)

**Step 2: Run test to confirm it fails**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest src/__tests__/payments.test.ts --no-coverage -t "listPayments — authorization" 2>&1 | tail -20
```

Expected: FAIL — outsider call does NOT throw `PERMISSION_DENIED`

**Step 3: Add authorization check to `listPayments`**

In `regroup-functions/functions/src/callable/payments.ts`, after the existing `request.auth` check at line 132, add:

```typescript
// Verify caller is an admin or guest of the requested house
const token = request.auth.token as Record<string, any>;
const isAdmin = token.admin && houseId in token.admin;
const isGuest = token.guest && houseId in token.guest;
if (!isAdmin && !isGuest) {
  throw new HttpsError(
    'permission-denied',
    "You do not have access to this house's payment data",
  );
}
```

Add this block immediately after the `const { guestId, houseId, limit = 20 } = request.data` destructuring (around line 144).

**Step 4: Run tests**

```bash
npx jest src/__tests__/payments.test.ts --no-coverage 2>&1 | tail -15
```

Expected: all tests PASS including the new authorization tests

**Step 5: Commit**

```bash
git add src/callable/payments.ts src/__tests__/payments.test.ts
git commit -m "fix(payments): add house membership authorization check to listPayments"
```

---

## Task 6: Add House Membership Authorization to `savePaymentMethod`

**Files:**

- Modify: `regroup-functions/functions/src/callable/payments.ts:179-234`
- Test: `regroup-functions/functions/src/__tests__/payments.test.ts` (add test)

**Context:** `savePaymentMethod` checks that the house exists and has an active Stripe account, but does not verify the caller is actually a guest of that house. A signed-in user from House A could save payment methods under a guest in House B. Fix: same custom claims check as Task 5.

**Step 1: Write the failing test**

In `src/__tests__/payments.test.ts`, add:

```typescript
describe('savePaymentMethod — authorization', () => {
  it('throws permission-denied when caller is not a member of the house', async () => {
    const { savePaymentMethod } = require('../callable/payments');

    const result = await callFunction(savePaymentMethod, {
      auth: { uid: 'outsider-uid', token: { admin: {}, guest: {} } },
      data: {
        paymentMethodId: 'pm_test_123',
        guestId: 'g1',
        houseId: 'house-999',
      },
    });

    expect(result.error?.status).toBe('PERMISSION_DENIED');
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npx jest src/__tests__/payments.test.ts --no-coverage -t "savePaymentMethod — authorization" 2>&1 | tail -20
```

Expected: FAIL

**Step 3: Add authorization check to `savePaymentMethod`**

In `payments.ts`, after the `const { paymentMethodId, guestId, houseId }` destructuring in `savePaymentMethod` (around line 186), add the same check:

```typescript
const token = request.auth.token as Record<string, any>;
const isAdmin = token.admin && houseId in token.admin;
const isGuest = token.guest && houseId in token.guest;
if (!isAdmin && !isGuest) {
  throw new HttpsError(
    'permission-denied',
    'You do not have access to save payment methods for this house',
  );
}
```

**Step 4: Run all payments tests**

```bash
npx jest src/__tests__/payments.test.ts --no-coverage 2>&1 | tail -15
```

Expected: all PASS

**Step 5: Run the full test suite to confirm no regressions**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (currently 122+)

**Step 6: Commit**

```bash
git add src/callable/payments.ts src/__tests__/payments.test.ts
git commit -m "fix(payments): add house membership authorization check to savePaymentMethod"
```

---

## Task 7: Add Firestore Rule for `paymentMethods` Subcollection

**Files:**

- Modify: `firebase/firestore.rules`

**Context:** The Oxford subcollections (`officers`, `businessMeetings`, `votes`, `ees`) are already covered under `houses/{houseId}`. The `paymentMethods` subcollection (`houses/{houseId}/guests/{guestId}/paymentMethods`) has no client-facing rule. Firestore defaults to deny-all for unmatched paths, so Cloud Function writes (Admin SDK) work fine, but an explicit rule prevents confusion and future breakage if anyone adds client-side reads.

**Step 1: Verify Oxford rules are already in place**

```bash
grep -A3 "Oxford House" firebase/firestore.rules
```

Expected: officers, businessMeetings, votes, ees all present. If any are missing, add them following the existing pattern.

**Step 2: Add paymentMethods rule**

In `firebase/firestore.rules`, inside the `match /houses/{houseId}` block (after the `/ees/{eesId}` block, before the closing `}`), add:

```
// Payment methods: guest can read their own; admin can read all; write is Cloud Functions only
match /guests/{guestId}/paymentMethods/{pmId} {
  allow read: if isAdmin([houseId]) || (isGuestOrAdmin([houseId]) && isSameUser(guestId));
  allow write: if false; // Written by Cloud Functions via Admin SDK only
}
```

**Step 3: Verify rules syntax (local)**

```bash
cd /Users/marcusklein/dev/rats-v2
firebase emulators:start --only firestore &
sleep 5
firebase emulators:exec --only firestore "echo rules loaded OK"
```

Or visually inspect the rules file for syntax errors (balanced braces, valid function calls).

**Step 4: Commit**

```bash
git add firebase/firestore.rules
git commit -m "fix(security): add Firestore rule for paymentMethods subcollection"
```

---

## Task 8: Final Week 0 Verification

**Step 1: Run the full rats-v2 test suite**

```bash
cd /Users/marcusklein/dev/rats-v2
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (4310+ passing, same 3 pre-existing failures as before)

**Step 2: Run the full regroup-functions test suite**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (122+ passing)

**Step 3: Week 0 complete — checklist**

- [ ] Dual-repo deployment confirmed: `regroup-functions` is canonical
- [ ] `subscriptionIsActive()` returns `true` for `'trialing'`
- [ ] Oxford upgrade CTA navigates in-app (no Safari)
- [ ] Officer names resolve correctly by Auth UID
- [ ] BusinessMeetings uses DatePicker instead of raw TextInput
- [ ] `listPayments` rejects callers not in the house
- [ ] `savePaymentMethod` rejects callers not in the house
- [ ] Firestore `paymentMethods` rule in place

**Once all green, the parallel tracks (Week 1-3) can begin.**

---

## What Comes Next

The parallel track plans will be written as separate documents:

- `2026-02-27-track-a-payments-plan.md` — Traditional payment dashboard (Sprints 5-7)
- `2026-02-27-track-b-oxford-plan.md` — Oxford completion (Sprint 8)

Both use the same TDD discipline as this plan.
