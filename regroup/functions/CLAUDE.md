# Cloud Functions

This directory contains the Firebase Cloud Functions backend for Regroup. Loaded by Claude Code automatically when working inside `functions/`. See `../CLAUDE.md` for project-wide rules (including Stripe and PII policy).

## Commands

```bash
npm run build                   # TypeScript compile
npm test                        # Jest unit tests (run in band)
npm run test:watch              # Jest watch mode
npm run test:coverage           # Jest with coverage
npm run serve                   # Build + legacy `firebase serve --only functions`
npm run preflight:billing       # Billing preflight (also the firebase.json predeploy hook)
npm run stripe:listen           # Forward Stripe events to local stripeEvents + handleStripeConnectWebhook
npm run deploy                  # Deploy all functions
npm run deploy:batched          # Batched fallback for deploy quotas only (default: `firebase deploy --only functions` from regroup/)
```

**Migration scripts** (each runs `npm run build` first; dry-run is the default, `--apply` writes for the cents migrations):

```bash
npm run migrate:dry-run         # Dry-run guest weeks migration
npm run migrate:run             # Apply guest weeks migration
npm run migrate:house-sub:dry-run
npm run migrate:house-sub:run
npm run migrate:payment-cents:dry-run   # / :apply
npm run migrate:balance-cents:dry-run   # / :apply
npm run report:ghost-guests     # Read-only: guest docs with no house claim (ids only); needs both emulator hosts to rehearse
```

Jest config is the `jest` key in `package.json` (no `jest.config.js`). Firestore rules tests live in `../mobile/firebase/__tests__/`, not here.

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
    account.ts      deleteAccount
    houses.ts       createHouses
    finishOperatorSetup.ts, getTierCatalog.ts
  triggers/
    firestore/      Firestore document write triggers
  accountDeletion/  Resumable deleteAccount orchestrator (targets, *Records, personalData)
  houses/           createHouses transaction, houseId, operatorSetup
  http/
    stripeConnect.ts  Stripe Connect account event endpoints (stripeConnectReauth, stripeConnectReturn)
    universal.ts    Generic health-check catch-all (/health, /healthz -> 200; else 404) — no SSR logic.
                    The Angular SSR `universal` handler lives in the separate
                    `regroup/web/functions/src/index.ts` codebase, not here.
  webhooks/
    transferReversals.ts
    stripeWebhook.ts  Stripe webhook receiver (signature-verified); exports stripeWebhook
                      (deployed as `stripeEvents`) and handleStripeConnectWebhook
  scheduled/
    officerTermReminder.ts
    overdueRentNotification.ts
    scheduledRentCollection.ts
    rentAttempts.ts, rentDestination.ts
    index.ts        Also defines updateDisputes (daily 2am UTC), weeklyTransfers
                     (Sundays 8am UTC), warmWebsite (every 5 min)
  api/              Internal API helpers (stripe, recoveryApi, stripeDeletion, firestore, cardValidation)
  entities/         TypeScript interfaces (House, Guest, Subscription, etc.)
  types/            Shared type definitions
  util/             Shared utilities (logging, formatting)
  validation/       Input validation helpers
  scripts/          One-off migration scripts (not deployed as functions)
