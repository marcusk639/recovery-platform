# RATS — Remaining Work Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Execute all phases from REMAINING_WORK_PLAN.md, sequenced by revenue impact and risk — from stabilization through resident payments, quality hardening, and Oxford House MVP.

**Architecture:** Phase A stabilizes the current codebase (CI, migration, legal). Phase B adds the primary revenue driver (resident payment collection via Stripe Connect). Phase C hardens quality for scale. Phase D launches the Oxford House market. Each phase has exit criteria that must pass before the next begins.

**Tech Stack:** React Native 0.72 + TypeScript, Firebase Firestore + Cloud Functions, Redux Toolkit, Stripe Connect, Jest + Detox, GitHub Actions

---

## Updated State (Feb 22, 2026)

Before executing, note these corrections to REMAINING_WORK_PLAN.md:

| Item | Plan Said | Actual State |
|------|-----------|--------------|
| ~170 TypeScript errors | "Fix ~170 errors" | **1 error** (jest.setup.js type annotation in JS file) — effectively done |
| migrate-full.ts stubs | "Implement phase stubs" | **All 4 phases are fully implemented** — needs dry-run + execute only |
| CI/CD | "No CI" | `e2e-tests.yml` exists; **no unit test (Jest) workflow** on PRs |

---

## Phase A: Stabilize & Ship

**Goal:** Make the app safe for existing houses and new onboarding. Exit criteria: Jest passes in CI on every PR, Guest docs have no embedded Week objects, legal docs published.

---

### Task A1: Fix the one remaining TypeScript error

**Files:**
- Modify: `jest.setup.js:210`

**Step 1: Confirm the error**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules
```
Expected: `jest.setup.js(210,42): error TS8010: Type annotations can only be used in TypeScript files.`

**Step 2: Read the offending line**

```bash
sed -n '205,215p' jest.setup.js
```

**Step 3: Remove the type annotation**

Find the type annotation (e.g., `: string`) in jest.setup.js line 210 and remove it — plain JS doesn't support TypeScript syntax. For example, change:
```js
// Before
function foo(x: string) { ... }
// After
function foo(x) { ... }
```

**Step 4: Verify fix**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules
```
Expected: No output (zero errors)

**Step 5: Commit**

```bash
git add jest.setup.js
git commit -m "fix(types): remove TS type annotation from jest.setup.js"
```

---

### Task A2: Add Jest unit test GitHub Actions workflow

No workflow currently runs `npx jest` on PRs. The `e2e-tests.yml` runs Detox only (requires device). We need a fast unit test check on every PR.

**Files:**
- Create: `.github/workflows/unit-tests.yml`

**Step 1: Create the workflow file**

```yaml
# .github/workflows/unit-tests.yml
name: Unit Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Jest Unit Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npx jest --no-coverage --forceExit --passWithNoTests
        env:
          CI: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: jest-results
          path: |
            jest-results.json
          retention-days: 7
```

**Step 2: Verify tests pass locally first**

```bash
npx jest --no-coverage --forceExit 2>&1 | tail -5
```
Expected: `Test Suites: 34 passed, 34 total` and `Tests: 715 passed`

**Step 3: Commit and push**

```bash
git add .github/workflows/unit-tests.yml
git commit -m "ci: add Jest unit test workflow on PRs"
git push
```

**Step 4: Verify in GitHub**

Go to https://github.com/marcusk639/regroup-rn7/actions and confirm the `Unit Tests` workflow appears and passes.

---

### Task A3: Execute the data model migration (dry-run then live)

`scripts/migrate-full.ts` is fully implemented with all 4 phases. It needs to be run against production Firestore. **This is the highest-risk task in Phase A** — follow the steps exactly.

**Files:**
- Modify: (none — only executing the existing script)
- Script: `scripts/migrate-full.ts`

**Prerequisites:**
- Firebase service account key file at `scripts/service-key.json` (download from Firebase Console → Project Settings → Service Accounts → Generate new private key)
- `ts-node` installed: `npm install -g ts-node` or use `npx ts-node`

**Step 1: Install script dependencies if needed**

```bash
npm install firebase-admin --save-dev 2>/dev/null || true
```

**Step 2: Run Phase 4 dry-run first (lowest risk — just adds a field)**

```bash
cd /Users/marcusklein/dev/rats-v2
npx ts-node scripts/migrate-full.ts dry-run --phase=houses scripts/service-key.json
```
Expected: Output showing count of houses that would get `houseType: 'traditional'`. No changes made.

**Step 3: Run Phase 1 dry-run (user normalization)**

```bash
npx ts-node scripts/migrate-full.ts dry-run --phase=users scripts/service-key.json
```
Expected: Lists any users with mismatched UIDs or dangling guestId/adminId references.

**Step 4: Run Phase 2 dry-run (guest embedded week removal — the critical one)**

```bash
npx ts-node scripts/migrate-full.ts dry-run --phase=guests scripts/service-key.json
```
Expected: Lists guests with `currentWeek`, `previousWeek`, or `nextWeek` fields. Shows count of activities and summaries that would be created.

**Step 5: Run Phase 3 dry-run (standalone weeks collection)**

