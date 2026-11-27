# Regroup Billing Go-Live Runbook

**Purpose:** the exact steps to turn on real-money billing for Regroup, plus the pre-charge verification. Covers launch blockers RG-P0-1 (billing config) and RG-P0-2 (real-money E2E). Last updated 2026-11-14 (checked against the code at `c1931c04`).

> Most of the engineering is done. What remains is **configuration and one live test** — steps below are ops, executed by a human with Stripe Dashboard + Firebase access.

---

## RG-P0-1 — Configure and verify billing env (blocks charging on the correct model)

### Why this is a blocker

`functions/src/callable/subscriptions.ts` (`createOperatorSubscription`) throws `HttpsError("internal")` at checkout if the chosen tier's monthly price-ID env var is unset (that subscribe 500s). A missing `_ANNUAL` var also surfaces as `internal`, but only on an annual checkout and only after the Stripe customer has been created and the card checked. If `TIER_BILLING_ENABLED` is not `"true"`, checkout, and reactivating a canceled subscription, refuse with `failed-precondition` ("New subscriptions are not available right now"); since #254 there is no legacy fallback. Checkout also refuses while the Firestore sales switch `config/sales.open` is not `true` (missing means closed; `util/salesSwitch.ts`). None of this fails at deploy time, so a misconfigured deploy looks healthy until the first operator tries to pay.

A **preflight gate guards this**: `scripts/preflight-billing.js` runs automatically via `firebase.json` `functions.predeploy`. Its enforcement is **fail-closed only once billing is actually on**, so it protects go-live without blocking unrelated pre-launch deploys:

- **`TIER_BILLING_ENABLED=true`** in the deployed config (the go-live state, set in step 2) → any missing billing var **hard-fails the deploy** (exit 1).
- **flag absent/false** (pre-launch, before the billing `.env` is filled) → missing vars are a **loud warning only**; the deploy proceeds. This is deliberate: an unrelated functions hotfix (meetings, invites) must not be blocked just because billing isn't wired yet.
- **`--strict`** → enforce regardless, and also treat an unconfirmed secret as fatal. Use it as an explicit go-live readiness check.

```bash
# from regroup/
node scripts/preflight-billing.js          # or: cd functions && npm run preflight:billing
node scripts/preflight-billing.js --strict  # every warning is fatal; only passes once TIER_BILLING_ENABLED=true is in the config
```

So the sequence at go-live is: fill the billing `.env` and run the **plain** preflight to find gaps → set `TIER_BILLING_ENABLED=true` in that file → the predeploy gate is now hard-closed automatically → run `--strict` as the readiness check. Do **not** use `--strict` before the flag is in the file: with the flag absent the preflight always adds the "TIER_BILLING_ENABLED is not true" warning, and `--strict` exits 1 on any warning, so that run can never pass. A `--strict` failure on a secret it could not confirm needs `secretmanager.versions.access` to clear; someone with that permission confirms the secret exists.

### Steps

1. **Confirm live Stripe Prices exist.** Tier price IDs are recorded in `scripts/stripe-prices.env`: the monthly block is live mode (created 2026-06-20) and the annual block is live mode too (created 2026-11-22, owner approved). `npm --prefix functions run stripe:verify-live -- --project phoenix-cleanhouse` checks every one is live, active, USD and at the right amount and interval. The 6 monthly + 6 annual IDs map 1:1 to `priceEnvVar` / `annualPriceEnvVar` in `SUBSCRIPTION_TIERS` (`functions/src/config.ts`).
   Regroup uses **two separate config mechanisms** (see `functions/src/config.ts` + `functions/.env.example`) — do not mix them up; it's the difference between a green deploy and a live secret committed to git.

