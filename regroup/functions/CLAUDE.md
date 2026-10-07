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

> **Node ≥ 23 gotcha:** the firebase-admin → jsonwebtoken → jwa chain loads `buffer-equal-constant-time`, which crashes on Node ≥ 23 (SlowBuffer removed; no upstream fix exists). Jest maps it to `test-shims/buffer-equal-constant-time.js` so `npm test` works on any Node; deployed runtime is Node 22 (`engines`). Non-Jest local scripts that load firebase-admin auth still need Node ≤ 22.

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
    compliance.ts   complianceExport (tier-gated compliance export, RG-SPEC-09)
    analytics.ts    rentRoiMetrics (tier-gated rent-collection ROI metrics, RG-TRACK)
  triggers/
    firestore/      Firestore document write triggers
    rtdb/           Realtime Database triggers
  http/
    stripeConnect.ts  Stripe Connect account event endpoints (stripeConnectReauth, stripeConnectReturn)
    universal.ts    Generic health-check catch-all (/health, /healthz -> 200; else 404) — no SSR logic.
                    The Angular SSR `universal` handler lives in the separate
                    `regroup/web/functions/src/index.ts` codebase, not here.
  webhooks/
    stripeWebhook.ts  Stripe webhook receiver (signature-verified); exports stripeWebhook
                      (deployed as `stripeEvents`) and handleStripeConnectWebhook
  scheduled/
    officerTermReminder.ts
    overdueRentNotification.ts
    scheduledRentCollection.ts
    index.ts        Also defines updateDisputes (daily 2am UTC), weeklyTransfers
                     (Sundays 8am UTC), warmWebsite (every 5 min)
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
`applyBundleDiscountToSubscription`, `removeBundleDiscount`). **It is now dormant.**
The automatic trigger lived in the legacy branch of `updateSubscriptionHouses`,
deleted with the rest of the per-house model; the only remaining entry point is the
`applyBundleDiscount` callable, which early-returns for any sub carrying a `tier`.
Every surviving subscription is a tier sub, so it never fires. Kept deliberately
rather than deleted — do not wire it to tiers without a pricing decision, because
tier level already prices multi-property. The discount was keyed off the count of
`subscriptionMetadata.houses` and removed when it dropped below 3. Coupons are
`duration: forever`.

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

### Server-side entitlement gate (paywall)

`util/entitlement.ts` is the only server-side paywall enforcement. Before it,
`castOxfordVote` was the sole callable that consulted `subscriptionStatus` — the
paywall was otherwise enforced only in the mobile client, so anyone calling the API
directly kept full access regardless of payment.

`enforceHouseEntitlement(house, houseId)` is the gate. Ladder: `active`/`trialing`
grant; `past_due` grants only while `guestGraceEndsAt` is in the future (an absent or
unparseable deadline counts as expired, not as unlimited grace); `canceled`/`unpaid`
deny; an unrecognized status denies.

**Phase A is in force:** a house with no `subscriptionStatus` is GRANTED access and
logs `entitlement.absent_status` with its house id. That measures how many houses a
fail-closed rollout would lock out. Flip the absent branch to a denial only once that
count reaches zero. `House.subscriptionStatus` defaults to `""`, so this is not rare.

**Kill switch:** `paywall/config.enabled`, read with the Admin SDK so it bypasses
security rules — there is no `match /paywall/...` block, so the mobile hook reading
the same doc is denied on every attempt. Fails closed in every failure mode (missing
doc, non-boolean field, throwing read). Cached 60s.

Gated today: `castOxfordVote`, `setOxfordEnabled`, `createInvitation`, and claim
**grants** via `assertCanGrantClaimForHouses({ enforceEntitlement: true })`.

Deliberately NOT gated — do not "fix" these:

- `createPaymentIntent` — residents must be able to pay rent while the operator is
  lapsed. Blocking it harms the resident and removes the operator's means of
  recovering.
- Claim **revocations** (`deleteAdminAuthorization`, `removePrivilegesForGuests`) —
  preventing an operator from removing someone's access is a safety problem.
- `redeemInvitation` — an invitee mid-accept should not be stranded because the
  operator lapsed after the invitation went out.
- Billing/auth escape hatches (`createOperatorSubscription`,
  `reactivateOperatorSubscription`, `createBillingPortalSession`,
  `updatePaymentInfo`, the Stripe Connect trio) — gating any of these deadlocks a
  lapsed operator out of paying.