```bash
npx ts-node scripts/migrate-full.ts dry-run --phase=weeks scripts/service-key.json
```
Expected: Shows count of standalone week documents that would be migrated.

**Step 6: Review dry-run output for errors**

If any phase shows errors, investigate before executing. Do NOT proceed to execute if there are unexpected errors.

**Step 7: Execute live migration (all phases)**

```bash
npx ts-node scripts/migrate-full.ts execute scripts/service-key.json
```
Type `EXECUTE` when prompted.

**Step 8: Validate migration**

```bash
npx ts-node scripts/migrate-full.ts validate scripts/service-key.json
```
Expected:
```
PASS  No guests with embedded currentWeek
PASS  All N active guests have activity records
PASS  All N houses have houseType field
PASS  archived-weeks collection has records
Result: 4 passed, 0 failed
Validation PASSED.
```

**Step 9: Commit the service-key to .gitignore (do not commit the key itself)**

```bash
echo "scripts/service-key.json" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore migration service key"
```

---

### Task A4: Publish Terms of Service and Privacy Policy

This is a non-code task but required before paid user acquisition.

**Step 1: Use a SaaS policy generator**

Go to https://app.termly.io or https://getterms.io and generate:
- Terms of Service — describe recovery house management SaaS, data collection, dispute resolution
- Privacy Policy — describe what data is collected (name, email, sobriety date, activity logs), retention, deletion rights

**Step 2: Host the documents**

Options (pick one):
- Add as static HTML pages in a web host (GitHub Pages, Vercel)
- Add as routes in any existing marketing site
- Host directly at a URL like `https://regroup.app/terms` and `https://regroup.app/privacy`

**Step 3: Add links to the app**

Modify: `src/screens/SignUp/SignUp.tsx` (or wherever signup form exists)

Add a ToS checkbox with the URL:
```tsx
<Text>
  By signing up, you agree to our{' '}
  <Text onPress={() => Linking.openURL('https://regroup.app/terms')}>
    Terms of Service
  </Text>{' '}and{' '}
  <Text onPress={() => Linking.openURL('https://regroup.app/privacy')}>
    Privacy Policy
  </Text>
</Text>
```

**Step 4: Commit the app change**

```bash
git add src/screens/SignUp/
git commit -m "feat(legal): add ToS and Privacy Policy links to signup"
```

**Phase A Exit Criteria:**
- [ ] `npx tsc --noEmit` shows 0 errors
- [ ] Unit tests pass in GitHub Actions on PRs
- [ ] `validate` script passes against production Firestore
- [ ] ToS and Privacy Policy published at live URLs

---

## Phase B: Resident Payment System

**Goal:** Enable houses to collect rent through the app. This is the #1 revenue driver.

The existing `StripeSettingsScreen.tsx` handles admin Stripe Connect account setup. What's missing is the resident-facing payment flow: entering a card, viewing a balance, and making payments.

---

### Task B1: Resident payment service — Cloud Function stubs

**Files:**
- Create: `functions/src/payments/createPaymentIntent.ts`
- Create: `functions/src/payments/listPayments.ts`
- Create: `functions/src/payments/savePaymentMethod.ts`

**Background on Stripe Connect:**
- The house's Stripe account is already stored in `house.stripeAccountId`
- Resident payments use "destination charges" — the app creates a payment intent on behalf of the connected account
- The `stripe` npm package must be installed in the `functions/` directory

**Step 1: Install Stripe in functions**

```bash
cd functions && npm install stripe && cd ..
```

**Step 2: Create `createPaymentIntent` function**

```typescript
// functions/src/payments/createPaymentIntent.ts
import * as functions from 'firebase-functions';
import Stripe from 'stripe';

const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: '2023-10-16',
});

export const createPaymentIntent = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

  const { amount, currency = 'usd', guestId, houseId, description } = data;
  if (!amount || !guestId || !houseId) {
    throw new functions.https.HttpsError('invalid-argument', 'amount, guestId, houseId required');
  }

  // Get the house's connected Stripe account
  const admin = require('firebase-admin');
  const houseDoc = await admin.firestore().collection('houses').doc(houseId).get();
  if (!houseDoc.exists) throw new functions.https.HttpsError('not-found', 'House not found');

  const house = houseDoc.data();
  if (!house.stripeAccountId || house.stripeStatus !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'House has no active Stripe account');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // cents
    currency,
    description: description || `Rent payment for ${houseId}`,
    metadata: { guestId, houseId },
    transfer_data: { destination: house.stripeAccountId },
    application_fee_amount: Math.round(amount * 100 * 0.02), // 2% platform fee
  });

  return { clientSecret: paymentIntent.client_secret };
});
```

**Step 3: Create `listPayments` function**

```typescript
// functions/src/payments/listPayments.ts
import * as functions from 'firebase-functions';
import Stripe from 'stripe';

const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: '2023-10-16',
});

export const listPayments = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

  const { guestId, houseId, limit = 20 } = data;
  const admin = require('firebase-admin');

  const houseDoc = await admin.firestore().collection('houses').doc(houseId).get();
  const house = houseDoc.data();
  if (!house?.stripeAccountId) return { payments: [] };

  const charges = await stripe.charges.list(
    { limit, metadata: { guestId } },
    { stripeAccount: house.stripeAccountId }
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
    })),
  };
});
```

