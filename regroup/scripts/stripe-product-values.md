# Stripe Product Values — Regroup Platform

**Mode:** TEST  
**Generated:** 2026-06-28 via `scripts/setup-stripe-all.js`  
**API Version:** `2026-01-28.clover` — matches `functions/src/util/stripe.ts` [`S7`]

> Copy these values into `functions/.env.local` (Firebase emulator) or set them
> as Firebase Secret Manager secrets before deploying.
>
> **Firebase Secret Manager command (for secrets):**
> `firebase functions:secrets:set <SECRET_NAME>`

---

## 1. Subscription Products & Prices

Source: `functions/src/config.ts` [`S1`] — `SUBSCRIPTION_TIERS` object;
`functions/src/util/tierPricing.ts` [`S5`] — `resolveTierPriceId()`.

All prices are USD. Annual = 2 months free (10× monthly). Monthly prices set
as env vars consumed by `priceEnvVar` / `annualPriceEnvVar` fields in config.

### Traditional House Tiers

| Env Var | Price ID | Amount | Interval |
|---------|----------|--------|----------|
| `STRIPE_PRICE_TRAD_STARTER` | `price_1TnBmGKsstp3aqoP5cUjb8Eo` | $69.00 | monthly |
| `STRIPE_PRICE_TRAD_STARTER_ANNUAL` | `price_1TnBmGKsstp3aqoPHD06jOuG` | $690.00 | yearly |
| `STRIPE_PRICE_TRAD_PROFESSIONAL` | `price_1TnBmHKsstp3aqoP6TvYRpbS` | $129.00 | monthly |
| `STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL` | `price_1TnBmIKsstp3aqoPtC9eG9Oj` | $1,290.00 | yearly |
| `STRIPE_PRICE_TRAD_ENTERPRISE` | `price_1TnBmIKsstp3aqoP29ZKgH3b` | $249.00 | monthly |
| `STRIPE_PRICE_TRAD_ENTERPRISE_ANNUAL` | `price_1TnBmJKsstp3aqoPs87VKKSR` | $2,490.00 | yearly |

### Oxford House Tiers

| Env Var | Price ID | Amount | Interval |
|---------|----------|--------|----------|
| `STRIPE_PRICE_OXFORD_STANDARD` | `price_1TnBmJKsstp3aqoPtoAenHYF` | $49.00 | monthly |
| `STRIPE_PRICE_OXFORD_STANDARD_ANNUAL` | `price_1TnBmKKsstp3aqoPJPrNQmbL` | $490.00 | yearly |
| `STRIPE_PRICE_OXFORD_PLUS` | `price_1TnBmKKsstp3aqoPmcqRUm5o` | $89.00 | monthly |
| `STRIPE_PRICE_OXFORD_PLUS_ANNUAL` | `price_1TnBmLKsstp3aqoPKA5okvUu` | $890.00 | yearly |
| `STRIPE_PRICE_OXFORD_NETWORK` | `price_1TnBmLKsstp3aqoPFa1GLKoF` | $299.00 | monthly |
| `STRIPE_PRICE_OXFORD_NETWORK_ANNUAL` | `price_1TnBmMKsstp3aqoP0LvT0Xnn` | $2,990.00 | yearly |

> **Note:** Oxford Network has `availableForSale: false` in `config.ts` [`S1`] —
> a price ID is required for internal use but the tier is blocked at checkout.

### Product IDs

| Product | Stripe Product ID |
|---------|------------------|
| Regroup Traditional — Starter | `prod_UmlI5qr0ndeAdx` |
| Regroup Traditional — Professional | `prod_UmlIecHlx0WO6w` |
| Regroup Traditional — Enterprise | `prod_UmlIMnr2dWkI2N` |
| Regroup Oxford — Standard | `prod_UmlI2YAQvlYYQY` |
| Regroup Oxford — Plus | `prod_UmlIcHFACN7o7g` |
| Regroup Oxford — Network | `prod_UmlIEjQp6WCsqu` |

---

## 2. Legacy Prices (Grandfathered Subscribers)

Source: `functions/src/api/stripe.ts` [`S2`] — `planIds` object and `OXFORD_PRICE_ID`.
These are still actively consumed by `createSubscription()`, `reactivateSubscription()`,
and `initializeSubscription()`. Do NOT remove until legacy billing is fully retired.

| Env Var | Price ID | Description |
|---------|----------|-------------|
| `STRIPE_HOUSE_PRICE_ID` | `price_1TZqF1RuYQlYKoSlRuMJfupT` | Regroup House — $49/month legacy flat-fee plan (prod_UYy6h1eZ5G5WD2) |
| `STRIPE_OXFORD_PRICE_ID` | `price_1TZqF2RuYQlYKoSl5ZW19Pvk` | Regroup Oxford — $79/month legacy plan (prod_UYy6cF0Ccj8fID) |
| `STRIPE_GUEST_PRICE_ID` | `plan_HFkh7QvRnNjMy8` | Legacy per-guest metered plan — retained for existing subscribers |

---

## 3. Coupons (Bundle Discounts)

Source: `functions/src/api/stripe.ts` [`S2`] — `bundleCouponIds`, `getBundleCoupon()`,
`applyBundleDiscountToSubscription()`. Applied to legacy (per-house) subscriptions only;
tier-based subscriptions skip bundle discounts (`subscriptions.ts` line 784).

