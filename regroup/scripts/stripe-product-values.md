# Stripe Product Values — Regroup Platform

**Mode:** TEST  
**Generated:** 2026-06-28 via `scripts/setup-stripe-all.js`  
**API Version:** `2026-01-28.clover` — matches `PINNED_API_VERSION` in `functions/src/util/stripeApiVersion.ts` [`S7`]

> Non-secret values (price IDs, `STRIPE_API_VERSION`, `TIER_BILLING_ENABLED`) go in
> `functions/.env` or `functions/.env.<projectId>` for a deploy; those are the only
> files Firebase bundles. `functions/.env.local` is read by the emulator only and is
> never deployed. Secrets go in Firebase Secret Manager. The production steps are in
> `docs/launch-readiness/billing-go-live-runbook.md`.
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

| Env Var                                 | Price ID                         | Amount    | Interval |
| --------------------------------------- | -------------------------------- | --------- | -------- |
| `STRIPE_PRICE_TRAD_STARTER`             | `price_1TnBmGKsstp3aqoP5cUjb8Eo` | $69.00    | monthly  |
| `STRIPE_PRICE_TRAD_STARTER_ANNUAL`      | `price_1TnBmGKsstp3aqoPHD06jOuG` | $690.00   | yearly   |
| `STRIPE_PRICE_TRAD_PROFESSIONAL`        | `price_1TnBmHKsstp3aqoP6TvYRpbS` | $129.00   | monthly  |
| `STRIPE_PRICE_TRAD_PROFESSIONAL_ANNUAL` | `price_1TnBmIKsstp3aqoPtC9eG9Oj` | $1,290.00 | yearly   |
| `STRIPE_PRICE_TRAD_ENTERPRISE`          | `price_1TnBmIKsstp3aqoP29ZKgH3b` | $249.00   | monthly  |
| `STRIPE_PRICE_TRAD_ENTERPRISE_ANNUAL`   | `price_1TnBmJKsstp3aqoPs87VKKSR` | $2,490.00 | yearly   |

### Oxford House Tiers

| Env Var                               | Price ID                         | Amount    | Interval |
| ------------------------------------- | -------------------------------- | --------- | -------- |
| `STRIPE_PRICE_OXFORD_STANDARD`        | `price_1TnBmJKsstp3aqoPtoAenHYF` | $49.00    | monthly  |
| `STRIPE_PRICE_OXFORD_STANDARD_ANNUAL` | `price_1TnBmKKsstp3aqoPJPrNQmbL` | $490.00   | yearly   |
| `STRIPE_PRICE_OXFORD_PLUS`            | `price_1TnBmKKsstp3aqoPmcqRUm5o` | $89.00    | monthly  |
| `STRIPE_PRICE_OXFORD_PLUS_ANNUAL`     | `price_1TnBmLKsstp3aqoPKA5okvUu` | $890.00   | yearly   |
| `STRIPE_PRICE_OXFORD_NETWORK`         | `price_1TnBmLKsstp3aqoPFa1GLKoF` | $299.00   | monthly  |
| `STRIPE_PRICE_OXFORD_NETWORK_ANNUAL`  | `price_1TnBmMKsstp3aqoP0LvT0Xnn` | $2,990.00 | yearly   |

> **Note:** Oxford Network has `availableForSale: false` in `config.ts` [`S1`] —
> a price ID is required for internal use but the tier is blocked at checkout.

### Product IDs

| Product                            | Stripe Product ID     |
| ---------------------------------- | --------------------- |
| Regroup Traditional — Starter      | `prod_UmlI5qr0ndeAdx` |
| Regroup Traditional — Professional | `prod_UmlIecHlx0WO6w` |
| Regroup Traditional — Enterprise   | `prod_UmlIMnr2dWkI2N` |
| Regroup Oxford — Standard          | `prod_UmlI2YAQvlYYQY` |
| Regroup Oxford — Plus              | `prod_UmlIcHFACN7o7g` |
| Regroup Oxford — Network           | `prod_UmlIEjQp6WCsqu` |

---

## 2. Legacy Prices (Grandfathered Subscribers)

Source: `functions/src/api/stripe.ts` [`S2`] — `planIds` object and `OXFORD_PRICE_ID`.
These are still read at module load and used by the legacy code path
(`createSubscription()`, the legacy branch of `reactivateSubscription()`,
`initializeSubscription()`). Do NOT remove until legacy billing is fully retired.

> **Status (2026-11-14):** since #254 that path is unreachable from the callables:
> `createOperatorSubscription` refuses when `TIER_BILLING_ENABLED` is off, and
> `reactivateOperatorSubscription` refuses a subscription with no `tier`. The code
> stays until post-launch cleanup. The launch plan cancels the live legacy subscriptions
> at launch with `npm run legacy:cancel` (`functions/src/scripts/cancelLegacySubscriptions.ts`),
> whose `LEGACY_PRICE_IDS` are `plan_HFkfwM5lQx6oud` and `plan_HFkh7QvRnNjMy8`, the
> live $10 Home and $1 Resident prices. The launch design
> (`docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md`) notes that
> the house and Oxford IDs below are not live IDs.