**Step 4: Export from functions index**

Modify: `functions/src/index.ts`

```typescript
export { createPaymentIntent } from './payments/createPaymentIntent';
export { listPayments } from './payments/listPayments';
```

**Step 5: Write unit tests**

```typescript
// functions/src/payments/__tests__/createPaymentIntent.test.ts
import { createPaymentIntent } from '../createPaymentIntent';
// Test: unauthenticated request throws
// Test: missing amount throws
// Test: house without Stripe account throws
// Test: valid request returns clientSecret
```

**Step 6: Deploy to Firebase**

```bash
cd functions && npm run build && firebase deploy --only functions:createPaymentIntent,functions:listPayments
```

**Step 7: Commit**

```bash
git add functions/src/payments/ functions/src/index.ts
git commit -m "feat(payments): add Cloud Functions for resident payment intent and history"
```

---

### Task B2: Resident payment service (client-side)

**Files:**
- Create: `src/services/payments.ts`
- Modify: `src/navigation/types.ts` (add payment routes)

**Step 1: Create payments service**

```typescript
// src/services/payments.ts
import functions from '@react-native-firebase/functions';

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
  description: string;
  createdAt: string;
  receiptUrl?: string;
}

export async function createPaymentIntent(
  amount: number,
  guestId: string,
  houseId: string,
  description?: string,
): Promise<{ clientSecret: string }> {
  const callable = functions().httpsCallable('createPaymentIntent');
  const result = await callable({ amount, guestId, houseId, description });
  return result.data as { clientSecret: string };
}

export async function listPayments(
  guestId: string,
  houseId: string,
  limit = 20,
): Promise<PaymentRecord[]> {
  const callable = functions().httpsCallable('listPayments');
  const result = await callable({ guestId, houseId, limit });
  return (result.data as any).payments;
}
```

**Step 2: Add payment routes to navigation**

Modify: `src/navigation/types.ts`

```typescript
// In the Routes enum, add:
ResidentPayment = 'residentPayment',
PaymentHistory = 'paymentHistory',

// In RootStackParamList, add:
[Routes.ResidentPayment]: { amount?: number };
[Routes.PaymentHistory]: undefined;
```

**Step 3: Commit**

```bash
git add src/services/payments.ts src/navigation/types.ts
git commit -m "feat(payments): add resident payment service and routes"
```

---

### Task B3: Resident payment screens

**Files:**
- Create: `src/screens/Payments/ResidentPayment.tsx`
- Create: `src/screens/Payments/PaymentHistory.tsx`
- Create: `src/screens/Payments/index.ts`

**Step 1: Create ResidentPayment screen**

```tsx
// src/screens/Payments/ResidentPayment.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { useAppSelector } from '../../state/store';
import { createPaymentIntent } from '../../services/payments';
import RatsButton from '../../components/rats-button';
import ScreenHeader from '../../components/screen-header';
import RatsScrollView from '../../components/rats-scroll-view';
import { color } from '../../styles/theme';

const ResidentPayment: React.FC = () => {
  const guest = useAppSelector(s => s.guestsRTK.selectedGuest);
  const house = useAppSelector(s => s.housesRTK.selectedHouse);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount.');
      return;
    }
    if (!guest?.id || !house?.id) return;

    setLoading(true);
    try {
      const { clientSecret } = await createPaymentIntent(
        parsedAmount,
        guest.id,
        house.id,
        `Rent - ${house.name}`,
      );
      // TODO: Present Stripe payment sheet using @stripe/stripe-react-native
      // initPaymentSheet({ paymentIntentClientSecret: clientSecret })
      // presentPaymentSheet()
      Alert.alert('Payment initiated', `Client secret: ${clientSecret.slice(0, 20)}...`);
    } catch (err: any) {
      Alert.alert('Payment Error', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Make a Payment" />
      <View style={styles.container}>
        <Text style={styles.label}>Amount ($)</Text>
        <TextInput
          testID="payment-amount-input"
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0.00"
          value={amount}
          onChangeText={setAmount}
        />
        <RatsButton
          testID="submit-payment-button"
          title={loading ? 'Processing...' : 'Pay Now'}
          onPress={handlePayment}
          disabled={loading || !amount}
        />
      </View>
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: color.dark_grey },
  input: {
    borderWidth: 1, borderColor: color.light_grey, borderRadius: 8,
    padding: 12, fontSize: 24, marginBottom: 24, textAlign: 'center',
  },
});

export default ResidentPayment;
```

**Step 2: Create PaymentHistory screen**

