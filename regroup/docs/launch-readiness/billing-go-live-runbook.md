# Regroup Billing Go-Live Runbook

**Purpose:** the exact steps to turn on real-money billing for Regroup, plus the pre-charge verification. Covers launch blockers RG-P0-1 (billing config) and RG-P0-2 (real-money E2E). Last updated 2026-07-16.

> Most of the engineering is done. What remains is **configuration and one live test** — steps below are ops, executed by a human with Stripe Dashboard + Firebase access.

---

## RG-P0-1 — Configure and verify billing env (blocks charging on the correct model)

### Why this is a blocker

`functions/src/callable/subscriptions.ts` throws `HttpsError("internal")` at checkout if a tier price-ID env var is unset (every subscribe 500s), and if `TIER_BILLING_ENABLED` is not `"true"` every new checkout silently uses the **legacy per-house+per-guest** model instead of the 6-tier plan. Neither fails at deploy time by default — so a misconfigured deploy looks healthy until the first operator tries to pay.

A **preflight gate guards this**: `scripts/preflight-billing.js` runs automatically via `firebase.json` `functions.predeploy`. Its enforcement is **fail-closed only once billing is actually on**, so it protects go-live without blocking unrelated pre-launch deploys:

- **`TIER_BILLING_ENABLED=true`** in the deployed config (the go-live state, set in step 2) → any missing billing var **hard-fails the deploy** (exit 1).
- **flag absent/false** (pre-launch, before the billing `.env` is filled) → missing vars are a **loud warning only**; the deploy proceeds. This is deliberate: an unrelated functions hotfix (meetings, invites) must not be blocked just because billing isn't wired yet.
- **`--strict`** → enforce regardless, and also treat an unconfirmed secret as fatal. Use it as an explicit go-live readiness check.

```bash
# from regroup/
node scripts/preflight-billing.js          # or: cd functions && npm run preflight:billing
node scripts/preflight-billing.js --strict  # enforce now: fail on missing config OR unconfirmed secret
```

So the sequence at go-live is: fill the billing `.env` → set `TIER_BILLING_ENABLED=true` → the predeploy gate is now hard-closed automatically. Verify early with `--strict` before flipping the flag.

### Steps

1. **Confirm live Stripe Prices exist.** Monthly + annual live-mode tier price IDs were created 2026-06-20/28 and are recorded in `scripts/stripe-prices.env`. Verify each still exists and is **active** in the Stripe **live** Dashboard (Products → each tier). The 6 monthly + 6 annual IDs map 1:1 to `SUBSCRIPTION_TIERS` in `functions/src/config.ts`.
   Regroup uses **two separate config mechanisms** (see `functions/src/config.ts` + `functions/.env.example`) — do not mix them up; it's the difference between a green deploy and a live secret committed to git.

2. **[CONFIG] non-secret deploy config → `functions/.env.<projectId>`.** Copy the price IDs, `STRIPE_API_VERSION`, and `TIER_BILLING_ENABLED=true` from `scripts/stripe-prices.env` into **`functions/.env.phoenix-cleanhouse`** (gitignored). These files are what Firebase bundles into the deploy.
   - 15 price IDs (6 monthly + 6 annual tier + 3 legacy), `STRIPE_API_VERSION=2026-01-28.clover` (must match the hardcoded version in `util/stripe.ts` / `scheduled/scheduledRentCollection.ts`; see RG-P1-1), and `TIER_BILLING_ENABLED=true`.
   - **Do NOT use `functions/.env.local`** — Firebase treats it as emulator-only and does not deploy it. **Do NOT put any Stripe secret here.**
3. **[SECRET] Stripe secret/webhook keys → Firebase Secret Manager** (never any `.env` file — these are `defineSecret()` vars):
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY               # sk_live_...
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET           # whsec_... (subscription/invoice endpoint)
   firebase functions:secrets:set STRIPE_CONNECT_WEBHOOK_SECRET   # whsec_... (Connect endpoint — RG-P1-2; without it all account.updated events are rejected)
   firebase functions:secrets:set STRIPE_CLIENT_ID               # ca_...
   ```
4. **Run the preflight** (`node scripts/preflight-billing.js` from `regroup/`). It hard-fails on any missing [CONFIG] var and checks each [SECRET] exists in Secret Manager (warning only; `--strict` makes an unconfirmed secret fatal). Green before deploying.
5. **Deploy** (`npm run deploy` from `functions/` — the preflight fires first via `predeploy`). Confirm the two Stripe webhook endpoints (subscription + Connect) point at the deployed live function URLs and are enabled.
6. **Confirm runtime env** in the deployed function (Firebase Console → Functions) shows `TIER_BILLING_ENABLED=true` and the price IDs — the preflight validates the _source_ `.env` file, not the live runtime.

---

## RG-P0-2 — Real-money end-to-end verification (blocks charging anyone)

No live-money cycle has been run. Do this once, end-to-end, with **live** keys before onboarding a paying operator. Use a real card you control and refund afterward.

- [ ] **Operator subscribe (monthly).** New operator → pick a Traditional tier → pay with a real card → subscription shows `active`/`trialing` in Stripe live, and `users/{uid}.subscriptionMetadata` + the `subscriptions/{id}` doc are seeded (webhook resolved the sub).
- [ ] **Operator subscribe (annual).** Repeat with `billingInterval: "year"` → confirm it resolves the `_ANNUAL` price and charges the annual amount.
- [ ] **Trial → active.** Confirm the 30-day trial applies and the first real invoice is scheduled correctly.
- [ ] **Connect onboarding.** Operator connects a Stripe account (Express) → `account.updated` webhook fires and syncs payout status (validates `STRIPE_CONNECT_WEBHOOK_SECRET`).
- [ ] **Resident rent payment.** Resident pays rent via `createPaymentIntent` → charge succeeds → application fee matches `RENT_FEE` (ACH flat vs card platform rate) → funds land in the operator's connected account → `listPayments` shows it.
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

---

## Related (not P0, but touch the money path — see readiness-report / assessment)

- **RG-P1-1:** pin `STRIPE_API_VERSION` in `api/stripe.ts` (currently `process.env…!`) to match the hardcoded `2026-01-28.clover` elsewhere, or a version mismatch can corrupt subscription creation vs webhook parsing.
- **RG-P1-2:** `STRIPE_CONNECT_WEBHOOK_SECRET` (above) — required, easy to forget.
- **RG-P1-5:** live-mode `regroup-bundle-3/5` coupons don't exist yet (legacy multi-house discounts only).
