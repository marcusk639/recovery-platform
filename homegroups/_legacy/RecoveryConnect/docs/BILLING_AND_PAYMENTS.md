> ⚠️ **Legacy document.** Carried over from the standalone `RecoveryConnect` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `homegroups` documentation.

# Billing and Payments System

This document describes the billing and payment system for Homegroups, including subscription management, donations, authentication flows, and webhook handling.

## Table of Contents

1. [Overview](#overview)
2. [Subscription Model](#subscription-model)
3. [Authentication for Web Payments](#authentication-for-web-payments)
4. [Payment Flows](#payment-flows)
5. [Stripe Webhooks](#stripe-webhooks)
6. [Billing Management](#billing-management)
7. [Donations](#donations)
8. [Email Notifications](#email-notifications)
9. [Firebase Console Configuration](#firebase-console-configuration)
10. [Environment Variables](#environment-variables)
11. [Mobile App Integration](#mobile-app-integration)

---

## Overview

The Homegroups app uses Stripe for payment processing. The billing system supports:

- **Group Subscriptions**: $12/year flat rate for group admin access
- **Donations**: One-time donations to groups (optional Stripe Connect)
- **Trial Period**: 7-day free trial for new subscriptions

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│    Web App      │────▶│ Firebase Cloud  │
│  (React Native) │     │    (React)      │     │   Functions     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │     Stripe      │
                                                │      API        │
                                                └─────────────────┘
```

---

## Subscription Model

### Pricing

| Plan                | Price              | Billing Cycle | Trial  | Stripe Product env var            |
| ------------------- | ------------------ | ------------- | ------ | --------------------------------- |
| Group Admin         | $12                | Yearly        | 7 days | `STRIPE_PRODUCT_ID_GROUP`         |
| Intergroup — Tier A | TBD                | Yearly        | —      | `STRIPE_PRODUCT_ID_INTERGROUP_A`  |
| Intergroup — Tier B | TBD                | Yearly        | —      | `STRIPE_PRODUCT_ID_INTERGROUP_B`  |
| Treatment Center    | (same as Tier A/B) | Yearly        | —      | same products as intergroup tiers |

### Pricing-to-Product Mapping

All three customer types (intergroup, district/area, treatment center) route through the **`createIntergroup` callable** — the `type` field discriminates them at runtime. Treatment centers are **not a separate Stripe product**; they purchase the same intergroup tier-A or tier-B product depending on how many affiliated groups they need.

```
User clicks "Get Started" on TreatmentCentersPage
  → createIntergroup({ type: "treatment_center", tier: "tier_a" | "tier_b", ... })
  → Stripe Checkout with productIdIntergroupA or productIdIntergroupB
  → intergroups/{id} document created with type: "treatment_center"
```

The 3-to-2 fan-in: three UI entry points (intergroup, district/area, treatment center) map to two Stripe products (tier A, tier B). The `type` field on the Firestore document is the only persistent record of which entry point was used. Stripe sees only the tier, not the customer type.

**Required Stripe setup before V4.4 launch:**

- Set a default price on `productIdIntergroupA` (env: `STRIPE_PRODUCT_ID_INTERGROUP_A`)
- Set a default price on `productIdIntergroupB` (env: `STRIPE_PRODUCT_ID_INTERGROUP_B`)
- Both must have default prices set in the Stripe Dashboard; `getDefaultPriceForProduct()` throws if no default price is configured.

### Subscription States

| Status       | Description                     |
| ------------ | ------------------------------- |
| `trialing`   | User is in free trial period    |
| `active`     | Subscription is active and paid |
| `past_due`   | Payment failed, grace period    |
| `canceled`   | Subscription has been cancelled |
| `incomplete` | Initial payment pending         |

### Group Document Fields

```typescript
interface GroupSubscriptionFields {
  stripeCustomerId?: string; // Stripe Customer ID
  stripeSubscriptionId?: string; // Stripe Subscription ID
  stripeSubscriptionItemId?: string;
  subscriptionStatus?: string; // active, trialing, past_due, canceled
  subscriptionExpiresAt?: Timestamp;
  subscriptionCancelAtPeriodEnd?: boolean;
  lastPaymentDate?: Timestamp;
  lastPaymentFailureDate?: Timestamp;
  stripeConnectAccountId?: string; // For donations (optional)
}
```

### Intergroup Document Fields

Intergroup and treatment-center subscriptions live in the top-level `intergroups` collection (one doc per intergroup / treatment center). The same shape is used for both — `type` discriminates.

```typescript
interface IntergroupSubscriptionFields {
  // Identity
  intergroupId: string; // Firestore doc ID, mirrored in the doc as `id`
  name: string;
  type: "intergroup" | "district" | "area" | "treatment_center";
  facilityName?: string; // Treatment centers only — user-supplied in checkout modal

  // Tier / capacity
  tier: "tier_a" | "tier_b";
  maxGroups: number; // 10 for tier_a, 9999 for tier_b ("unlimited")
  affiliatedGroupIds: string[];

  // Access control
  createdBy: string; // UID of the original creator (immutable)
  adminUids: string[]; // UIDs with admin access; creator is seeded in here

  // Stripe
  stripeCustomerId: string;
  stripeProductIdIntergroup: string;
  stripeSubscriptionId?: string; // Set by webhook after checkout completes
  stripePriceId?: string; // Set by webhook after checkout completes
  subscriptionStatus: string; // "incomplete" on create, then "active" / "past_due" / "canceled" via webhook
  pendingCheckoutSessionId?: string; // Set during initial createIntergroup; cleared by webhook
  pendingUpgradeSessionId?: string; // Set during upgradeIntergroupTier; cleared by webhook

  // Metadata
  description?: string | null;
  contactEmail?: string | null;
  state?: string | null;
  country?: string | null;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}
```

**`createdBy` vs `adminUids`:** `createdBy` records the original owner UID and never changes. `adminUids` is the live admin allow-list — `upgradeIntergroupTier` and other admin-gated callables check membership in `adminUids`, not `createdBy`. Always add new admins to `adminUids`; do not mutate `createdBy`.

**Members subcollection:** `intergroups/{id}/members/{uid}` documents (`role: "owner"` for the creator) track membership separately from `adminUids`.

---

## Authentication for Web Payments

Due to Apple App Store requirements, payments are handled on the web. The system supports multiple authentication methods for the web app.

### Method 1: Custom Token (From Mobile App)

Used when opening web pages from within the mobile app via WebView.

**Flow:**

```
Mobile App                    Web App                      Firebase
    │                            │                            │
    ├── createWebAuthToken() ───▶│                            │
    │◀── { token } ──────────────┤                            │
    │                            │                            │
    ├── Open URL with ?token=xxx ▶│                            │
    │                            ├── signInWithCustomToken() ─▶│
    │                            │◀── authenticated session ───┤
```

**Mobile App Usage:**

```typescript
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const createWebAuthToken = httpsCallable(functions, "createWebAuthToken");

// Get token
const result = await createWebAuthToken();
const { token } = result.data;

// Build URL with token
const subscribeUrl = `https://homegroups-app.com/subscribe?token=${encodeURIComponent(
  token
)}&groupId=${groupId}&groupName=${encodeURIComponent(groupName)}`;

// Open in WebView or browser
Linking.openURL(subscribeUrl);
```

### Method 2: Email Magic Link (External Access)

Used when users access billing from email notifications or desktop browsers.

**Flow:**

```
User                          Web App                      Firebase
  │                              │                            │
  ├── Visit /billing ───────────▶│                            │
  │                              │                            │
  │◀── Show email form ──────────┤                            │
  │                              │                            │
  ├── Enter email ──────────────▶│                            │
  │                              ├── sendSignInLinkToEmail() ─▶│
  │                              │                            │
  │◀── Email with magic link ────────────────────────────────┤
  │                              │                            │
  ├── Click link in email ──────▶│                            │
  │                              ├── signInWithEmailLink() ───▶│
  │                              │◀── authenticated session ───┤
```

**Supported Web Pages:**

| Page            | Path               | Auth Methods                   |
| --------------- | ------------------ | ------------------------------ |
| Subscribe       | `/subscribe`       | Custom Token                   |
| Billing         | `/billing`         | Custom Token, Email Magic Link |
| Stripe Redirect | `/stripe-redirect` | N/A (redirect handler)         |

---

## Payment Flows

### Flow 1: New Group Subscription (iOS - Apple requirement)

Since Apple doesn't allow in-app payments for this type of app, subscriptions are handled via web:

```
1. User taps "Become Admin" in mobile app
2. App calls createWebAuthToken() to get auth token
3. App opens WebView to /subscribe?token=xxx&groupId=xxx
4. User enters payment details on SubscribePage
5. SubscribePage calls requestAdminAccessWithSubscription()
6. Cloud Function creates Stripe customer and subscription
7. User is granted admin access immediately
8. WebView redirects back to app via deep link
```

### Flow 2: New Group Subscription (Android)

Android can use in-app payment via Stripe SDK:

```
1. User taps "Become Admin" in mobile app
2. App collects payment method via Stripe SDK
3. App calls requestAdminAccessWithSubscription() with paymentMethodId
4. Cloud Function creates customer and subscription
5. User is granted admin access
```

### Flow 3: Modify Billing (From App)

```
1. User taps "Manage Billing" in mobile app
2. App calls createCustomerPortalSession({ groupId })
3. Cloud Function returns Stripe Customer Portal URL
4. App opens URL in browser
5. User manages subscription in Stripe's hosted portal
```

### Flow 4: Modify Billing (From Email/External)

```
1. User receives payment failure email with billing link
2. User clicks link to /billing?groupId=xxx
3. User enters email to receive sign-in link
4. User clicks magic link in email
5. User is authenticated and can access billing
6. User clicks "Manage Billing" to open Stripe Portal
```

---

## Stripe Webhooks

### Webhook Endpoints

| Endpoint         | URL                                                                  | Purpose                         |
| ---------------- | -------------------------------------------------------------------- | ------------------------------- |
| Platform Webhook | `https://<region>-<project>.cloudfunctions.net/stripeWebhook`        | Subscriptions, checkout         |
| Connect Webhook  | `https://<region>-<project>.cloudfunctions.net/stripeConnectWebhook` | Donations to connected accounts |

### Handled Events

#### Platform Webhook Events

| Event                                  | Handler                          | Action                           |
| -------------------------------------- | -------------------------------- | -------------------------------- |
| `checkout.session.completed`           | `handleCheckoutSessionCompleted` | Grant admin access, update group |
| `invoice.payment_succeeded`            | `handleInvoicePaymentSucceeded`  | Mark subscription active         |
| `invoice.payment_failed`               | `handleInvoicePaymentFailed`     | Mark past_due, notify admins     |
| `customer.subscription.updated`        | `handleSubscriptionUpdated`      | Sync subscription status         |
| `customer.subscription.deleted`        | `handleSubscriptionDeleted`      | Mark canceled, notify admins     |
| `customer.subscription.trial_will_end` | `handleTrialWillEnd`             | Notify admins (3 days before)    |
| `payment_intent.succeeded`             | `handlePaymentIntentSucceeded`   | Update donation status           |
| `payment_intent.payment_failed`        | `handlePaymentIntentFailed`      | Update donation status           |
| `charge.dispute.created`               | `handleDisputeCreated`           | Log dispute                      |

### Webhook Security

1. **Signature Verification**: All webhooks verify Stripe signature
2. **Idempotency (atomic-create-as-lock pattern)**: Events are tracked in `processed_stripe_events/{eventId}` using Firestore `create()` (`functions/src/http/stripeWebhook.ts:106-124`). Because `create()` fails with `ALREADY_EXISTS` if the document already exists, the create itself serves as a distributed lock — the second attempt at processing the same event is rejected before any side-effects run. On transient failure (Firestore down, network error), the marker document is deleted so the retry can proceed. Non-retriable handler errors throw a custom `NonRetriableError` so the webhook still returns 200 (preventing infinite Stripe retries) while the marker doc stays in place to record the dead-letter event.
3. **Error Handling**: Non-retriable errors return 200 to prevent infinite retries

### Setting Up Webhooks in Stripe Dashboard

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://us-central1-<project-id>.cloudfunctions.net/stripeWebhook`
3. Select events to listen for (see list above)
4. Copy webhook signing secret to environment variables

---

## Billing Management

### Stripe Customer Portal

The Stripe Customer Portal allows users to:

- Update payment method
- View invoices and payment history
- Cancel subscription
- Update billing email

**Cloud Function: `createCustomerPortalSession`**

```typescript
// Request
{ groupId: string }

// Response
{ success: boolean, url: string }
```

### Reactivating a Subscription

**Cloud Function: `reactivateGroupSubscription`**

Used to reactivate a canceled or failed subscription:

```typescript
// Request
{ groupId: string }

// Response
{
  success: boolean,
  subscriptionId: string,
  subscriptionStatus: string
}
```

---

## Donations

### Overview

Groups can optionally set up Stripe Connect to receive donations directly. Donations are one-time payments.

### Stripe Connect Setup

1. Group admin initiates Stripe Connect onboarding
2. `createStripeAccountLink` creates Express account
3. Admin completes onboarding on Stripe
4. Group receives `stripeConnectAccountId`

### Donation Flow

```
1. User enters donation amount
2. App calls createStripePaymentIntent({ groupId, amount })
3. Cloud Function creates PaymentIntent with transfer_data (if Connect)
4. User completes payment
5. payment_intent.succeeded webhook updates donation record
6. Funds transferred to group's Connect account (minus platform fee)
```

### Platform Fee

- **Platform Fee**: 5% of donation amount
- Configured in `functions/src/utils/stripe.ts` as `PLATFORM_FEE_PERCENT`

---

## Email Notifications

The system sends both push notifications and emails for important billing events.

### Payment Failure Email

Sent when a subscription payment fails:

- **Subject**: `⚠️ Payment Failed - {Group Name}`
- **Content**: Explanation + "Update Payment Method" button linking to `/billing?groupId=xxx`

### Trial Ending Email

Sent 3 days before trial ends:

- **Subject**: `⏰ Trial Ending Soon - {Group Name}`
- **Content**: Trial end date + "Add Payment Method" button

### Subscription Cancelled

Push notification only (no email currently).

---

## Firebase Console Configuration

### Enable Email Link Sign-In

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to **Authentication** → **Sign-in method**
4. Click **Email/Password**
5. Enable **Email link (passwordless sign-in)**
6. Click **Save**

### Add Authorized Domains

1. In **Authentication** → **Settings** → **Authorized domains**
2. Add your production domain (e.g., `homegroups-app.com`)

---

## Environment Variables

### Cloud Functions (`functions/.env`)

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_TEST_SECRET_KEY=sk_test_xxx

# Stripe Webhook Secrets
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_TEST_WEBHOOK_SECRET=whsec_xxx
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxx
STRIPE_TEST_CONNECT_WEBHOOK_SECRET=whsec_xxx

# Stripe Price IDs
STRIPE_PRICE_ID_MEMBER=price_xxx
STRIPE_TEST_PRICE_ID_MEMBER=price_xxx

# Stripe Product IDs (price ID resolved at runtime via getDefaultPriceForProduct)
STRIPE_PRODUCT_ID_GROUP=prod_xxx
STRIPE_PRODUCT_ID_INTERGROUP_A=prod_xxx  # Tier A: up to 10 groups
STRIPE_PRODUCT_ID_INTERGROUP_B=prod_xxx  # Tier B: unlimited (maxGroups: 9999)

# RATS integration (getMeetingAttendance HTTP endpoint)
RATS_API_KEY=<64-char-hex-bearer-token>

# SendGrid (for emails)
SENDGRID_API_KEY=SG.xxx
```

| Variable                         | Purpose                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `STRIPE_PRODUCT_ID_GROUP`        | Stripe product ID for group admin subscriptions ($12/year)                                     |
| `STRIPE_PRODUCT_ID_INTERGROUP_A` | Stripe product ID for tier A intergroup / treatment-center plan (up to 10 groups)              |
| `STRIPE_PRODUCT_ID_INTERGROUP_B` | Stripe product ID for tier B intergroup / treatment-center plan (unlimited groups)             |
| `RATS_API_KEY`                   | Bearer token for the `getMeetingAttendance` HTTP endpoint. Required; checked on every request. |

> Each Stripe product above must have a **default price** configured in the Stripe Dashboard. `getDefaultPriceForProduct()` reads `product.default_price` at runtime — if it's unset, the callable throws `'Product X has no default price set'` and checkout fails. Verify after creating any new product.

### Web App (`web/.env`)

```bash
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

---

## Mobile App Integration

### Opening Subscribe Page

The `SubscriptionWebView` component automatically handles auth token generation:

```typescript
// In GroupOverviewScreen or similar
import SubscriptionWebView from "../../components/payments/SubscriptionWebView";

// The WebView automatically:
// 1. Calls createWebAuthToken() when opened
// 2. Passes the token to the web subscribe page
// 3. Handles success/error/cancel callbacks

<SubscriptionWebView
  visible={subscriptionWebViewVisible}
  onClose={handleClose}
  onSuccess={handleSuccess} // receives subscriptionId
  onError={handleError} // receives error message
  userId={currentUser.uid}
  userEmail={currentUser.email}
  userName={currentUser.displayName}
  groupId={groupId}
  groupName={groupName}
/>;
```

For manual URL construction (rare):

```typescript
import { getFunctions, httpsCallable } from "firebase/functions";
import { Linking } from "react-native";

async function openSubscribePage(
  groupId: string,
  groupName: string,
  userEmail: string
) {
  const functions = getFunctions();
  const createWebAuthToken = httpsCallable(functions, "createWebAuthToken");

  const result = await createWebAuthToken();
  const { token } = result.data;

  const url = new URL("https://homegroups-app.com/subscribe");
  url.searchParams.set("token", token);
  url.searchParams.set("groupId", groupId);
  url.searchParams.set("groupName", groupName);
  url.searchParams.set("email", userEmail);

  // Open in WebView or browser
  await Linking.openURL(url.toString());
}
```

### Opening Billing Page (Direct to Stripe Portal)

```typescript
async function openBillingPortal(groupId: string) {
  const functions = getFunctions();
  const createPortalSession = httpsCallable(
    functions,
    "createCustomerPortalSession"
  );

  const result = await createPortalSession({ groupId });

  if (result.data.success) {
    await Linking.openURL(result.data.url);
  }
}
```

### Handling Deep Links

Configure deep link handling for payment callbacks:

```typescript
// URL Schemes
homegroups-app://payment-success?subscriptionId=xxx&groupId=xxx
homegroups-app://payment-cancelled?groupId=xxx
homegroups-app://payment-error?groupId=xxx&error=xxx
homegroups-app://billing
```

---

## Troubleshooting

### Common Issues

1. **"Webhook secret not configured"**

   - Check that `STRIPE_WEBHOOK_SECRET` is set in `functions/.env`
   - Redeploy functions after adding environment variables

2. **"User must be logged in"**

   - Ensure the auth token is being passed correctly to web pages
   - Check that Firebase Auth is properly initialized

3. **Email sign-in link not working**

   - Verify Email Link sign-in is enabled in Firebase Console
   - Check that the domain is in authorized domains

4. **Payments not reflecting in Firestore**
   - Check webhook logs in Stripe Dashboard
   - Verify webhook endpoints are correctly configured
   - Check Cloud Functions logs for errors

### Testing

Use Stripe test mode for development:

- Test card: `4242 4242 4242 4242`
- Any future expiry date
- Any CVC

---

## Related Files

### Cloud Functions

- `functions/src/callable/createWebAuthToken.ts` - Generate auth tokens for web
- `functions/src/callable/requestAdminAccessWithSubscription.ts` - Create subscription
- `functions/src/callable/createCustomerPortalSession.ts` - Stripe portal access
- `functions/src/callable/createStripePaymentIntent.ts` - Donation payments
- `functions/src/callable/createStripeAccountLink.ts` - Stripe Connect onboarding
- `functions/src/callable/reactivateGroupSubscription.ts` - Reactivate subscription
- `functions/src/http/stripeWebhook.ts` - Webhook handlers
- `functions/src/utils/stripeUtils.ts` - Stripe event handlers and notifications
- `functions/src/utils/stripe.ts` - Stripe client initialization

### Web App

- `web/src/pages/SubscribePage.js` - Subscription checkout
- `web/src/pages/BillingPage.js` - Billing management with email auth
- `web/src/lib/firebase.js` - Firebase initialization

### Mobile App

- `mobile/src/screens/homegroup/GroupOverviewScreen.tsx` - Claim group flow
- `mobile/src/screens/homegroup/GroupDonationScreen.tsx` - Donation flow

## RATS Integration

The `getMeetingAttendance` HTTP endpoint is called by the RATS sober living app to verify
a resident's meeting attendance without embedding the full Homegroups UI.

**Endpoint:** `GET https://us-central1-<project>.cloudfunctions.net/getMeetingAttendance`

**Auth:** `Authorization: Bearer <RATS_API_KEY>`

**Auth comparison is constant-time (U-1):** The endpoint uses `safeStringEqual` (`functions/src/http/getMeetingAttendance.ts:29-37`) — an HMAC-SHA256 normalization of both the expected and provided tokens, then `crypto.timingSafeEqual` on the resulting digests. This prevents two classes of side-channel:

- **Length leakage:** A naive `==` comparison short-circuits at the first byte mismatch, leaking the token length through response timing. HMAC-SHA256 produces a 32-byte digest regardless of input length, so the comparison length is constant.
- **Byte-by-byte timing:** `timingSafeEqual` compares all bytes of the digest before returning, preventing per-byte timing attacks.

Future RATS-style bearer endpoints should reuse this pattern rather than rolling a fresh comparison.

**Query params:**

- `userId` (string, required) — Firebase UID of the resident
- `groupId` (string, required) — Homegroups group ID

**Response:**

```json
{
  "userId": "abc123",
  "groupId": "grp456",
  "checkIns": [
    {
      "instanceId": "...",
      "meetingId": "...",
      "scheduledAt": "ISO-8601",
      "attendeeCount": 12
    }
  ],
  "count": 1
}
```

**Error responses:**

| Status | Condition                                     | Response body                        |
| ------ | --------------------------------------------- | ------------------------------------ |
| 401    | Missing/invalid Bearer token                  | `{"error": "Unauthorized"}`          |
| 400    | Missing required query params                 | `{"error": "..."}` (per-param msg)   |
| 500    | Internal error (e.g. Firestore index missing) | `{"error": "Internal server error"}` |

**Hard cap:** The endpoint returns at most **100 records per call** (Firestore `.limit(100)`, ordered by `scheduledAt DESC`). The response shape does not currently include `truncated`, but callers should treat `count === 100` as potentially truncated and paginate by `scheduledAt` cursors if/when added. (If a future revision adds `truncated: true` to the response, that flag indicates the result was capped — older clients should still handle the 100-cap by inspection.)

**Rate limits:** No built-in rate limiting is enforced server-side. As a courtesy / to avoid Firestore quota pressure, callers should not exceed approximately **60 requests per minute** per RATS instance. Higher sustained throughput should be coordinated with the Homegroups team before deploy.

**Setup:** Set `RATS_API_KEY` in Firebase Functions environment config:

```bash
firebase functions:config:set rats.api_key="<generate-a-random-64-char-hex-string>"
```

Then reference it in your `.env` or secrets config as `RATS_API_KEY`.

## Treatment Center Checkout

Treatment centers reach checkout via the public marketing page `web/src/pages/TreatmentCentersPage.js` (no token from a mobile app — these users start cold on the web).

**Auth pattern (differs from group admin flow):**

- Treatment-center users authenticate via **Google OAuth `signInWithPopup`** (preferred) or via web-native `signInWithEmailAndPassword` / `createUserWithEmailAndPassword`.
- They do **not** use `createWebAuthToken` (the mobile→web custom-token flow). That callable is only relevant when the mobile app already has an authenticated Firebase user that needs to be carried to a WebView.
- For Google sign-in, the page additionally requires `emailVerified === true`; if false, it triggers `sendEmailVerification`, signs the user out, and surfaces a "Please verify your email" message before allowing checkout.

**Tier mapping (checkout modal → `createIntergroup` tier):**

| Page tier (visible)        | `tier` param sent to `createIntergroup`                                                     | Stripe product env var           |
| -------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| Basic Listing ($99/mo)     | `tier_a`                                                                                    | `STRIPE_PRODUCT_ID_INTERGROUP_A` |
| Referral Partner ($299/mo) | `tier_b`                                                                                    | `STRIPE_PRODUCT_ID_INTERGROUP_B` |
| White-Label ($999/mo)      | _Not a self-serve checkout._ Routes to the "Request information" lead-capture form instead. | n/a                              |

**`facilityName` is user-provided** (a free-text input in the checkout modal — e.g. "Sunrise Recovery Center"). It is **not** derived from the user's email or Google profile. The modal blocks checkout until the field is non-empty.

**Checkout flow:**

1. User clicks "Get Started" on a tier card.
2. Modal opens; user fills in facility name and either signs in with Google (verified) or with email/password (sign in OR create account).
3. Page calls `createIntergroup` with:
   ```js
   {
     name: facilityName.trim(),
     type: "treatment_center",
     tier: "tier_a" | "tier_b",
     successUrl: `${window.location.origin}/treatment-center-success`,
     cancelUrl: `${window.location.origin}/treatment-center-cancel`,
   }
   ```
4. `createIntergroup` resolves the price via `getDefaultPriceForProduct(productIdIntergroupA|B)`, creates a Stripe customer + Checkout Session, writes a pending `intergroups` doc (`subscriptionStatus: "incomplete"`), and returns `{ checkoutUrl }`.
5. Page does `window.location.href = checkoutUrl` to hand off to Stripe Checkout.
6. On success, Stripe redirects to `successUrl` (`TreatmentCenterSuccessPage`); on cancel, to `cancelUrl` (`TreatmentCenterCancelPage`).
7. `stripeWebhook` handles `checkout.session.completed` and flips the `intergroups` doc to `subscriptionStatus: "active"`, populating `stripeSubscriptionId` / `stripePriceId`.

**Allow-listed redirect origins:** `successUrl` / `cancelUrl` are validated server-side against `ALLOWED_REDIRECT_ORIGINS` in `createIntergroup.ts`. When the production web origin changes, this list must be updated in the same PR — see `docs/LAUNCH_BLOCKERS.md` #5.