```tsx
// src/screens/Payments/PaymentHistory.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useAppSelector } from '../../state/store';
import { listPayments, PaymentRecord } from '../../services/payments';
import ScreenHeader from '../../components/screen-header';
import RatsScrollView from '../../components/rats-scroll-view';
import { color } from '../../styles/theme';
import moment from 'moment';

const PaymentHistory: React.FC = () => {
  const guest = useAppSelector(s => s.guestsRTK.selectedGuest);
  const house = useAppSelector(s => s.housesRTK.selectedHouse);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guest?.id || !house?.id) return;
    listPayments(guest.id, house.id)
      .then(setPayments)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [guest?.id, house?.id]);

  const renderItem = ({ item }: { item: PaymentRecord }) => (
    <View style={styles.row} testID={`payment-row-${item.id}`}>
      <View>
        <Text style={styles.desc}>{item.description || 'Payment'}</Text>
        <Text style={styles.date}>{moment(item.createdAt).format('MMM D, YYYY')}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
        <Text style={[styles.status, item.status === 'succeeded' ? styles.green : styles.red]}>
          {item.status}
        </Text>
      </View>
    </View>
  );

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Payment History" />
      <FlatList
        data={payments}
        renderItem={renderItem}
        keyExtractor={p => p.id}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading...' : 'No payments yet.'}</Text>
        }
      />
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16,
    borderBottomWidth: 1, borderColor: color.light_grey },
  desc: { fontSize: 15, fontWeight: '600' },
  date: { fontSize: 12, color: color.grey, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 18, fontWeight: '700' },
  status: { fontSize: 12, marginTop: 2 },
  green: { color: 'green' },
  red: { color: 'red' },
  empty: { textAlign: 'center', marginTop: 40, color: color.grey },
});

export default PaymentHistory;
```

**Step 3: Create index barrel**

```typescript
// src/screens/Payments/index.ts
export { default as ResidentPayment } from './ResidentPayment';
export { default as PaymentHistory } from './PaymentHistory';
```

**Step 4: Register screens in navigator**

Modify: `src/navigation/navigators.tsx`

```tsx
import { ResidentPayment, PaymentHistory } from '../screens/Payments';

// Inside RootStack:
<RootStack.Screen name={Routes.ResidentPayment} component={ResidentPayment} />
<RootStack.Screen name={Routes.PaymentHistory} component={PaymentHistory} />
```

**Step 5: Add payment entry point to GuestHome**

Modify: `src/screens/Profile/GuestHome.tsx`

Add navigation buttons to reach payment screens:
```tsx
<Section
  testID="make-payment-button"
  name="Make a Payment"
  description="Pay rent or fees"
  iconName="credit-card"
  onPress={() => navigation.navigate(Routes.ResidentPayment)}
/>
<Section
  testID="payment-history-button"
  name="Payment History"
  description="View past payments"
  iconName="history"
  onPress={() => navigation.navigate(Routes.PaymentHistory)}
/>
```

**Step 6: Commit**

```bash
git add src/screens/Payments/ src/navigation/navigators.tsx src/screens/Profile/GuestHome.tsx
git commit -m "feat(payments): add resident payment screens and navigation"
```

---

### Task B4: Manager payment dashboard

**Files:**
- Create: `src/screens/HouseSettings/PaymentDashboard.tsx`
- Modify: `src/navigation/types.ts` (add `PaymentDashboard` route)

**Step 1: Add route**

```typescript
// In Routes enum:
PaymentDashboard = 'paymentDashboard',
// In RootStackParamList:
[Routes.PaymentDashboard]: undefined;
```

**Step 2: Create PaymentDashboard screen**

```tsx
// src/screens/HouseSettings/PaymentDashboard.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useAppSelector } from '../../state/store';
import { listPayments, PaymentRecord } from '../../services/payments';
import ScreenHeader from '../../components/screen-header';
import RatsScrollView from '../../components/rats-scroll-view';
import { color } from '../../styles/theme';
import moment from 'moment';

const PaymentDashboard: React.FC = () => {
  const house = useAppSelector(s => s.housesRTK.selectedHouse);
  const guests = useAppSelector(s => s.guestsRTK.guests);
  const [allPayments, setAllPayments] = useState<(PaymentRecord & { guestName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!house?.id) return;
    // Fetch payments for all guests in parallel
    const guestList = Object.values(guests || {});
    Promise.all(
      guestList.map(g =>
        listPayments(g.id, house.id).then(ps =>
          ps.map(p => ({ ...p, guestName: `${g.firstName} ${g.lastName}` }))
        ).catch(() => [])
      )
    ).then(results => {
      const flat = results.flat().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setAllPayments(flat);
    }).finally(() => setLoading(false));
  }, [house?.id, guests]);

  const renderItem = ({ item }: { item: PaymentRecord & { guestName: string } }) => (
    <View style={styles.row}>
      <View>
        <Text style={styles.name}>{item.guestName}</Text>
        <Text style={styles.date}>{moment(item.createdAt).format('MMM D, YYYY')}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
        <Text style={item.status === 'succeeded' ? styles.green : styles.red}>{item.status}</Text>
      </View>
    </View>
  );

  const total = allPayments
    .filter(p => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Payments" />
      <View style={styles.summary}>
        <Text style={styles.totalLabel}>Total Collected</Text>
        <Text style={styles.totalAmount}>${total.toFixed(2)}</Text>
      </View>
      <FlatList
        data={allPayments}
        renderItem={renderItem}
        keyExtractor={p => p.id}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading...' : 'No payments recorded.'}</Text>
        }
      />
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  summary: { padding: 20, backgroundColor: color.green_blue, alignItems: 'center' },
  totalLabel: { color: 'white', fontSize: 14 },
  totalAmount: { color: 'white', fontSize: 32, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 16,
    borderBottomWidth: 1, borderColor: color.light_grey },
  name: { fontSize: 15, fontWeight: '600' },
  date: { fontSize: 12, color: color.grey, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: 18, fontWeight: '700' },
  green: { color: 'green', fontSize: 12 },
  red: { color: 'red', fontSize: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: color.grey },
});

export default PaymentDashboard;
```