```

## Domain Rules

### Stripe amounts

All Stripe amounts are in **US cents** (integers). `50000` = $500.00. Convert only at the UI boundary — never inside function logic.

### Bundle discounts (dormant)

`api/stripe.ts` (`getBundleCoupon`, `applyBundleDiscountToSubscription`, `removeBundleDiscount`) is legacy per-house code and never fires: the `applyBundleDiscount` callable early-returns for any sub carrying a `tier`, and every surviving sub is a tier sub. Do not wire it to tiers without a pricing decision (tier level already prices multi-property; pricing gate P-6). Coupons exist in Stripe test mode only.

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

`util/entitlement.ts` (`enforceHouseEntitlement`) is the only server-side paywall. `active`/`trialing` grant, `past_due` grants until `guestGraceEndsAt`, and `canceled`/`unpaid`/unknown statuses deny. Phase A: an absent `subscriptionStatus` is still **granted** and logs `entitlement.absent_status`. The kill switch `paywall/config.enabled` fails closed. Gated: `castOxfordVote`, `setOxfordEnabled`, `createInvitation` and claim grants. Payments, claim revocations, `redeemInvitation`, the billing escape hatches and reads are deliberately ungated. Don't "fix" them. The full ladder, the reasons and the testing trap are in `.claude/rules/regroup-paywall.md`, which loads automatically when you work in `regroup/functions/src/`.

### Invitations, admission tickets and house tiers

- **Records** (`util/houseRoleStore.ts`, policy in `util/houseRoles.ts`): `house-roles/{houseId}_{uid}` `{ houseId, tier, grantedBy, grantedAt, via, invitationId?, primary? }`, server-only (the rules read them with `get()`). Tiers: owner > manager > peer leader > resident; each grants only below it (owner may grant owner). Oxford houses too, until the Oxford admission PR.
- **Tier sources:** the record plus the account's LIVE claims (`getUser`, never the caller's token). **The owner is the record with `primary: true`**: `createHouses` writes it in its transaction; the backfill writes it from `superAdminId`. `houses.ownerId` is never trusted for authority (`houseTierOf`, removals, `authGuard`, `finishOperatorSetup`, which only recovers houses with a primary record for the caller, `createInvitation`, the subscription add-house check, and resident capacity, which counts against the primary owner's subscription). A superAdmin claim is a co-owner; an admin-claim holder with no record is a peer leader.
- **Grants write the record** (never lowering it): admin invitation or `addAdminAuthorization` (owner only) -> manager (superAdmin -> co-owner); senior-peer invitation, `promoteGuestsToAdmin`, `addGuestAuthorization` with `isAdmin` (manager or above) -> peer leader; guest invitation -> resident. **Revokes re-derive the record** from the claims left (highest remaining claim; the primary owner record is never lowered).
- **Ranks** (primary owner > co-owner > manager > peer leader > resident): removals in the callables (`assertMayRevokeAll`), and in the rules any staff change to a guest record's status, `moveOutDate` or house (departure, re-activation or move) and staff deletes; a rank-0 record any staff may change; nobody changes these on their own record.
- **Invitations:** no self-invite; no guest invitation to someone who already lives in the house (staff invitations may: that is how a resident manager is promoted). At redeem: the inviter's live tier must still allow the role, the inviter cannot redeem it, and a guest or senior-peer invitation is refused to someone who already lives there. Fresh redeem sets `grantPending`; `completeGrant` sets `grantCompletedAt` with the tier in one transaction; a same-account retry grants nothing unless stranded (`grantPending`, no completion, unexpired +24h), which re-checks capacity and records occupancy. A used admission ticket is never overwritten.
- **Admission tickets:** written with the redemption, expiring `min(redeem + 7d, invitation expiry + 24h)`; `settleTicket` (onGuestWrite, every create) binds one doc and flags other non-staff docs in `guest-flags`; with no ticket a doc without `createdBy` is legacy/staff. `entitlingDocs` decides which active docs keep the claims.
- **Departures** (onGuestWrite): a delete, an update from active to departed, or a move (`houseId` change; the old house's EES week is re-split, the new house's claims never granted) revokes the old house's guest claim, plus admin unless an owner/manager record or a live superAdmin claim remains; the record is re-derived. Current state decides, so redeliveries are no-ops.
- **Stale tokens:** after a demotion the ID token keeps the removed claim for up to an hour, so rules (which read the token) still accept it in that window; callables read live claims. Forced sign-out (`revokeRefreshTokens`) is not used: it would sign multi-house staff out everywhere.
- **Not moved to records (report):** payments authority (`util/houseAuth.ts`, `callable/payments.ts`) still reads `ownerId`, `adminId`, `adminIds`, `superAdminIds`, which a superAdmin of the house can write until the rules change them; the `superAdminId`-missing fallback in `triggers/firestore/index.ts` and the account-deletion queries are unchanged.

**Deploy order (#145):**

Run steps 1 to 5 back to back: until the rules deploy (step 5) the rules-dependent protections below are not live, and while managers are recorded as peerLeader (steps 1 to 4) they lose manager powers.

1. **Backfill, before the functions deploy:** `cd regroup/functions && npm run migrate:house-roles:dry-run`, the owner reviews the report, then `npm run migrate:house-roles:apply` (`scripts/backfillHouseRoles.ts`). Safe before the deploy: the old code never reads `house-roles`. It gives each house with no primary owner record one for its `superAdminId` (set only by `createHouses`, server-only in every rules version; houses whose `ownerId` disagrees, or with no `superAdminId`, are listed and the latter get none), adds `houseId` to every record, stamps `grantCompletedAt` on redeemed invitations, writes `manager` only when unambiguous and `peerLeader` (least privilege) for every other admin-claim holder, each listed with the reason (resident staff first).
2. **Deploy functions:** `cd regroup && firebase deploy --only functions`. It deploys every export. Not `npm run deploy:batched`: before this PR that script's hand-kept list left out 14 exports, including `createHouses`, `finishOperatorSetup`, `createInvitation`, `peekInvitation` and `redeemInvitation`, all changed here; the list is now complete and a failed batch stops it, but it remains the fallback for deploy quotas only.
3. **Re-run the backfill** (`dry-run`, then `apply`; never adds a second primary owner): it adds records for grants made between steps 1 and 2 and lowers or removes records whose claims the old code removed in that window, re-reading each account's claims first (a lookup error skips the record; records granted after the run started are left alone).
4. **The owner promotes the real managers** from the review list: in the app, send them an admin invitation (allowed even when they live in the house; redeeming it raises the record to manager); or `npm run roles:promote-manager -- --house H --uid U` (dry run), then with `--apply`. Until then a real manager is a peer leader: they cannot invite or promote peer leaders, remove a peer leader, create their `admins` doc or change a peer leader's record status, and a manager who is also a resident loses the admin claim if discharged, moved or deleted in the window (review those rows first).
5. **Deploy rules, only from `main`, after #141 has merged:** `cd regroup/mobile && npm run deploy:rules:dry`, then `npm run deploy:rules` (a rules deploy replaces the whole ruleset).

**Live only after step 5 (rules):** `houseType` and `ownerId` server-only; any staff change to a guest record's status, `moveOutDate` or house, and staff deletes, by rank (no change to one's own record); `moveOutDate` typed; staff create never self-links; `userId` immutable; strict phase and field limits on self-create; `createdBy`/`updatedBy` checks; `admins` doc limits. **Live from step 2 (functions):** every tier check (from `house-roles` and live claims; the owner from the primary record), removal ranks and claim-derived record updates, redeem retries, the inviter and redeemer checks, self-invite and already-resident refusals, capacity counted against the primary owner, departure and move revokes, ticket binding.

**Future consideration (owner decision, not changed):** `redeemInvitation` checks that the token's invited email matches the account email, but not `email_verified`. So someone holding an invite link can register the invited email unverified and redeem it. Requiring verification would add a step to every invitee's signup. Options: send a verification email before redeem, or verify by a code in the invite. Tracked as S3 in `docs/launch-readiness/plan-regroup-recovery-api-2026-10-19.md`.

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

**Indexes are NOT deployed by `deploy:rules`.** `regroup/mobile/firebase/firestore.indexes.json` is the source of truth (wired via `mobile/firebase/firebase.json`); `mobile`'s `deploy:rules` is only `--only firestore:rules,storage`. Deploy indexes with `cd ../mobile && npm run deploy:indexes`. A `balance`→`rentOwed` rename in `6e67faf` (2026-06-01) left the committed index stale, and `scheduledRentCollection` threw `FAILED_PRECONDITION` on every single run for months while Cloud Scheduler went unwatched. After changing any composite query, run `deploy:indexes` and confirm the index reports READY.

Never key a document on a timestamp or counter — Firestore shards by key range, so sequential keys concentrate writes on one range instead of spreading them. Use `collection.doc()` auto-ids and keep the time in a `createdAt` field.

### Live reads (phoenix-cleanhouse)

The firebase MCP server can't query regroup. Read Firestore with ADC and the REST `runQuery` endpoint, and read Gen2 logs with `resource.type="cloud_run_revision"` and a **lowercased** `service_name` (about 30 days of retention). The commands are in `regroup/functions/docs/live-reads.md`.

### Test mocking

A `jest.mock(path, () => importedConstant)` factory that returns a value **imported** from a test helper throws `ReferenceError: Cannot access '<helper>_1' before initialization` — jest hoists the factory above the import, and it runs during the hoisted import of the module under test. Inline shared mock *values* in each factory; only shared *behaviour* survives extraction, because an arrow like `doc: (id) => store.doc(id)` reads the outer binding lazily at call time.