2. **[CONFIG] non-secret deploy config → `functions/.env.<projectId>`.** Run `npm --prefix functions run env:write -- --project phoenix-cleanhouse` from `regroup/`: it writes **`functions/.env.phoenix-cleanhouse`** (gitignored) from `scripts/stripe-prices.env`, including `CONNECT_BASE_URL` and `TIER_BILLING_ENABLED=true`. Don't hand-copy values, and don't keep a generic `functions/.env`: Firebase deploys it to every project and any key `.env.<projectId>` omits falls back to it. Details: [`../operations/environment-and-secrets.md`](../operations/environment-and-secrets.md).
   - **12 tier price IDs**: the 6 `STRIPE_PRICE_*` monthly vars and their 6 `STRIPE_PRICE_*_ANNUAL` twins (`TIER_PRICE_VARS` / `ANNUAL_PRICE_VARS` in `scripts/preflight-billing.js`). The 3 legacy price vars (`STRIPE_HOUSE_PRICE_ID`, `STRIPE_OXFORD_PRICE_ID`, `STRIPE_GUEST_PRICE_ID`) are not required: the preflight dropped them on 2026-09-29, and checkout and reactivation now refuse the legacy shape.
   - **`STRIPE_API_VERSION=2026-01-28.clover`**, which must equal `PINNED_API_VERSION` in `functions/src/util/stripeApiVersion.ts`. That file is the one pin every Stripe client reads (`util/stripe.ts`, `api/stripe.ts`, `scheduledRentCollection.ts`), and a deployed `STRIPE_API_VERSION` overrides it for all of them. The preflight parses the pin and reports a mismatch (fatal once it is enforcing).
   - **`CONNECT_BASE_URL=https://regroup-app.com/connect`** (required). `connectBaseUrl()` in `functions/src/util/connectUrls.ts` throws without it, so Connect onboarding (`connectStripeAccount` when the caller passes no return/refresh URLs, and the `stripeConnectReauth` refresh link) fails and no house can connect a bank account. It must be the prefix of the `/connect/stripe-return` and `/connect/stripe-refresh` Hosting rewrites in `web/firebase.json` (step 5b).
   - **`TIER_BILLING_ENABLED=true`**.
   - **Do NOT use `functions/.env.local`** — Firebase treats it as emulator-only and does not deploy it. **Do NOT put any Stripe secret here.**