- Reads (`listPayments`, `complianceExport`, `rentRoiMetrics`) — the gate covers
  writes; data is not held hostage.

**Testing note:** because Phase A grants on absent status, a test whose house fixture
omits `subscriptionStatus` passes whether or not the gate is wired at all. Assert the
gate was *called*, and verify by deleting the gate and confirming the test fails.

### Webhook security

`webhooks/stripeWebhook.ts` uses Stripe signature verification (`stripe.webhooks.constructEvent`). Never process a webhook payload without verifying the signature first.

### Cross-product access (meetings, referrals)

Never add direct Firestore cross-queries to another product's database — route through recovery-api with service-key auth (`X-Service-Key`/`X-App-Id`/`X-User-Uid`). Firebase Auth ID tokens are project-scoped, so recovery-api (`recovery-platform`) cannot verify a `phoenix-cleanhouse` end-user token — cross-product calls are server-to-server, not end-user. (The former `callable/homegroups.ts` attendance bridge was removed as dead code — zero callers; regroup tracks attendance natively. Meeting **discovery** is being consolidated into recovery-api: see `docs/launch-readiness/recovery-api-meetings-stabilization-plan.md`.)

### Secrets

Service key lives in `service-key.json` (gitignored). Download from Firebase Console under `phoenix-cleanhouse`. Functions read secrets via environment config, not hardcoded values.

There is no `functions/.env.example`. Required deploy-time config beyond the `defineSecret` set: `STRIPE_CONNECT_WEBHOOK_SECRET` (defined but missing from the setup runbook), plain `process.env` values `STRIPE_PRICE_TRAD_*` / `STRIPE_PRICE_OXFORD_*`, `TIER_BILLING_ENABLED`, `RECOVERY_API_BASE_URL`, and `STRIPE_API_VERSION`.

The legacy `STRIPE_HOUSE_PRICE_ID` / `STRIPE_GUEST_PRICE_ID` / `STRIPE_OXFORD_PRICE_ID` values are no longer read — the per-house model that used them is gone.

**Two Stripe clients, two version sources.** `util/stripe.ts` hardcodes `apiVersion: "2026-01-28.clover"`; `api/stripe.ts` reads `process.env.STRIPE_API_VERSION!`. `STRIPE_API_VERSION` is therefore still genuinely required — unset, it affects only the `api/stripe.ts` client; set to anything else, the two clients disagree. Worth collapsing to one source.

### Firestore gotchas

**No script in this repo deploys regroup's Firestore indexes.** `regroup/mobile/firebase/firestore.indexes.json` is the source of truth (wired via `mobile/firebase/firebase.json`), but `mobile`'s `deploy:rules` is only `--only firestore:rules,storage`. A `balance`→`rentOwed` rename in `6e67faf` (2026-06-01) left the committed index stale, and `scheduledRentCollection` threw `FAILED_PRECONDITION` on every single run for months while Cloud Scheduler went unwatched. After changing any composite query, deploy `--only firestore:indexes` explicitly and confirm the index reports READY.

Never key a document on a timestamp or counter — Firestore shards by key range, so sequential keys concentrate writes on one range instead of spreading them. Use `collection.doc()` auto-ids and keep the time in a `createdAt` field.

### Live reads (phoenix-cleanhouse)

The firebase MCP server is pinned to `recovery-api` / the `recovery-platform` project, so it cannot query regroup. Use ADC + REST instead:

```bash
TOK=$(gcloud auth application-default print-access-token)
curl -s -X POST "https://firestore.googleapis.com/v1/projects/phoenix-cleanhouse/databases/(default)/documents:runQuery" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d @query.json
```

Gen2 function logs live under `resource.type="cloud_run_revision"` with a **lowercased** `service_name` — not `resource.labels.function_name`, which returns nothing:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="scheduledrentcollection"' \
  --project=phoenix-cleanhouse --freshness=30d
```

Log retention is ~30 days, so anything older cannot be confirmed from logs at all.

### Test mocking

A `jest.mock(path, () => importedConstant)` factory that returns a value **imported** from a test helper throws `ReferenceError: Cannot access '<helper>_1' before initialization` — jest hoists the factory above the import, and it runs during the hoisted import of the module under test. Inline shared mock *values* in each factory; only shared *behaviour* survives extraction, because an arrow like `doc: (id) => store.doc(id)` reads the outer binding lazily at call time.