**Step 3: Register and link from HouseSettings**

Modify: `src/navigation/navigators.tsx` — add `<RootStack.Screen name={Routes.PaymentDashboard} component={PaymentDashboard} />`

**Step 4: Commit**

```bash
git add src/screens/HouseSettings/PaymentDashboard.tsx src/navigation/
git commit -m "feat(payments): add manager payment dashboard"
```

---

### Task B5: Install Stripe React Native SDK

**Step 1: Install**

```bash
npm install @stripe/stripe-react-native
cd ios && pod install && cd ..
```

**Step 2: Wrap App with StripeProvider**

Modify: `App.tsx`

```tsx
import { StripeProvider } from '@stripe/stripe-react-native';

// Wrap the root component:
<StripeProvider publishableKey="pk_live_...">
  {/* existing app content */}
</StripeProvider>
```

**Step 3: Update ResidentPayment to use real Stripe sheet**

Modify: `src/screens/Payments/ResidentPayment.tsx`

```tsx
import { useStripe } from '@stripe/stripe-react-native';

const { initPaymentSheet, presentPaymentSheet } = useStripe();

const handlePayment = async () => {
  const { clientSecret } = await createPaymentIntent(...);

  const { error: initError } = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: house?.name || 'Recovery House',
  });

  if (initError) { Alert.alert('Error', initError.message); return; }

  const { error: presentError } = await presentPaymentSheet();
  if (presentError) {
    Alert.alert('Payment failed', presentError.message);
  } else {
    Alert.alert('Payment complete', 'Your payment was successful.');
  }
};
```

**Step 4: Commit**

```bash
git add App.tsx src/screens/Payments/ResidentPayment.tsx
git commit -m "feat(payments): integrate Stripe payment sheet for resident payments"
```

**Phase B Exit Criteria:**
- [ ] 1 house successfully collects rent through the app using a test Stripe card
- [ ] Manager can see payment history for all residents
- [ ] Resident can see their own payment history
- [ ] All payment Cloud Functions deployed and returning correct data

---

## Phase C: Quality & Retention

### Task C1: Verify and configure Sentry error monitoring

**Step 1: Check current Sentry init**

The `App.tsx` already initializes Sentry:
```typescript
Sentry.init({ dsn: 'https://d785dae671464fc3a3a4464c5e7876cc@sentry.io/4306202' });
```

**Step 2: Verify events are reaching Sentry dashboard**

Add a test error in development:
```tsx
// In App.tsx temporarily:
if (__DEV__) {
  Sentry.captureException(new Error('Sentry integration test'));
}
```

Run the app and check https://sentry.io for the event.

**Step 3: Configure release tracking**

Modify: `App.tsx`
```typescript
Sentry.init({
  dsn: 'https://d785dae671464fc3a3a4464c5e7876cc@sentry.io/4306202',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
});
```

**Step 4: Remove the test error and commit**

```bash
git add App.tsx
git commit -m "chore(monitoring): configure Sentry release tracking and verify integration"
```

---

### Task C2: PDF compliance report export

**Goal:** Admin can tap "Export Report" on a guest's profile to receive a PDF of that week's compliance.

**Libraries needed:**

```bash
npm install react-native-html-to-pdf
```

**Files:**
- Create: `src/services/reportExport.ts`
- Modify: `src/screens/Profile/GuestHome.tsx`

**Step 1: Create report export service**