3. **[SECRET] every bound secret → Firebase Secret Manager** (never any `.env` file — these are `defineSecret()` vars in `functions/src/config.ts`, bound per function with `secrets: [...]`). Nine are bound; set every one before the first deploy. Whether `firebase deploy` hard-fails or prompts on a bound secret with no value is unverified for the pinned CLI, so don't rely on the deploy to catch a missing one.
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY                   # sk_live_... — every Stripe callable, both webhooks, scheduledRentCollection, the Connect HTTP endpoints, getTierCatalog, deleteAccount
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET               # whsec_... of the live stripeEvents endpoint (step 5a)
   firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET       # whsec_... of the live handleStripeConnectWebhook endpoint (RG-P1-2)
   firebase functions:secrets:set STRIPE_TEST_WEBHOOK_SECRET          # bound on stripeEvents (see below)
   firebase functions:secrets:set STRIPE_CONNECT_TEST_WEBHOOK_SECRET  # bound on handleStripeConnectWebhook (see below)
   firebase functions:secrets:set STRIPE_CLIENT_ID                    # ca_... — bound on disconnectStripeAccount but never read
   firebase functions:secrets:set SENDGRID_API_KEY                    # email: stripeEvents, createOperatorSubscription, sendConfirmationEmail, createInvitation, the house/contact/user/bug/feedback triggers
   firebase functions:secrets:set GOOGLE_MAPS_API_KEY                 # userIsAtMeeting (Geocoding + Time Zone APIs)
   firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY           # findMeetings → recovery-api; must equal recovery-api's RECOVERY_PLATFORM_API_KEY
   ```
   - **Without `STRIPE_CONNECT_WEBHOOK_SECRET`**, if the test Connect secret is also unset the Connect endpoint answers every delivery with 500 "endpoint not configured", which Stripe keeps retrying; if only the test one is set, live events fail signature verification (400). Either way no `account.updated` is processed until the secret is set and `handleStripeConnectWebhook` is redeployed (a function keeps the secret version it was deployed with). The same holds for `STRIPE_WEBHOOK_SECRET` and `stripeEvents`.
   - **What the two TEST secrets hold in production:** the signing secrets of any **test-mode** endpoints registered against the production URLs. On a live deployment they can only verify a test event so it is refused as "wrong mode" (400) instead of failing as an opaque bad signature; `util/verifyStripeWebhook.ts` never processes an event whose mode differs from the deployment's. Docs disagree on whether such test-mode endpoints exist (`docs/operations/stripe-testing.md` says none; `pr64-fix-report-2026-10-06.md` recorded two in sandbox `acct_1RXiFg2KPgAtfsl6`). Unverified: check the Stripe Dashboard.
4. **Run the preflight** (`node scripts/preflight-billing.js` from `regroup/`). With `TIER_BILLING_ENABLED=true` in the file it hard-fails on any missing [CONFIG] var or an API-version mismatch, and checks each [SECRET] exists in Secret Manager (warning only). Then run `--strict` (see above). Green before deploying.
5. **Deploy**, from a clean checkout of the release commit, from `regroup/` (as `regroup/CLAUDE.md` says; the predeploy hook runs only the preflight and does **not** build, and `functions/package.json` `main` is `lib/index.js`):

   ```bash
   npm --prefix functions ci && npm --prefix functions run build
   firebase deploy --only functions   # the preflight fires first via functions.predeploy
   ```

   Don't use `npm run deploy` from `functions/` on its own: it is `firebase deploy --only functions` with no build, so it ships whatever stale or missing `lib/` is on disk. `npm run deploy:batched` is the fallback for deploy quotas only.

   **5a. Webhook endpoints (Stripe live Dashboard → Developers → Webhooks).** Two endpoints, each with its own signing secret:

   | Endpoint URL (deployed name)                                                                                                     | Secret                          | Events the handler acts on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
   | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/stripeEvents` (platform; the module exports it as `stripeWebhook`)    | `STRIPE_WEBHOOK_SECRET`         | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.refund.updated`, `charge.dispute.created`, `charge.dispute.closed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `payout.failed` (see the caution in `scripts/stripe-product-values.md` §4a). Its `account.updated` case is not subscribed here. |
   | `https://us-central1-phoenix-cleanhouse.cloudfunctions.net/handleStripeConnectWebhook` (Connect: "events on connected accounts") | `STRIPE_CONNECT_WEBHOOK_SECRET` | `account.updated`, `account.application.deauthorized`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

   The lists are the `switch (event.type)` cases in `functions/src/webhooks/stripeWebhook.ts`. #254 added `customer.subscription.created`, `customer.subscription.trial_will_end` and `invoice.payment_action_required`; subscribe the live endpoint to any that `scripts/stripe-product-values.md` §4a does not list yet. Set each endpoint's **API version to `2026-01-28.clover`**: inbound payload shapes follow the endpoint's Dashboard setting, not `STRIPE_API_VERSION`. Confirm both are enabled and point at the deployed live URLs.

   **5b. Web Hosting rewrites.** The `/connect/stripe-return` and `/connect/stripe-refresh` rewrites (to `stripeConnectReturn` / `stripeConnectReauth`) live in `web/firebase.json`, so they ship with a **web** deploy, not a functions deploy. If they are not live yet, deploy the web from `regroup/web` as `web/CLAUDE.md` describes: `npm run build`, then `firebase deploy --only hosting,functions:web:ssr` (use the global `firebase` CLI; see `web/CLAUDE.md` on the local 8.2.0). Then check that `https://regroup-app.com/connect/stripe-refresh` reaches the function rather than the SSR app.

6. **Confirm runtime env** in the deployed function (Firebase Console → Functions) shows `TIER_BILLING_ENABLED=true`, `CONNECT_BASE_URL` and the price IDs — the preflight validates the _source_ `.env` file, not the live runtime.
7. **Open sales when ready.** New tier subscriptions also need `config/sales.open == true` in Firestore (closed when missing). Flip it without a deploy, dry run first: `cd functions && npm run switch:set -- --switch=sales --value=true`, then, after checking the project it logs, the same with `--apply`. The launch plan keeps it closed until the new app is in the stores; `--value=false` closes it again at once. RG-P0-2's subscribe checks need it open.

