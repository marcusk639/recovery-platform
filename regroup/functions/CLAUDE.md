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
npm run backfill:week-summaries:dry-run -- --from YYYY-MM-DD --to YYYY-MM-DD [--house <id>]   # / :apply
npm run backfill:dispute-identity:dry-run [-- --house <id>]   # then :apply — stamp/re-stamp residentUid, log older decisions (reopen needs them), seed house-disputes. Combined #141/#145 deploy order (regroup/CLAUDE.md): #145 step 0 and backfills → functions (build first) → the MERGED ruleset immediately after → this, at least 10 minutes later, with `-- --verify-stamps` (cutoff = run start; re-derives pre-rules stamps; flags differing ones on disputed activities, exit 3) → #145's remaining steps → app
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
                    (activityWeekSummary.ts: onActivityWritten owns week-summaries)
  activities/       Week-summary recompute (syncWeekSummary) + pure week/time-zone math
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

**week-summaries are server-owned.** `onActivityWritten` recomputes the touched guest-week(s) from `activities` in a transaction on every activity write (house-local Monday week via the guest's `houses.timezone`, default `America/New_York`; every activity counts unless `status == "deleted"` or `incomplete == true` (an admin-approved dispute, recorded with `disputeOutcome: 'incomplete-per-residents'`; disputed activities are never deleted, see regroup/CLAUDE.md) — pending and rejected disputes count; the court compliance export lists meetings by the same rule (its Dispute History column reads the decision log, the trusted record). On a transition into `disputed` it notifies the house admins (`adminIds`/`superAdminIds`/`superAdminId`) and the resident minus the disputer, who is the `disputedBy` (older builds: `disputeResolvedBy`) that the entering write set; the rules require it to be `request.auth.uid` for every caller. Firestore's auth-context `authId` is not documented as the Auth uid, so it is not used (`activities/disputeNotifications.ts`, idempotent per event). A REOPEN (an admin undoing a decision: `resolved`, or an older build's "delete", back to `disputed`) notifies the same people minus the reopener: "A dispute decision was undone; the dispute is open again." It maintains the live dispute list `house-disputes/{houseId}` (server-only, the app reads it; `house.disputes` is still written as an untrusted, display-only legacy mirror for older builds), the server-only `dispute-archive` (the trusted record with the decision log; `/disputes` is the legacy, client-writable, untrusted collection older builds write) and the decision log in one transaction (`activities/houseDisputeMirror.ts`, `activities/disputeDecisions.ts`): (1) a write that leaves `disputed` logs `activities/{id}/dispute-decisions/decided_{disputeResolvedAt ms}` (approved | rejected | kept | deleted, with `by` and `at`), and a reopen logs `reopened_{reopenedAt ms}` with the outcome it undid, both from the event payload and never rewritten (a redelivery that disagrees with an existing entry logs `dispute_decisions.conflict`; the ids must be time-based because the rules derive `decided_…` from `disputeResolvedAt`, and each activity's subcollection holds only a handful of decisions, far below the write rates where sequential keys hot-spot); the rules allow a reopen only once `decided_…` exists, so no decision is undone before it is logged; (2) the dispute that event decided is archived to `dispute-archive/{activityId}_{decision id}`, built from the decision and the activity payload only and written with `create()` (a disagreeing redelivery logs `dispute_archive.conflict`) with that decision's outcome and resolver, even when the close is processed after a reopen or a later dispute, so re-deciding a reopened dispute never overwrites an earlier archive; (3) the live list is reconciled from the activity's current state: while `disputed`, the server's own entry is kept if it has this dispute's `disputeStamp` = hash(disputer, reason, `disputedAt`), else a new one is built from the activity; otherwise every entry for the activity is removed. Nothing is ever copied from the legacy `house.disputes` map (admins can write it); its keys for the activity are only deleted, and it gets the live entry as a mirror. A reopened older-build dispute (disputer only in `disputeResolvedBy`) gets `disputedBy` back from that dispute's decision log entry, onto the activity too; decisions backfilled for pre-deploy disputes carry no disputer (older builds had overwritten it), so those get none back. An activity id that cannot be a map key (the rules now refuse those at create) is left out of the lists and logged; its decisions are still logged and archived. It also fills `residentUid` (the resident's account, from `guests.userId`) when it is absent or null (`activities/residentStamp.ts`); no client changes it after create (new app builds set it at create, checked by the rules); the server re-stamps it only on an admin's `guestId` correction before any dispute (see below), and `onGuestLinkedRestamp` (`activities/guestRestamp.ts`, separate from `onGuestWrite`, with `util/eventAge`'s `RETRY_CUTOFF_MS` cutoff) only fills empty stamps on a guest's activities when its `userId` is linked or changed, skipping stamped ones without a transaction. An activity that cannot be stamped gets `residentUid: null, residentUidPending: false` once (logged once), so later writes skip the transaction (a fill that fails is left pending instead, so the next write or the backfill fills it). An admin correcting `guestId` before any dispute re-stamps it from the new guest; once there is dispute history the rules freeze `guestId`, so a disputed activity's stamp never moves. With no usable stamp the rules fall back to the guest doc (any admin but the logger when it has no account or is missing), which relies on #145's guest rules. Clients can never change it. A decision or reopen by the activity's resident (guest `userId` or stamp) or logger is logged as `dispute.self_decision` (ids only) and flagged in the server-only `flaggedForReview` (`activities/selfDecisionCheck.ts`). Residents may no longer write `house.disputes`. Besides the mirror, one server consumer of that untrusted map remains: the scheduled `updateDisputes` job (`scheduled/disputeUpdates.ts`, old dispute model), which writes legacy guest week fields, `house.disputes` and `/disputes`; none of them feed the week summaries, the export or any money path. Activities are client-written, so nothing in them is trusted: the summary's `houseId` comes from `guests/{guestId}`, and an activity counts only if its `houseId` is the guest's house and `loggedBy` is the resident (`guests.userId`) or an admin/superAdmin of that house per Auth custom claims (`activities/activityTrust.ts`). Writes are absolute values, so redelivery is a no-op. Don't add client-side summary writes back. **Rollout:** app builds released before the trigger still write summaries — +1 on log, -1 on delete, and a full client recompute on edit/resolve (window Monday 00:00 UTC through `weekEnd + 'T23:59:59'` device-local, counting every activity with the guestId). Any of these can land after the trigger and overwrite its value, and nothing re-triggers until the next activity write for that guest-week. Old resident builds also keep producing duplicate activities (error after save → retry). Re-running `backfill:week-summaries` once those builds are retired is MANDATORY (dry run first; it reports suspected duplicates and closed-week rewrites).

