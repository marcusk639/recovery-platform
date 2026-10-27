# regroup/CLAUDE.md

**Regroup** is a sober living house management platform for operators, staff, and residents. It is part of the `recovery-platform` monorepo. (The mobile app's internal codename is `rats` — preserved in `app.json` `name`/`displayName` and iOS config for App Store / Firebase continuity. Canonical product name is **Regroup**.)

**Target users:** Sober living house operators / managers, and their guests (residents in recovery).

**Firebase project:** `phoenix-cleanhouse`

---

## Stack

| Layer     | Technology                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Mobile    | React Native 0.72, TypeScript, Redux Toolkit, Firebase SDK                                                  |
| Functions | Firebase Cloud Functions v2 (firebase-functions ^7), TypeScript, Stripe, SendGrid (some v1 legacy triggers) |
| Web       | Angular 9 (EOL — see web/CLAUDE.md), TypeScript, Firebase Hosting                                           |

---

## Subproject Memory

Per-area commands, architecture, and domain rules live in subdirectory CLAUDE.md files, lazy-loaded by Claude Code when working in those directories:

- [`mobile/CLAUDE.md`](mobile/CLAUDE.md) — RN 0.72 app: commands, Redux architecture, navigation, Firestore models, patch-package notes, iOS/Android build details.
- [`functions/CLAUDE.md`](functions/CLAUDE.md) — Cloud Functions: callable/http/trigger architecture, Stripe webhooks, subscription model, secret management.
- [`web/CLAUDE.md`](web/CLAUDE.md) — Angular web portal: commands, Firebase Hosting deploy, structure.

---

## Firebase config

Rules, indexes and emulators live in `mobile/firebase/` (its own `firebase.json`; no `.firebaserc` there). The project pin is `regroup/.firebaserc` -> `phoenix-cleanhouse`. `regroup/firebase.json` only wires `functions.predeploy` to run `scripts/preflight-billing.js`. Start emulators from `mobile/firebase/` (auth 9099, firestore 8080, database 9000, storage 9199, UI 4000; no functions port).

Commits from this repo's installed hook also run `.claude/agent-gates/verify-diff.sh` (blocks deleted/renamed test files and test-count drops — keep a moved test in its original file).

Account deletion is a resumable orchestrator in `functions/src/accountDeletion/`. Stripe ownership is proven only by `metadata.userId`. The property cap counts keys of `users/{uid}.subscriptionMetadata.houses`.

---

## Cross-Product Rules

- **Service key** for Cloud Functions: `functions/service-key.json` (gitignored). Download from Firebase Console under `phoenix-cleanhouse`.
- **Stripe** amounts are in **US cents** (integers). `50000` = $500.00. Convert at the UI boundary only.
- **Subscription model:** 6-tier flat monthly pricing (`SUBSCRIPTION_TIERS` in `functions/src/config.ts`: Traditional 69/129/249, Oxford 49/89/299), selected at checkout and gated by `TIER_BILLING_ENABLED` / `isTierBillingEnabled()`. **The legacy per-house + per-guest quantity model has been deleted** (2026-09-30) — no operators remained on it. A subscription with no `tier` now raises `failed-precondition` rather than silently no-opping. `OperatorSubscription` tracks Stripe `customerId`/`subscriptionId`; tier subs carry a single `subscriptionItemId`, not the old `items.houseItemId`/`guestItemId` pair.

---

## Activity disputes

- **Owner rule:** an activity is never disputed, decided or reopened by the person who did it. Disputes are for *other* people to say the resident did not actually do it (e.g. one resident says they did their chore, another says they did not). "Who did it" = `residentUid`, the account on its guest doc now, and `loggedBy` (whoever created it; admins too can only log as themselves). `residentUid` is server-only: `onActivityWritten` stamps it from `guests.userId` when the activity is created or moved to another guest, and `onGuestLinkedRestamp` re-stamps a guest's activities whenever its `userId` is linked or changed. A null stamp counts as none: with neither a usable stamp nor a guest doc, only the house owner (`superAdmin`) may act. A decision by the resident or logger that slips past the rules (a stamp lagging an account change) is logged as `dispute.self_decision` and flagged in the server-only `flaggedForReview`. `npm run backfill:dispute-identity:apply` (functions; run `:dry-run` first) stamps older activities. Activities disputed by their owner before this rule are left as they are. Guest `userId` immutability is #145's (guest rules).
- **Who:** any other resident of the house (peer) or a house admin may dispute an *active* activity. The entering write names the caller in `disputeResolvedBy` and, if present, `disputedBy` (older builds set only `disputeResolvedBy`), may set `disputedAt` to the server time, and may not rewrite `loggedAt` (older builds' server-time stamp stays allowed). Only house admins (owners = `superAdmin`, managers and peer leaders = `admin` claim) decide, and only an open dispute, recording themselves in `disputeResolvedBy` and the server time in `disputeResolvedAt`: APPROVE (`disputed: 'successful'`, `incomplete: true`, `disputeOutcome: 'incomplete-per-residents'`, `disputeResult: 'success'`: not done, does not count) or REJECT (`disputed: 'rejected'`, `incomplete: false`, `disputeResult: 'fail'`: stands, counts). An older build's "keep" (no outcome fields) counts like a REJECT. A pending dispute keeps counting.
- **Undo (reopen):** owner decision: "Add a way to undo dispute decisions. The dispute should stay alive and approve and reject should show as options again." The same admins (never the resident or `loggedBy`) may move a decided dispute, or an older build's "delete" (deleted with `disputeResolvedAt == loggedAt`), back to `disputed`. The write sets `reopenedBy` to the caller and `reopenedAt` to the server time, clears `disputed`, `incomplete`, `disputeResult`, `disputeOutcome`, `disputeResolvedBy` and `disputeResolvedAt` to null (the only write that may), and changes nothing else. The dispute is pending and counts again, and APPROVE/REJECT show again (Disputes screen: UNDO DECISION, also on an older build's "delete" from the last two weeks). The rules allow it only once the decision is in `activities/{id}/dispute-decisions/decided_{disputeResolvedAt ms}`, which the server writes with the `/disputes` archive. A decision with no `disputeResolvedAt` cannot be reopened. Nothing else leaves a decision: no restore to active.
- **Never deleted, never erased:** once an activity has any dispute history (status `disputed` or `resolved`, or any dispute field), nobody may soft- or hard-delete it from a client (owner rule: "Disputed activities should never be deleted"). No dispute field is ever removed or nulled except by a reopen. `guestId`, `loggedBy` and `houseId` are frozen once there is history, for admins too, and always for non-admins. Outcome fields are set only by a decision, consistently (incl. `disputeResult`). "Successfully disputed — residents of the house report this activity was not completed" (app badge, export label) comes from the counting rule, never from `disputed` alone. The owner may still soft-delete an activity that was never disputed. No Admin SDK path deletes activities (account and house deletion leave them).
- **Server-owned:** `onActivityWritten` (regroup/functions) stamps `residentUid`, sends the dispute and reopen notifications, maintains the live dispute list, archives every decision to `/disputes` and logs it in `dispute-decisions`; clients write only the activity. The live list is `house-disputes/{houseId}` (server-only, readable by house members; the app reads it). `houses/{id}.disputes` is still written as a legacy mirror for older builds, but admins can rewrite it (house setup saves whole-house copies), so it is untrusted and display-only. `/disputes` is still client-writable for older builds' resolve batch (see the PR); trust the decision log, not it. Activity ids are limited to `[A-Za-z0-9_-]`. Details: `functions/CLAUDE.md` (Firestore gotchas) and the rules comments on `activities`.
- **Deploy order:** (1) rules, only from `main` and only after #145 has merged too; (2) functions; (3) `backfill:dispute-identity:dry-run`, review, then `:apply` (a stamp is not a week-summary input, so it triggers no recompute); (4) the app build.

## Key Docs

| File                                | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `mobile/CLAUDE.md`                  | RN app deep-dive                                            |
| `functions/CLAUDE.md`               | Cloud Functions architecture                                |
| `web/CLAUDE.md`                     | Angular web + SSR                                           |
| `FUNCTION_AUDIT.md`                 | Audit of current function inventory                         |
| `docs/go-to-market/roadmap.md`      | Product roadmap (GTM SSOT; sources consolidated 2026-06-10) |
| `docs/go-to-market/monetization.md` | Pricing and subscription model (GTM SSOT)                   |
