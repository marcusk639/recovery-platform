---
generated: 2026-09-27
revised: 2026-09-28 (re-run 2 — verdict reversed, see Changes since last plan)
target: regroup/{mobile,web,functions}
firebase_project: phoenix-cleanhouse
bar: first paying customer (this skill's bar)
companion: plan-regroup-homegroups-2026-09-27.md (store-availability bar)
method: direct verification; no subagents (the prior run's agents underperformed). Re-run 2 adds live-site probes of regroup-app.com.
---

# Launch Readiness Plan — Regroup

**Resolved targets:** `regroup/mobile`, `regroup/web`, `regroup/functions`.

## Verdict

**Re-run 2 reverses re-run 1's verdict.** That plan concluded "Regroup's revenue path is the Angular
web app, not the mobile app," and deprioritised every store blocker on that basis. Direct probes of
production and of the web source now indicate **there is no working purchase path on either
surface.**

- **Live site:** `regroup-app.com/pricing` renders real content — $10/Home, $1/Resident — with a
  "Start Free Trial" button linking to `/signup`. `regroup-app.com/signup` asks for Name, Email,
  Password and a "Next" button. Neither page carries a card field or Stripe element.
- **Web source:** **no HTML template** in `regroup/web/src` references `app-billing-info`,
  `ngx-stripe` or `stripe-card`, so the 221-line `ngx-stripe` card collector at
  `components/billing/billing-info/billing-info.component.ts` is declared (`app.module.ts:195`) but
  never rendered. `createOperatorSubscription` has **zero call sites** outside its own service
  definition. `SubscribePageComponent` is a 306-byte stub with an empty `ngOnInit`, and there is no
  `billing` route among the 27 in `app-routing.module.ts`.
- **Mobile:** `App.tsx:11` initialises Stripe from `process.env.STRIPE_PUBLISHABLE_KEY`, but
  `regroup/mobile/babel.config.js` carries only `metro-react-native-babel-preset` — no
  `react-native-config`, no inline-env transform — so the `'pk_test_placeholder'` fallback is used
  in **every build, including release**.

`/signup` is a multi-step wizard, so a card step behind "Next" cannot be ruled out without
completing a signup against production. That single check is now critical-path item 1, because it
decides whether this is a "wire up the last mile" problem or a "build the money path" problem.

The binding constraint from re-run 1 — the twelve `STRIPE_PRICE_*` variables — remains open and
unverified, but it is no longer clearly the *first* constraint. A bound price variable cannot help a
checkout surface that is never rendered.

---

## Changes since last plan (2026-09-28 re-run)

### Newly resolved

| Prior claim / question | Now |
|---|---|
| OQ4 — "is `regroup/web` deployed on a working domain with SSL?" | **Partly answered: yes.** `regroup-app.com/pricing` and `/signup` both return HTTP 200 over TLS with real, styled content. Whether the repo builds cleanly is still unverified. |
| Companion plan's premise that iOS blockers do not affect revenue | **Superseded.** Since no surface can currently charge, "which surface is the revenue path" is an open product decision, not a settled fact. |

### Newly discovered (none of these were in re-run 1)

| Finding | Evidence |
|---|---|
| Mobile ships a placeholder Stripe key in every build | `regroup/mobile/App.tsx:11` + `regroup/mobile/babel.config.js` (no env transform) |
| Web card collector is never rendered | no `.html` in `regroup/web/src` references `app-billing-info`/`ngx-stripe`/`stripe-card`; declared at `app.module.ts:195` |
| `createOperatorSubscription` has zero callers | `regroup/web/src/app/services/functions/cloud-function.service.ts:36` |
| `/subscribe` is an empty stub; no `/billing` route exists | `subscribe-page.component.ts` (306 bytes); `app-routing.module.ts` (27 routes) |
| Live pricing is the **legacy** two-item model, not the tier model | live `/pricing` shows $10/Home + $1/Resident, matching `api/stripe.ts:84-113`; the tier model at `:116-135` sits behind `TIER_BILLING_ENABLED` |
| The paywall is written but never mounted — not enforced at all | `SubscriptionGate` has zero references outside its own file; `App.tsx` mounts `RootNavigator` with no gate |
| The app's only subscription link-out is a 404 | `SubscriptionRequiredScreen.tsx:13-15` → `regroup-app.com/billing`; `RATS_WEB_URL` is defined nowhere and no such route exists |
| Payment failure never reaches house state or resident grace | `handleInvoicePaymentFailed` (`stripeWebhook.ts:676-730`) updates only the subscription doc; never calls the house helper at `:198-264`, never sets `guestGraceEndsAt` |
| Residents are never notified of a lapse | only `sendFcmToHouseAdmins` fires |
| House creation is a direct client-side Firestore write with no entitlement check anywhere | `regroup/mobile/src/services/house.tsx:46,162`; no `createHouse` callable exists; no callable in `regroup/functions/src/callable` checks subscription state |
| Operator signup runs through a mounted WebView that relays the password over `postMessage` | `screens/SignUp/SignUpWebView.tsx`, rendered at `SignUp.tsx:252` |
| `aps-environment = development` in the Release entitlements | `regroup/mobile/ios/rats/rats.entitlements` — breaks all production push, including dunning |
| Android `targetSdkVersion 34` against Play's required 36 (deadline passed 2026-08-31) | compounded by AGP 7.4.2 vs 48 androidx deps needing 8.1.1+ |

### Still blocked (carried forward unchanged)

Open questions 1, 2, 3, 5, 6 and 7. The `STRIPE_PRICE_*` binding, the `priceEnvVar` runtime
consumer, the live-vs-TEST price sets, the Oxford tier decision, the demo credential, and pricing
validation are all exactly as they were.

---

## Critical path

Re-ordered in re-run 2. Items marked *(carried)* keep their re-run 1 evidence; their position
changed, not their content.

### Tier 0 — the check that branches everything

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 1 | **Complete the live `/signup` wizard past "Next" and record whether a card step exists.** Step 1 is Name/Email/Password with no Stripe element. If a later step takes a card, Tier 1 shrinks to configuration; if not, Regroup has no money path and that is the whole launch problem. | OPS | live probe of `regroup-app.com/signup`, 2026-09-28 | the interpretation of every item below | minutes |

### Tier 1 — nothing can charge

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 2 | **Establish a build-time config mechanism for `regroup/mobile`, and verify a live key reaches a release build.** Without it `'pk_test_placeholder'` is used unconditionally. Also unblocks `RATS_WEB_URL`. **Acceptance:** release build carries a `pk_live_` value and the placeholder literal is unreachable. | ENG | `App.tsx:11`; `babel.config.js` | any mobile charge; the app's billing link-out | hours |
| 3 | **Decide the billing model actually being sold: legacy per-house/per-resident, or tiers.** Live sells $10/Home + $1/Resident (legacy `createSubscription`); the tier path is gated behind `TIER_BILLING_ENABLED`. Fixing the wrong one wastes items 4-6. | PRODUCT | live `/pricing`; `api/stripe.ts:84-113` vs `:116-135` | which checkout to repair; whether the trial change matters | decision |
| 4 | **Render a real checkout surface on web.** Route `BillingInfoComponent` (or build `/billing`), and wire a caller for the subscription callable. **Acceptance:** a test card completes a subscription end to end. | ENG | `app.module.ts:195` declared-but-unrendered; no `billing` route | the entire web revenue path | days |
| 5 | **Verify the 12 `STRIPE_PRICE_*` variables are bound in deployed config.** *(carried — was item 1.)* Only `.env.example` exists; every price line is `# [CONFIG]`. Relevant only if item 3 selects tiers. | OPS | `regroup/functions/.env.example`; `regroup/scripts/stripe-prices.env:1-25` | every tier checkout | minutes to verify |
| 6 | **Find or write the runtime consumer of `priceEnvVar`.** *(carried — was item 2.)* An unbound variable and an unread variable look identical at checkout. | ENG | `config.ts:76,77,91,92,106,107,123,124,138,139,153,154` | every tier checkout | hours |
| 7 | **Resolve the conflicting price-ID sets** (one labelled live, one labelled TEST, same variable names). *(carried — was item 3.)* | OPS | `scripts/stripe-prices.env`; `scripts/stripe-product-values.md` §1 | whether a real card is charged | minutes |
| 8 | **Confirm `regroup/web` builds from source.** *(carried — was item 4.)* The site is confirmed deployed and serving; whether the current tree still compiles is unverified, and its test runner has never existed. | ENG | `regroup/web/package.json`; `angular.json` → missing `karma.conf.js` | shipping any web fix | unknown until run |

### Tier 2 — live exposure on a shipped app

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 9 | **Per-owner scoping on Storage.** *(carried — was item 6.)* The interim auth-only ruleset closed public access; any authenticated user can still read any resident's documents. | OPS | live ruleset `4b19f102-0389-4c4a-95aa-06c2e0244d1e`; fix at `regroup/mobile/firebase/storage.rules` (139 lines, undeployed) | resident data confidentiality | hours |
| 10 | **Fix the rules deploy path.** *(carried — was item 5.)* Four `firebase.json` under `regroup/`; every deploy is `--only functions`. This is the mechanism behind six years of rules drift, and it blocks item 9 **and** any entitlement enforcement in rules. | ENG | `$ find regroup -maxdepth 3 -name firebase.json` → 4 | item 9; server-side entitlement | hours |
| 11 | **Deploy the two `documents` indexes.** *(carried — was item 7.)* Commit the definitions first or the next deploy erases them. | OPS | `regroup/mobile/src/services/documents.ts:154-163` | resident documents feature | minutes + deploy |

### Tier 3 — you may not be able to ship an update

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 12 | **Android `targetSdkVersion` 34 → 36.** Play's deadline passed 2026-08-31. Compounded by AGP 7.4.2 against 48 androidx deps requiring 8.1.1+. **Acceptance:** confirm whether Play still accepts an update; if not, this precedes everything in Tier 1 that ships via Android. | ENG | `regroup/mobile/android` build config | shipping any Android fix at all | days to weeks |
| 13 | **`aps-environment` → `production` in Release entitlements.** Every production push fails silently today, including dunning and grace notices. | ENG | `regroup/mobile/ios/rats/rats.entitlements` | payment-failure notifications | minutes |
| 14 | **iOS store blockers** — ITMS-91061 privacy manifest, in-app account deletion (5.1.1(v)). Tracked in the companion plan; they gate store availability, not revenue. Note no iOS build is possible on the current machine (Command Line Tools only, no full Xcode). | ENG/OPS | companion plan | App Store submission | weeks |

### Tier 4 — product decisions

| # | Item | ENG/OPS | Evidence | Blocks | Effort |
|---|---|---|---|---|---|
| 15 | **Confirm the Oxford Network tier is meant to be unsellable.** *(carried — was item 8.)* | PRODUCT | `regroup/functions/src/util/tierPricing.ts:76-79` | whether a listed tier can convert | decision |

**Relationship to the billing design spec.** `docs/superpowers/specs/2026-09-27-regroup-external-billing-onboarding-design.md`
(rev 4) specifies operator onboarding, the 7-day trial, house-scoped entitlement and its server-side
enforcement. It **assumes a working charge to build on**, so it sits behind Tier 1. Its items 1, 2,
10, 11 and 12 overlap items 2, 9 and 10 here and should be done once, not twice.

## Already done — stale-doc zombies killed

| Claimed | Reality | Evidence |
|---|---|---|
| `regroup/web` needs its live Stripe key set — "LAUNCH BLOCKER (C2)" | **Already live.** The comment asserting the blocker sits directly above a real `pk_live_` value *in the same file*. Delete the comment. | `regroup/web/src/environments/environment.prod.ts:4-7` |
| Stripe products have no default price; `getDefaultPriceForProduct()` throws at runtime (asserted across several docs, and in this skill's own repo-facts) | **Does not apply to Regroup.** Zero occurrences of `getDefaultPriceForProduct` anywhere in `regroup/functions/src`. That function belongs to Homegroups. | `$ grep -rn getDefaultPriceForProduct regroup/functions/src` → no matches |
| regroup has no webhook-driven subscription status changes | **False.** Handled. | `regroup/functions/src/webhooks/stripeWebhook.ts:1111-1121` |
| Failed-payment recovery is absent | **Present.** `invoice.payment_failed` with escalation and customer notification. | `stripeWebhook.ts:677,707,725-726` |
| Stripe API version unset | **Pinned**, and enforced at predeploy. | `STRIPE_API_VERSION="2026-01-28.clover"` in `scripts/stripe-prices.env`; `scripts/preflight-billing.js:132` |
| `functions/.env.example` missing | **Exists and is complete**, including all six `*_ANNUAL` tier variables. | `regroup/functions/.env.example` |
| Storage bucket world-readable/writable since 2020-08-08 | **Closed this session** with an interim auth-only ruleset, verified live. Per-owner scoping still outstanding (item 6). | ruleset `4b19f102…` replacing `346c6c92…` |

**A correction I made mid-analysis, recorded so it is not re-derived:** I briefly concluded the
`*_ANNUAL` price variables were missing from configuration. That was an artifact of a truncated
read. They are present in both `regroup/functions/.env.example` and `regroup/scripts/stripe-prices.env`.

---

## Risks

| Risk | Severity | Concrete failure |
|---|---|---|
| Price variables unbound or unread | High | Every tier checkout fails at price resolution. The customer sees a broken page, not a declined card, and nothing reaches Stripe. |
| Wrong price-ID set deployed | High | Checkout either charges nothing in test mode while appearing to succeed, or 500s at call time. |
| Any authenticated user can read any resident's documents | High | Recovery-status, drug-test and medication documents readable across houses until item 6 ships. |
| `regroup/web` is the revenue surface and has never been tested | High | Its test runner has never existed; a build or SSR regression would be discovered by a paying customer. |
| Four `firebase.json` files | Medium | A deploy from the wrong directory silently omits rules and indexes, or overwrites them. Already the documented cause of six undeployed indexes. |
| 30-day trial on every tier | Medium | A declined card stays invisible for a month. Dunning exists, so this is late detection, not absent recovery. |
| No rendered checkout on either surface | Critical | No customer can pay by any route. Supersedes every other revenue risk below it. |
| Placeholder Stripe key in release builds | Critical | Even a repaired mobile flow charges nothing; failures look like Stripe errors, not config. |
| Android below Play's target-SDK floor | High | Fixes cannot be shipped to Android users at all; the deadline has already passed. |
| Paywall written but unmounted | Medium | Subscription state is computed and never enforced; webhook-written `past_due`/`unpaid` values are read by nothing. |
| House creation unguarded server-side | Medium | Once a paywall exists, it is bypassable by a direct Firestore write (`services/house.tsx:46`). |
| Operator password relayed over WebView `postMessage` | Medium | Credentials cross a JS bridge during the only live operator signup path (`SignUpWebView.tsx`). |

---

## The 30-day trial — recommendation

Hardcoded at `regroup/functions/src/api/stripe.ts:101` and `:127`, every tier, no configuration.
`payment_method_collection` is never set, so Stripe's default requires a card but nothing proves it
is chargeable until the first invoice.

**Keep the trial. Add payment-method validation at signup** — a `$0` authorization or explicit
setup-intent confirmation — so a declined card surfaces on day one rather than day 31. Removing the
trial is the wrong lever: dunning already exists, so the gap is detection latency, not recovery.
Under the money bar this *does* matter (it delays the first real charge by 30 days), so unlike in
the store-bar plan it belongs on the roadmap — but behind critical-path items 1-4, which decide
whether a charge is possible at all. Re-run 2 note: the design spec settles the target at **7 days**
with a SetupIntent at signup; that change should be made once, in whichever billing model item 3
selects, not applied to both code paths.

**Unanswerable here:** whether $49-$249/month is the right price. The repo holds no pricing
validation, funnel or retention data.

---

## Deferred

- **`regroup/web` test runner.** `angular.json` points at a `karma.conf.js` that has never existed; no CI job either. Worth fixing precisely because web is the revenue path — but it blocks no charge today.
- **iOS store blockers** (Firebase SDK floor / ITMS-91061, account deletion, privacy-manifest accuracy). Promoted to critical-path item 14 in re-run 2 — they still gate *store availability* rather than a charge, but with no working money path on any surface, "revenue doesn't need the store" is no longer a safe premise. The APNs entitlement was promoted further, to item 13, because it silently breaks dunning notifications.
- **`createReferral` has zero call sites.** The platform's integration thesis, unused. Cannot block a payment.
- **300-line violations** (81 files in `regroup/mobile`). Documented, ratcheted debt.
- **Analytics.** One event (`signin`). Matters for diagnosing the funnel after launch, not before.

---

## Open questions

1. **Are the 12 `STRIPE_PRICE_*` variables set in the deployed `phoenix-cleanhouse` functions config?** (decides whether any tier can be purchased) — deployment config, not readable from the repo and must not be.
2. **What reads `priceEnvVar` at runtime?** (decides whether configuration alone is sufficient)
3. **Which price-ID set is deployed — the one labelled live, or the one labelled TEST?** (decides whether a real card can be charged)
4. **Does `regroup/web` build from the current tree?** — *deployment half answered 2026-09-28:* the site **is** live on `regroup-app.com` over TLS, serving real content. Whether the repo still compiles is unverified.
5. **Does the live `/signup` wizard take a card at any step past "Next"?** (decides whether a money path exists at all — critical-path item 1)
6. **Which billing model is live — legacy per-house/per-resident, or tiers?** (decides which checkout to repair; live prices match the legacy model)
7. **Is the Oxford Network tier's `availableForSale: false` intentional?** (decides whether a listed tier should convert)
8. **Is `demo_user@appdemo.net` still live in `phoenix-cleanhouse` Auth, and what can it see?** Shipped in the app at `regroup/mobile/src/screens/Landing/InitialLandingForm.tsx:76`; with critical-path item 9 outstanding, a shared credential reads every resident's files.
9. **What should any of this cost?** No pricing validation exists in the repo.
10. **Will Google Play still accept an update at `targetSdkVersion 34`?** (decides whether Android fixes can ship at all; the 36 deadline passed 2026-08-31)
11. **Why were `SubscriptionGate`, `BillingInfoComponent`, `SubscribePageComponent` and `linkingConfig` all built and never wired?** (a deliberate hold would reorder Tier 1)

---

## How this was verified

Direct inspection only — no subagents, after the prior run's five agents produced three truncated
reports and one that never returned. Verified this session: `regroup/firebase.json`,
`regroup/web/package.json` scripts, `regroup/web/src/environments/environment.prod.ts` (keys
redacted before display), `regroup/functions/.env.example`, `regroup/scripts/stripe-prices.env`,
`regroup/functions/src/config.ts`, and greps across `regroup/functions/src` for
`getDefaultPriceForProduct`, `priceEnvVar` and `defineSecret`. Live Firebase rules and index state
for `phoenix-cleanhouse` were measured earlier today via the firebaserules and Firestore REST APIs.

**Areas skipped, per this skill's applicability table:** store and distribution for
`regroup/functions` (not applicable), and iOS/Android build health, which belongs to the
store-availability bar and is covered in the companion plan.

**Added in re-run 2 (2026-09-28):** live unauthenticated probes of `regroup-app.com/pricing` and
`/signup` (content only; no account created, no form submitted); greps across `regroup/web/src` for
`app-billing-info`/`ngx-stripe`/`stripe-card` in templates and for callers of
`createOperatorSubscription`; `regroup/mobile/babel.config.js`; `App.tsx:11`; `services/house.tsx`;
`callable/auth.ts:300-338`; `SignUpWebView.tsx`; `stripeWebhook.ts:676-730`; and Apple's current
App Review Guidelines §3.1.1(a)/3.1.3(e), retrieved 2026-09-27.

**Not checked:** Stripe Dashboard state, deployed environment variables, whether `regroup/web`
compiles, any authenticated step of the live signup wizard, and App Store / Play listing state. Critical-path items 1, 5, 7, 8 and 12 and Open Questions 1-6 and 10 exist precisely because these
are console-, browser- and build-side facts rather than repo facts.