Known limits of the week-summary recompute (by design, not bugs to "fix" silently):

- **Only activity writes trigger it.** Nothing recomputes when a guest doc changes (e.g. `userId` set after the resident's activities were logged by an admin import, or a house move), so that guest's summaries stay stale until the next activity write in each affected week. Run `backfill:week-summaries` (optionally `--house`) after such a change.
- **House moves exclude history.** An activity counts only if its `houseId` is the guest's *current* house, so a guest moved between houses has their earlier activities excluded as `otherHouse` on any recompute of those weeks. No transfer UI exists today; if one is added, decide whether summaries follow the guest.
- **Dates are the resident's to choose on create.** The rules let a resident log a backdated or future-dated activity (the forms allow picking a date); only *updates* are limited to dispute, delete and an admin's decisions (a reopen restores only the count an approval removed).
- Admin claims are resolved before the transaction (no Auth calls while it holds locks), and the transaction re-reads the guest and its house: if the house or its zone changed since the week was computed it throws `week_summary.guest_changed` (code `aborted`) and the event retries. The backfill aborts on it; re-run it.

**Indexes are NOT deployed by `deploy:rules`.** `regroup/mobile/firebase/firestore.indexes.json` is the source of truth (wired via `mobile/firebase/firebase.json`); `mobile`'s `deploy:rules` is only `--only firestore:rules,storage`. Deploy indexes with `cd ../mobile && npm run deploy:indexes`. A `balance`→`rentOwed` rename in `6e67faf` (2026-06-01) left the committed index stale, and `scheduledRentCollection` threw `FAILED_PRECONDITION` on every single run for months while Cloud Scheduler went unwatched. After changing any composite query, run `deploy:indexes` and confirm the index reports READY.

Never key a document on a timestamp or counter — Firestore shards by key range, so sequential keys concentrate writes on one range instead of spreading them. Use `collection.doc()` auto-ids and keep the time in a `createdAt` field.

### Live reads (phoenix-cleanhouse)

The firebase MCP server can't query regroup. Read Firestore with ADC and the REST `runQuery` endpoint, and read Gen2 logs with `resource.type="cloud_run_revision"` and a **lowercased** `service_name` (about 30 days of retention). The commands are in `regroup/functions/docs/live-reads.md`.

### Test mocking

A `jest.mock(path, () => importedConstant)` factory that returns a value **imported** from a test helper throws `ReferenceError: Cannot access '<helper>_1' before initialization` — jest hoists the factory above the import, and it runs during the hoisted import of the module under test. Inline shared mock *values* in each factory; only shared *behaviour* survives extraction, because an arrow like `doc: (id) => store.doc(id)` reads the outer binding lazily at call time.
