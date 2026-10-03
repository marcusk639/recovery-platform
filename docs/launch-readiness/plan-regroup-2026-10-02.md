# Launch Readiness Plan — Regroup

**Target:** `regroup` → `regroup/mobile`, `regroup/web`, `regroup/functions`
**Firebase project:** `phoenix-cleanhouse`
**Ground truth:** `origin/main` @ `7ea7bf9`, which contains `c4b7550` (PR #59, 55 commits of tier
billing) and `7ea7bf9` (PR #60, regroup CI jobs).
**Date:** 2026-10-02 — re-run of `docs/launch-readiness/plan-regroup-2026-09-27.md`

---

## Verdict

The engineering that the 2026-09-27 plan called blocking is largely **done**: a real checkout wizard
with card entry, a decided billing model, server-side entitlement enforcement, and a mobile paywall
that actually fires. What remains is that **the paths which deliver that code to production are
broken or unverified**, plus one live privacy exposure.

Three things set the timeline. Launch requires an App Store / Play release, and the Android debug
build does not compile (item 10) — that is the longest pole and the only one with latency outside the
team's control, so it starts today regardless of its severity rank. And `deploy:batched` silently omits
14 functions including the whole tier-billing and invitation surface (item 2), so shipping the billing
work does not currently ship it.

**Correction, 2026-10-03.** This plan said mobile could not initialise Stripe. The truth was worse and
this plan missed it: `regroup/mobile` had no `metro.config.js` at all, so `react-native bundle` failed
outright and **no store artifact could be produced on either platform**. That outranked every item
listed here, and it was invisible to this plan because every item was verified by reading source rather
than by running a build. Item 1 is now resolved; see _Resolved: item 1, and the blocker it missed_.

A Storage privacy exposure was ranked first in an earlier revision and has been **withdrawn**: the
path it described is unused, so nothing was being leaked. See item 9 and the note in _How this was
verified_. No launch-blocking privacy issue is currently known for regroup.

None of items 2, 3, 4 or 10 would be visible from a green CI run or a successful deploy. That is the
through-line: the gaps here are in things that _look_ like they are working.

---

## Critical path

Ordered by severity-then-dependency, with one deliberate exception.

**Launch requires an App Store / Play release** (confirmed 2026-10-02). That makes item 10 a
_long-lead_ item rather than a low-priority one: store review latency is measured in days, is outside
the team's control, and nothing ships without it. **Start item 10 in parallel today** instead of
working down to it — its rank below reflects severity, not when to begin.

Item 1 is the binding _engineering_ constraint: it is independent of every deploy concern below it —
even a flawless deploy leaves rent collection dead.

**A previous revision ranked a Storage privacy exposure first.** That was withdrawn on 2026-10-03:
the path it described is unused, so it was not harming anyone. It now sits at 9 at its real
severity. The lesson is in _How this was verified_ — I never checked whether the path I was
hardening had call sites.

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ENG/OPS                      | Evidence                                                                                                                                                              | Blocks                                                                                                                                                                                                                   | Effort                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1   | **~~Give `regroup/mobile` a build-time config mechanism and a real Stripe publishable key.~~ RESOLVED 2026-10-03** — see _Resolved: item 1, and the blocker it missed_ below. The diagnosis here was correct but incomplete: it identified the missing Babel transform, not that `metro.config.js` was absent entirely, so the app could not be bundled at all. Code is done; **setting the `pk_live_` value in the CI/fastlane environment remains OPS and is not done.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ENG (done) + OPS             | `b6a1a6d`, `e8d6509`, `a05f791`                                                                                                                                       | Nothing further, once the key is set.                                                                                                                                                                                    | done                      |
| 2   | **Rebuild `regroup/scripts/deploy-batched.sh` to derive its function list from source.** The hardcoded `ALL_FUNCTIONS` array holds 40 names; the generated inventory holds 53. **14 live functions are never deployed**: `getTierCatalog`, `createBillingPortalSession`, `applyBundleDiscount`, `createInvitation`, `peekInvitation`, `redeemInvitation`, `setOxfordEnabled`, `castOxfordVote`, `complianceExport`, `rentRoiMetrics`, `scheduledRentCollection`, `overdueRentNotification`, `notifyOperatorOnApplication`, `setHouseSubscriptionStatusOnCreate`. It also still lists `sendInviteEmails`, which no longer exists, so that batch hard-errors — and line 40 ends `\|\| echo "⚠ Batch $BATCH_NUM had errors — continuing"`, which defeats the `set -e` on line 2. The script exits 0 regardless.                                                                                                                                                                | ENG                          | `regroup/scripts/deploy-batched.sh:2,40`; `regroup/FUNCTION_AUDIT.md`; `regroup/functions/package.json:10`                                                            | Shipping tier billing at all. Checkout, the billing portal, every invitation path and both rent cron jobs stay at their old revision or never appear.                                                                    | ~2 hours                  |
| 3   | **Get the billing configuration off one laptop.** All 12 `STRIPE_PRICE_*` vars plus `TIER_BILLING_ENABLED` are bound — `regroup/scripts/preflight-billing.js` passes clean locally — but only in `regroup/functions/.env`, which is gitignored (`regroup/functions/.gitignore:17`). There is no `.env.phoenix-cleanhouse`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | OPS (+ENG for the mechanism) | `regroup/functions/.env` (5558 bytes, local only); `regroup/functions/.gitignore:17`; preflight run output                                                            | Any deploy not performed from this machine. From CI the vars are unset and every tier checkout throws `Price ID not configured for env var: …`.                                                                          | hours                     |
| 4   | **Set `TIER_BILLING_ENABLED=true` in deployed config, and confirm it.** With the flag off, `createOperatorSubscription` falls through to `initializeCustomer` and mints a **tier-less** subscription. Since `87a835d` deleted the legacy capacity path, any later `updateSubscriptionHouses` / `updateSubscriptionGuests` on a tier-less subscription raises `failed-precondition`. The go-live runbook still describes this as "silently uses the legacy per-house+per-guest model", which is no longer what happens. **Confirm it** by redeploying with `node regroup/scripts/preflight-billing.js --strict`, which hard-fails on missing CONFIG once the flag is true, and by checking the deployed `functions/.env.phoenix-cleanhouse`. **Rollback is not symmetric:** flipping the flag on later does not repair subscriptions already created tier-less — those need a Stripe-side migration onto a tier price — so verify before the first real checkout, not after. | OPS                          | `regroup/functions/src/callable/subscriptions.ts:237`; commit `87a835d`; `regroup/docs/launch-readiness/billing-go-live-runbook.md:13`                                | Correct billing. Flag-off does not degrade gracefully — it creates subscriptions that can never add a house or resident.                                                                                                 | minutes + verification    |
| 5   | **Make production failures visible.** The mobile top-level ErrorBoundary only `console.error`s, with the comment "Sentry can be added later" — the worst mobile failure, a white screen, is invisible. Crashlytics is a dependency with a root classpath but the plugin is never applied, so native crashes go unreported. `regroup/functions` has no error-reporting dependency at all (0 matches), and `regroup/web` ends at `console.error`. No alert policy, notification channel or uptime check exists anywhere under `regroup/`.                                                                                                                                                                                                                                                                                                                                                                                                                                     | ENG + OPS                    | `regroup/mobile/src/components/ErrorBoundary.tsx:27-28`; `regroup/mobile/android/build.gradle:25` (classpath, plugin never applied); `regroup/functions/package.json` | Operating at all after launch. When a callable throws for a paying operator, nobody learns of it unless someone happens to open Cloud Logging.                                                                           | hours                     |
| 6   | **Make `scheduledRentCollection` fail loudly.** It counts failures and logs an aggregate, but never rethrows, so the handler returns normally and Cloud Scheduler records SUCCESS even when every charge failed. Combined with item 6 there is no signal whatsoever.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ENG                          | `regroup/functions/src/scheduled/scheduledRentCollection.ts` (failure branch logs, no `throw`)                                                                        | Noticing that rent collection has stopped. A rotated Stripe key or revoked Connect account halts collection for every operator; first notice is a complaint weeks later, with no failed-run record to reconcile against. | ~1 hour                   |
| 7   | **Add a deploy path for Firestore indexes.** `deploy:rules` is `firebase deploy --only firestore:rules,storage`, which excludes indexes; no `firestore:indexes` target exists anywhere outside archived docs. Two new `documents` composite indexes (houseId+createdAt, houseId+guestId+createdAt) currently exist **only in the uncommitted working tree**, so they are doubly stranded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ENG                          | `regroup/mobile/package.json` (`deploy:rules`); `regroup/mobile/firebase/firestore.indexes.json` (uncommitted)                                                        | Any query needing a composite index — first production hit throws `FAILED_PRECONDITION: index required`.                                                                                                                 | ~1 hour                   |
| 8   | **Replace the TEST-mode annual price IDs.** The six monthly IDs are live-mode; the six annual IDs are marked TEST in the file's own section comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | OPS                          | `regroup/scripts/stripe-prices.env` (live block vs `TEST MODE` block)                                                                                                 | Selling annual plans. Annual checkout transacts against test prices in production.                                                                                                                                       | hours (Stripe console)    |
| 9   | **Decide the visibility of `users/{userId}/avatar`, still `isAuthenticated()`.** **Severity corrected 2026-10-03 — the earlier version of this item was wrong.** It claimed anyone signed up could fetch any resident's photo given a houseId/guestId pair; that path (`houses/{houseId}/guests/{guestId}/avatar/`) is **unused** — `uploadGuestAvatar` and `getGuestAvatarDownloadURL` have zero call sites and the path appears nowhere outside its three definition lines. Avatars upload to `users/{uid}/avatar`, whose tokenised URL is copied onto `guest.avatar` and `admin.avatar`. The real exposure is therefore weaker: it needs a **uid**, and the path carries no house or residency information, so a photo alone does not disclose recovery status. Scoping it is a product decision — user avatars render in contact views that legitimately cross houses. #61 hardened the unused path as hygiene and improved its tests; it did not fix a live leak.      | ENG + product decision       | `regroup/mobile/firebase/storage.rules:59`; `regroup/mobile/src/services/storage.tsx:6,14,19`; `regroup/mobile/src/services/users.tsx:233,247,251`                    | Nothing that blocks taking payment. A signed-up user who learns a uid can fetch that person's photo.                                                                                                                     | hours, after the decision |
| 10  | **Fix the Android debug build.** `:app:checkDebugAarMetadata` fails with 68 AAR issues: transitive AndroidX (e.g. `androidx.navigation:navigation-runtime-android:2.9.7`) requires AGP 8.1.1+, both apps are on 7.4.2, and `regroup/mobile` pins no AGP version at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ENG                          | issue #58; `regroup/mobile/android/build.gradle:22`                                                                                                                   | Any Android store submission, and all Maestro smoke coverage.                                                                                                                                                            | days                      |
| 11  | **Fix `regroup/web`'s build pipeline past `ng build`.** Measured 2026-10-02, not assumed: `ng build` SUCCEEDS and emits `dist/sapp/browser/` with all chunks. `npm run build` then fails at step 2 of 4 — `copy:hosting` runs `cp -r ./dist/sapp/* ./public && rm ./public/index.html`, but Angular 9 emits into `dist/sapp/browser/`, so `public/index.html` never exists, `rm` exits 1, and the `&&` chain stops. **`build:ssr` and `build:functions` therefore never run**, on an app that needs Angular Universal SSR. The right fix depends on hosting intent, which I could not determine: `regroup/web/firebase.json` serves `dist/sapp/browser`, yet `copy:hosting` writes into the committed `public/` tree — so whether that `rm` should target `public/browser/index.html` or be dropped is a decision, not a typo.                                                                                                                                              | ENG                          | build log `EXIT=1` with 0 compile errors; `regroup/web/package.json` scripts `build`, `copy:hosting`, `build:ssr`                                                     | Any web deploy needing SSR or the hosting functions.                                                                                                                                                                     | hours                     |

---

## Resolved: item 1, and the blocker it missed

Shipped 2026-10-03 as `b6a1a6d`, `e8d6509`, `a05f791` on `feat/regroup-tier-billing`.

**What this plan got right.** `App.tsx` read `process.env.STRIPE_PUBLISHABLE_KEY ?? 'pk_test_placeholder'`
with no Babel transform configured, so the placeholder was used in every build.

**What it missed.** `regroup/mobile/metro.config.js` did not exist — not tracked, not on disk, not
ignored, while `homegroups/mobile` has one. `react-native bundle` failed with _"No Metro config found"_.
No release artifact could be produced for iOS **or** Android. This also means item 10 was never the only
thing blocking Android: bundling was blocking it too.

Behind that sat a second failure: `@tanstack/query-core` 5.90.20 points its package `react-native` field
at `src/index.ts`, so Metro compiled raw TypeScript using class private methods the RN preset does not
enable. Fixed with three syntax plugins, gated off under Jest — Jest resolves `@tanstack` via the built
`main` field and never needs them, and their loose class-property semantics fail 28 suites.

**Shared root cause.** `regroup/.gitignore` excluded all JavaScript, so the RN template configs were
never committed. `ea3ad4d` ("restore regroup/mobile test tooling") recreated `babel.config.js` as three
lines without the `dotenv` call it had, and did not recreate `metro.config.js` at all. The header of
`google/apikeys.ts` meanwhile described the mechanism in convincing detail — dotenv in `babel.config.js`,
then _"Metro's built-in loose-envify pass"_. Neither half existed, and there is no such Metro pass.

**Verified by building, not reading.** iOS and Android bundles both build; the injected key appears
exactly once in each; a non-whitelisted variable is confirmed _not_ substituted, so an unrelated secret
in the build shell cannot leak into a shipped bundle. Tests 290/291 — the one failure
(`StalePendingBanner`, expects `support@regroup-app.com`, source sends `admin@`) is pre-existing at HEAD
and unrelated.

**Still open.**

- `regroup/mobile/.env.example` is unwritten — the repo's env-guard hook blocks writes to it. It is the
  only part of the mechanism not landed, and it is where the variable names get documented.
- The `pk_live_` key must be set in the CI/fastlane environment. `npm run check:env:release` fails the
  build on a missing or test-mode key, so this cannot silently regress — but the gate is not yet wired
  to a build step, because `fastlane/Fastfile`'s `beta` lane only uploads a prebuilt IPA from
  `/tmp/regroup-export/rats.ipa` and never builds. Choosing that chokepoint is an open decision.

**Method note.** Every item in this plan was verified by reading source. The one blocker that outranked
them all was only findable by running `react-native bundle`. For a release-gating plan, "does it build"
belongs alongside "does the code say the right thing".

---

## Already done — stale-doc zombies killed

Each of these was listed as blocking on 2026-09-27 and is resolved on `origin/main`:

- **The `/signup` wizard has a real card step.** Tier resolve from query string, capacity-first
  `<tier-picker>`, account details, then `<billing-info>` with ngx-stripe card elements calling
  `createPaymentMethod` → `subscribeOperator` → `createOperatorSubscription`
  (`regroup/web/src/app/components/accounts/signup/signup.component.html`;
  `regroup/web/src/app/components/billing/billing-info/billing-info.component.ts:150-175`).
- **The billing model is decided.** Six tiers in `regroup/functions/src/config.ts:60-158`; the
  legacy per-house/per-guest capacity path is deleted (`87a835d`).
- **`BillingInfoComponent` needs no route** — it is a child of signup, and
  `createBillingPortalSession` is wired at `regroup/web/src/app/components/accounts/my-account/my-account.component.ts:76-84`.
- **`priceEnvVar` has a runtime consumer** — `regroup/functions/src/callable/subscriptions.ts` reads
  `process.env[tierConfig.priceEnvVar]`, and `regroup/functions/src/util/tierPricing.ts` resolves tier/interval.
- **Price config is bound and enforced at deploy.** `regroup/firebase.json` runs
  `regroup/scripts/preflight-billing.js` as the functions `predeploy`; it hard-fails on missing CONFIG
  once `TIER_BILLING_ENABLED=true`. A local `--strict` run passes clean.
- **Rules have a deploy path.** `deploy:rules` in `regroup/mobile/package.json`, plus a `:dry`
  variant. (Indexes still do not — item 5.)
- **Server-side entitlement exists.** `regroup/functions/src/util/entitlement.ts`, wired into
  `createInvitation`, `setOxfordEnabled`, `castOxfordVote` and the shared claim-grant guard,
  with four deliberate exemptions each carrying a `Do not add enforceHouseEntitlement here.`
  comment. An absent subscription status now denies rather than grants (`30cae0a`).
- **The mobile operator paywall actually fires.** It previously short-circuited on
  `potentialSuperAdmin`, which both signup funnels set permanently, making it unreachable for
  every real operator (`d30015c`).
- **`subscriptionMetadata` is server-owned in Firestore rules.** The former blanket
  `allow read, write: if isSameUser(userId)` is gone; create and update now both exclude it
  (`regroup/mobile/firebase/firestore.rules:352-376`). This closes the self-escalation path an
  earlier review of mine flagged.
- **`regroup/mobile` and `regroup/web` are now in CI** (`7ea7bf9`) — a 290-suite Jest run and a
  spec typecheck. Adding the mobile job immediately caught a real bug on main
  (`ACCOUNT_URL === "undefined/my-account"`).

---

## Risks

- **The client paywall can still be bypassed in the UI.** `potentialSuperAdmin` is not in the
  `users` update exclusion list, so a user can self-write it and short-circuit
  `useSubscriptionGate`. Severity is limited to UI access because server-side entitlement now
  gates the writes that matter — but it is still a bypass of what the screen claims to enforce.
- **39 uncommitted files on this machine**, including the two stranded indexes and an
  `.env` holding all billing config. A laptop failure loses deployable configuration.
- **`regroup/web` is not demonstrably buildable.** Angular 9.1 / TypeScript 3.8.3 with `engines`
  null, every script prefixed `NODE_OPTIONS=--openssl-legacy-provider` to force a webpack-4
  toolchain onto Node 17+, against local Node 22. The site is deployed and serving; whether the
  current tree still builds was not demonstrated.
- **`regroup/.github/workflows/deploy.yml` never runs.** GitHub only reads
  `.github/workflows/` at repo root, so this file is inert — and it uses the deprecated
  `FIREBASE_TOKEN`. Anyone assuming push-to-main deploys functions is wrong.
- **The preflight Secret Manager probe is network-dependent.** One run reported
  `STRIPE_WEBHOOK_SECRET not found or not accessible` and three subsequent runs did not. A
  transient failure blocks a deploy spuriously; worse, it trains people to re-run until green.

---

## Deferred

- **Consolidating the four `firebase.json` files (regroup/, regroup/mobile/, regroup/mobile/firebase/, regroup/web/)** under `regroup/`. Confusing, but each has a
  distinct role and the deploy paths that matter are covered by items 2 and 5.
- **`regroup/web` test runner.** `regroup/web/angular.json` points at a `karma.conf.js` that has never
  existed. The new CI job typechecks the specs instead, which is honest about what it covers.
- **The `StalePendingBanner` / contact-address class of drift.** Fixed where found; a broader
  audit can wait.

---

## Open questions

Each blocks a decision and cannot be answered from the repo.

| Question                                                                                                                                                              | Blocks                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Is `TIER_BILLING_ENABLED` true in deployed config?~~ **Not an open question — a short console check.** Folded into item 5, which now names the confirmation method. | —                                                                                                                                                                |
| ~~Are the 12 `STRIPE_PRICE_*` vars in the deployed project?~~ **Same check.** Folded into items 4 and 5; `preflight-billing.js --strict` answers it at deploy time.   | —                                                                                                                                                                |
| ~~Does `regroup/web` build?~~ **Answered 2026-10-02 by running it:** `ng build` succeeds; `npm run build` fails at `copy:hosting`. Now critical-path item 11.         | —                                                                                                                                                                |
| What is the state of the iOS/Android store listings, privacy labels and review metadata?                                                                              | Store submission timing. Not verified — see below.                                                                                                               |
| Error visibility, support path, refund handling, account deletion.                                                                                                    | First-failure experience for a paying customer. **Not verified** — the subagent covering operational readiness did not return, and I did not re-derive its area. |
| Anything about pricing, demand, conversion or retention.                                                                                                              | The repo holds no user research, pricing validation, CAC/LTV or funnel data. Not estimated here.                                                                 |

---

## How this was verified

**Run:** `node regroup/scripts/preflight-billing.js` and `--strict` (4 invocations, to test
determinism); a set-diff of `regroup/FUNCTION_AUDIT.md` against `ALL_FUNCTIONS` in
`regroup/scripts/deploy-batched.sh`; `git show origin/main:<path>` for every cited file, because the working
tree carries 39 uncommitted files from another session and does not represent `main`.

**Read:** the 2026-09-27 plan's critical path, re-verified item by item rather than carried
forward; `regroup/functions/src/callable/subscriptions.ts`, `regroup/functions/src/config.ts`, `regroup/functions/src/util/entitlement.ts`, `regroup/mobile/App.tsx`, `regroup/mobile/babel.config.js`,
`regroup/mobile/firebase/firestore.rules`, `regroup/scripts/deploy-batched.sh`, `regroup/scripts/preflight-billing.js`, the four `firebase.json` files (regroup/, regroup/mobile/, regroup/mobile/firebase/, regroup/web/).

**Could not check:** deployed Firebase config and Secret Manager contents (no access from the
repo); store listing state; and the refund and
account-deletion routes specifically. The operational-readiness area was initially published as
unverified because its subagent had not returned; it reported afterwards and its findings on
Storage scoping, error visibility and silent cron failure were each re-verified against
`origin/main` before being added as items 1, 6 and 7.

**Corrections made during this run:** an initial reading of the preflight exit code suggested
the deploy gate was inert; that was an artifact of piping to `tail` and is wrong — the gate
exits non-zero correctly. A subagent reported 13 missing deploy functions including
`stripeWebhook`; the real figure is 14, and `stripeWebhook` is a false positive because it
deploys under the name `stripeEvents`, which is listed.

**Withdrawn finding (2026-10-03).** This plan originally ranked first a claim that any signed-up
user could fetch any resident's face photo via `houses/{houseId}/guests/{guestId}/avatar/`, calling
it the one item actively harming users. **That was wrong.** The path is unused: `uploadGuestAvatar`
and `getGuestAvatarDownloadURL` have zero call sites, and the path appears nowhere outside its three
definition lines in `regroup/mobile/src/services/storage.tsx`. Avatars upload to `users/{uid}/avatar`
and that URL is copied onto `guest.avatar`. I had cited `regroup/mobile/src/services/users.tsx:233`
as minting the guest URL; it mints the user one.

The method failure is worth recording, because it was avoidable: I verified that the _rule_ was open
but never that the _path was in use_. A single `git grep` for call sites — which I ran for other
findings in this same review — would have caught it. An adversarial review of this document found it;
treat "is this code path reachable?" as part of verifying any severity claim, not an optimisation.
