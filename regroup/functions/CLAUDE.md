# Cloud Functions

This directory contains the Firebase Cloud Functions backend for Regroup. Loaded by Claude Code automatically when working inside `functions/`. See `../CLAUDE.md` for project-wide rules (including Stripe and PII policy).

## Commands

```bash
npm run build                   # TypeScript compile
npm test                        # Jest unit tests (run in band)
npm run test:watch              # Jest watch mode
npm run test:coverage           # Jest with coverage
npm run serve                   # Build + start Firebase emulator
npm run deploy                  # Deploy all functions
npm run deploy:batched          # Batch deploy (preferred for large changesets)
```

**Migration scripts** (run after build):

```bash
npm run migrate:dry-run         # Dry-run guest weeks migration
npm run migrate:run             # Apply guest weeks migration
npm run migrate:house-sub:dry-run
npm run migrate:house-sub:run
```

## Architecture

```
src/
  index.ts          Entry point — re-exports all functions
  init.ts           Firebase Admin SDK initialization (must be imported first)
  config.ts         Environment configuration
  callable/
    auth.ts         Auth callables (login helpers, token refresh)
    meetings.ts     Meeting management
    payments.ts     Payment initiation (house/guest payments)
    subscriptions.ts  Stripe subscriptions + Connect account management;
                      sendConfirmationEmail
    oxford.ts       Oxford House management callables
    invitations.ts  createInvitation, peekInvitation, redeemInvitation
  triggers/
    firestore/      Firestore document write triggers
    rtdb/           Realtime Database triggers
    stripeConnect.ts  Stripe Connect account event triggers
  http/
    index.ts        HTTP-only endpoints (not callable)
    stripeWebhook.ts  Stripe webhook receiver (signature-verified)
  scheduled/
    officerTermReminder.ts
    overdueRentNotification.ts
    scheduledRentCollection.ts
  webhooks/
    universal.ts    Angular SSR handler (serves the web app)
  api/              Internal API helpers
  entities/         TypeScript interfaces (House, Guest, Subscription, etc.)
  types/            Shared type definitions
  util/             Shared utilities (logging, formatting)
  validation/       Input validation helpers
  scripts/          One-off migration scripts (not deployed as functions)
```

## Domain Rules

### Stripe amounts

All Stripe amounts are in **US cents** (integers). `50000` = $500.00. Convert only at the UI boundary — never inside function logic.

### Bundle discounts (legacy per-house subscriptions only)

Multi-house operators on the **legacy per-house** subscription get an automatic
stacking coupon: 3–4 houses → `regroup-bundle-3` (10% off), 5+ → `regroup-bundle-5`
(15% off). The logic lives in `api/stripe.ts` (`getBundleCoupon`,
`applyBundleDiscountToSubscription`, `removeBundleDiscount`) and is invoked from
`callable/subscriptions.ts` — `updateSubscriptionHouses` (recompute on house
add/remove) and the `applyBundleDiscount` callable. The discount is keyed off the
count of `subscriptionMetadata.houses` and removed when it drops below 3. Coupons
are `duration: forever`.

**Do not apply bundles to tier subscriptions.** The 6-tier model prices
multi-property via the tier (Professional/Enterprise/Network), so per-house bundle
coupons would double-discount. `applyBundleDiscount` deliberately early-returns for
any sub carrying a `tier` (locked decision, pricing gate P-6 — legacy-only). When
re-touching this path, keep the tier skip. The two coupons exist in Stripe **test
mode**; live coupons are pending a Dashboard create (the `rk_live_` key can't write
coupons).

### Tier capabilities (value ladder, P-7/P-8)

Each tier in `SUBSCRIPTION_TIERS` carries a `features` map
(`automatedRentCollection`, `multiProperty`, `complianceExport`, `analytics`,
`whiteLabel`) expressing the value ladder. Gate features at their real call site
with `tierAllows(houseType, tier, featureKey)` (`util/tierPricing.ts`) — **compose
with the `maxResidents`/`maxProperties` caps, don't replace them**. Currently
enforced: `multiProperty` in `updateSubscriptionHouses` (capability-specific error
before the numeric cap); `complianceExport` in the `complianceExport` callable
(`callable/compliance.ts`, RG-SPEC-09 — returns `upgrade_required` when the tier
lacks it, else a real court/drug-court **CSV** of drug tests + meeting attendance,
issue #31); and `analytics` in the `rentRoiMetrics` callable
(`callable/analytics.ts`, RG-TRACK — returns `upgrade_required` else rent-collection
ROI metrics, issue #32). The remaining flags (`automatedRentCollection`,
`whiteLabel`) are defined value-ladder labels; do not gate a capability that has no
real feature behind it.

**Read-only money/PHI note:** both `complianceExport` and `rentRoiMetrics` are
read-only and log only ids + aggregate counts (never names, test results, or
amounts per resident). `payments` docs store `amount` in **dollars** (webhook
divides by 100) — convert to cents when aggregating; `guests.rentOwed` is integer
cents. `rentRoiMetrics` returns `collectedGrossCents`, `refundedCents`,
`collectedNetCents` (gross − refunds), `outstandingCents`, `overdueResidentCount`,
and `onTimeRatePct`/`duePaymentCount`. Refunds are recorded by the
`charge.refunded` webhook handler as `payments.refundedAmountCents` (cents);
on-time uses `payments.dueDate`, the guest's `rentDueDate` captured at charge time
in `handlePaymentIntentSucceeded` (an approximation — no per-charge schedule
history). Hours-saved remains deferred (#32 caveats).

Oxford Network has `availableForSale: false` (P-8) — `isTierAvailableForSale()`
blocks it in `createOperatorSubscription` checkout while keeping the tier defined.
Absent flag ⇒ sellable.

### Webhook security

`http/stripeWebhook.ts` uses Stripe signature verification (`stripe.webhooks.constructEvent`). Never process a webhook payload without verifying the signature first.

### Cross-product access (meetings, referrals)

Never add direct Firestore cross-queries to another product's database — route through recovery-api with service-key auth (`X-Service-Key`/`X-App-Id`/`X-User-Uid`). Firebase Auth ID tokens are project-scoped, so recovery-api (`recovery-platform`) cannot verify a `phoenix-cleanhouse` end-user token — cross-product calls are server-to-server, not end-user. (The former `callable/homegroups.ts` attendance bridge was removed as dead code — zero callers; regroup tracks attendance natively. Meeting **discovery** is being consolidated into recovery-api: see `docs/launch-readiness/recovery-api-meetings-stabilization-plan.md`.)

### Secrets

Service key lives in `service-key.json` (gitignored). Download from Firebase Console under `phoenix-cleanhouse`. Functions read secrets via environment config, not hardcoded values.

There is no `functions/.env.example`. Required deploy-time config beyond the `defineSecret` set: `STRIPE_CONNECT_WEBHOOK_SECRET` (defined but missing from the setup runbook), plain `process.env` values `STRIPE_PRICE_TRAD_*` / `STRIPE_PRICE_OXFORD_*`, `STRIPE_HOUSE_PRICE_ID` / `STRIPE_GUEST_PRICE_ID` / `STRIPE_OXFORD_PRICE_ID` (legacy), `TIER_BILLING_ENABLED`, `RECOVERY_API_BASE_URL`, and `STRIPE_API_VERSION` (pin to `2026-01-28.clover` — unset today, which silently defaults the `api/stripe.ts` client).