| Coupon ID | Discount | Condition | Duration |
|-----------|----------|-----------|----------|
| `regroup-bundle-3` | 10% off | 3+ houses (`houseCount >= 3`) | forever |
| `regroup-bundle-5` | 20% off | 5+ houses (`houseCount >= 5`) | forever |

> Coupons use **fixed string IDs** (not generated). The code references them
> by literal string — no env var needed. Verify they exist in the Stripe Dashboard.

---

## 4. Webhooks

Source: `functions/src/webhooks/stripeWebhook.ts` [`S4`] — two separate exported
handler functions, each verified with its own signing secret.

### 4a. Platform Webhook

**Endpoint ID:** `we_1TnPYQKsstp3aqoPA6Zv8Knd`  
**URL:** `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeWebhook`  
**Env Var:** `STRIPE_WEBHOOK_SECRET` — set via `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`  
**Secret (copy now — not shown again):** `whsec_HvhPdx1bTds92NDfOJu10hgYagFklbXJ`  

**Listened events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.dispute.created`
- `charge.refunded`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.deleted`
- `customer.subscription.updated`
- `account.updated`
- `payout.failed`

### 4b. Stripe Connect Webhook

**Endpoint ID:** `we_1TnPYRKsstp3aqoPhoIKwfts`  
**URL:** `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/handleStripeConnectWebhook`  
**Env Var:** `STRIPE_CONNECT_WEBHOOK_SECRET` — set via `firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET`  
**Secret (copy now — not shown again):** `whsec_XQhlIq6H0UDjVZ6Bt9w2MDoI1bgenLHK`  

**Listened events:**
- `account.updated`
- `account.application.deauthorized`

---

## 5. Keys & Secrets (Dashboard-only — cannot be scripted)

These values are set manually in the Stripe Dashboard and stored in Firebase
Secret Manager. They cannot be created or read back via the API.

Source: `functions/src/config.ts` [`S3`] — `defineSecret()` declarations;
`web/src/environments/environment*.ts` [`S8`] — publishable keys.

| Secret / Var | Where to find it | Consumer |
|---|---|---|
| `STRIPE_SECRET_KEY` | Dashboard → Developers → API keys | Firebase Functions (all Stripe API calls) |
| `STRIPE_PUBLISHABLE_KEY` | Dashboard → Developers → API keys | Angular web app (`NgxStripeModule`), React Native mobile |
| `STRIPE_WEBHOOK_SECRET` | Created with webhook (§4a above) | `stripeWebhook` function — verifies `constructEvent()` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Created with webhook (§4b above) | `handleStripeConnectWebhook` function |
| `STRIPE_CLIENT_ID` | Dashboard → Connect → Settings → Client ID | `disconnectStripeAccount` callable — `stripe.oauth.deauthorize()` |

**Current known values (TEST mode):**

| Var | Value |
|-----|-------|
| `STRIPE_PUBLISHABLE_KEY` (test) | `pk_test_PHY9XItnPuSWxhpixEkULA0o00DfMn6uns` |
| `STRIPE_PUBLISHABLE_KEY` (live) | `pk_live_7aliRHmckYVQEJh7HseJ4PTa00GasKVZ81` |

---

## 6. Other Config

Source: `functions/src/util/stripe.ts` [`S7`]; `functions/src/config.ts` [`S3`].

| Env Var | Value | Description |
|---------|-------|-------------|
| `STRIPE_API_VERSION` | `2026-01-28.clover` | Must match `apiVersion` arg in `createStripeClient()` |
| `TIER_BILLING_ENABLED` | `true` | Gates new tier subscriptions; legacy path used when absent or false |

---

## 7. Stripe Connect (Express Accounts)

Source: `functions/src/callable/payments.ts` [`S6`] — `connectStripeAccount()`,
`disconnectStripeAccount()`; `functions/src/http/stripeConnect.ts` — reauth/return redirects.

Regroup uses **Express accounts** for house operators to receive rent payments.
Connect accounts are created per-house (not scripted — created at operator onboarding).

| Requirement | Detail |
|-------------|--------|
| Account type | Express (not Standard or Custom) |
| Onboarding flow | `stripe.accountLinks.create()` → redirect → `stripeConnectReturn` HTTP endpoint |
| Reauth URL | `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeConnectReauth?stripeAccountId={id}` |
| Return URL | `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeConnectReturn` |
| Disconnect | `stripe.oauth.deauthorize({ client_id: STRIPE_CLIENT_ID })` |
| Payout failures | Handled by `payout.failed` event → FCM push + email to house admins |

---

## 8. Source File Index

| Ref | File | What it defines |
|-----|------|-----------------|
| `S1` | `functions/src/config.ts` | `SUBSCRIPTION_TIERS` — tier names, prices, env var names, feature flags |
| `S2` | `functions/src/api/stripe.ts` | `planIds`, `bundleCouponIds`, legacy price IDs, all Stripe API wrappers |
| `S3` | `functions/src/config.ts` | Firebase Secret Manager `defineSecret()` declarations |
| `S4` | `functions/src/webhooks/stripeWebhook.ts` | Both webhook handlers and their event routing switch() blocks |
| `S5` | `functions/src/util/tierPricing.ts` | `resolveTierPriceId()` — reads price IDs from env vars at runtime |
| `S6` | `functions/src/callable/payments.ts` | Connect onboarding, disconnect, `STRIPE_CLIENT_ID` usage |
| `S7` | `functions/src/util/stripe.ts` | API version string `"2026-01-28.clover"` |
| `S8` | `web/src/environments/environment*.ts` | Angular publishable key per environment |
