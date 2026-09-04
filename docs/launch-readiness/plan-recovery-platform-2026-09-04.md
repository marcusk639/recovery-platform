---
generated: 2026-09-04
target: recovery-platform (all products)
bar: first paying customer
method: 6 parallel evidence scans + live infrastructure verification
---

# Launch Readiness Plan — recovery-platform

**Targets resolved:** homegroups/{mobile,web,functions}, regroup/{mobile,web,functions},
detox-recovery, recovery-api, plus the cross-product referral layer.

## Verdict

Neither revenue product can take a real payment today, and for each the reason is specific,
identified, and mostly not code. **Homegroups' deployed production checkout serves a Stripe
test-mode publishable key** — confirmed by fetching the live bundle, not by reading a doc — so
a real card cannot be charged through the primary claim-and-subscribe path. **Regroup hardcodes
a 30-day trial on every tier subscription**, so by design no card is charged at signup at all.
Cloud Logging shows zero invocations of any homegroups Stripe callable in 90 days: this funnel
has never run end to end in production.

The payment *logic* in both products is in better shape than the documentation suggests. Most
of what the docs still list as blockers is already fixed. The real work is configuration,
console state, and two missing Firestore indexes — plus one product decision about the trial
that determines what "launch" even means for regroup.

## Critical path

Ordered by dependency. Nothing below item 1 is worth doing until item 1 is answered.

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 1 | Resolve billing-account anomaly | OPS | `gcloud billing accounts describe 017B81-3A1509-49961A` → `open: false`, yet `createGroupSubscription` is `state: ACTIVE` (updated 2026-09-01) with live invocations today | Everything, if real | Minutes — Console check |
| 2 | Confirm `STRIPE_SECRET_KEY` mode (live vs test) in Secret Manager | OPS | Could not be read from repo; secret metadata read was blocked | Whether fixing the web key alone suffices | Minutes |
| 3 | Set live publishable key, rebuild + redeploy homegroups web | OPS | Live bundle `static/js/main.bf937b3a.js` contains `pk_test_51RJRFsRoJe1udy4OjF4`, no `pk_live_` | Entire web claim/subscribe flow (`homegroups/web/src/pages/SubscribePage.js`) | Hours |
| 4 | Add `intergroups` composite index and deploy | ENG | Query `homegroups/functions/src/callable/createIntergroup.ts:112-118` needs `createdBy` + `subscriptionStatus` + `createdAt`; absent from `firestore.indexes.json` **and** from live `firebase firestore:indexes` | 100% of intergroup tier A/B and treatment-center checkout — throws before Stripe is reached | Minutes + deploy |
| 5 | Add `documents` composite index (regroup) | ENG | `regroup/mobile/src/services/documents.ts:154-163` — `houseId`[+`guestId`] equality + `createdAt` DESC; zero `documents` entries in `regroup/mobile/firebase/firestore.indexes.json` | `listDocuments` — guaranteed `FAILED_PRECONDITION` on first production use | Minutes + deploy |
| 6 | Decide: is `trial_period_days: 30` intentional? | PRODUCT | `regroup/functions/src/api/stripe.ts:127` | Defines regroup's launch bar; see Risks #1 | Decision, then hours |
| 7 | Reconcile the two conflicting "live" price-ID sets | OPS | `regroup/scripts/stripe-prices.env:15-20` (`price_1TkbS…`, labelled live) vs `regroup/scripts/stripe-product-values.md` §1 (`price_1TnBm…`, labelled **TEST**) — same env-var names | Whether regroup checkout resolves a real price or 500s at call time | Minutes |
| 8 | Add live-key branch to homegroups mobile Stripe init | ENG | `homegroups/mobile/App.tsx:472` — `process.env.STRIPE_TEST_PUBLISHABLE_KEY ?? ''`, no live branch, unlike the backend's `isTestMode` pattern in `functions/src/utils/stripe.ts` | Native create-group-and-pay (`CreateGroupScreen.tsx`). Does **not** affect claim-existing-group, which uses the web view | Hours + store resubmit |
| 9 | Wire backend error tracking | ENG | No Sentry/equivalent in any functions package or any web frontend; only the two mobile apps report | You will not know when a paying customer's payment fails | Hours |
| 10 | Fix homegroups Release APNs entitlement | ENG | `ios/RecoveryConnect/RecoveryConnectRelease.entitlements:5-6` — `aps-environment = development` | Production push; possible App Store flag | Small |

## Already done — stop treating these as blockers

Each was found stated-as-open in a committed doc and verified resolved in code.

| Claimed blocker | Reality | Evidence |
|---|---|---|
| Invite-code region mismatch | **Fixed** | Neither `joinGroupByInviteCode.ts` nor `sendGroupInviteEmail.ts` declares a region; client uses default `us-central1`. Regression tests exist for both |
| "No default price throws silently" | **Guarded** | `functions/src/utils/stripe.ts:167-221` checks env fallbacks, then throws a caught, clear `HttpsError` |
| regroup: no webhook-driven status changes | **False** | `customer.subscription.updated` and `.deleted` both handled, `webhooks/stripeWebhook.ts:1111-1121` |
| regroup web `pk_live_` "LAUNCH BLOCKER (C2)" | **Stale comment** | Real live key already set, `environment.prod.ts:7` |
| regroup: Stripe API version unset | **False** | Pinned `2026-01-28.clover`, enforced by `preflight-billing.js:132` |
| regroup: no `functions/.env.example` | **False** | Exists, 4.6 KB, fully documented |
| homegroups Hosting not started (`HG-P0-9`) | **Live** | `curl` returns 200 on production URL |
| regroup iOS bundle-id mismatch | **False alarm** | Test-target ids differ normally and never ship |
| `group_conscience_votes` missing index | **Committed** | Exact match in `homegroups/firestore.indexes.json` |

