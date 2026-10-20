# Claim ledger — regroup + recovery-api — 2026-10-19

**Plan:** [plan-regroup-recovery-api-2026-10-19.md](plan-regroup-recovery-api-2026-10-19.md)
**Code base:** `origin/main` at `f5bef2c`
**Totals:** 148 claims: 37 IMPLEMENTED · 23 PARTIAL · 12 MISSING · 16 CONTRADICTED · 25 STALE-DOC · 30 UNVERIFIABLE-HERE · 5 not re-checked. There are another 23 reverse-pass findings (REV-M1–M9, REV-A1–A14).

The per-document tables below are agent output at L1 (static read). Where the main session re-verified a row, the table in the next section takes precedence over the agent's verdict.

## Main-session verification (overrides agent rows)

| ID | Claim or finding | Verdict | Level | Evidence |
| --- | --- | --- | --- | --- |
| REV-A3 | A new operator can create a house in the setup wizard | MISSING (the rules deny it) | L3 | Emulator probe: context `{potentialSuperAdmin:true}` batch-writing `houses/h1` + `admins/a1` → PERMISSION_DENIED. Rules `firestore.rules:196,130`; deployed rules :188-190 are the same. The only creation path is `initializeHouses` (`mobile/src/services/setup-wizard.ts:239-243`). `superAdminClaim.ts:6-9` defers the house grant to a "future `createHouse` callable" that doesn't exist. |
| FDM-1 | A resident's `logActivity` updates their week summary | CONTRADICTED | L3 | Emulator: context `{guest:{h2:true}}` writing `week-summaries/*` → PERMISSION_DENIED. Rule `firestore.rules:437` (deployed :429) is admin-only. The client transaction is at `mobile/src/services/activity.ts:438-482`, and the error rethrows at `:113-115`. |
| REV-A1 | Invitation signup completes | CONTRADICTED | L1 (main) | `SignUpForm.tsx:154-156` sends `ownerUserId: invitation.ownerId`. `native-deep-links.ts:107` sets `ownerId: ''`. Schema `min(1)` at `callable/subscriptions.ts:127,133`; uid check at `:454`. |
| REV-M1 | A subscription lapse restricts the operator's houses | CONTRADICTED | L1 (main) | `stripeWebhook.ts:231-258` queries by uid, but houses store Admin doc IDs (`setup-wizard.ts:160,184-185`). |
| REV-M2 | The autopay toggle charges residents | MISSING | L1 (main) | Nothing writes `guests.stripeCustomerId`. `RentPaymentScreen.tsx:243-249`. |
| REV-A2 | Account deletion exists | MISSING | L1 (main) | Grep across mobile, web and functions. Only an orphan cleanup at `web/.../auth-service.service.ts:255`. |
| RLR-1 / annual | Live annual prices are configured | CONTRADICTED | L5 | All six deployed `*_ANNUAL` IDs are test-mode. `price_1TnBmGKsstp3aqoPHD06jOuG` in live mode returns "No such price … exists in test mode". |
| DEP | `main` is deployed | CONTRADICTED | L5 | 55 functions, last deployed 2026-10-13. The rules release lacks the #96 and #98 changes (14 lines differ). The `ees-records` index is not deployed. |
| FLAG | `TIER_BILLING_ENABLED` is on in production | IMPLEMENTED | L5 | Deployed env is `true`. `CONNECT_ACCOUNTS_API` is unset, which means v1. |
| AGP | The Android build uses a supported AGP | IMPLEMENTED (not built) | L1 | `mobile/android/build.gradle:52` sets `agpVersion = "8.1.1"`. |
| WEB-BUILD | The web build has no `copy:hosting` failure | IMPLEMENTED (not built) | L1 | `web/package.json:14` |
| RENT-JOB | The rent job fails loudly | IMPLEMENTED | L1 | `scheduledRentCollection.ts:338-342` rethrows. |
| ERRB | Mobile crashes reach Sentry | PARTIAL | L1 | `Sentry.init` is at `App.tsx:34`, but `components/ErrorBoundary.tsx:27` only logs to the console. |
| DEPLOY-SCRIPT | `deploy:batched` deploys every function | CONTRADICTED | L1 | `scripts/deploy-batched.sh` hardcodes its list, includes the dead `sendInviteEmails` (`:19`), and has `\|\| echo` (`:40`). |


## Agent ledger — Launch-readiness, operations and billing docs

#### Claim ledger (L1 static, worktree wt-lr2 @ origin/main f5bef2c). Budget-limited: evidence is from targeted reads/greps. Rows marked (not re-checked) were not examined in depth. I did NOT verify deployed state, Stripe/Secret Manager contents, or the contents of untracked `.env*` files. In this report, "src" = regroup/functions/src.

Abbreviations: W = worktree root. Doc paths are relative to W.

##### Verified code facts that drive many rows
- Autopay now routes to the house. `src/scheduled/rentDestination.ts:32-54` reads `house.stripeAccountId` and requires `stripeStatus==='active'`. `src/scheduled/scheduledRentCollection.ts:176-216` skips the charge if there is no destination, and `:266` sets `transfer_data.destination`. The `guest.stripeConnectId` read is gone (no match in non-test src).
- `scheduledRentCollection.ts:338-344` rethrows when charges fail.
- Guests update rule needs admin of both the old and new house: `regroup/mobile/firebase/firestore.rules:161-162`.
- `deploy-batched.sh` is unchanged and still broken. It has a hardcoded `ALL_FUNCTIONS` (`:8`), still lists `sendInviteEmails` (`:19`), and `:40` still has `|| echo "...continuing"`.
- `regroup/firebase.json` has only a `predeploy` preflight (`:3`). No functions `ignore` list is committed.
- The `documents` composite indexes are now committed (`regroup/mobile/firebase/firestore.indexes.json:157,165`).
- `deploy:rules` still excludes indexes (`regroup/mobile/package.json:9`). There is no `deploy:indexes` script.
- Migration scripts exist: `migrate:payment-cents:*` and `migrate:balance-cents:*` (`regroup/functions/package.json:16-19`). Whether they have been run is UNVERIFIABLE-HERE.
- `CONNECT_ACCOUNTS_API` defaults to v1 (`src/config.ts:246`). `TIER_BILLING_ENABLED` is read at `src/config.ts:236`.

##### 1. Per-doc tables