---

## RG-P0-2 — Real-money end-to-end verification (blocks charging anyone)

No live-money cycle has been run. Do this once, end-to-end, with **live** keys before onboarding a paying operator. Use a real card you control and refund afterward.

- [ ] **Operator subscribe (monthly).** New operator → pick a Traditional tier → pay with a real card → subscription shows `active`/`trialing` in Stripe live, and `users/{uid}.subscriptionMetadata` + the `subscriptions/{id}` doc are seeded (webhook resolved the sub).
- [ ] **Operator subscribe (annual).** Repeat with `billingInterval: "year"` → confirm it resolves the `_ANNUAL` price and charges the annual amount.
- [ ] **Trial → active.** Confirm the 7-day trial applies and the first real invoice is scheduled correctly.
- [ ] **Connect onboarding.** Operator connects a Stripe account (Express) → `account.updated` webhook fires and syncs payout status (validates `STRIPE_CONNECT_WEBHOOK_SECRET`).
- [ ] **Resident rent payment.** Resident pays rent via `createPaymentIntent` → charge succeeds → application fee matches `computeApplicationFee` (`util/rentFee.ts`, `RENT_FEE` in `config.ts`): margin plus estimated Stripe cost, so **$6.00 on a $500 ACH payment** ($2.00 + 0.8% capped at $5) and **$18.55 on a $500 card payment** (0.75% + 2.9% + 30¢) → funds land in the operator's connected account → `listPayments` shows it.
- [ ] **Cancel / refund.** Cancel the subscription and refund the test charges; confirm `customer.subscription.deleted` updates Firestore status.
- [ ] **Idempotency spot-check.** Re-deliver one webhook event from the Stripe Dashboard → confirm the `webhookEvents` transaction dedupes it (no double-processing).

Record the date + Stripe test IDs of the passing run here when done: _______________

---

## RG-P0-3 — App Store submission (ops-only; no code change)

**Decision (2026-07-16):** `com.rats.dev` is the confirmed production bundle identifier. The shipping app target (`rats.app`) and the Firebase iOS app (`mobile/ios/GoogleService-Info.plist`) are already consistent on it — **no repo change is required.** (The `org.reactjs.native.example.*` ids in the project belong to the `ratsTests` unit-test target, which is normal and never ships. `MARKETING_VERSION = 1.53` / build 40 is a carryover from the predecessor rats-v2 app and is the store version; `package.json` `1.0.0` is unrelated.)

Remaining P0-3 work is entirely App Store Connect / Apple Developer:

- [ ] `com.rats.dev` registered as an App ID in the Apple Developer portal.
- [ ] App record created in App Store Connect under that bundle id.
- [ ] Distribution signing cert + provisioning profile.
- [ ] Store listing complete, incl. a **reachable privacy-policy URL** (Apple requires it; publish `docs/operations/legal/privacy-policy.md`).
- [ ] Push/APNs key uploaded to Firebase for `com.rats.dev` (production).
- [ ] App Review notes say plans are bought on the web: the app opens `regroup-app.com/pricing` or `/my-account` in the system browser and takes no payment in-app (launch P5 Task 9; there is no billing WebView).

---

## Related (not P0, but touch the money path — see readiness-report / assessment)

- **RG-P1-1 (resolved):** every Stripe client, `api/stripe.ts` included, now reads `STRIPE_API_VERSION` from `util/stripeApiVersion.ts` (`PINNED_API_VERSION = '2026-01-28.clover'`, overridable by the deployed env var), and the preflight checks the deployed value against the pin. What remains manual is the webhook endpoints' API version in the Dashboard (step 5a).
- **RG-P1-2:** `STRIPE_CONNECT_WEBHOOK_SECRET` (above) — required, easy to forget.
- **RG-P1-5:** live-mode `regroup-bundle-3/5` coupons don't exist yet (legacy multi-house discounts only).