```typescript
// src/services/reportExport.ts
import RNHTMLtoPDF from 'react-native-html-to-pdf';
import { Guest } from '../entities/Guest';
import { WeekStats } from '../entities/WeekSummary';
import moment from 'moment';

export async function exportWeeklyReportPDF(
  guest: Guest,
  stats: WeekStats,
  weekStart: string,
  phaseRules: Record<string, number>,
): Promise<string> {
  const html = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #2c7be5; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f0f0f0; }
        .pass { color: green; }
        .fail { color: red; }
      </style>
    </head>
    <body>
      <h1>Weekly Compliance Report</h1>
      <p><strong>Resident:</strong> ${guest.firstName} ${guest.lastName}</p>
      <p><strong>Week of:</strong> ${moment(weekStart).format('MMMM D, YYYY')}</p>
      <p><strong>Phase:</strong> ${guest.phase}</p>
      <table>
        <tr><th>Activity</th><th>Required</th><th>Completed</th><th>Status</th></tr>
        <tr>
          <td>Meetings</td>
          <td>${phaseRules.meetings ?? 0}</td>
          <td>${stats.meetingsAttended}</td>
          <td class="${stats.meetingsAttended >= (phaseRules.meetings ?? 0) ? 'pass' : 'fail'}">
            ${stats.meetingsAttended >= (phaseRules.meetings ?? 0) ? 'PASS' : 'FAIL'}
          </td>
        </tr>
        <tr>
          <td>Chores</td>
          <td>${phaseRules.chore ? 1 : 0}</td>
          <td>${stats.choresCompleted}</td>
          <td class="${stats.choresCompleted >= (phaseRules.chore ? 1 : 0) ? 'pass' : 'fail'}">
            ${stats.choresCompleted >= (phaseRules.chore ? 1 : 0) ? 'PASS' : 'FAIL'}
          </td>
        </tr>
        <tr>
          <td>Work Hours</td>
          <td>${phaseRules.work ?? 0}</td>
          <td>${stats.hoursWorked}</td>
          <td class="${stats.hoursWorked >= (phaseRules.work ?? 0) ? 'pass' : 'fail'}">
            ${stats.hoursWorked >= (phaseRules.work ?? 0) ? 'PASS' : 'FAIL'}
          </td>
        </tr>
        <tr>
          <td>Medication</td>
          <td>${phaseRules.medications ? 'Required' : 'N/A'}</td>
          <td>${stats.medicationTaken > 0 ? 'Yes' : 'No'}</td>
          <td class="${!phaseRules.medications || stats.medicationTaken > 0 ? 'pass' : 'fail'}">
            ${!phaseRules.medications || stats.medicationTaken > 0 ? 'PASS' : 'FAIL'}
          </td>
        </tr>
        <tr>
          <td>Sponsor Meeting</td>
          <td>${phaseRules.supporter ? 'Required' : 'N/A'}</td>
          <td>${stats.primarySupporterMet > 0 ? 'Yes' : 'No'}</td>
          <td class="${!phaseRules.supporter || stats.primarySupporterMet > 0 ? 'pass' : 'fail'}">
            ${!phaseRules.supporter || stats.primarySupporterMet > 0 ? 'PASS' : 'FAIL'}
          </td>
        </tr>
      </table>
      <p style="margin-top: 30px; font-size: 12px; color: #999;">
        Generated by RATS Recovery App — ${moment().format('MMMM D, YYYY h:mm A')}
      </p>
    </body>
    </html>
  `;

  const options = {
    html,
    fileName: `compliance_${guest.id}_${weekStart}`,
    directory: 'Documents',
  };

  const file = await RNHTMLtoPDF.convert(options);
  return file.filePath!;
}
```

**Step 2: Add Export button to GuestHome**

Modify: `src/screens/Profile/GuestHome.tsx`

```tsx
import { exportWeeklyReportPDF } from '../../services/reportExport';
import Share from 'react-native-share';

// In the component:
const handleExportReport = async () => {
  if (!guest || !summary) return;
  try {
    const filePath = await exportWeeklyReportPDF(guest, summary.stats, startDate, phaseRules);
    await Share.open({ url: `file://${filePath}`, type: 'application/pdf' });
  } catch (err) {
    Alert.alert('Export failed', 'Could not generate PDF report.');
  }
};

// Add button:
<RatsButton
  testID="export-report-button"
  title="Export PDF Report"
  onPress={handleExportReport}
/>
```

**Step 3: Commit**

```bash
git add src/services/reportExport.ts src/screens/Profile/GuestHome.tsx
git commit -m "feat(reports): add PDF compliance report export"
```

---

### Task C3: 2FA for admin accounts

**Goal:** Admins can optionally enable SMS-based 2FA via Firebase Phone Authentication.

**Firebase already supports phone auth** — no new SDK needed.

**Files:**
- Create: `src/screens/Personal/TwoFactorSetup.tsx`
- Modify: `src/navigation/types.ts` (add `TwoFactorSetup` route)
- Modify: `src/screens/Personal/Personal.tsx` (add 2FA entry point)

**Step 1: Add route**

```typescript
TwoFactorSetup = 'twoFactorSetup',
// In param list:
[Routes.TwoFactorSetup]: undefined;
```

**Step 2: Create 2FA setup screen**

```tsx
// src/screens/Personal/TwoFactorSetup.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import auth from '@react-native-firebase/auth';
import ScreenHeader from '../../components/screen-header';
import RatsScrollView from '../../components/rats-scroll-view';
import RatsButton from '../../components/rats-button';
import { color } from '../../styles/theme';

const TwoFactorSetup: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'done'>('phone');

  const sendCode = async () => {
    try {
      const confirmation = await auth().signInWithPhoneNumber(phone);
      setVerificationId(confirmation.verificationId);
      setStep('code');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send code.');
    }
  };

  const verifyCode = async () => {
    try {
      const credential = auth.PhoneAuthProvider.credential(verificationId, code);
      await auth().currentUser?.linkWithCredential(credential);
      setStep('done');
      Alert.alert('2FA Enabled', 'Your account is now protected with two-factor authentication.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid code.');
    }
  };

  return (
    <RatsScrollView>
      <ScreenHeader renderBackButton header="Two-Factor Authentication" />
      <View style={styles.container}>
        {step === 'phone' && (
          <>
            <Text style={styles.desc}>Enter your phone number to receive a verification code.</Text>
            <TextInput
              testID="phone-input"
              style={styles.input}
              placeholder="+1 555 000 0000"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            <RatsButton testID="send-code-button" title="Send Code" onPress={sendCode} />
          </>
        )}
        {step === 'code' && (
          <>
            <Text style={styles.desc}>Enter the 6-digit code sent to {phone}.</Text>
            <TextInput
              testID="verification-code-input"
              style={styles.input}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <RatsButton testID="verify-code-button" title="Verify" onPress={verifyCode} />
          </>
        )}
        {step === 'done' && (
          <Text style={styles.success}>2FA is enabled on your account.</Text>
        )}
      </View>
    </RatsScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  desc: { fontSize: 15, color: color.dark_grey, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: color.light_grey, borderRadius: 8,
    padding: 12, fontSize: 18, marginBottom: 16 },
  success: { fontSize: 16, color: 'green', textAlign: 'center', marginTop: 20 },
});