**P1002** (docs/launch-readiness/plan-regroup-2026-10-02.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| P1002-1 | Item 1: Stripe key/metro config resolved | UNVERIFIABLE-HERE | P1002:58,74-108 | I did not re-check `metro.config.js`. The `pk_live_` key in CI is OPS. The fastlane chokepoint was left undecided in the doc. |
| P1002-2 | `deploy-batched.sh` omits 14 functions, lists the dead `sendInviteEmails`, and `\|\| echo` defeats `set -e` | IMPLEMENTED as a defect (still open) | P1002:59 · deploy-batched.sh:8,19,40 | Unchanged. |
| P1002-3 | Billing config lives only in a gitignored local `.env` | UNVERIFIABLE-HERE | P1002:60 | No `.env.phoenix-cleanhouse` is visible in the tree; I did not check the deployed config. |
| P1002-4 | `TIER_BILLING_ENABLED=true` must be set; flag-off creates tier-less subscriptions | PARTIAL | P1002:61 · src/config.ts:236 | The flag is code-gated. Its deployed value is UNVERIFIABLE-HERE. |
| P1002-5 | Production failure visibility: mobile ErrorBoundary only logs | CONTRADICTED (partly stale) | P1002:62 · mobile/App.tsx:34-40, mobile/src/util/logging.ts:1-11, ErrorBoundary.tsx:27 | Sentry is now initialised in `App.tsx` and `logException` calls `Sentry.captureException`. The ErrorBoundary itself still only `console.error`s ("Sentry can be added later"), so a white-screen crash is still not reported. Functions still have no error-reporting dependency. Crashlytics has a classpath at `android/build.gradle:99` but the plugin was not confirmed applied (not re-checked). |
| P1002-6 | `scheduledRentCollection` never rethrows | CONTRADICTED (resolved) | P1002:63 · scheduledRentCollection.ts:338-344 | Fixed in the worktree. Live only after a deploy. |
| P1002-7 | No Firestore index deploy path; indexes uncommitted | PARTIAL | P1002:64 · firestore.indexes.json:157,165 · mobile/package.json:9 | Indexes are now committed. No deploy script covers them (`deploy:rules` is rules and storage only). `regroup/mobile/firebase/firebase.json:4` references the indexes file, so `firebase deploy --only firestore:indexes` would work. |
| P1002-8 | Annual price IDs are TEST mode | UNVERIFIABLE-HERE | P1002:65 | I did not read `regroup/scripts/stripe-prices.env`. |
| P1002-9 | `users/{uid}/avatar` readable by any authenticated user | not re-checked | P1002:66 | Treat as still open. |
| P1002-10 | Android AGP 7.4.2 breaks the debug build | not re-checked | P1002:67 | Treat as still open. |
| P1002-11 | Web `npm run build` fails at `copy:hosting` | not re-checked | P1002:68 | Treat as still open. |
| P1002-R1 | Client paywall bypass: `potentialSuperAdmin` is user-writable | not re-checked | P1002:155 | The guests rule whitelist is fine, but I did not re-read the users rule. |
| P1002-R2 | `regroup/.github/workflows/deploy.yml` is inert | not re-checked | P1002:165 | |
| P1002-Q | Store listing state; refund handling; account deletion | see sections 2 and 4 | | |

**P1019** (docs/launch-readiness/plan-regroup-functions-2026-10-19.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| P1019-1 | Autopay never routes to the house (REV-01), backlog item 1 | CONTRADICTED (resolved by #98) | P1019:33 · rentDestination.ts:32-54 · scheduledRentCollection.ts:204-216,266 | Residual risk below. |
| P1019-2 | Commit a functions `ignore` list (REV-04) | MISSING (still open) | P1019:34 · regroup/firebase.json:1-5 | Only a `predeploy` entry is present. |
| P1019-3 | Deploy all functions via `firebase deploy --only functions`, not batched; nothing since 10-13 is deployed | UNVERIFIABLE-HERE | P1019:35 | Needs gcloud. The `deploy:batched` defect is confirmed. |
| P1019-4 | Run the payments-in-cents migration after the deploy | PARTIAL | P1019:36 · functions/package.json:16-17 | The scripts exist. The run state is UNVERIFIABLE-HERE. |
| P1019-5 | Webhook writes cents (post-#86) | IMPLEMENTED in code | stripeWebhook.ts:331 (`amount: paymentIntent.amount`) | Only correct once deployed. |
| P1019-6 | Deploy rules and indexes | PARTIAL | P1019:37 | The deploy path for indexes is still manual. |
| P1019-7 | Confirm deployed billing config | UNVERIFIABLE-HERE | P1019:43 | |
| P1019-8 | Fix or retire `deploy:batched` | MISSING | P1019:44 · functions/package.json:10 | Still wired as a script. |
| P1019-9 | `deploy:indexes` script | MISSING | P1019:50 | |
| P1019-10 | Scheduled rent fails loudly | IMPLEMENTED | scheduledRentCollection.ts:338-344 | |
| P1019-11 | Two Stripe clients share one API-version source | not re-checked | P1019:63 | Matching files exist (`util/stripeApiVersion.ts`). |
| P1019-12 | Accounts v1 default behind a switch | IMPLEMENTED | src/config.ts:246 · payments.ts:513,587 | |
| P1019-13 | Secrets leak via a `.secret.local` upload | UNVERIFIABLE-HERE | P1019:73 | The missing `ignore` list in `regroup/firebase.json` makes the risk plausible. |

**RLR** (docs/launch-readiness/regroup-launch-readiness.md, dated 2026-06-06)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| RLR-1 | Stripe prices "Not created" (§3.1) | STALE-DOC | RLR:92-99 · P1002:65 | Live monthly IDs were created 2026-06-20/28 per BGL:31. |
| RLR-2 | No full E2E payment cycle ever run (§3.2) | UNVERIFIABLE-HERE | RLR:105 · BGL:62 | The BGL record field is blank. |
| RLR-3 | Billing portal and tier model exist | IMPLEMENTED | P1002:121-130 | The tier model and portal were not re-read. |
| RLR-4 | Crashlytics and Sentry installed | PARTIAL | RLR:71 · mobile/package.json:63,75 · App.tsx:34 | Sentry is initialised. Crashlytics is unconfirmed. Functions and web have none. |
| RLR-5 | Mobile bundle ID `com.rats.dev` is a dev suffix | STALE-DOC | BGL:68 | The decision was confirmed on 2026-07-16 as the production ID. |
| RLR-6 | Webhook covers 10 event types | not re-checked | RLR:59 | |
| RLR-7 | Rent collection and scheduled rent "Complete" | CONTRADICTED at the time of writing, now fixed | RLR:32-33 | Autopay was broken until #98. |

**RCW** (docs/launch-readiness/regroup-critical-work-2026-07-07.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| RCW-1 | CRITICAL: demo credentials hardcoded in the client bundle; Firestore rules do not scope the account | IMPLEMENTED as a defect (still open); the decision is unrecorded | RCW:48-66 · mobile/src/screens/Landing/InitialLandingForm.tsx:76 · mobile/src/util/user.ts:32 | Credentials are still in the bundle. I did not check rule scoping. The demo account's custom claims decide the exposure. |
| RCW-2 | `castOxfordVote` callable; rules deny client vote writes | IMPLEMENTED (callable name per P1002:137) | RCW:25 | |
| RCW-3 | Votes rule allows any guest any field | not re-checked | RCW:106 | |
| RCW-4 | Homegroups Wave 1 commits to confirm | N/A | RCW:70-91 | Not a regroup item. |
| RCW-5 | ~40 `tsc` errors | UNVERIFIABLE-HERE | RCW:114 | Later CI notes mention typecheck baselines. |
| RCW-6 | Dual-officer deactivation, EES capacity mismatch, officer name fallback (HIGH) | not re-checked | RCW:103-105 | |

**BGL** (regroup/docs/launch-readiness/billing-go-live-runbook.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| BGL-1 | Flag off means "silently uses legacy per-house model" | STALE-DOC | BGL:13 · P1002:61 | The legacy capacity path was deleted (`87a835d`). Flag-off creates tier-less subscriptions. |
| BGL-2 | Preflight runs as `functions.predeploy` | IMPLEMENTED | BGL:15 · regroup/firebase.json:3 | |
| BGL-3 | The 15 vars include 3 legacy price IDs | not re-checked | BGL:35 | |
| BGL-4 | Real-money E2E checklist (§RG-P0-2) | UNVERIFIABLE-HERE | BGL:50-62 | Not recorded as done. Still the gating test. |
| BGL-5 | Resident rent lands in the operator's connected account via `createPaymentIntent` | IMPLEMENTED | payments.ts:148,208-231 | |
| BGL-6 | `STRIPE_CONNECT_WEBHOOK_SECRET` is required | PARTIAL | BGL:41 · util/stripeWebhookSecrets.ts | I did not read it. PR64 describes the livemode handling. |
| BGL-7 | Bundle `com.rats.dev` | IMPLEMENTED (decision) | BGL:68 | |
| BGL-8 | "The Stripe API version is hardcoded in `util/stripe.ts` and `scheduledRentCollection.ts`" | STALE-DOC | BGL:35,82 · P1019:63 | There is now a single `util/stripeApiVersion.ts`. |
| BGL-9 | Legacy `regroup-bundle-*` coupons (RG-P1-5) | UNVERIFIABLE-HERE | BGL:84 | Related to `applyBundleDiscount`, a legacy path. |

**PRP** (regroup/docs/launch-readiness/regroup-pricing-revision-plan.md): my grep for status markers returned nothing, and I did not read the file. Not assessed.

**PR64** (regroup/docs/launch-readiness/pr64-fix-report-2026-10-06.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| PR64-1 | BLOCKER 1: a verified event from the wrong Stripe mode (livemode) is guarded | PARTIAL | PR64:64-125 · util/verifyStripeWebhook.ts, stripeWebhookSecrets.ts (livemode matches) | `livemode` is referenced in the util files but NOT in `webhooks/*.ts`. I did not trace the call chain. |
| PR64-2 | Preflight gates (items 3, 4, 8, 9) | IMPLEMENTED (doc-claimed) | PR64:234-340 | Not re-run. |

**ST** (regroup/docs/operations/stripe-testing.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| ST-1 | Scheduled auto-pay is "Same" destination charge (`transfer_data.destination` + fee) | IMPLEMENTED (since #98) | ST:17-18 · scheduledRentCollection.ts:266-270 | P1019 ST-02 is resolved. |
| ST-2 | `payments.amount` "carries two units" (dollars from the webhook); #82 open | STALE-DOC | ST:189-191 · stripeWebhook.ts:331 | The webhook now writes cents. Pre-deploy rows and the unrun migration remain a data issue. |
| ST-3 | `account.application.deauthorized` handled as a legacy safety net | not re-checked | ST:20 | |
| ST-4 | RENT_FEE vars: zeroing the Stripe-cost vars makes collection loss-making | not re-checked | ST:166 | An OPS config item. |

**RCA** (regroup/docs/operations/rent-collection-alerts.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| RCA-1 | The log messages exist ("some payments failed", "reconciliation sweep failed", etc.) | PARTIAL | RCA:15-22 · scheduledRentCollection.ts:88,303 | "reconciliation sweep failed" and "some payments failed" were seen. The rest are not re-checked. |
| RCA-2 | The job goes red only for charge failures | IMPLEMENTED | RCA:3-6 · scheduledRentCollection.ts:338-344 | |
| RCA-3 | The project has no alert policies, log metrics or channels | UNVERIFIABLE-HERE | RCA:8-11 | No alert definitions are under `regroup/` per P1002:62. The gcloud commands in the doc are a template, not evidence of creation. |
| RCA-4 | Alert filter uses `resource.labels.service_name="scheduledrentcollection"` | UNVERIFIABLE-HERE | RCA:37 | |

**MT** (regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| MT-1 | Checklist content | STALE-DOC | MT:1-15 | Superseded by `regroup/docs/go-to-market/project-management.md`. It is now a pointer with no checkable claims. |

**LEGAL**: see section 4.

##### 2. Previous-plan (P1002) items: resolved vs open

**Resolved**
- Item 6 (rent failure visibility): `scheduledRentCollection.ts:338-344` rethrows.
- Item 7 in part: the `documents` indexes are committed (`firestore.indexes.json:157,165`).
- Autopay destination: a new finding in P1019, resolved by #98 (`rentDestination.ts`).
- P1002 "Already done" items such as server-side entitlement, `subscriptionMetadata` scoping and the billing wizard: not re-checked.
- Part of item 5: mobile Sentry is now initialised (`App.tsx:34`, `logging.ts`). The ErrorBoundary gap remains.

**Still open or unverifiable**
- Item 2: `deploy-batched.sh` unchanged.
- Item 3: billing config lives only in a local `.env` (state not re-checked).
- Item 4: deployed `TIER_BILLING_ENABLED` is unverifiable.
- Item 5: ErrorBoundary only logs. Functions and web have no error reporting. Alert policies unverifiable.
- Item 7: no index-deploy script.
- Item 8: annual TEST price IDs unverified.
- Item 9: avatar visibility not re-checked.
- Item 10: Android AGP not re-checked.
- Item 11: web build not re-checked.
- Item 1 residual: the `pk_live_` key in CI.
- Open questions on store listings, support path and refund handling remain open. Refund and dispute reversals are #99, not merged. Account deletion is MISSING in code (section 4).

##### 3. BLOCKER / MUST-FIX candidates for a first paying customer

**BLOCKER**
- The deployed functions predate #86, #93, #94, #96 and #98 (P1019 REV-03), so the money fixes are not live. This is UNVERIFIABLE-HERE and needs a gcloud check. Deploy with `firebase deploy --only functions`, not `deploy:batched`.
- `deploy:batched` omits 14 functions, including `createOperatorSubscription` neighbours (`getTierCatalog`, `createBillingPortalSession`, `createInvitation`, `scheduledRentCollection`) and hard-errors on the dead `sendInviteEmails`, so using it breaks operator subscribe and rent. Confirm against `ALL_FUNCTIONS` at `deploy-batched.sh:8`.
- Payments-in-cents and balance-cents migrations are unrun or unverifiable, and ordering is critical. Running them before the deploy, or with a wrong cutoff, multiplies cents by 100. Scripts: `functions/package.json:16-19`.
- Deployed `TIER_BILLING_ENABLED=true`, the live-mode `STRIPE_PRICE_*` values (including annual) and the `pk_live_` key in the CI build are all UNVERIFIABLE-HERE. Flag-off creates tier-less subscriptions that cannot add houses or residents.
- Live-mode real-money E2E (BGL RG-P0-2) is not recorded as done (`BGL:62` blank). No live-money cycle has been demonstrated.

**MUST-FIX BEFORE LIVE**
- Commit a functions `ignore` list in `regroup/firebase.json` (nothing there now) so `.secret.local` and service-account keys are not uploaded.
- Firestore rules and indexes are not deployed by the standard path (`deploy:rules` excludes indexes, and #96's `stripeAccountApi` rule needs a rules deploy).
- No in-app account deletion exists, which risks App Store review rejection (guideline 5.1.1(v)). See section 4.
- Mobile ErrorBoundary does not report to Sentry or Crashlytics (`ErrorBoundary.tsx:27`).
- Rent alerts are a doc-only template. Nothing under `regroup/` creates the log metric or policy, so the "reconcile" ERROR logs reach nobody.
- Refunds and disputes: #99 (transfer reversals) is unmerged. Without it, a refund or dispute on a destination charge leaves the house holding the funds and the platform out of pocket.
- Demo credentials are embedded in the client bundle (`InitialLandingForm.tsx:76`). Confirm the demo account's claims cannot reach real houses.
- Autopay in live mode: whether any past autopay charge settled in the platform balance (the pre-#98 behaviour) is UNVERIFIABLE-HERE. If it did, those funds need transferring or refunding.
- Webhook livemode guard: confirm the handler paths call the livemode check (`verifyStripeWebhook.ts` and `stripeWebhookSecrets.ts` reference it; the handlers in `webhooks/*.ts` do not). Not traced.

##### 4. Privacy policy (regroup/docs/operations/legal/privacy-policy.md) claims the code contradicts or fails to support

| Claim | Verdict | Evidence |
|---|---|---|
| §2.7 / §4.2: crash reports and error logs via Sentry "no PII in stack traces" | PARTIAL | Sentry is initialised in mobile (`mobile/App.tsx:34-35`). `logException` sends `extra: { message }` (`logging.ts:9`), and the "no PII" claim is not enforced in code. Functions and web have no Sentry. A Crashlytics dependency exists but is not named in the policy. |
| §7 / §6: deletion of your account and personal data | MISSING (in code) | No account-deletion callable, trigger or UI exists (grep in `mobile/src` and `functions/src` found none). Only guest-doc delete in rules (`firestore.rules:175`). The policy says "contact privacy@regroup.app". The App Store account-deletion requirement is separate. |
| §6: application submissions deleted 90 days after decision | MISSING | `scheduled/index.ts` has `updateDisputes`, `weeklyTransfers`, `warmWebsite` and the rent jobs. I saw no retention or purge job. |
| §6: payment records 7 years | UNVERIFIABLE-HERE | Payment docs persist, but this is a policy statement about retention. |
| §6: error logs (Sentry) 90 days | UNVERIFIABLE-HERE | Configured in the Sentry dashboard, not in the repo. |
| §2.7: "App usage analytics" | UNVERIFIABLE-HERE | No analytics SDK found in `mobile/src`, `web/src` or `functions/src`. Potentially a claim for a collection that does not happen. |
| §2.4: "We do not store full payment card numbers"; Stripe holds customer and subscription IDs | IMPLEMENTED | Stripe Elements / `createPaymentMethod`; webhook stores IDs. |
| §4.1 / §5: accountability data visible only to the house operator and authorized admins | IMPLEMENTED (rules) | `guests` read: `isGuest([houseId]) \|\| isAdmin([houseId])` (`firestore.rules:137`). Note `isGuest` lets any guest of the house read guest docs, which are broader than "residents can view their own records". |
| §5: medication data is yes/no only; not PHI | not re-checked | |
| Contact addresses: privacy@regroup.app vs app code `support@regroup-app.com` / `admin@` | CONTRADICTED (doc-level) | P1002:98 showed a banner/source mismatch. Domains are inconsistent (`regroup.app` vs `regroup-app.com`) and should be reconciled. |

TOS (terms-of-service.md): I did not read it. Not assessed.

Key file paths (all under W = ): regroup/functions/src/scheduled/{rentDestination.ts,scheduledRentCollection.ts}, regroup/functions/src/callable/payments.ts, regroup/functions/src/webhooks/stripeWebhook.ts, regroup/mobile/firebase/{firestore.rules,firestore.indexes.json}, regroup/firebase.json, regroup/scripts/deploy-batched.sh, regroup/mobile/{App.tsx,src/components/ErrorBoundary.tsx,src/util/logging.ts}.
## Agent ledger — Product, specs and GTM docs

#### Claim ledger: Regroup docs vs code (L1 static read, worktree wt-lr2)

Method limits: Bash was disabled, so I used Grep/Read only. Rows are code-verified where a line is cited. REQ rows marked (grep) rest on absence of keyword hits and should be re-checked before being quoted as MISSING. I did not read the claim-ledger.md verdict table; I used the six verdicts from your brief.

Doc paths are relative to regroup/docs/. Code paths are relative to regroup/ (functions/src, mobile/src, web/src).

##### Docs that are stubs (no checkable claims)
- product/decisions.md [DEC]: 16-line "superseded" stub. It points to go-to-market/roadmap.md. Verdict STALE-DOC (superseded). Its link `go-to-market/README.md` uses the path `../../../docs/go-to-market/README.md`, which looks broken.
- product/roadmap.md [PRM]: 15-line stub, same status. STALE-DOC.
- monetization/model.md [MODEL]: 15-line stub pointing to go-to-market/monetization.md. STALE-DOC. The pricing and Oxford-economics content is now only in [MON].

##### [SPEC9] product/specs/RG-SPEC-09-compliance-export.md
| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| SPEC9-1 | L3: "shipped: CSV + PDF export (drug tests + attendance + profile)" | IMPLEMENTED (backend only) | SPEC9:3 · functions/src/callable/compliance.ts:362 (`complianceExport`), :252 (pdfkit lazy import) | No mobile or web caller. Grep for `complianceExport` in mobile/src has 0 hits. Web hits are only the TierCatalog type and a spec file. Operators cannot reach it from any UI. |
| SPEC9-2 | L18-29: "Current state: stub, returns coming_soon, no data exported" | STALE-DOC | SPEC9:18-29 · compliance.ts:349-361 (header says "real CSV export") | The doc contradicts its own L3 status line. The stub section is dead text. |
| SPEC9-3 | L22: gate is `tierAllows(...,"complianceExport")` and `upgrade_required` | IMPLEMENTED | compliance.ts:403, :418-433 | Gate is on tier capability, deliberately not on entitlement. A lapsed operator keeps export access (comment at :386-394). |
| SPEC9-4 | L22/L50: auth is house owner or "authorized staff" | PARTIAL | compliance.ts:379 (`superAdminId !== uid`) | Owner only. Admins and managers are denied. |
| SPEC9-5 | L51: "Audit: log who exported what" | PARTIAL | compliance.ts:457 (`logger.info` with ids) | Only a Cloud Logging line. There is no durable audit record. |
| SPEC9-6 | L56-58: export includes infractions and phase history | MISSING | SPEC9:3 "Deferred" · compliance.ts (no infractions or phase) | The status line admits this. The acceptance checkboxes are all unchecked, so the doc is internally inconsistent. |
| SPEC9-7 | L26: tests exist at `__tests__/callable/compliance.test.ts` | IMPLEMENTED | functions/src/__tests__/callable/compliance.test.ts | Not run. |

##### [TRACK] product/specs/RG-TRACK-rent-roi-dashboard.md
| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| TRACK-1 | L3: "`rentRoiMetrics` shipped: gross/net $, refunds, outstanding, overdue, on-time %" | IMPLEMENTED (backend only) | TRACK:3 · callable/analytics.ts:99, tierAllows at :131 | Not read in full; metric fields not individually verified. Spec says "Deferred: UI". Grep finds no mobile or web caller. |
| TRACK-2 | L45-47: gated by `analytics` capability (Professional/Plus+) | IMPLEMENTED | analytics.ts:131 · config.ts:156/203 | |
| TRACK-3 | L26 "Hours saved" metric | MISSING | TRACK:3 "Deferred" | Status line admits it. |
| TRACK-4 | L43: operator dashboard shows the metrics | MISSING | no UI caller | |
| TRACK-5 | L50: "Is a per-charge due date persisted today?" (open question) | UNVERIFIABLE-HERE | not traced | On-time % depends on this; confirm in analytics.ts. |

##### [GTMR] go-to-market/roadmap.md (last_verified 2026-06-10)
| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| RM-1 | Rules restricted (done) | UNVERIFIABLE-HERE | GTMR:44 · mobile/firebase/firestore.rules (guests :136, houses :194, users :360) | Financial fields on houses and guests are client-write-blocked (rules :153, :238). `subscriptionMetadata` is server-owned (:363-382). Looks good. Realtime DB rules not checked. |
| RM-2 | Hardcoded 9.99/19.99 removed (done) | IMPLEMENTED | config.ts:128-226 (no 9.99) | |
| RM-3 | Payment callables exist (done) | IMPLEMENTED | callable/payments.ts:116, :252, :346 | The doc's line anchors (L92/L180/L233) are stale; the real lines differ. |
| RM-4 | "2% Stripe Connect rent fee (done)" | CONTRADICTED / STALE-DOC | GTMR:47 · util/rentFee.ts:64 `computeApplicationFee`, payments.ts:200 | Fee is method-aware (ACH flat, card %, legacy 2%) per [MON] §2. The "2%" row and the "2%" in project-management.md are wrong. |
| RM-5 | `setOxfordEnabled` write path (done) | IMPLEMENTED | callable/oxford.ts:41 | |
| RM-6, RM-7 | Six-tier config; flag, `amountCents`, resolver (done) | IMPLEMENTED | config.ts:128-236, util/tierPricing.ts | `amountCents` values are $69/$129/$249 traditional and $49/$89/$299 Oxford. |
| RM-8 | 6 Stripe Price IDs created (blocked) | UNVERIFIABLE-HERE | `process.env[priceEnvVar]` read at callable/subscriptions.ts:220 | Env and secrets live outside the repo. No `.env*` file in the repo sets `TIER_BILLING_ENABLED`. |
| RM-9 | E2E real-card test (not started) | UNVERIFIABLE-HERE | | Needs a live run. |
| RM-10 | Legacy to tier migration for 5 houses (planned) | UNVERIFIABLE-HERE | scripts present: functions/src/scripts/ (balance and payment cents migrations) | The tier-migration script was not found. |
| RM-11 | iOS bundle `com.rats.dev`, version 0.0.1 (not started) | UNVERIFIABLE-HERE | not re-checked | Check mobile/package.json and the ios project before relying on this. |
| RM-12 | Subscription-webhook seeding: "no writer" (not started) | STALE-DOC / PARTIAL | callable/subscriptions.ts:265 and :322 (`upsertSubscriptionDoc`); stripeWebhook.ts:1513-1523 | The `subscriptions` doc is now seeded at subscribe time, in both flag branches. There is still no `customer.subscription.created` case in the webhook switch. That is acceptable since the doc exists, but `houseId:""`, `currentPeriodEnd:""` and `planId` are always the monthly price (see Blockers). |
| RM-14, RM-15, RM-24 | EES trigger, officer reminders, overdue-rent notification (done) | IMPLEMENTED | triggers/firestore/index.ts:261 `onGuestWrite`; scheduled/officerTermReminder.ts:131; scheduled/overdueRentNotification.ts:71 | The EES line anchor (L189/L223) is stale. |
| RM-17 | Enhanced reporting + PDF/CSV export "planned, export not wired" | CONTRADICTED / STALE-DOC | compliance.ts:252; mobile/src/services/reportExport.ts:115; screens/Payments/PaymentHistory.tsx:19; screens/Profile/GuestHome.tsx:70 | Server compliance CSV/PDF exists. The mobile app has payment-history CSV and weekly-report PDF exports. |
| RM-18 | Charter compliance PDF export (planned) | UNVERIFIABLE-HERE | | Only a generic compliance export was found. |
| RM-13 | Oxford onboarding wizard (planned) | CONTRADICTED / STALE-DOC | mobile/src/screens/Oxford/OxfordOnboardingWizard.tsx; state/mutations/oxfordOnboardingMutations.ts | Built. |
| RM-16 | Oxford `HouseDirectory` (planned) | UNVERIFIABLE-HERE | grep for `HouseDirectory` found nothing | Treat as MISSING pending a check. |
| RM-20 | 2FA: "screen exists; CF status unknown" | PARTIAL | screens/Personal/TwoFactorSetup.tsx:17,31; Personal.tsx:349 | See Blockers/risks: this is phone linking via `signInWithPhoneNumber` + `linkWithCredential`. It is not enforced MFA. No backup codes. No admin enforcement. |
| RM-21, RM-22 | TodayView; push accountability loop (planned) | MISSING (grep) | no `TodayView` hits | Only reminder crons (overdue rent, officer terms) exist. |
| RM-23 | Auto-pay / recurring rent (planned) | CONTRADICTED / STALE-DOC | scheduled/scheduledRentCollection.ts:4,128,328; mobile/src/screens/RentPayment/RentPaymentScreen.tsx:115,243-247 | Built end to end: saved-card toggle, `autoPayEnabled`, a daily 10:00 UTC collector, and reconciliation. It is also tracked as "done" in [PM]. |
| RM-25, RM-26 | Photo verification; advanced analytics (planned) | MISSING (grep) | | `rentRoiMetrics` is a partial backend precursor to RM-26. |
| RM-28 | E-signature not built | IMPLEMENTED (accurate) | grep for esign/signature found nothing in mobile, functions or web | Matches the doc. Document upload and list only: mobile/src/screens/Documents/DocumentListScreen.tsx. |
| RM-29 | Oxford CRUD is client-side + rules (L165-L184) | PARTIAL | callable/oxford.ts:178 `castOxfordVote` is also a callable | The doc says only `setOxfordEnabled` is a CF. Its rules line range is probably stale. |
| RM-19 | Web is "Angular 9, EOL, marketing-only" | PARTIAL | web/src/app/components/accounts/signup, my-account | The web app handles signup, checkout via `createOperatorSubscription` and `getTierCatalog`, and the billing portal (`createBillingPortalSession` at my-account.component.ts:83). "Marketing-only" is wrong. Angular version not re-checked. |

##### [MON] go-to-market/monetization.md
| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| MON-1 | §2: ACH flat $2, card 0.75%, legacy 2% via `computeApplicationFee` in `util/rentFee.ts`, same path for `createPaymentIntent` and scheduled collection | IMPLEMENTED | rentFee.ts:64; payments.ts:200,232; scheduledRentCollection.ts:266-267; config.ts:~100-126 | Constants not individually read. config.ts:75-94 shows the fee also includes an estimated Stripe cost, which the doc table doesn't mention. Check the numbers against config.ts:100-126. |
| MON-2 | §4.2 L242-246: "no TIER_BILLING_ENABLED flag yet, tier objects carry only priceEnvVar, no amountCents" | CONTRADICTED / STALE-DOC | config.ts:133,148,163 (`amountCents`); config.ts:235 (flag) | The roadmap and project-management docs say these shipped on 2026-06-13. MON §4.2 was never updated. |
| MON-3 | §1b L141-145: enforced today = `multiProperty`, `complianceExport` (stub); rest "not yet gated" | PARTIAL / STALE-DOC | subscriptions.ts:550; compliance.ts:403; analytics.ts:131 | `complianceExport` is no longer a stub. `analytics` is also enforced. `automatedRentCollection` is NOT enforced anywhere: grep shows it only in config and type files, so a Starter operator gets autopay anyway. The doc shows Starter as "core only". |
| MON-4 | §1b: annual billing via `annualPriceEnvVar` and `billingInterval`; 30-day trial | IMPLEMENTED (with a defect) | config.ts:132; util/tierPricing.ts:52; api/stripe.ts:132,162 | Defect: subscriptions.ts:220 requires the MONTHLY price env var even for an annual signup, and `planId` at :271 is stored as that monthly price. Trial length not read (TRIAL_PERIOD_DAYS constant at api/stripe.ts:11). |
| MON-5 | P-8: Oxford Network not for sale | IMPLEMENTED | config.ts:216; tierPricing.ts:74-79; subscriptions.ts:211 | |
| MON-6 | §1a: bundle coupons skip tier subscriptions; `applyBundleDiscount` callable | PARTIAL | subscriptions.ts:628 callable exists | Skip-on-tier logic not read. Coupon existence in Stripe is UNVERIFIABLE-HERE. |
| MON-7 | §4.3 D-11: web-only billing, "WebView already wired" | PARTIAL | mobile/src/screens/Subscription/SubscriptionRequiredScreen.tsx:81 ("renew on the Regroup web portal") | Mobile points to the web portal. The doc's "SubscriptionHandler WebView" wasn't found; the screen's button wiring wasn't traced. |
| MON-8 | §4.4: `subscriptions` collection has no writer | CONTRADICTED / STALE-DOC | subscriptions.ts:265,322 | See RM-12. |
| MON-9 | §3 D-9 grandfather: legacy two-item subscriptions untouched when the flag is on | PARTIAL | subscriptions.ts:237 (flag), :284 (legacy path) | By design. But with the flag OFF (the default), every new operator is created on the legacy path regardless of chosen tier. |
| MON-10 | Projections and "value ~$1,400/mo" | UNVERIFIABLE-HERE / skipped | | Market assumptions, not code. |

##### [PM] go-to-market/project-management.md (status claims only)
| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| PM-1 | RG-P0-1 tier-billing code done | IMPLEMENTED | config.ts:235; tierPricing.ts | |
| PM-2 | RG-P0-2 prices not created (blocked); RG-P0-3 no E2E test | UNVERIFIABLE-HERE | | Stripe dashboard and a live run needed. |
| PM-3 | RG-P0-5/6 (D-11, D-12) done | UNVERIFIABLE-HERE | | Decisions, not code. Privacy policy source exists: operations/legal/privacy-policy.md. Public hosting wasn't checked. |
| PM-4 | RG-P0-7 bundle ID `com.rats.dev`, version 0.0.1 | UNVERIFIABLE-HERE | | Not re-checked. |
| PM-5 | RG-P1-1 `.created` handler not started | STALE-DOC / PARTIAL | subscriptions.ts:322 | See RM-12. |
| PM-6 | "2% rent fee" in milestone RG-MS-6 and §intro | CONTRADICTED | rentFee.ts:64 | See RM-4. |
| PM-7 | All P0 security, legal and app-store tasks (key rotation, E2E-account deletion, hosted URLs) | UNVERIFIABLE-HERE | | Outside the repo. |

##### REQ: requirements.md — Regroup coverage (the main output)
The doc is a generic market list (all [n] cites are competitor sites). Nothing in it is a Regroup claim.

| Feature (REQ line) | Verdict | Code |
|---|---|---|
| Resident profiles: intake, emergency contacts, admit/discharge, meds, docs (:5) | PARTIAL | mobile/src/screens/ResidentIntake/IntakeFormScreen.tsx; screens/Contacts/*; GuestMedicationOverview; GuestUpdate/CreateGuest; Documents/DocumentListScreen.tsx. Legal status: no `legalStatus` hit (grep). Documents are upload/list only. |
| Property/bed/room management, occupancy (:6) | IMPLEMENTED | screens/Beds/{Beds,AssignGuest,RoomForm}.tsx; HousesOverview |
| Waitlist (:6) | MISSING (grep) | no `waitlist` hit |
| Simple admissions workflow (:6) | IMPLEMENTED | screens/Application/{ApplyScreen,ApplicationStatusScreen}.tsx; Applications/{List,Detail}; triggers/firestore/index.ts:365 `notifyOperatorOnApplication` |
| House rules, phases/levels, curfew (:7) | IMPLEMENTED | functions/src/util/phase.ts:10-80 (5 phases with curfews); mobile/src/entities/Phase.tsx; screens/SetupWizards/PhaseSetup/* |
| Passes / overnights (:7) | MISSING (grep) | no `overnight` or `pass` hit |
| Privileges tied to compliance (:7) | PARTIAL | components/compliance-indicator/ComplianceBreakdown.tsx; phase config. Enforcement not traced. |
| Chores: assign, track, staff verify (:13) | IMPLEMENTED | HouseChoreOverview/*; GuestChoreOverview; HouseSettings/ChoreRotationSetupScreen.tsx |
| Meeting tracking with GPS verification (:14) | IMPLEMENTED | callable/meetings.ts:92,167 (`findMeetings`, `userIsAtMeeting`); GuestMeetingOverview |
| Curfew check-in compliance tracking (:14) | PARTIAL | curfew exists as phase config; no dedicated check-in feature found (grep) |
| UA/BA drug test logging (:15) | IMPLEMENTED | screens/DrugTesting/{DrugTestForm,DrugTestHistory,DrugTestingScreen}.tsx |
| Infractions and incident log (:15) | MISSING / PARTIAL | no `incident` hit (grep). Complaints/ and Disputes/ screens exist but are complaints and payment disputes. SPEC9:3 itself says infractions are "not in data model". |
| Rent invoices, balances, online payments (:21) | IMPLEMENTED | payments.ts:116,252,346; screens/RentPayment/RentPaymentScreen.tsx; Payments/PaymentHistory.tsx; BalanceDashboard/*; HouseSettings/PaymentDashboard.tsx |
| Receipts (:21) | PARTIAL | webhooks/paymentEmail (spec at __tests__/webhooks/paymentEmail.test.ts); not read |
| Late and missed payment alerts (:21) | IMPLEMENTED | scheduled/overdueRentNotification.ts:71; scheduledRentCollection failure alerting (:344) |
| Auto-pay (implied by :21) | IMPLEMENTED | scheduledRentCollection.ts:328 |
| Dashboards: occupancy, length of stay, infractions, discharges, outcomes (:22) | PARTIAL | screens/AdminReport/AdminReportScreen.tsx; BalanceDashboard; callable/analytics.ts:99 `rentRoiMetrics` (financial only, no UI) |
| E-sign intake packets and agreements (:23) | MISSING | no code (RM-28 agrees) |
| Document storage in resident chart (:23) | PARTIAL | DocumentListScreen.tsx; firestore.rules:476 `/documents` |
| Staff notes and shift logs (:29) | IMPLEMENTED (shift logs not found) | screens/StaffNotes/StaffNotesFeed.tsx; services/staffNotes.ts; state/queries/staffNoteQueries.ts |
| House-wide announcements (:30) | PARTIAL / MISSING | no `announcement` hit (grep). HouseChat and DirectChat screens exist; push via triggers/firestore `notify` (:33). |
| Nice-to-have: mood logs, journaling, goals (:32) | MISSING (grep) | not found |

Regroup features that are not in REQ: Oxford governance (officers, voting, EES, onboarding wizard), Stripe Connect payouts, tiered operator subscriptions, 2FA phone linking, HouseSearch, and guest import.

##### First-paying-customer blocker / must-fix candidates
(operator subscribes → resident pays rent → money lands in the right account)

1. BLOCKER (config, unverified): `TIER_BILLING_ENABLED` is not set anywhere in the repo. With it off, the new-operator path (subscriptions.ts:284-340) creates the LEGACY two-item per-house plan even though `data.tier` is stored in metadata and entitlements are computed from it. The operator would be billed the legacy amount while shown a tier. Confirm the deployed env, the six `STRIPE_PRICE_*` secrets, and the `_ANNUAL` secrets. RM-8/9 say the prices and the real-card E2E test are still undone.
2. MUST-FIX: annual signups (subscriptions.ts:220,271) fail if the MONTHLY price env var is unset. `subscriptionDoc.planId` is also recorded as the monthly price for annual subscribers.
3. MUST-FIX (money): no enforcement of `automatedRentCollection`. The tier ladder (Starter = core only) is not applied to autopay. Decide whether that's intended and align the docs.
4. Verify before launch (money): `createPaymentIntent` binds guest to house (payments.ts:164-177) and sets `transfer_data.destination` to the house account (:231). The destination check uses `house.stripeStatus === "active"` at :148. Autopay uses a separate destination resolver (scheduled/rentDestination.ts). Confirm both resolve to the same Connect account and that Accounts v1 vs v2 (`CONNECT_ACCOUNTS_API`, config.ts:245) is set to match Stripe's enablement.
5. MUST-FIX (security/auth): `TwoFactorSetup.tsx` calls `auth().signInWithPhoneNumber()` (:17) and then `linkWithCredential` (:31). Calling `signInWithPhoneNumber` while signed in as an operator can replace the current session with a phone-only user. It is not a true second factor, so the "2FA enabled" alert is misleading. Hide the screen or fix it before a paying operator uses it.
6. Product gap: compliance export and ROI metrics have no UI. If compliance export is being sold as the Professional-tier differentiator, a paying operator cannot reach it.
7. Webhook coverage: no `customer.subscription.created` handler (stripeWebhook.ts:1513-1523). Mitigated because the doc is seeded at subscribe time with `houseId:""` and `currentPeriodEnd:""`. Verify that `invoice.payment_failed`, `subscription.updated/deleted` correctly resolve the operator uid when `houseId` is empty (handlers log "could not resolve operator uid" at stripeWebhook.ts:990, 1065).
8. Launch-track items (outside the repo, UNVERIFIABLE-HERE): iOS bundle id `com.rats.dev` and version 0.0.1, hosted privacy policy and terms URLs, service-account key rotation, and deleting E2E test accounts from production.

##### Docs I judge stale overall
- STALE (superseded stubs): product/decisions.md, product/roadmap.md, monetization/model.md. Check that `go-to-market/README.md` and the `_shared/pricing.md` and `_shared/decisions-log.md` links resolve. The relative paths in these docs (`../../../docs/go-to-market/...`) look broken.
- STALE in parts: go-to-market/roadmap.md (RM-4 fee, RM-12, RM-13, RM-17, RM-23, RM-19; line anchors drifted); go-to-market/monetization.md (§1b, §2 coverage OK but §4.2 and §4.4 wrong, "Phase-5 stub" language); go-to-market/project-management.md (the "2%" fee, P1-1); RG-SPEC-09 ("Current state: stub" section contradicts its own status line).
- Not a Regroup spec: product/requirements.md. Do not use it as a claim source.
- Reasonably accurate: RG-TRACK-rent-roi-dashboard.md (status line matches code; the only gap is the UI the doc already marks as deferred).
## Agent ledger — Technical docs

#### Regroup claim ledger (L1 static read, worktree wt-lr2 at f5bef2c)

Paths are relative to the worktree root. `rules` means `regroup/mobile/firebase/firestore.rules`.

**Coverage.** I fully or mostly covered ARCH, FDM, `regroup/functions/CLAUDE.md`, GAP headings, DEV and E2E status headers. I only sampled the PLAN docs, and I did NOT audit PERF, WEB, `regroup/web/CLAUDE.md`, `regroup/mobile/CLAUDE.md` or `regroup/CLAUDE.md` (ran out of time). Treat those as UNVERIFIABLE-HERE, not as passing.

##### (1) Tables

**[FDM] firestore-data-model.md**

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| FDM-1 | week-summaries "write: admin only" (FDM:305-309) AND client `updateWeekSummary` upserts it (FDM:311-323) | CONTRADICTED (doc vs doc, and rules vs client code) | rules:435-438 `allow write: if isAdmin(...)` · `mobile/src/services/activity.ts:94-105` (logActivity calls `incrementWeekSummaryForActivity`), `:438-482` (`tx.set` on `week-summaries`), `:582-585` | A resident logging an activity would hit permission-denied on the summary write. See BLOCKER 1. |
| FDM-2 | `houses` "read: signed in" (FDM:135-137) | CONTRADICTED | rules:195 `read: if isGuestOrAdmin([houseId])` | Doc is wrong. This matters for house search and invite flows. |
| FDM-3 | `admins` "read requires signed in" (FDM:103) | CONTRADICTED | rules:128 `isAdmin(houseIds) \|\| isSameUser(adminId)` | |
| FDM-4 | `users` read/write same user only | IMPLEMENTED | rules:360-384 | |
| FDM-5 | `guests` read/create/delete rules | PARTIAL | rules:136-175 | Matches in outline. Update has extra conditions (rules:161) that the doc omits. |
| FDM-6 | `activities` rules: create by loggedBy or admin, update by loggedBy or admin, delete admin only | IMPLEMENTED (plus undocumented restriction) | rules:420-432 | Residents cannot change `verified`/`verifiedBy`. Not in doc. |
| FDM-7 | Custom claims are maps keyed by houseId | IMPLEMENTED | rules:38-56 (`.keys().hasAny`) | |
| FDM-8 | Collection coverage | PARTIAL | Missing from FDM: `guest-weeks` (rules:182, `functions/src/api/firestore.ts:16`), `payments` (rules:305), `rent-collection-attempts` (`functions/src/api/firestore.ts:31`, `stripeWebhook.ts:468`), `subscriptions`, `ees-records`, `drug-tests`, `documents`, `complaints`, `issues`, `invitations`, `webhookEvents`, `paywall` | Doc covers 7 of roughly 25 collections. |
| FDM-9 | Guest money field not documented | STALE-DOC | `functions/CLAUDE.md:119` says `guests.rentOwed` is integer cents. `firestore.indexes.json:128` uses `rentOwed`. `functions/src/scripts/migrateBalanceToCents.ts` exists. | FDM never mentions `rentOwed` or `balance`. |

**[ARCH] architecture.md**

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| ARCH-1 | `week-summaries`: client writes "--", Cloud Function "Scheduled aggregation" (ARCH:476) | CONTRADICTED | `activity.ts:438-482`; no scheduled function writes it (`scheduled/index.ts` only has `updateDisputes`, `weeklyTransfers`, `warmWebsite`) | `util/guest.ts:84` touches it only during the weekly transfer. |
| ARCH-2 | Callables `addNewHouseAdmin`, `searchForHouses` (ARCH:273-278) | MISSING | No `callable/houses.ts`; not exported in `functions/src/index.ts:7-50` | |
| ARCH-3 | `narcoticsAnonymousMeetings`, `getCurrentAddress` (ARCH:286-287) | MISSING | `callable/meetings.ts` exports only `findMeetings` and `userIsAtMeeting` | Consistent with the Feb meetings refactor and the move to recovery-api. |
| ARCH-4 | `savePaymentMethod`, `sendInviteEmails` | MISSING | `callable/payments.ts` has `getPaymentMethod`, `updatePaymentInfo`; invitations moved to `callable/invitations.ts` | |
| ARCH-5 | RTDB trigger `dmNotification` (ARCH:328-332) | MISSING | No `onValueCreated` anywhere in `functions/src`; `functions/CLAUDE.md` lists a `triggers/rtdb/` dir but only `triggers/firestore/` exists | rules:440 treats `direct-messages` as a Firestore path, not RTDB. |
| ARCH-6 | Triggers `addDeleteGuestAuthorization`, `eesRecalculationOnGuestWrite` | STALE-DOC | Merged into `onGuestWrite`, `triggers/firestore/index.ts:261` (claims cleanup on delete at `:270-293`) | Behaviour is preserved. |
| ARCH-7 | Five `scheduledWeeklyTransfer{EST,CST,MST,PST,Fallback}` at `0 0 * * 0` local time (ARCH:339-343) | CONTRADICTED | `scheduled/index.ts:82-83` single `weeklyTransfers` at `0 8 * * 0` UTC, looping timezones | `functions/CLAUDE.md` is correct here. |
| ARCH-8 | Undocumented functions | STALE-DOC | `scheduledRentCollection`, `overdueRentNotification`, `rentRoiMetrics`, `complianceExport`, `getTierCatalog`, `applyBundleDiscount`, `createBillingPortalSession`, `setOxfordEnabled`, `castOxfordVote`, invitation trio, `notifyOperatorOnApplication`, `setHouseSubscriptionStatusOnCreate` | The rent-collection scheduler is the money path and is absent from ARCH. |
| ARCH-9 | Stripe Connect callables (v1 default, v2 switch) | PARTIAL | Functions exist at `callable/payments.ts` (`connectStripeAccount`, `disconnectStripeAccount`, `getStripeAccountStatus`); v1/v2 behaviour not read | Matches commit a1e6894. The v1/v2 switch is UNVERIFIABLE-HERE at depth. |
| ARCH-10 | Notification and email triggers (`notify`, `notifyNewHouseCreated`, `sendContactEmail`, `sendSubscriptionUpdateEmail`, `reportBug`, `submitFeedback`) | IMPLEMENTED | `triggers/firestore/index.ts:33,51,132,162,195,223` | |
| ARCH-11 | Mobile callables referenced by the app | IMPLEMENTED | Every `httpsCallable` name in `mobile/src` resolves to an existing export (`createPaymentIntent`, `listPayments`, `listHousePayments`, `castOxfordVote`, `updateSubscriptionGuests/Houses`, `applyBundleDiscount`, `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `deleteAdminAuthorization`, invitations, `givePotentialSuperAdminPrivilege`, `addAdminAuthorization`, `addGuestAuthorization`, `userIsAtMeeting`, Stripe trio) | Good news: no client call to a missing function in the files I scanned. |
| ARCH-12 | Index list (ARCH:485-502), `organizations/` collection, `EnhancedAuthService` rate limiting (ARCH:204) | UNVERIFIABLE-HERE | `week-summaries` index exists at `firestore.indexes.json:59`. A rate-limit grep hit only `SimpleValidationService.ts` and `users.tsx`. | The other two claims were not confirmed. |

**[CLAUDE] regroup/functions/CLAUDE.md**

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| CL-1 | Server-side entitlement gate on `castOxfordVote`, `setOxfordEnabled`, `createInvitation`, claim grants | IMPLEMENTED | `oxford.ts:67,202` · `invitations.ts:116` · `authGuard.ts:88` | |
| CL-2 | `createPaymentIntent`, revocations, reads, billing escape hatches deliberately NOT gated | IMPLEMENTED | `payments.ts:197,570` and `analytics.ts:122` carry "Do not add enforceHouseEntitlement" comments; `compliance.ts:394` and `meetings.ts:91,166` do too | |
| CL-3 | Phase A: absent `subscriptionStatus` is granted | UNVERIFIABLE-HERE | `entitlement.ts:152` exists; the branch was not read | Launch decision, see item 4 below. |
| CL-4 | Paywall kill switch has no rules block, so the mobile read is denied and the app fails closed | IMPLEMENTED | No `match /paywall` in rules · `mobile/src/hooks/useSubscriptionGate.ts:45,55` | The client-side bypass can never fire. Harmless but dead. |
| CL-5 | `weeklyTransfers` Sundays 8am UTC | IMPLEMENTED | `scheduled/index.ts:83` | |
| CL-6 | Index deploy gap: `deploy:rules` is rules and storage only | IMPLEMENTED (accurate warning, still open) | `mobile/package.json:9-10` · `firestore.indexes.json:128` now uses `rentOwed` | No script deploys indexes. |
| CL-7 | `auth.ts` is "login helpers, token refresh" | STALE-DOC | `callable/auth.ts` exports claims callables only | |
| CL-8 | `subscriptions.ts` includes Connect account management | STALE-DOC | Connect functions are in `callable/payments.ts` | |
| CL-9 | Dir `triggers/rtdb/` | STALE-DOC | Not present | |
| CL-10 | Two Stripe clients with different version sources | UNVERIFIABLE-HERE | Not read | |

**[GAP] gap-analysis-production-readiness.md** (self-labelled Dec 2025 snapshot)

| ID | Claim | Verdict | Evidence | Note |
|---|---|---|---|---|
| GAP-1 | Payment system "Operator billing only 30%"; resident payment collection MISSING (GAP:58-98, 236-242) | STALE-DOC | `createPaymentIntent`, `listPayments`, `stripeWebhook.ts:295,522`, `scheduledRentCollection.ts:328`, `overdueRentNotification` | |
| GAP-2 | Oxford "Not started 0%" (GAP:529-540) | STALE-DOC | `callable/oxford.ts`, rules for officers, votes and business-meetings (rules:245-271) | |
| GAP-3 | CSV and compliance reports MISSING (GAP:262-269) | PARTIAL | `callable/compliance.ts` `complianceExport` (CSV, tier-gated); `rentRoiMetrics` | PDF export and scheduled reports are not evidenced. |
| GAP-4 | Hardcoded live Stripe key (GAP:586) | UNVERIFIABLE-HERE | A grep for `sk_live_` or `sk_test_` found only `functions/src/scripts/migrateHouseSubscriptionStatus.ts` plus two tests, so no hit in app code | Inspect the script to confirm it is a placeholder or pattern, not a real key. |
| GAP-5 | No 2FA (GAP:605) | Still open | No `multiFactor` or `enrollMfa` in `mobile/src` or `functions/src` | |
| GAP-6 | No rate limiting or App Check (GAP:620) | Still open | No `enforceAppCheck` or rate-limit hit in functions | Only client-side validation helpers exist. |
| GAP-7 | Test coverage "near zero 5%" | STALE-DOC | Large `__tests__` suites exist; `test:rules` and `test:integration` scripts (`mobile/package.json:40-41`) | |
| GAP-8 | Announcements, staff notes and shift logs, document upload UI, invoice entity | UNVERIFIABLE-HERE | Not checked. Rules do have `documents` (rules:476). | |

Genuinely open from GAP, as far as I verified: MFA, App Check and rate limiting, Storage-backed document UX (unverified), PDF and scheduled reports, offline support (not verified).

**[DEV] development.md** has a single unchecked item (`- [ ] Firebase emulator setup`, DEV:9). Its ports match the root CLAUDE.md (Firestore 8080, Functions 5001, Auth 9099). Verdict: STALE-DOC/thin. I made no other checkable claims from it.

**[E2E] mobile/e2e/*.md** (14 files, all Feb 2026)
- The status claims contradict each other:
  - Blocked: `E2E_TESTING_BLOCKERS` (Feb 5), `E2E_TESTING_STATUS` (Feb 5), `E2E_XCODE_ISSUE` (Feb 6).
  - "95% complete": `E2E_FINAL_STATUS` (Feb 6).
  - "0/7 passing": `E2E_FIRST_RUN_ISSUES` (Feb 15).
  - "Complete / Ready for production use": `E2E_IMPLEMENTATION_SUMMARY` (Feb 13) and `E2E_TEST_COVERAGE_REPORT`.
  - "Ready for Execution": `E2E_SOLUTION_COMPLETE` (Feb 15).
- Detox is the runner (`mobile/package.json:28-39`, `test:e2e:*`).
- Whether any suite passes today is UNVERIFIABLE-HERE (L1 only). None of these docs can be trusted as a pass/fail statement.

**[PLAN]**
- `plans/functions/2026-02-23-meetings-refactor-*` and `unit-test-suites-*`: the code is consistent with the meetings refactor (`meetings.ts` slimmed to 2 callables), but I did not check the plan's task list. UNVERIFIABLE-HERE.
- `superpowers/plans/2026-06-06-regroup-tier-billing-migration.md`: 68 checklist or status lines, not read. The tier code exists (`getTierCatalog`, `tierAllows`, `createOperatorSubscription`), but I could not confirm each "done" item.

##### (2) Data-model mismatches
1. `week-summaries` has one writer by code (the resident's client, `activity.ts:438-585`) but the rules allow admin writes only (rules:437). ARCH says a scheduled Cloud Function writes it and FDM says both, so docs and rules disagree with the code.
2. `guest-weeks` is a live legacy collection (rules:182, `functions/src/api/firestore.ts:16`, migration script) that no doc covers. `util/house.ts:86` and `util/guest.ts:84` read `week-summaries` via `guest.currentWeekId`, a field FDM never lists. I did not trace its writer.
3. `rentOwed` (cents) is used in the index (`firestore.indexes.json:128`) and by `functions/CLAUDE.md`, but FDM omits it. `payments.amount` is stored in dollars while `rentOwed` and `refundedAmountCents` are cents (`functions/CLAUDE.md:118-123`). This unit split invites bugs on money paths. Per CL-6, the earlier `balance` to `rentOwed` rename broke an index.
4. `direct-messages` is documented as RTDB, but rules:440 gives it a Firestore rule. There is no trigger for it either way.
5. Read-never-written and write-never-read checks beyond these were not completed.

##### (3) BLOCKER / MUST-FIX candidates
1. **Resident activity logging may fail.** `logActivity` writes the activity, then does a client-side transaction on `week-summaries` (`activity.ts:94-105`). Rules permit that write only for admins of the house (rules:437). A resident would get "Failed to log activity", with the activity doc already created and no summary row. This is only a static finding. I found no rules test or integration test covering a guest-claim write to `week-summaries`. Reproduce it with the rules emulator (`npm run test:rules`) using a guest token. If it is real, fix it by moving the aggregation into a Firestore trigger or callable.
2. **Firestore indexes have no deploy path** (`mobile/package.json:9-10`, `functions/CLAUDE.md:197`). Do `firebase deploy --only firestore:indexes` to `phoenix-cleanhouse` and confirm READY before launch. The rent scheduler previously failed for months from a stale index.
3. **Entitlement Phase A grants access when `subscriptionStatus` is absent** (per `functions/CLAUDE.md:144`, not read in code). Decide whether the first paying customer's house must have a status set. `House.subscriptionStatus` defaults to `""`.
4. **No App Check, rate limiting or MFA** on callables that move money or grant claims. This is a hardening item, probably not a hard blocker for one customer.
5. **Check `functions/src/scripts/migrateHouseSubscriptionStatus.ts` for a real key.** A `sk_live_`/`sk_test_` pattern matched there.
6. **Money-path integrity.** The `payments` dollars versus cents split is documented, but the refund and on-time metrics rely on approximations. Have an independent reviewer check the domain model, per the root CLAUDE.md.

##### (4) Docs stale overall
- **Delete or archive:** `gap-analysis-production-readiness.md`. It is self-labelled historical and mostly contradicted by code.
- **Collapse the 14 E2E docs** into one current status file plus `E2E_TESTING_GUIDE.md` and `E2E_TEST_PLANS.md`. Delete `E2E_TESTING_BLOCKERS`, `E2E_TESTING_STATUS`, `E2E_FINAL_STATUS`, `E2E_XCODE_ISSUE`, `E2E_FIRST_RUN_ISSUES`, `E2E_SOLUTION_COMPLETE`, `E2E_REVIEW_FINDINGS`, `E2E_IMPLEMENTATION_SUMMARY` and `E2E_TEST_ANALYSIS`, and merge `E2E_UNCOVERED_FEATURES` and the coverage report into the one status file.
- **Fix, not delete:**
  - ARCH: refresh sections 3.1-3.3 and the `week-summaries` write-source row.
  - FDM: correct the `houses` and `admins` rules, resolve the `week-summaries` contradiction, and add the missing collections.
  - `functions/CLAUDE.md`: fix the `auth.ts`, `subscriptions.ts` and `triggers/rtdb` lines.
  - DEV: expand it or merge it into `mobile/CLAUDE.md`.
- **Keep:** `functions/CLAUDE.md` is the most accurate doc I checked.
- **Not assessed:** PERF, WEB docs, `regroup/web/CLAUDE.md`, `regroup/mobile/CLAUDE.md` and `regroup/CLAUDE.md`.
## Reverse pass — money path (UNDOCUMENTED and INCORRECT findings)

#### Reverse-pass money-path trace: Regroup on origin/main f5bef2c (read-only)

All paths below are relative to `regroup/` at `f5bef2c`. Nothing was edited and no external service was called. Every finding is L2 (code reading). I did not run any tests.

##### 1. Operator subscription: INCORRECT (paid access works; a lapse never revokes)
- **Checkout is web-only.** `web/src/app/services/functions/cloud-function.service.ts:40` calls `createOperatorSubscription` (`functions/src/callable/subscriptions.ts:173`). That creates a subscription with a trial (`api/stripe.ts:132`, `:162`, with `metadata.userId`). It writes `users.subscriptionMetadata.status`, normally `trialing` (`subscriptions.ts:252/308`), and seeds `subscriptions/{id}` (`:265`, `:322`). It does not touch houses.
- **The initial house status is stamped at house creation.** The trigger `setHouseSubscriptionStatusOnCreate` (`triggers/firestore/index.ts:90-123`) reads the operator through `house.superAdminId || house.ownerId`. The setup wizard sets `ownerId = operator.id` (`mobile/src/services/setup-wizard.ts:193`), so the house gets `trialing`.
- **Server gate.** `enforceHouseEntitlement` (`util/entitlement.ts:152`) is used only for claim grants (`util/authGuard.ts:88`), invitations (`callable/invitations.ts:116`) and oxford (`callable/oxford.ts:67`, `:202`). Rent is deliberately ungated (`callable/payments.ts:197`).
- **Client gate.** `mobile/src/hooks/useSubscriptionGate.ts:175-199` reads `house.subscriptionStatus` and `guestGraceEndsAt`, wrapped around the app at `navigation/navigators.tsx:203`.
- **Where it breaks: lapse propagation.** Every later webhook writer goes through `updateHouseSubscriptionStatus(operatorUid)` (`webhooks/stripeWebhook.ts:230-283`), which looks up houses by `adminIds array-contains operatorUid` or `adminId == operatorUid` (`:240-245`). But `house.adminIds` and `superAdminIds` hold **Admin doc auto-IDs**, not Firebase UIDs (`setup-wizard.ts:160-161`, `:184-185`; `services/house.tsx:166-173`). So the query finds nothing, logs "no houses found" (`:253`) and returns.
- **Result.** A house stays `trialing` (entitled) forever. That covers trial ending unpaid, `past_due`, `unpaid` and `canceled`.
- **Ratifying test.** The test fixture models a state production never produces: `adminIds: [operatorUid]` at `__tests__/webhooks/stripeWebhook.test.ts:1719`.
- **Correct helper exists but is dead.** `api/firestore.ts:136` `updateHouseStatuses` keys on `superAdminIds` and `user.adminId`, which is right, but nothing calls it.

##### 2. Resident rent (one-off): COMPLETE in code, but the history view is broken and the code is not deployed
- **Units are cents at every boundary.**
  - `ResidentPayment.tsx:171` parses dollars to cents.
  - `RentPaymentScreen.tsx:121-164` uses `rentOwed` cents.
  - `services/payments.ts:111-135` validates an integer and passes it as `amount`.
  - `createPaymentIntent` (`callable/payments.ts:116-245`): zod int (`:55`), gate `stripeStatus==='active'` (`:148`), guest↔house binding (`:165-185`), `transfer_data.destination` and application fee (`:231-232`).
- **Webhook.** `payment_intent.succeeded` writes `payments/{pi}` with `amount` in cents (`stripeWebhook.ts:~367-375`) and decrements `rentOwed` once inside a transaction (`:~523-545`).
- **Display.** Resident history uses the `listPayments` callable (dollars from `/100` at `payments.ts:326`, converted back to cents client-side at `services/payments.ts:233-247`). The operator dashboard uses `listHousePayments`, with the same conversion and `/100` shown at `PaymentDashboard.tsx:482`.
- **Defect: `RentPaymentScreen` history is always denied.** It uses `usePaymentHistory` → a Firestore query `payments where guestId==` (`services/payments.ts:214-224`). The rule requires `resource.data.guestUserId == uid` for guests and `isAdmin(houseId)` for admins (`mobile/firebase/firestore.rules:306-307`). Nobody writes `guestUserId` on payments, and the query does not filter on `houseId`.
- **Defect: "resolved offline" always fails.** `markPaymentResolvedOffline` updates `payments` (`services/payments.ts:335`), but the rules say `allow update: if false` (`rules:309`).
- **Defect: second same-day payment collides.** The server's default idempotency key is `${guestId}-${houseId}-${day}` (`payments.ts:188`). The mobile client always sends its own key built from amount (`services/payments.ts:135`), so a second same-day payment of the same amount reuses the first PaymentIntent. This needs a check.

##### 3. Autopay enrollment: MISSING (the UI promises autopay that cannot fire)
- **The toggle does nothing useful.** The only UI is the "Enable auto-pay" switch in `RentPaymentScreen.tsx:~506-530`. It writes `guests.autoPayEnabled` client-side (`:243-249`, allowed by the self-update whitelist at `rules:~170`).
- **The scheduled job skips every enrolled guest.** It requires both `guest.stripeCustomerId` and `defaultPaymentMethodId` (`scheduled/scheduledRentCollection.ts:186-190`) and returns with a warning when either is missing.
  - **`guests.stripeCustomerId` has no writer anywhere.** The only `stripeCustomerId` writes are on `subscriptions` docs (`subscriptions.ts:267`, `:324`).
  - **`defaultPaymentMethodId` is only written by `updatePaymentInfo`** (`payments.ts:493-496`). That resolves the customer from the caller's operator `subscriptionMetadata.customerId` (`:448-451`), so a resident gets `not-found`. If an admin calls it with a `guestId`, the resident's card is attached to the **operator's** Stripe customer.
  - **No mobile code calls `updatePaymentInfo`.** The web call (`cloud-function.service.ts:63`) is for operator billing.
- **No card is ever saved.** The one-off PaymentIntent has no `customer` and no `setup_future_usage` (`payments.ts:207-233`), and there is no SetupIntent path for residents.

##### 4. Connect onboarding: COMPLETE in code (mobile only; web has none); needs an L4 check
- **Mobile flow.** `mobile/src/screens/HouseSettings/StripeSettingsScreen.tsx:221` calls `connectStripeAccount` (`payments.ts:532`). That creates a v1 controller-express account requesting `card_payments` and `transfers` (`util/connectAccountLifecycle.ts:39-48`), persists `stripeAccountId`, `stripeAccountApi` and `stripeStatus:'pending'` (`payments.ts:~651-652`), and returns an `accountLinks` URL (`:~685-695`).
- **Status.** Status comes from `getStripeAccountStatus` (`:829`) and from the `account.updated` webhook (`stripeWebhook.ts:1072+`, platform switch `:1530` and connect switch `:1722`). Both re-read the account and map the transfers capability (`util/connectAccountStatus.ts:117`).
- **Rent gate.** `stripeStatus==='active'` for one-off rent (`payments.ts:148`) and autopay (`scheduled/rentDestination.ts:47`).

##### 5. Refunds and disputes on main (pre-#99): INCORRECT
- **Refunds.** There is no refund callable; refunds are Dashboard-only. Nothing on main uses `reverse_transfer` or `createReversal`.
- **`charge.refunded`** (`stripeWebhook.ts:759-785`) only records the cumulative refunded cents on the payment doc. It does not reverse the house transfer, does not refund the application fee, and does not restore `rentOwed`.
- **`charge.dispute.created`** (`:687-748`) sets `disputed: true` and notifies. There is no handler for `charge.dispute.closed` or funds withdrawn.
- **Who pays.** With destination charges, the platform balance absorbs every refund and lost dispute while the house keeps the transfer, and the resident's ledger still shows the rent as paid.
- **Not on main.** The fix commit `15e547a` ("reverse house transfers on refunds and disputes") exists only off main.

##### Findings

| ID | Finding | Severity | Evidence file:line | Failure scenario |
|---|---|---|---|---|
| REV-M1 | Subscription webhooks look up houses by operator UID in `adminIds`/`adminId`, but those fields hold Admin doc IDs, so no house status ever changes after creation. The test fixture ratifies the wrong shape. | BLOCKER | `functions/src/webhooks/stripeWebhook.ts:240-256`; `mobile/src/services/setup-wizard.ts:160,184`; `__tests__/webhooks/stripeWebhook.test.ts:1719` | Trial ends unpaid, or the operator cancels → house stays `trialing` → full access with no revenue. A `past_due` → paid recovery also never propagates (harmless only because nothing lapses). |
| REV-M2 | Autopay toggle enrolls residents but no path writes `guests.stripeCustomerId` or saves a resident card, so the job skips every guest. `updatePaymentInfo` uses the operator's customer. | BLOCKER (or hide the toggle → MUST-FIX) | `RentPaymentScreen.tsx:243-249`; `scheduledRentCollection.ts:186-190`; `payments.ts:448-451,493-496` | Resident turns on "auto-pay … charged when due", rent is never charged, and the overdue and late notices follow. |
| REV-M3 | Refunds and disputes on main never reverse the transfer to the house or restore `rentOwed`. #99 is not merged. | MUST-FIX | `stripeWebhook.ts:687-785`; no `reverse_transfer` anywhere | Any refund or lost chargeback is a platform-balance loss, and the ledger still shows the rent as paid. |
| REV-M4 | Most money-path code is committed but not deployed. Functions were last deployed 2026-10-13. Since then #81, #86, #88, #93/#96 and #98 have merged (10-15 to 10-19), plus the #98 rules change. | BLOCKER (until deployed) | `git log origin/main -- regroup/functions/src` | Production still runs the older webhook, payment-amount handling and Connect API path, and the autopay path without a house destination. The `guests` re-homing rule is open until the rules deploy. |
| REV-M5 | The `payments.amount` cents migration has not been run, and `--deployed-at` must be the real #86 deploy instant, which is still in the future. | MUST-FIX (ordering) | `scripts/migratePaymentAmountsToCents.ts:5-23`; reader `callable/analytics.ts:171-177` | If run before the deploy, or with a wrong cutoff, it multiplies new cents rows 100x or leaves dollar rows. Analytics sums are then wrong. |
| REV-M6 | Payment-history query on RentPaymentScreen depends on `payments.guestUserId`, which nothing writes, and the query has no `houseId` filter, so the rules deny it. | SHOULD-FIX | `mobile/src/services/payments.ts:214-224`; `firestore.rules:306-307` | Residents and admins see an error or empty history on the Pay Rent screen. |
| REV-M7 | `markPaymentResolvedOffline` updates payment docs, but the rules forbid all client updates. | SHOULD-FIX | `services/payments.ts:335`; `firestore.rules:309` | Operator taps "resolved offline" on a failed payment and gets permission-denied, so the item stays flagged. |
| REV-M8 | `customer.subscription.deleted` does not clear `guestGraceEndsAt`, and `subscription.updated` writes `currentPeriodEnd` from `billing_cycle_anchor`. | SHOULD-FIX | `stripeWebhook.ts:~968-990`, `:1027-1030` | After M1 is fixed, the client shows a grace banner to a canceled house while the server denies it, and the stored period end is wrong. |
| REV-M9 | The status helper that keys on the right field (`superAdminIds`, `user.adminId`) has no caller. | SHOULD-FIX (use it for the M1 fix) | `functions/src/api/firestore.ts:136-157` | Dead code that hides the correct key. |

##### Not verified: L4/L5 checks needed
- **L4, Stripe test mode, for M1.** Advance a test clock past the trial with a failing card, then confirm the house doc's `subscriptionStatus` changes. Today it should not.
- **L4, for M2.** Enable autopay in the app, run `scheduledRentCollection` in the emulator, and expect the "missing payment info" warning.
- **L4, Connect.** Create a v1 controller-express account with `card_payments` and `transfers` on the live platform. The platform may need Stripe's approval. Complete onboarding and confirm `stripeStatus` reaches `active`, then make a destination charge.
- **L4, for M3.** Refund a test destination charge and confirm the platform balance is debited and the transfer is not reversed.
- **L5, deploy state.**
  - Use `firebase functions:list` and revision timestamps for `phoenix-cleanhouse`.
  - Diff the deployed `firestore.rules` against `mobile/firebase/firestore.rules`.
  - Check that the `autoPayEnabled + rentOwed` composite index is deployed.
- **L5, Stripe Dashboard.**
  - Check the events each webhook endpoint (platform and Connect) is registered for against the switches at `stripeWebhook.ts:1482-1536` and `:1722-1728`, including `account.updated` on the Connect endpoint.
  - Look for duplicate endpoints and check the signing secret for each.
- **L5, data.** Count `houses` per `subscriptionStatus` and look for lapsed `subscriptions` docs whose houses are still `trialing` or `active`; that confirms M1 in production. Count `payments` docs created before the #86 deploy, for M5.

##### Failure classes hit
- **Merged but not on main:** the #99 fix (`15e547a`).
- **Correct only by mocks:** M1 fixture; the Connect v1 capabilities are only mocked.
- **Committed but not deployed:** M4.
- **Written but never run:** M5.
- **Field read but never written:** `guests.stripeCustomerId` (M2), `payments.guestUserId` (M6).
- **Tests ratifying a defect:** M1, `stripeWebhook.test.ts:1719`.
- **Secrets that ship:** nothing found on these paths. I did not check this class beyond them.
## Reverse pass — auth, onboarding, recovery-api

REVERSE-PASS TRACE (read-only, worktree wt-lr2 @ f5bef2c). Paths below are relative to regroup.

CAVEATS
- Flows 7 and 8 were not finished, and flow 2 (application path) is only partly traced.
- Nothing was executed and no emulator was run. "Verified" means I read the code on both sides of the claim.
- Exact line numbers are given only where I saw them. Elsewhere the anchor is the function or rule block name, so grep for it.
- I did not read the Angular web signup flow beyond `web/src/app/services/functions/cloud-function.service.ts`.
- I did not read the recovery-api side at all.

PER-FLOW VERDICTS

1. New operator: INCORRECT, with a probable BLOCKER at house creation.
   - Web: `cloud-function.service.ts` calls `createOperatorSubscription`. The server `finishCheckout` in `callable/subscriptions.ts` grants the `potentialSuperAdmin` claim.
   - Mobile: the setup wizard runs `initializeHouses` in `mobile/src/services/setup-wizard.ts`. It does one `batch.commit()` that writes the `admins/*` doc, the `houses/{id}` docs and a `users/{uid}` update.
   - Only after the commit does it call `addAdminAuthorization`. That callable needs the house doc to exist first (`util/authGuard.ts`), and the comment in `setup-wizard.ts` says so.
   - `firestore.rules` has `houses`: `allow create: if isAdmin([houseId])` and `admins`: `allow create: if isAdmin(request.resource.data.houseIds)`. Both need an admin or superAdmin claim for that house, and the new operator has none yet. The claim-grant callable and the rule each require the other to happen first.
   - The existing rules test only seeds houses through the admin context (`mobile/firebase/__tests__/firestore.rules.test.ts` ~2170), so nothing exercises a new-operator create.
   - Needs an emulator confirmation. If it holds, no new operator can create a house from the app.

2. New resident via invitation: INCORRECT (BLOCKER, see REV-A1).
   - Trace: `createInvitation` writes `invitations/{token}` and sends the email. The link is `regroup-app://?type=invitation&token=…`.
   - `createInvitationFromLink` builds a placeholder invitation. `SignUp.tsx` calls `peekInvitation` and hydrates email, houseId, type and initialPhase.
   - `SignUpForm` creates the user, calls `redeemInvitation`, which sets the guest claim, then `getAuthUser(true)` refreshes the token. It then runs `Promise.all([createGuest, updateUser, updateSubscriptionGuests])`.
   - The last call fails every time. The resident is left on the signup form with an error even though the claim is already granted.
   - Application path: INCOMPLETE and unverified.
     - Applicants can create `houses/{h}/applications` (rules). `notifyOperatorOnApplication` notifies the admins.
     - I did not trace how an approved applicant gets a claim or a guest doc. `addGuestAuthorization` would let an admin delegate it.
     - `requestAccountVerification` in `services/users.tsx` calls `houseService.updateHouseAwaitingVerification`. That is a non-member write to a house doc, and the `houses` update rule requires a claim. I suspect this is a dead end for house-code join but did not confirm it.
   - Rent visibility depends on `payments` and `guests` reads, which are claim-gated. Fine once a claim exists.

3. Claims refresh, regions and demo: MIXED.
   - Regions: verified consistent. The server never sets a region (only `setGlobalOptions({cpu, maxInstances})` in `functions/src/init.ts`), so it is us-central1. Mobile uses `FirebaseFunctions()` default (`mobile/firebase-setup`). Web has no `REGION` provider. There is no mismatch today.
   - Refresh: only the acting user's own flows force a token refresh (`setup-wizard.ts`, `SignUpForm`). Nothing pushes a refresh to a user whose role changed (REV-A5).
   - Demo: see REV-A8.

4. Rules review: findings REV-A3, A4, A6, A7, A9 and A10 below.

5. Account deletion: MISSING (REV-A2).

6. 2FA: INCORRECT as a feature.
   - Session replacement: verified not a problem. `TwoFactorSetup.tsx:17` calls `signInWithPhoneNumber`, but the code never calls `confirmation.confirm()`.
   - It builds `PhoneAuthProvider.credential(verificationId, code)` and calls `linkWithCredential`. That links a phone provider to the current user and does not replace the session.
   - It does not enrol MFA. Linking a phone number does not require a second factor at sign-in. The alert "Your account is now protected with two-factor authentication" is false (REV-A11).

7. Retention: PARTIAL. I did not finish this one.
   - Wired server-side: the `notify` trigger on `notifications/{id}`, `notifyOperatorOnApplication`, `notifyNewHouseCreated`, and the schedules `overdueRentNotification`, `officerTermReminder`, `scheduledRentCollection`, `weeklyTransfers`, `updateDisputes`.
   - Invites: `createInvitation` sends the email through SendGrid. The 7-day token has no resend or reminder path that I saw.
   - FCM token: `Splash.tsx:108` calls `messaging().getToken()`. I did not confirm it is stored where `notify` reads it.
   - Suspected: the `notifications` rule allows a client to create only a notification addressed to itself. Any client-side "notify resident" would be denied. I did not grep for such callers.
   - Callables with no caller found in `mobile/src` or `web/src` (a grep on the `httpsCallable(` pattern, so wrappers could hide callers): `complianceExport`, `rentRoiMetrics`, `setOxfordEnabled`. Treat these as suspected-dead.
   - Related: `houses` update lets any admin or guest write `oxfordEnabled` directly (REV-A12).

8. recovery-api: PARTIAL (meetings only).
   - Regroup calls it server-to-server from `functions/src/api/recoveryApi.ts`, used by `callable/meetings.ts`, `util/meetings.ts` and `util/directoryMapping.ts`.
   - It posts the callable wire protocol to `findMeetings` with service-key headers and app id `phoenix-cleanhouse`. The `findMeetings` callable exists in recovery-api per the platform docs.
   - I found no use of referrals or profiles anywhere in Regroup. Nothing in Regroup expects them, so there is no missing contract on that side.
   - Not verified: the header names against recovery-api's `requireServiceAuth`, and the key being provisioned as a secret (`functions/src/config.ts` mentions it).

FINDINGS
| ID | Finding | Severity | Evidence | Scenario |
|---|---|---|---|---|
| REV-A1 | Resident invitation signup always errors after the claim is granted (VERIFIED by reading). `SignUpForm` calls `updateSubscriptionGuests({ownerUserId: invitation.ownerId, …})`. `ownerId` is `''` on the token flow, because `createInvitationFromLink` sets it to `''` and `SignUp.tsx` hydrates only email, houseId, type and initialPhase. The server schema is `ownerUserId: z.string().min(1)`. The server also requires `ownerUserId === request.auth.uid`, so it denies even if populated. Occupancy is already recorded by `recordResidentAccepted` inside `redeemInvitation`, so the call is redundant. | BLOCKER | `mobile/src/screens/SignUp/SignUpForm.tsx` (guest branch, `Promise.all` with `updateSubscriptionGuests`); `mobile/src/services/native-deep-links.ts` (`createInvitationFromLink`, `ownerId: ''`); `mobile/src/screens/SignUp/SignUp.tsx` ~190-205; `functions/src/callable/subscriptions.ts` `updateSubscriptionGuestsSchema` and the `ownerUserId !== request.auth.uid` check in `updateSubscriptionGuests` | Operator invites a resident. The resident signs up and sees "Failed to create guest account". The token is already redeemed. `createGuest` and `updateUser` run concurrently and probably succeeded. Retrying signup hits email-already-in-use, so the resident is stuck and needs support. Admin invites via `redeemInvitation` are unaffected because that branch has no such call. |
| REV-A2 | No account deletion anywhere (VERIFIED by grep: no match for "delete account" or `deleteAccount` in `mobile/src`, `web/src`, `functions/src`; no deletion callable in the exported callable list). The `users/{uid}` rule allows deleting only the Firestore doc. The Auth account, guest doc, Stripe customer and storage remain. | BLOCKER (App Store 5.1.1(v), iOS) | `firestore.rules` `match /users/{userId}` (`allow delete`); callable list in `functions/src/index.ts` | App review rejection, and a privacy-law deletion request cannot be honored. |
| REV-A3 | New-operator house create is circular against the rules (VERIFIED by reading both sides; NOT emulator-tested). | BLOCKER, pending emulator confirmation | `mobile/src/services/setup-wizard.ts` `initializeHouses` (batch then `addAdminAuthorization`); `firestore.rules` `houses` create and `admins` create; `functions/src/util/authGuard.ts` (house must exist) | Paid operator finishes checkout and reaches the setup wizard. Commit fails with permission-denied and the wizard shows "Failed to create houses." They never get a working house. Suggested fix: create the house server-side, or add an owner-based create rule such as `request.resource.data.ownerId == request.auth.uid` and `potentialSuperAdmin`. |
| REV-A4 | `addAdminAuthorization` can drop the new admin claim (VERIFIED by reading `createClaims`; not run). Both `createClaims` calls start from the same snapshot, and each returns `{...current, [role]: merged}`. The handler merges them as `{...userClaims, ...superAdminClaims}`. The second spread overwrites `admin` with the stale pre-update `admin`. | MUST-FIX | `functions/src/callable/auth.ts` `addAdminAuthorization` (`Promise.all` of two `createClaims`, then the spread); `functions/src/util/claims.ts` `createClaims` | The operator path works because `superAdmin` is set and rules accept it. The legacy path `addAdminAuthorization(newAdmin)` (the no-token fallback in `SignUpForm`) with houseIds=[h] and superAdmin=[] ends with no admin claim. |
| REV-A5 | Role changes do not propagate to the affected user (VERIFIED by reading). Rules read the ID token claims only. `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `deleteAdminAuthorization` and the `onGuestWrite` delete cleanup change claims server-side, but no code refreshes the target's token. `refreshClaims` (`mobile/src/services/users.tsx:183`) is called only on self-flows. | SHOULD-FIX | `functions/src/callable/auth.ts`; `functions/src/triggers/firestore/index.ts` `onGuestWrite` | A removed admin keeps data access for up to about 1 hour. A promoted admin cannot act until re-login or token expiry. |
| REV-A6 | Every resident can read every housemate's guest doc (VERIFIED from the rule). `guests` read is `isGuest([houseId]) \|\| isAdmin(...)`. The doc carries `drugOfChoice`, `sobrietyDate`, `rentOwed`, emergency contacts, phone and email. This is PHI-adjacent. The rule's own comment admits the design gap. | MUST-FIX | `firestore.rules` `match /guests/{guestId}` (read) | A resident with a modified client or a direct query lists all housemates' recovery and financial data. Split the PHI fields into an admin-only subdocument. |
| REV-A7 | `guests` create allows a self-created guest doc for any `houseId` with arbitrary fields. The rule is `isSameUser(request.resource.data.userId) \|\| isAdmin(...)`, and the update rule is the one that carries the whitelist. `guest-reports` is readable and writable by every resident of the house. `applications` create requires only `signedIn()` plus `applicantUid == auth.uid`, so it can target any houseId and fan out admin notifications. `admins` update and delete check `request.resource.data.houseIds` rather than `resource.data`. (All VERIFIED from the rules; impact SUSPECTED.) | MUST-FIX (guests create), SHOULD-FIX (the rest) | `firestore.rules` `guests` create; `guest-reports`; `houses/{h}/applications` create; `admins` update and delete | A user who knows another house's id plants a guest doc there. That pollutes the roster and triggers `onGuestWrite` and EES recalculation. A free-signup user spams any operator with application notifications. An admin of house A rewrites an admin doc belonging to house B by setting `houseIds` to their own. |
| REV-A8 | Demo account. Credentials are hardcoded (`InitialLandingForm.tsx:76`: `demo_user@appdemo.net` / `DemoUser1`; `mobile/src/util/user.ts:32` also special-cases the email). Firestore rules scope it to houses with `isDemoHouse == true` via `isDemoScopedHouses`, which is good. Storage rules have no demo scoping. Callables have no demo guard. I did not check which claims the demo user holds, so what it can do is SUSPECTED. | SHOULD-FIX | `firestore.rules` `isDemoAccount` and `isDemoScopedHouses`; `storage.rules` (no demo check); `functions/src/callable/invitations.ts` `createInvitation` (no demo check) | Anyone can log in as the demo user. If it holds admin on the demo house, it can call `createInvitation` (SendGrid emails to arbitrary addresses, if the demo house is entitled) and any other callable. Add a server-side denylist for the demo uid and disable the email send for it. |
| REV-A9 | `redeemInvitation` checks the token email against `request.auth.token.email` but not `email_verified`. `SignUpForm` explicitly skips email verification for invitations. A leaked or forwarded token plus password signup with the invited address grants the claim. | SHOULD-FIX | `functions/src/callable/invitations.ts` `redeemInvitation`; `SignUpForm.tsx` `handleUserInvitation` | Moderate, because the token is needed. Require `email_verified`, or verify at redeem time. |
| REV-A10 | The legacy no-token invite path is dead (VERIFIED by reading). `SignUpForm` still calls `addGuestAuthorization` and `addAdminAuthorization` as the new user. The guard `assertCanGrantClaimForHouses` allows only the house owner or an existing admin delegating to another user, so a new user is denied. | SHOULD-FIX | `SignUpForm.tsx` (the `else` branches); `functions/src/util/authGuard.ts` | Any pre-token invitation email still in an inbox produces "Not authorized to grant this claim". Delete the branches or show a "ask for a new invite" message. |
| REV-A11 | The 2FA screen is misleading (VERIFIED by reading). It links a phone provider and does not enrol MFA, so there is no second factor at sign-in. It also fails with credential-already-in-use if the number is linked elsewhere. | MUST-FIX (a false security claim in a recovery product) | `mobile/src/screens/Personal/TwoFactorSetup.tsx:17` and the `linkWithCredential` call | A user believes the account is protected and it is not. Hide the screen or implement real MFA enrolment. |
| REV-A12 | `users/{uid}` update blocks only `subscriptionMetadata`, so `potentialSuperAdmin` and `orgSetupCompleted` are self-writable. `useSubscriptionGate.ts:145` short-circuits the paywall when `potentialSuperAdmin && !orgSetupCompleted`. `mobile/src/util/user.ts:25` sets it from the signup role. Similarly, `houses` update lets any admin or guest write `oxfordEnabled`, `pendingAdminInvites`, `superAdminIds` and other non-listed fields. The server entitlement gate (`enforceHouseEntitlement`) is the real control on grants and invites. | SHOULD-FIX | `firestore.rules` `users` update and `houses` update; `mobile/src/hooks/useSubscriptionGate.ts:145` | A modified client skips the mobile paywall UI, but server callables still enforce entitlement. A house admin flips `oxfordEnabled` directly to unlock Oxford features if they are a paid tier, bypassing the `setOxfordEnabled` callable. Both are SUSPECTED impact. |
| REV-A13 | Storage: avatars at `users/{uid}/avatar` are readable by any authenticated user, and free signup makes everyone authenticated. Guest avatars were already tightened to house members. A chore photo path lets any member write any `guestId` folder. | SHOULD-FIX (low) | `storage.rules` sections 1 and 5 | A stranger fetches a user's face photo by uid. A resident overwrites a housemate's chore photo. |
| REV-A14 | recovery-api auth contract unverified. Header names and key provisioning on the recovery-api side were not checked, and the 8th item of the brief is only partly covered. | SHOULD-FIX (verify) | `functions/src/api/recoveryApi.ts`; `functions/src/config.ts` | The meetings search would return nothing in production if the key or app-id registration is missing. |

VERIFIED GOOD (no action)
- Claim-granting callables are guarded by owner or admin-delegation checks, with entitlement enforced on grants and not on revocations.
- `invitations`, `webhookEvents` and `subscriptions` are server-only or admin-scoped in the rules.
- Vote casting is server-side only.
- `documents` and `drug-tests` are admin-only; residents have no access.
- The demo account is house-scoped in the Firestore rules.
- Server regions and the client call sites are consistent.
- `subscriptionStatus`, `guestGraceEndsAt` and `stripeAccountApi` on the house doc, and `subscriptionMetadata` on the user doc, are protected from client writes.

SUGGESTED NEXT STEPS
- Run the emulator for REV-A3 with a fresh user and no claims, creating a house.
- Run the emulator for REV-A1 with a redeemed token.
- Finish the notification FCM token storage trace for flow 7.
- Check the recovery-api service-auth headers for flow 8.