| Env Var                  | Price ID                         | Description                                                          |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| `STRIPE_HOUSE_PRICE_ID`  | RETIRED: deliberately unset | The old ID (`price_1TZqF1…`) belongs to another Stripe account (launch plan S3). Do not put it back. |
| `STRIPE_OXFORD_PRICE_ID` | RETIRED: deliberately unset | The old ID (`price_1TZqF2…`) belongs to another Stripe account (launch plan S3). Do not put it back. |
| `STRIPE_GUEST_PRICE_ID`  | `plan_HFkh7QvRnNjMy8`            | Legacy per-guest metered plan — retained for existing subscribers    |

---

## 3. Coupons (Bundle Discounts)

Source: `functions/src/api/stripe.ts` [`S2`] — `bundleCouponIds`, `getBundleCoupon()`,
`applyBundleDiscountToSubscription()`. Applied to legacy (per-house) subscriptions only;
tier-based subscriptions skip bundle discounts (the `tier` check in the
`applyBundleDiscount` callable, `functions/src/callable/subscriptions.ts`).

| Coupon ID          | Discount | Condition                     | Duration |
| ------------------ | -------- | ----------------------------- | -------- |
| `regroup-bundle-3` | 10% off  | 3+ houses (`houseCount >= 3`) | forever  |
| `regroup-bundle-5` | 15% off  | 5+ houses (`houseCount >= 5`) | forever  |

> Coupons use **fixed string IDs** (not generated). The code references them
> by literal string — no env var needed. Percentages follow pricing decision P-6
> (`docs/launch-readiness/regroup-pricing-revision-plan.md`). As of 2026-10-26 they
> exist in the test sandboxes but not in live mode (go-live runbook RG-P1-5).

---

## 4. Webhooks

Source: `functions/src/webhooks/stripeWebhook.ts` [`S4`] — two separate exported
handler functions, each verified with its own signing secret. Both endpoints are
in the live `regroup-app.com` account (`acct_1GfryQKsstp3aqoP`), were created
2026-10-06 and are pinned to API version `2026-01-28.clover`.

> **Unverified — check the Stripe Dashboard.** `docs/operations/stripe-testing.md`
> ("Known gaps") describes four live endpoints on three API versions; this section
> describes two, both on `2026-01-28.clover`. The code cannot settle which is
> current. Inbound payload shapes follow each endpoint's Dashboard API version, not
> `STRIPE_API_VERSION`, so confirm the count and versions there and correct
> whichever doc is wrong.

### 4a. Platform Webhook

**Endpoint ID:** `we_1UNgxzKsstp3aqoPyxhYJkuY`  
**URL:** `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents`  
**Function:** `stripeEvents` (the module exports it as `stripeWebhook`; `functions/src/index.ts` renames it on export)  
**Env Var:** `STRIPE_WEBHOOK_SECRET` — set via `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`  
**Secret:** stored only in Firebase Secret Manager (see Env Var above); never commit it.

**Subscribed events:**

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.dispute.created` — also reverses the house's net share of the disputed rent
- `charge.dispute.closed` — returns that share to the house if the dispute is won
- `charge.refunded` — also reverses the house's net share of each settled refund
- `charge.refund.updated` — reverses a refund that was still pending when `charge.refunded` fired
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.deleted`
- `customer.subscription.updated`
- `payout.failed`

The handler also has an `account.updated` case, but this endpoint does not
subscribe to it: connected-account updates arrive through the Connect webhook (§4b).