export default TwoFactorSetup;
```

**Step 3: Register and link from Personal screen**

In `src/navigation/navigators.tsx`:
```tsx
<RootStack.Screen name={Routes.TwoFactorSetup} component={TwoFactorSetup} />
```

In `src/screens/Personal/Personal.tsx`:
```tsx
<Section
  testID="2fa-setup-button"
  name="Two-Factor Authentication"
  description="Add an extra layer of security"
  iconName="shield-alt"
  onPress={() => navigation.navigate(Routes.TwoFactorSetup)}
/>
```

**Step 4: Commit**

```bash
git add src/screens/Personal/TwoFactorSetup.tsx src/navigation/ src/screens/Personal/Personal.tsx
git commit -m "feat(security): add SMS-based 2FA setup for admin accounts"
```

**Phase C Exit Criteria:**
- [ ] Sentry shows events in dashboard
- [ ] PDF export works on device for at least one guest report
- [ ] 2FA setup flow completes without error on test account

---

## Phase D: Oxford House MVP

**Goal:** Launch minimum feature set for Oxford Houses. Type definitions (`Officer.ts`, `Election.ts`) already exist in `src/entities/oxford/`.

---

### Task D1: House type selector in setup wizard

**Files:**
- Modify: `src/screens/SetupWizards/OperatorSetupWizard/HouseSetupForm.tsx` (or equivalent)
- Modify: `src/entities/House.ts` — confirm `houseType: 'traditional' | 'oxford'` exists

**Step 1: Verify House entity has houseType**

```bash
grep "houseType" /Users/marcusklein/dev/rats-v2/src/entities/House.ts
```
Expected: `houseType?: 'traditional' | 'oxford'`

**Step 2: Add house type selection to setup form**

Find the house setup form (likely `src/screens/SetupWizards/OperatorSetupWizard/`) and add a radio/segmented control:
```tsx
<Text>House Type</Text>
<RadioButton
  testID="house-type-traditional"
  label="Traditional"
  selected={houseType === 'traditional'}
  onPress={() => setHouseType('traditional')}
/>
<RadioButton
  testID="house-type-oxford"
  label="Oxford House"
  selected={houseType === 'oxford'}
  onPress={() => setHouseType('oxford')}
/>
```

**Step 3: Persist the selection**

Ensure `houseType` is included in the `createHouse()` call.

**Step 4: Commit**

```bash
git commit -m "feat(oxford): add house type selector in setup wizard"
```

---

### Task D2: Oxford House officer management

**Files:**
- Create: `src/screens/Oxford/OfficerManagement.tsx`
- Create: `src/services/oxford/officers.ts`
- Modify: `src/navigation/types.ts`

**Step 1: Create officer service**

```typescript
// src/services/oxford/officers.ts
import { firestore } from '../../../firebase-setup';
import { Officer } from '../../entities/oxford/Officer';

export async function getOfficers(houseId: string): Promise<Officer[]> {
  const snap = await firestore
    .collection('houses').doc(houseId)
    .collection('officers').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Officer));
}

export async function setOfficer(houseId: string, officer: Omit<Officer, 'id'>): Promise<void> {
  const ref = firestore.collection('houses').doc(houseId).collection('officers');
  // Replace any existing officer with same role
  const existing = await ref.where('role', '==', officer.role).get();
  const batch = firestore.batch();
  existing.docs.forEach(d => batch.delete(d.ref));
  batch.set(ref.doc(), { ...officer, createdAt: new Date().toISOString() });
  await batch.commit();
}
```

**Step 2: Create OfficerManagement screen with officer list and assignment**

The screen shows current officers (President, Treasurer, Secretary, Comptroller) and allows admin to assign guests to officer roles.

**Step 3: Add route and link from HouseSummary (Oxford houses only)**

Show Oxford-specific tabs/options only when `house.houseType === 'oxford'`.

**Step 4: Commit per sub-feature (service, screen, navigation)**

---

### Task D3: Equal Expense Share (EES) tracker

**Files:**
- Create: `src/screens/Oxford/EESTracker.tsx`
- Create: `src/services/oxford/ees.ts`

**Core logic:**
- EES = Total house expenses ÷ Number of current residents
- Auto-recalculates when `house.currentCapacity` changes
- Treasurer marks collections per resident

**Step 1: Create EES service**

```typescript
// src/services/oxford/ees.ts
import { firestore } from '../../../firebase-setup';