Docs still asserting otherwise: `docs/go-to-market/project-management.md` (last verified 2026-06-10),
`regroup/functions/CLAUDE.md`, `regroup/docs/technical/gap-analysis-production-readiness.md` (Dec-2025, stale wholesale).

## Risks to a real customer

| Risk | Severity | Concrete failure |
|---|---|---|
| 30-day trial masks a bad card | High | Card is attached but never charged. An expired or declined card is invisible for a month while the operator has full access; churn and failed-payment recovery both start 30 days late |
| Test-mode key in production | High | A real card submitted on `/subscribe` today is rejected outright, or worse silently processes as test — customer believes they paid |
| `createIntergroup` index missing | High | Every intergroup and treatment-center signup throws `FAILED_PRECONDITION` before Stripe is reached — 100% failure, not intermittent |
| No backend error visibility | High | A webhook throws mid-checkout; nobody is alerted until a customer complains |
| Support email cross-branded | Medium | Homegroups ToS/Privacy/Contact all list `admin@regroup-app.com` (4 files) — a stuck Homegroups customer emails a differently-branded inbox |
| Rate limiting near-absent | Medium | 2 of 91 homegroups callables limited; regroup has none. Abuse drives cost or enables harassment in a vulnerable-user product |
| Backups with no restore | Medium | `scheduledGroupBackups.ts` writes monthly JSON; no restore code exists anywhere |
| regroup iOS may not compile | Medium | RN 0.72 + `react-native-screens` 4.0.0 + Navigation v7, no shim patches, no CI iOS build — the exact combination homegroups had to downgrade away from |

## Deferred — real work, not launch-blocking

- **300-line violations (~258, of which 222 are in the two mobile apps).** Already a documented, deliberately ratcheted debt. Blocks nothing.
- **`regroup/web` test runner.** `angular.json` references a `karma.conf.js` that has never existed in git history, and there is no CI job. Genuinely broken, but it gates no payment path.
- **`createReferral` has zero call sites.** `recovery-api/src/callable/referrals.ts:97` is built and unused by either product. Strategically significant — it is the platform's whole integration thesis — but it cannot block a first payment.
- **Analytics instrumentation.** Homegroups fires 3 events (all on the subscription screen), regroup fires 1 (`signin`). Not launch-blocking, but see Open Questions: without it you cannot distinguish a funnel problem from a demand problem after launch.
- **Unbounded fan-out** in `scheduledInstanceGenerator.ts` — scales with group count; its sibling `scheduledGroupBackups.ts` already batches correctly. Fix before growth, not before launch.

## Open questions

The repo holds no user research, pricing validation, funnel, or retention data. Everything
below requires a human or a console, and no answer was invented.

1. **Is the billing account genuinely closed?** (decides: emergency escalation vs no action)
2. **Is `STRIPE_SECRET_KEY` live-mode?** (decides: whether item 3 alone unblocks payment)
3. **Which price-ID set is actually deployed for regroup?** (decides: whether checkout resolves a real price)
4. **Is the 30-day trial intentional?** (decides: whether "first live charge" is even regroup's correct launch criterion, or whether it should be "trial→first-invoice succeeds")
5. **Are `STRIPE_PRICE_ID_INTERGROUP_A/B` bound in Secret Manager?** (decides: intergroup checkout status)
6. **Is `com.rats.dev` the registered production bundle id for regroup?** (decides: submit as-is vs re-register, which cascades to AASA/entitlements/provisioning)
7. **Which of the two conflicting AASA team IDs is correct** — `KQSSHWK7V7` vs `D8K3FS4HAX`? (decides: how regroup Universal Links get wired)
8. **Is `minSdkVersion 34` deliberate?** (decides: whether to lower before Play launch — it currently excludes all pre-Android-14 devices)
9. **Does regroup's iOS app build at all?** (decides: whether an iOS spike is needed before any upload attempt)
10. **What price should any of this be?** No pricing validation exists in the repo. Unanswerable here.

## How this was verified

Six parallel scans: homegroups money path, regroup money path, onboarding/retention, deploy and
config drift, store and distribution, operational readiness. Findings cite file paths and line
numbers throughout.

Beyond static analysis, the homegroups money-path scan verified live state directly — fetching
the deployed production JS bundle, querying Cloud Logging for 90 days of callable invocations,
and listing live Firestore indexes. That is how the test-key and never-invoked findings were
established as fact rather than inference.

**Not checked:** Stripe Dashboard state, Secret Manager values, App Store Connect and Play
Console listings, Firebase Console alerting configuration, and custom-domain bindings. All are
console-side and appear above as Open Questions rather than assumptions.
