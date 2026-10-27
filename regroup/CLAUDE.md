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

- **Owner rule:** an activity is never disputed by the person who did it. Disputes are for *other* people to say the resident did not actually do it (e.g. one resident says they did their chore, another says they did not). "Who did it" = the account on the activity's guest doc (`guests.userId`) and `loggedBy`; the rules refuse any write entering `disputed` from either, as resident, peer or admin, and an admin who is the resident cannot resolve it either. Activities disputed by their owner before this rule are left as they are.
- **Who:** any other resident of the house (peer) or a house admin may dispute an *active* activity, naming themselves as disputer (`disputedBy`; older builds `disputeResolvedBy`). Only house admins (owners = `superAdmin`, managers and peer leaders = `admin` claim) resolve: APPROVE (`incomplete: true`, `disputed: 'successful'`: not done, does not count) or REJECT (`disputed: 'rejected'`: stands, counts). A pending dispute keeps counting.
- **Never deleted:** once an activity has any dispute history (an open dispute, a resolution, or any disputer/resolver/resolution time), nobody may soft- or hard-delete it from a client (owner rule: "Disputed activities should never be deleted"). A dispute ends only by APPROVE (`disputed: 'successful'`, `incomplete: true`, `disputeOutcome: 'incomplete-per-residents'`; shown as "Successfully disputed — residents of the house report this activity was not completed") or REJECT. The owner may still soft-delete an activity that was never disputed. No Admin SDK path deletes activities (account and house deletion leave them).
- **Server-owned:** `onActivityWritten` (regroup/functions) sends the dispute notifications and maintains `house.disputes`; clients write only the activity. Details: `functions/CLAUDE.md` (Firestore gotchas) and the rules comments on `activities`.

## Key Docs

| File                                | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `mobile/CLAUDE.md`                  | RN app deep-dive                                            |
| `functions/CLAUDE.md`               | Cloud Functions architecture                                |
| `web/CLAUDE.md`                     | Angular web + SSR                                           |
| `FUNCTION_AUDIT.md`                 | Audit of current function inventory                         |
| `docs/go-to-market/roadmap.md`      | Product roadmap (GTM SSOT; sources consolidated 2026-06-10) |
| `docs/go-to-market/monetization.md` | Pricing and subscription model (GTM SSOT)                   |
