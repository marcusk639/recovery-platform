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

- **Records** (`util/houseRoleStore.ts`, policy in `util/houseRoles.ts`): `house-roles/{houseId}_{uid}` `{ houseId, tier, grantedBy, grantedAt, via, invitationId?, primary? }`, server-only (the rules read them with `get()`). Tiers: owner > manager > peer leader > resident; each grants only below it, and ranks are strict for every grant and revoke: only the primary owner may grant owner (a co-owner may not). Oxford houses too, until the Oxford admission PR.
- **Tier sources:** the record plus the account's LIVE claims (`getUser`, never the caller's token). **The owner is the record with `primary: true`**: `createHouses` writes it in its transaction; the backfill writes it only when server-written evidence agrees with both `superAdminId` and `ownerId` (see Deploy order step 1), otherwise lists the house for the owner (`--primary houseId=uid`). A house with no primary record fails closed: guest and senior-peer invitations are refused (`house has no owner record`) and nobody may grant owner. `houses.ownerId` is never trusted for authority (`houseTierOf`, removals, `authGuard`, `finishOperatorSetup`, which only recovers houses with a primary record for the caller, `createInvitation`, the subscription add-house check, and resident capacity, which counts against the primary owner's subscription). A superAdmin claim is a co-owner; an admin-claim holder with no record is a peer leader.
- **Grants write the record** (never lowering it): admin invitation or `addAdminAuthorization` (owner or co-owner) -> manager; `addAdminAuthorization` with superAdmin (primary owner only) -> co-owner; senior-peer invitation, `promoteGuestsToAdmin`, `addGuestAuthorization` with `isAdmin` (manager or above) -> peer leader; guest invitation -> resident. **Record before claims** in `addAdminAuthorization`, `addGuestAuthorization` and `promoteGuestsToAdmin`: a failed claims write leaves a record with no matching claim. It grants nothing: tier checks need the live claim, and the rules count a caller's record only when a matching claim backs it (owner: superAdmin; manager or peer leader: admin). As a target it still ranks by the record (rules cannot read another account's claims), so no shadow doc can be made for it and equal staff cannot discharge it (a manager or the owner can) until a retry or the backfill's stale pass, which skips records granted in the last 10 minutes. `recordRoleRevoke` reads the live claims inside its transaction; a revoke racing a grant whose claims are not yet written can still remove the fresh record, leaving a claim with no record (peer leader) until the backfill re-run. `redeemInvitation` still writes claims first (its retry needs the record and `grantCompletedAt` together); a stranded redeem is completed by the retry, and the backfill records any admin-claim holder still without a record. **Revokes re-derive the record** from the claims left (highest remaining claim; the primary owner record is never lowered).
- **Ranks** (primary owner > co-owner > manager > peer leader > resident): removals in the callables (`assertMayRevokeAll`), and in the rules any staff change to a guest record's status, `moveOutDate` or house (departure, re-activation or move) and staff deletes, checked against the record's account before and after the write; a staff create or link of a guest doc to an account needs a rank strictly above that account (no shadow record keeping a peer leader's claims); a rank-0 record any staff may change; nobody changes these on their own record.
- **Invitations:** no self-invite; no guest or senior-peer invitation to someone who already lives in the house (only an admin invitation may: that is how a resident manager is promoted). At redeem: the inviter's live tier must still allow the role, the inviter cannot redeem it, and a guest or senior-peer invitation is refused to someone who already lives there. Fresh redeem sets `grantPending`; `completeGrant` sets `grantCompletedAt` with the tier in one transaction; a same-account retry grants nothing unless stranded (`grantPending`, no completion, unexpired +24h), which re-checks capacity and records occupancy. A used admission ticket is never overwritten, so a resident who left (discharged or evicted) can never be re-admitted by invitation: their redeem is refused, and staff ranked above them re-add them (a staff-created guest doc plus `addGuestAuthorization`). Not changed: letting a new invitation replace a used ticket would reopen a self-create path, so it needs its own review.
- **Admission tickets:** written with the redemption, expiring `min(redeem + 7d, invitation expiry + 24h)`; `settleTicket` (onGuestWrite, every create) binds one doc and flags other non-staff docs in `guest-flags`; with no ticket a doc without `createdBy` is legacy/staff. `entitlingDocs` decides which active docs keep the claims. It still counts a doc created by staff of equal or lower rank (not changed: shipped builds send no `createdBy` and per-doc rank reads could strip a real resident; the rules now refuse new shadow records, and any made before step 3 need a one-off audit).
- **Departures** (onGuestWrite): a delete, an update from active to departed, or a move (`houseId` change; the old house's EES week is re-split, the new house's claims never granted) revokes the old house's guest claim, plus admin unless an owner/manager record or a live superAdmin claim remains; the record is re-derived. Current state decides, so redeliveries are no-ops.
- **Rules read limit on guest batches:** each departure, delete or account-linked create of a guest doc reads that account's `house-roles` record (one `get()`, which returns null for a missing record), plus the caller's record once per batch; a move between houses reads both houses. A batch may make 20 reads, so one batch carries at most 19 account-linked removals or discharges, or 9 moves between two houses (measured in the emulator). The app removes and discharges one guest doc at a time, so the limit does not affect it (`services/house.tsx` `updateHouseBatch`, which chunks through `services/guestBatch.ts`, has no caller).
- **Stale tokens:** after a demotion the ID token keeps the removed claim for up to an hour, so rules (which read the token) still accept it in that window; callables read live claims. Forced sign-out (`revokeRefreshTokens`) is not used: it would sign multi-house staff out everywhere.
- **Not moved to records (report):** payments authority (`util/houseAuth.ts`, `callable/payments.ts`) still reads `ownerId`, `adminId`, `adminIds`, `superAdminIds`. Until step 3 (rules live) a superAdmin of the house can write all four; after step 3 `ownerId` is server-only, while `adminId`, `adminIds` and `superAdminIds` stay writable by a superAdmin of the house (owner decision pending); the `superAdminId`-missing fallback in `triggers/firestore/index.ts` and the account-deletion queries are unchanged.

**Deploy order (#141 + #145, combined):**

One order for #141 and #145, the same as `regroup/CLAUDE.md` ("Deploy order (#141 + #145, combined)"), which #141 adds; after the merge that is the single source and this section only details #145's steps. #141's rules never go live without #145's, so the two ship as ONE merged ruleset. Run back to back: 0, 1, 2, 3, 4, then 5 and the app build. #145's steps 0 to 2 must run before the rules; nothing of #145 needs to run after them except step 5, and neither part of step 5 depends on the rules (see "Between step 3 and step 5b").

0. **Hard precondition, before step 1: the live rules are #103 or later** (document only; the owner runs it). From #103 no client can write `superAdminId`, and houses are created only by `createHouses`; the backfill's evidence relies on that for anything written from now on (data written earlier is covered in step 1). Read the live `phoenix-cleanhouse` ruleset (Console, Firestore > Rules; or `curl -H "Authorization: Bearer $(gcloud auth print-access-token)" https://firebaserules.googleapis.com/v1/projects/phoenix-cleanhouse/releases/cloud.firestore`, then fetch the `rulesetName` it returns) and check that `match /houses/{houseId}` has `allow create: if false;` and lists `superAdminId` among its server-owned fields. If not, deploy #103's rules first: from a clean worktree at the last `main` commit before #145's merge, `cd regroup/mobile && npm run deploy:rules:dry`, then `npm run deploy:rules`. Do not start step 1 until this holds.
1. **Backfill, before the functions deploy:** `cd regroup/functions && npm run migrate:house-roles:dry-run`, the owner reviews the report, then `npm run migrate:house-roles:apply` (`scripts/backfillHouseRoles.ts`, pass 1 in `scripts/backfillHouseOwners.ts`). Safe before the deploy: the old code never reads `house-roles`. Threat model: with step 0 in place only `ownerId` can still be rewritten (by a superAdmin co-owner, until step 3); a co-owner holding both fields must have set `superAdminId` before #103. The fields cannot tell that co-owner from the owner; the subscription is the only evidence that can, and a co-owner could list the house on their own subscription by three routes: before #59 (c4b75501) `users/{uid}` was writable by its owner (status and houses map); before #103 a co-owner could delete and recreate their users doc with a houses map, which `writeOperatorSubscription` keeps; and `updateSubscriptionHouses` added any house unchecked before #103 and, until step 2, adds any house whose `ownerId` is the caller. So a house gets a primary owner record only when all of these agree: `superAdminId` = `ownerId` = U; U's subscription (`users/{U}.subscriptionMetadata`, non-empty status) is the only one listing the house; U holds a live superAdmin claim there and no other account does (any house with a co-owner waits for the owner). Every other house gets no primary and is listed with the evidence ("owner must choose"); the owner settles each with `npm run migrate:house-roles:apply -- --primary houseId=uid` (any existing account; the record is marked `chosen` with `chosenAt` and never re-checked; `--primary` with the uid an existing primary record already names marks that record chosen, which settles a contradicted or unverifiable one). A malformed `--primary`, a repeated house, or an unknown house or account stops the run before any write (exit 1). **Settle every listed house before step 2, co-owned houses included** (any house where more than one account holds a superAdmin claim is listed): from step 2 until it is settled, the house refuses resident (guest) and peer-leader (senior-peer) invitations ("house has no owner record") and nobody can grant owner there. What still slips through: a sole superAdmin-claim holder who already removed the real owner's claim; that owner has lost the house without this PR too. Existing primary records that were not chosen are re-checked: one the evidence contradicts (it names another account) is reported and left as it is; one the evidence can neither confirm nor contradict (e.g. a `createHouses` record whose claim grant failed) is listed for review, not deletion. The run also adds `houseId` to every record (the dry run reports how many), stamps `grantCompletedAt` on redeemed invitations, writes `manager` only when unambiguous and `peerLeader` (least privilege) for every other admin-claim holder, each listed with the reason (resident staff first). Exit codes: 2 when a claims lookup failed (those records are left as they are: re-run); otherwise 3 when a house is listed for the owner or a primary is contradicted; 0 when nothing needs the owner.
2. **Functions, all of them,** from a clean worktree at the merged commit, from `regroup/`. First run `firebase functions:list` and compare it with `ALL_FUNCTIONS` in `scripts/deploy-batched.sh` (a test keeps that list equal to the exports). For each deployed function the code no longer exports (e.g. `sendInviteEmails`), the deploy will offer to delete it: decide beforehand whether to delete it (answer yes) or keep it running (answer no; the rest still deploys); don't pass `--force` blindly. Then `npm --prefix functions ci && npm --prefix functions run build`, then `firebase deploy --only functions` (the predeploy hook does not build). It deploys every export. Not `npm run deploy:batched`: on `main` that script's hand-kept list leaves out 18 exports, including `createHouses`, `finishOperatorSetup`, `createInvitation`, `peekInvitation` and `redeemInvitation`, all changed here; the list is now complete and a failed batch stops it, but it remains the fallback for deploy quotas only.
3. **Immediately after: the MERGED ruleset,** from `main` after both PRs have merged: `cd regroup/mobile && npm run deploy:rules:dry`, then `npm run deploy:rules` (a rules deploy replaces the whole ruleset). Note the time it went live.
4. **#141's backfill**, once the rules are live: `backfill:dispute-identity` with `--rules-live-at <ISO time of step 3>`, dry run, review, then apply (details in `regroup/CLAUDE.md`). It touches activities and disputes only, not `house-roles`.
5. **#145's remaining steps, then the app build:**
   - **5a. Re-run the backfill** (`dry-run`, then `apply`; never adds a second primary owner): it adds records for grants the old code made between steps 1 and 2 and lowers or removes records whose claims the old code removed in that window, re-reading each account's claims first (a lookup error skips the record; records granted after the run started are left alone). Settle listed houses with `--primary houseId=uid`; repeat until it exits 0 (2: re-run; 3: houses or primaries still need the owner). Run it promptly after step 3: until then an account granted admin in that window has no record and ranks 0 as a target in the rules (it ranks by its claim as a caller).
   - **5b. The owner promotes the real managers** from the review list: in the app, send them an admin invitation (allowed even when they live in the house; redeeming it raises the record to manager); or `npm run roles:promote-manager -- --house H --uid U` (dry run), then with `--apply`. Review the resident-staff rows first.

**Between step 3 and step 5b** a real manager recorded as peerLeader is a peer leader everywhere. From step 2 the callables refuse them: inviting or promoting peer leaders, sending admin invitations, removing a peer leader. From step 3 the rules also refuse them: discharging, moving or deleting a peer leader's (or manager's) guest doc, creating or linking a guest doc for a peer leader, and creating their own `admins` doc. Everything they do for residents still works (admitting, editing, discharging, moving, deleting resident docs; resident invitations), and no peer leader can discharge them (equal rank). This is acceptable: the refused actions are rare, the owner can do each of them meanwhile, and promotion ends it. Nothing in #145's steps 1 to 4 needs moving earlier. One more effect of the earlier rules: someone who redeemed an invitation under the old code (no admission ticket) and creates their guest doc only after step 3 is refused; they need a new invitation, or staff create the doc. The steps are close together, so this is rare.

**Live only after step 3 (rules):** `houseType` and `ownerId` server-only; any staff change to a guest record's status, `moveOutDate` or house, and staff deletes, by rank, checked against the record's account before and after the write (no change to one's own record); a staff create or link of a guest doc to an account only by staff ranked strictly above that account (no "shadow" records); `moveOutDate` typed; staff create never self-links; `userId` immutable; strict phase and field limits on self-create; `createdBy`/`updatedBy` checks; `admins` doc limits. Legacy edge: a full-object staff edit of an old guest doc with no `status` field adds `status`, which counts as a status change, so it is denied on one's own doc or on a doc whose account ranks at or above the editor. **Live from step 2 (functions):** every tier check (from `house-roles` and live claims; the owner from the primary record), owner granted only by the primary owner, removal ranks and claim-derived record updates, redeem retries, the inviter and redeemer checks, self-invite and already-resident refusals, capacity counted against the primary owner (no primary record: slot-consuming invitations refused), departure and move revokes, ticket binding.

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