Since #254 the handler also acts on `customer.subscription.created`,
`customer.subscription.trial_will_end` and `invoice.payment_action_required`,
which the list above (the endpoint's recorded subscriptions) does not include.
Add them to the live endpoint, then update this list.

> **Caution — `payout.failed` may never reach its handler [unverified].** The
> handler (`handlePayoutFailed`) needs `event.account`, the connected account the
> payout belongs to. Per Stripe's Connect model, events that happen on a connected
> account (its payouts included) are delivered to **Connect** endpoints ("events on
> connected accounts"), not to a platform endpoint like this one. The Connect
> handler (§4b, `handleStripeConnectWebhook`) currently has no `payout.failed`
> case: it acts only on `account.updated` and `account.application.deauthorized`.
> So the "Payout failures" alert in §7 may not fire. Confirm with a test-mode
> payout failure before relying on it.

### 4b. Stripe Connect Webhook

**Endpoint ID:** `we_1UNgzIKsstp3aqoPeAGheDy3`  
**URL:** `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/handleStripeConnectWebhook`  
**Function:** `handleStripeConnectWebhook`  
**Env Var:** `STRIPE_CONNECT_WEBHOOK_SECRET` — set via `firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET`  
**Secret:** stored only in Firebase Secret Manager (see Env Var above); never commit it.

**Subscribed events:**

- `account.updated`
- `account.application.deauthorized`

### 4c. Rotating a webhook signing secret

The Stripe API cannot roll a signing secret, and recreating an endpoint while the
old one is live delivers every event twice. Rotate from the Dashboard instead.

> **Conflicts with a code comment.** `functions/src/util/stripeWebhookSecrets.ts`
> says rotation is "NOT yet survivable": there is one secret var per mode, so the
> function can hold only the old or the new same-mode secret, and it says in-flight
> events signed with the old one are dropped. The procedure below relies instead on
> Stripe signing every delivery with **both** secrets until the old one expires, so
> whichever single secret the deployed function holds still matches one signature.
> That rests on Stripe's roll behaviour, which this repo cannot prove; until it is
> confirmed (e.g. a test-mode roll), treat a roll as possibly dropping deliveries and
> watch the endpoint for failures.

1. Dashboard → Developers → Webhooks → the endpoint → **Roll secret**, with an
   expiry long enough to finish the steps below (Stripe signs with both secrets
   until then).
2. Store the new value: `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`
   (or `STRIPE_CONNECT_WEBHOOK_SECRET`) in `phoenix-cleanhouse`. The two
   endpoints have different secrets: copy each one from the page of the endpoint
   whose URL ends in `/stripeEvents` or `/handleStripeConnectWebhook`.
3. Before redeploying, check that the two stored values differ. This prints no
   secret, and stops if a read fails or comes back empty:

   ```bash
   for s in STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET; do
     v=$(gcloud secrets versions access latest --secret "$s" --project phoenix-cleanhouse) \
       || { echo "$s: read failed, stop"; break; }
     [ -n "$v" ] || { echo "$s: empty, stop"; break; }
     printf '%s' "$v" | shasum -a 256 | cut -c1-12
   done; unset v   # two different hashes expected
   ```

   A hash of `e3b0c44298fc` means an empty read, not a secret.

4. Redeploy the function that uses it (`stripeEvents` or
   `handleStripeConnectWebhook`). A deployed function keeps the secret version
   it was deployed with, so storing a new version alone changes nothing.
5. Confirm the running revision uses the new version, e.g.
   `gcloud run revisions describe <revision> --region us-central1 --project phoenix-cleanhouse`,
   and that deliveries return 200 before the old secret expires.

If the two hashes in step 3 match, one endpoint will reject every event once
its old secret expires. After the rotation, disable the superseded versions with
`gcloud secrets versions disable <n> --secret <name> --project phoenix-cleanhouse`,
but only versions that no running revision uses.

---

## 5. Keys & Secrets (Dashboard-only — cannot be scripted)

These values are set manually in the Stripe Dashboard and stored in Firebase
Secret Manager. They cannot be created or read back via the API.

Source: `functions/src/config.ts` [`S3`] — `defineSecret()` declarations;
`web/src/environments/environment*.ts` [`S8`] — publishable keys.

| Secret / Var                    | Where to find it                           | Consumer                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`             | Dashboard → Developers → API keys          | Firebase Functions (all Stripe API calls)                                                                                                                                                                                                                                                                                  |
| `STRIPE_PUBLISHABLE_KEY`        | Dashboard → Developers → API keys          | Angular web app (`NgxStripeModule`), React Native mobile                                                                                                                                                                                                                                                                   |
| `STRIPE_WEBHOOK_SECRET`         | Created with webhook (§4a above)           | `stripeEvents` function — verifies `constructEvent()`                                                                                                                                                                                                                                                                      |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Created with webhook (§4b above)           | `handleStripeConnectWebhook` function                                                                                                                                                                                                                                                                                      |
| `STRIPE_CLIENT_ID`              | Dashboard → Connect → Settings → Client ID | **No longer read by any function.** Disconnect closes a v2 account (`stripe.v2.core.accounts.close()`) or unlinks a v1 one without a Stripe call; neither needs an OAuth client id. Still bound on `disconnectStripeAccount` and still listed in `scripts/preflight-billing.js`; unbinding it is a deploy-config decision. |

**Current known values (TEST mode):**

| Var                             | Value                                        |
| ------------------------------- | -------------------------------------------- |
| `STRIPE_PUBLISHABLE_KEY` (test) | `pk_test_PHY9XItnPuSWxhpixEkULA0o00DfMn6uns` |
| `STRIPE_PUBLISHABLE_KEY` (live) | `pk_live_7aliRHmckYVQEJh7HseJ4PTa00GasKVZ81` |

---

## 6. Other Config

Source: `functions/src/util/stripeApiVersion.ts` [`S7`]; `functions/src/config.ts` [`S3`].

| Env Var                | Value                             | Description                                                                                                                                                                      |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_API_VERSION`   | `2026-01-28.clover`               | Must equal `PINNED_API_VERSION` in `util/stripeApiVersion.ts`; a deployed value overrides the pin for every Stripe client, and `scripts/preflight-billing.js` reports a mismatch |
| `TIER_BILLING_ENABLED` | `true`                            | Gates new tier subscriptions. When absent or false, checkout and canceled-subscription reactivation refuse (`failed-precondition`); there is no legacy fallback since #254       |
| `CONNECT_BASE_URL`     | `https://regroup-app.com/connect` | Required: the prefix of the `/connect/*` Hosting rewrites in `web/firebase.json`; `connectBaseUrl()` (`util/connectUrls.ts`) throws without it                                   |

---

## 7. Stripe Connect (Express Accounts)

Source: `functions/src/callable/payments.ts` [`S6`] — `connectStripeAccount()`,
`disconnectStripeAccount()`; `functions/src/http/stripeConnect.ts` — reauth/return redirects.

Regroup uses **Express accounts** for house operators to receive rent payments.
Connect accounts are created per-house (not scripted — created at operator onboarding).

| Requirement     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account type    | Chosen by `CONNECT_ACCOUNTS_API` for new accounts; each house records its own in `houses.stripeAccountApi` (absent = v1). **v1 (default, live):** created from controller properties — `stripe_dashboard.type: express`, `fees.payer: application`, `losses.payments: application`, `requirement_collection: stripe`, `country: US` — requesting `card_payments` and `transfers` (transfers alone needs Stripe's approval). **v2 (needs Stripe to enable Accounts v2 for the platform):** a **recipient**, Express dashboard; `configuration.merchant` and `card_payments` deliberately not requested. Houses receive transfers and never charge anyone either way. |
| Onboarding flow | `stripe.accountLinks.create()` → redirect → `stripeConnectReturn` HTTP endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Reauth URL      | `${CONNECT_BASE_URL}/stripe-refresh?stripeAccountId={id}`, i.e. `https://regroup-app.com/connect/stripe-refresh?stripeAccountId={id}` in production; a Hosting rewrite in `web/firebase.json` sends it to `stripeConnectReauth` (`util/connectUrls.ts`, `connectRefreshUrl`)                                                                                                                                                                                                                                                                                                                                                                                        |
| Return URL      | `${CONNECT_BASE_URL}/stripe-return`, i.e. `https://regroup-app.com/connect/stripe-return`; rewritten to `stripeConnectReturn` (`connectReturnUrl`). `CONNECT_BASE_URL` is required: with it unset, building either URL throws                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Disconnect      | v2: `stripe.v2.core.accounts.close(id, { applied_configurations: ['recipient'] })`. v1: the house is unlinked and the account left open — never deleted, so transfer reversals for refunds and disputes stay possible.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Payout failures | `payout.failed` → FCM push + email to house admins, handled on the platform endpoint only. See the caution in §4a: connected-account payout events go to Connect endpoints, whose handler has no `payout.failed` case                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 8. Source File Index

| Ref   | File                                            | What it defines                                                                                          |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `S1`  | `functions/src/config.ts`                       | `SUBSCRIPTION_TIERS` — tier names, prices, env var names, feature flags                                  |
| `S2`  | `functions/src/api/stripe.ts`                   | `planIds`, `bundleCouponIds`, legacy price IDs, all Stripe API wrappers                                  |
| `S3`  | `functions/src/config.ts`                       | Firebase Secret Manager `defineSecret()` declarations                                                    |
| `S4`  | `functions/src/webhooks/stripeWebhook.ts`       | Both webhook handlers and their event routing switch() blocks                                            |
| `S5`  | `functions/src/util/tierPricing.ts`             | `resolveTierPriceId()` — reads price IDs from env vars at runtime                                        |
| `S6`  | `functions/src/callable/payments.ts`            | Connect onboarding and disconnect callables                                                              |
| `S6a` | `functions/src/util/connectAccountLifecycle.ts` | v1 and v2 account create params, v2 close, orphan cleanup, already-gone tolerance                        |
| `S6b` | `functions/src/util/connectAccountStatus.ts`    | The one mapping from the transfers capability (v1 or v2) to house status, and the per-house API dispatch |
| `S7`  | `functions/src/util/stripeApiVersion.ts`        | `PINNED_API_VERSION = '2026-01-28.clover'` and the `STRIPE_API_VERSION` every Stripe client uses         |
| `S8`  | `web/src/environments/environment*.ts`          | Angular publishable key per environment                                                                  |
