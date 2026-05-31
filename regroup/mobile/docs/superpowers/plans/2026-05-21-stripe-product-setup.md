# Stripe Product Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two Stripe subscription products (House $49/mo, Oxford $79/mo) via the Stripe CLI and wire their live price IDs into Firebase Functions config.

**Architecture:** Stripe CLI creates products and prices directly against the Stripe API. Price IDs are written to Firebase Functions config (accessible via `functions.config()`) and to a `.env` file for local development. The paywall in the mobile app already reads these IDs — no code changes needed beyond config.

**Tech Stack:** Stripe CLI, Firebase CLI, Firebase Functions config

> **⚠️ PREREQUISITE — P0-F (IAP Decision):** Complete the IAP vs. direct billing decision before this plan. If you choose Apple IAP (Option B), you still need these Stripe products for web billing, but the mobile upgrade CTA changes. See the decision guide at the end of this plan.

---

## File Structure

| Action | Path                               | Responsibility                                             |
| ------ | ---------------------------------- | ---------------------------------------------------------- |
| Modify | Firebase Functions config (remote) | Store `stripe.house_price_id` and `stripe.oxford_price_id` |
| Create | `.env.local` (gitignored)          | Local dev price IDs for the mobile app                     |

---

## Task 1: Create Stripe Products and Prices

**Prerequisites:**

- Stripe CLI installed: `brew install stripe/stripe-cli/stripe`
- Logged in: `stripe login` (opens browser)

- [ ] **Step 1: Verify Stripe CLI is installed and authenticated**

```bash
stripe --version
stripe config --list
```

Expected: version printed (e.g., `stripe version 1.21.x`), config shows your account email.

If not installed:

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

- [ ] **Step 2: Create the House subscription product (test mode first)**

```bash
stripe products create \
  --name="Regroup House" \
  --description="Monthly subscription for one sober living house" \
  --metadata[tier]="house"
```

Expected output includes:

```
{
  "id": "prod_xxxxxxxxxxxxxxxxx",
  "name": "Regroup House",
  ...
}
```

Copy the `prod_` ID.

- [ ] **Step 3: Create the House price ($49/mo)**

Replace `prod_HOUSE_ID` with the ID from Step 2:

```bash
stripe prices create \
  --product=prod_HOUSE_ID \
  --unit-amount=4900 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="House Monthly"
```

Expected output includes:

```
{
  "id": "price_xxxxxxxxxxxxxxxxx",
  "unit_amount": 4900,
  "recurring": { "interval": "month" },
  ...
}
```

Copy the `price_` ID. This is `STRIPE_TEST_HOUSE_PRICE_ID`.

- [ ] **Step 4: Create the Oxford subscription product**

```bash
stripe products create \
  --name="Regroup Oxford" \
  --description="Monthly subscription for Oxford House governance features" \
  --metadata[tier]="oxford"
```

Copy the `prod_` ID.

- [ ] **Step 5: Create the Oxford price ($79/mo)**

Replace `prod_OXFORD_ID` with the ID from Step 4:

```bash
stripe prices create \
  --product=prod_OXFORD_ID \
  --unit-amount=7900 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="Oxford Monthly"
```

Copy the `price_` ID. This is `STRIPE_TEST_OXFORD_PRICE_ID`.

- [ ] **Step 6: Verify both products in Stripe Dashboard**

Open https://dashboard.stripe.com/test/products in a browser. Confirm:

- "Regroup House" — $49.00/month
- "Regroup Oxford" — $79.00/month

**Expected result:** Both products visible with correct prices.

---

## Task 2: Wire Price IDs into Firebase Functions Config

- [ ] **Step 1: Set test-mode price IDs in Functions config**

Replace the placeholder values with your actual price IDs from Task 1:

```bash
firebase functions:config:set \
  stripe.house_price_id="price_TEST_HOUSE_ID" \
  stripe.oxford_price_id="price_TEST_OXFORD_ID"
```

Expected: `✔  Functions config updated.`

- [ ] **Step 2: Verify config was set**

```bash
firebase functions:config:get stripe
```

Expected:

```json
{
  "stripe": {
    "house_price_id": "price_TEST_HOUSE_ID",
    "oxford_price_id": "price_TEST_OXFORD_ID"
  }
}
```

- [ ] **Step 3: Create `.env.local` for local mobile dev**

In the rats-v2 root, create `.env.local` (confirm it is in `.gitignore` before writing):

```bash
grep ".env.local" .gitignore || echo "WARNING: .env.local not in .gitignore — add it first"
```

If not gitignored, add it:

```bash
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore .env.local"
```

Then create the file:

```bash
cat > .env.local << 'EOF'
STRIPE_HOUSE_PRICE_ID=price_TEST_HOUSE_ID
STRIPE_OXFORD_PRICE_ID=price_TEST_OXFORD_ID
EOF
```

Replace `price_TEST_HOUSE_ID` and `price_TEST_OXFORD_ID` with the actual test IDs.

- [ ] **Step 4: Deploy Functions with updated config**

```bash
firebase deploy --only functions
```

Expected: deployment succeeds. Subscription flow will now use the correct price IDs.

---

## Task 3: End-to-End Test in Stripe Test Mode

- [ ] **Step 1: Trigger a test subscription from the app**

Run the iOS app on simulator:

```bash
cd /Users/marcusklein/dev/rats-v2
npm run ios
```

Navigate to: **Settings → Subscription → Upgrade**. This opens `SubscriptionHandler` WebView pointing at `regroup-app.com/my-account`.

- [ ] **Step 2: Complete checkout with a test card**

In the WebView, complete the checkout using Stripe test card:

- Card number: `4242 4242 4242 4242`
- Expiry: any future date (e.g., `12/30`)
- CVC: any 3 digits (e.g., `123`)

- [ ] **Step 3: Verify webhook fired and house status updated**

```bash
# Check Functions logs for webhook receipt
firebase functions:log --only stripeWebhook | tail -20
```

Expected: log entry showing `customer.subscription.created` event processed and house `subscriptionStatus` updated to `active`.

In Firestore Console, find the test house document and confirm `subscriptionStatus: "active"`.

**Expected result:** Full subscription flow works end-to-end in test mode.

---

## Task 4: Repeat in Live Mode Before Launch

> **Do this only immediately before App Store submission.** Live mode creates real charges.

- [ ] **Step 1: Switch Stripe CLI to live mode**

```bash
stripe login --interactive
# When prompted, select your live mode API key
```

Or set the live secret key explicitly:

```bash
export STRIPE_API_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 2: Repeat Tasks 1 and 2 in live mode**

Run all the same `stripe products create` and `stripe prices create` commands. The products will have different `prod_` and `price_` IDs (live IDs start with `price_live_` in some Stripe versions, but the format is the same).

- [ ] **Step 3: Update Functions config with live price IDs**

```bash
firebase functions:config:set \
  stripe.house_price_id="price_LIVE_HOUSE_ID" \
  stripe.oxford_price_id="price_LIVE_OXFORD_ID"

firebase deploy --only functions
```

---

## Manual Step: P0-F — IAP vs. Direct Billing Decision

> This is a business/legal decision, not engineering. No code changes are needed for Option A (recommended).

**The question:** Apple requires IAP for digital goods purchased _within_ an iOS app. Regroup uses a WebView (`SubscriptionHandler`) for the upgrade flow — that WebView opens `regroup-app.com/my-account`, which is a web page outside the app's native UI.

**Apple's position:** The "reader app" exemption and the B2B SaaS precedent both suggest that a WebView linking to an external subscription page does not require IAP. However, Apple's enforcement is inconsistent.

**Options:**

| Option                        | What it means                                                                       | Risk                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **A: Keep WebView (current)** | Upgrade opens `regroup-app.com/my-account` in a WebView. No native payment sheet.   | Low-moderate. Apple may ask you to add IAP during review. Prepare a response citing B2B exemption. |
| **B: Add Apple IAP**          | Implement StoreKit 2 in the app. Apple takes 15–30%. Requires ~2 weeks engineering. | Eliminates App Store rejection risk but significantly reduces revenue.                             |

**Recommended response if Apple rejects for IAP:** "Regroup is a B2B software tool for sober living house operators. Subscriptions are business decisions made by house managers, not end-consumer micropurchases. We offer subscription management through our web portal per App Store guideline §3.1.3(b)."

**Record your decision here before running Task 4 (live mode).**

---

## Self-Review

### Spec Coverage

| Requirement                          | Covered by                                               |
| ------------------------------------ | -------------------------------------------------------- |
| Stripe subscription products created | Task 1 — Stripe CLI creates House ($49) and Oxford ($79) |
| Price IDs wired into Functions       | Task 2 — `firebase functions:config:set`                 |
| End-to-end subscription test         | Task 3 — test card flow in test mode                     |
| Live mode products before launch     | Task 4 — repeat in live mode                             |

### Acceptance Criteria

- [ ] `stripe prices list` shows two recurring prices: $49/mo and $79/mo
- [ ] `firebase functions:config:get stripe` returns both price IDs
- [ ] Test subscription creates a Stripe customer + subscription in Stripe Dashboard
- [ ] Firestore house document `subscriptionStatus` updates to `active` after test checkout