export interface EESRecord {
  guestId: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  weekStart: string;
  houseId: string;
}

export function calculateEES(totalExpenses: number, residentCount: number): number {
  if (residentCount === 0) return 0;
  return Math.round((totalExpenses / residentCount) * 100) / 100;
}

export async function getEESRecords(houseId: string, weekStart: string): Promise<EESRecord[]> {
  const snap = await firestore.collection('ees-records')
    .where('houseId', '==', houseId)
    .where('weekStart', '==', weekStart)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
}

export async function markEESPaid(recordId: string): Promise<void> {
  await firestore.collection('ees-records').doc(recordId).update({
    paid: true,
    paidAt: new Date().toISOString(),
  });
}
```

**Step 2: Build EESTracker screen showing per-resident share and paid/unpaid status**

**Step 3: Commit**

```bash
git commit -m "feat(oxford): add Equal Expense Share tracker"
```

---

### Task D4: Business meeting management

**Files:**
- Create: `src/screens/Oxford/BusinessMeetings.tsx`
- Create: `src/services/oxford/businessMeetings.ts`

**Step 1: Create business meeting service**

```typescript
// src/services/oxford/businessMeetings.ts
import { firestore } from '../../../firebase-setup';
import { BusinessMeeting } from '../../entities/oxford/BusinessMeeting';

export async function createBusinessMeeting(
  houseId: string,
  meeting: Omit<BusinessMeeting, 'id'>
): Promise<string> {
  const ref = firestore.collection('houses').doc(houseId)
    .collection('business-meetings').doc();
  await ref.set(meeting);
  return ref.id;
}

export async function getBusinessMeetings(houseId: string): Promise<BusinessMeeting[]> {
  const snap = await firestore.collection('houses').doc(houseId)
    .collection('business-meetings')
    .orderBy('scheduledAt', 'desc')
    .limit(20)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as BusinessMeeting));
}
```

**Step 2: Build BusinessMeetings screen with schedule, attendance, and minutes**

**Step 3: Commit**

```bash
git commit -m "feat(oxford): add business meeting management"
```

---

### Task D5: Democratic voting system

**Files:**
- Create: `src/screens/Oxford/Voting.tsx`
- Create: `src/services/oxford/votes.ts`

**Voting rules:** New member admission requires 80% approval from current members. Expulsion votes require same threshold.

**Step 1: Create voting service**

```typescript
// src/services/oxford/votes.ts
import { firestore } from '../../../firebase-setup';
import { Vote } from '../../entities/oxford/Vote';

export async function createVote(houseId: string, vote: Omit<Vote, 'id'>): Promise<string> {
  const ref = firestore.collection('houses').doc(houseId)
    .collection('votes').doc();
  await ref.set({ ...vote, createdAt: new Date().toISOString(), votes: {} });
  return ref.id;
}

export async function castVote(
  houseId: string,
  voteId: string,
  guestId: string,
  choice: 'yes' | 'no' | 'abstain',
): Promise<void> {
  await firestore.collection('houses').doc(houseId)
    .collection('votes').doc(voteId)
    .update({ [`votes.${guestId}`]: choice });
}

export function calculateResult(
  votes: Record<string, 'yes' | 'no' | 'abstain'>,
  threshold = 0.8,
): 'passed' | 'failed' | 'pending' {
  const values = Object.values(votes);
  const total = values.filter(v => v !== 'abstain').length;
  if (total === 0) return 'pending';
  const yeses = values.filter(v => v === 'yes').length;
  return yeses / total >= threshold ? 'passed' : 'failed';
}
```

**Step 2: Build Voting screen showing active votes with pass/fail thresholds**

**Step 3: Commit**

```bash
git commit -m "feat(oxford): add democratic voting system with 80% threshold"
```

**Phase D Exit Criteria:**
- [ ] 5+ Oxford Houses actively piloting the app
- [ ] Officer elections, EES tracking, and business meetings all functional
- [ ] Voting system correctly enforces 80% threshold

---

## Phase E: Scale (Months 5-12)

Execute from PRODUCT_ROADMAP.md and FEATURE_PRIORITIZATION.md. Key items:

- Oxford House regional outreach to OHARR and regional associations
- Photo verification for meeting attendance
- Advanced analytics dashboard (cross-house operator view)
- Annual billing option (15-20% discount for 12-month pre-pay)
- Referral program (1 free month per referred house that converts)

---

## Kill List

Do not build:
- Web app modernization (Angular 9 → Next.js): mobile-first product; web is marketing only
- Alumni network: requires user mass that doesn't yet exist
- QuickBooks integration: CSV export is sufficient at current scale
- v2 clean-port rewrite: do data migration incrementally, not a full rewrite
- HIPAA compliance: not required until enterprise customers demand it

---

## Success Metrics

| Checkpoint | Target |
|-----------|--------|
| May 2026 | Resident payments live in 3+ houses; 15+ houses total; CI green |
| August 2026 | Oxford pilot with 5+ houses; $2K+/month ARR; PDF reports; 2FA available |
| February 2027 | 100+ houses; $10K+/month ARR; Oxford features mature |
