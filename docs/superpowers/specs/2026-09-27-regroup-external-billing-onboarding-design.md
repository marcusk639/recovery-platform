# Regroup — External Billing & Operator Onboarding

**Date:** 2026-09-27 (rev 4)
**Status:** Design — awaiting approval. No implementation authorised.
**Scope:** `regroup/mobile`, `regroup/web`, `regroup/functions`. Project `phoenix-cleanhouse`.

**Rev 4 resolves the §6 decision: entitlement is enforced at the house, not at app entry.** This
restructures §4.3, dissolves compliance weakness A (§2.1), and relocates enforcement from the client
to the server (§4.8) — because houses are currently created by a direct client-side Firestore write,
which no client gate can protect.

Rev 3 added the operator lifecycle state machine (§4.3.1), reconciled the design with the
**already-mounted** `SignUpWebView` operator flow (§4.7), corrects the dependency ordering so
notification work precedes its own verification, bounds the self-heal, and adds the automated test
plan required for release (§8).

**Rev 3 corrects a rev-2-review claim.** That review stated `potentialSuperAdmin` grants
"unconditional full app access, indefinitely." That was wrong: the callable that sets it is guarded
(§3.1). The real shape of the gap is narrower and is specified in §4.3.1.

Rev 2 resolved: existing-operator lockout, build-time config, the whole-app-gating compliance gap,
the rollback lever, and per-item acceptance criteria.

## 1. Intent

Let a new house manager/owner sign up and pay for Regroup without the App Store taking a
commission, and make the app react correctly when payment fails.

Stated by the product owner:

- A 7-day trial, with billing details captured up front.
- Stripe webhooks drive account state in the database.
- **Operators get no access until the subscription is paid.** No grandfathering exemption.
- **Residents keep access for a limited window** after an operator lapses, so they can continue
  tracking recovery data and meeting house requirements — then access is revoked for all house
  users. One week maximum.
- Regroup ships **US-only**.

Two changes from the original sketch, both load-bearing:

1. **The card is collected in the system browser, not an in-app WebView.** See §2 for the
   distinction between what is verified rule and what is judgement here.
2. **Account creation stays in the mobile app.** The original sketch created the account on the web
   and handed the session back; inverting it removes the handoff problem entirely (§4.2).

## 2. Compliance basis

Quoted verbatim from <https://developer.apple.com/app-store/review/guidelines/>, retrieved
2026-09-27:

> **3.1.3(e) Goods and Services Outside of the App:** If your app enables people to purchase
> physical goods or services that will be consumed outside of the app, you must use purchase
> methods other than in-app purchase to collect those payments, such as Apple Pay or traditional
> credit card entry.

> **3.1.1(a) Link to Other Purchase Methods:** […] These entitlements are not required for
> developers to include buttons, external links, or other calls to action in their United States
> storefront apps.

> **3.1.3 Other Purchase Methods:** […] Apps in this section cannot, within the app, encourage
> users to use a purchasing method other than in-app purchase, **except for apps on the United
> States storefront** and as set forth in 3.1.1(a) and 3.1.3(a).

Consequences:

- Under 3.1.3(e), IAP is **prohibited**, not optional, for a service consumed outside the app.
  Standing on 3.1.3(e) rather than on a 3.1.1(a) exception is what removes any obligation to offer
  IAP side-by-side, and means **no StoreKit code is written**.
- US-only storefront means no entitlement, no application, no `SKStorefront` gating.
- Commission is **0%**, following Epic v. Apple (contempt ruling 2025-04-30, largely upheld by the
  Ninth Circuit Dec 2025, Supreme Court declining a stay May 2026).

### 2.1 The claim, and its two weaknesses

**The claim:** Regroup sells the administrative instrument for operating a licensed physical
sober-living facility, metered by physical capacity. Pricing is per `maxResidents` /
`maxProperties` (evidence: `regroup/functions/src/util/tierPricing.ts:17-18`).

**Weakness A — whole-app gating.** Per §4.3, an unpaid operator is denied the entire app, not a
feature. A reviewer can reasonably read a paywall over the whole binary as gating "features or
functionality within your app," which is 3.1.1's own language. This is the harder objection and
must be anticipated in review notes.

The honest rebuttal: nothing unlocks software tiers. What is gated is access to the management
tool for a physical facility the operator runs, priced per bed and per property. An operator with
no houses has nothing to manage; an operator with houses is running a real-world business.
Residents — who are not purchasers — retain access during the grace window and are never shown a
purchase CTA (§4.3), which distinguishes this from a consumer paywall.

**Resolved in rev 4: entitlement is enforced at the house, not at app entry.** An operator signs in
and reaches the app; payment is required to **register or retain a house**. This is stronger on
every axis:

- It is almost exactly what the product owner originally described: "when a house manager/owner
  signs up to create a house, they must be redirected…".
- It removes weakness A entirely. Nothing gates "functionality within the app"; what is gated is
  registering a real-world facility, which is squarely 3.1.3(e).
- It matches the code's existing grain — `potentialSuperAdmin` already exists precisely to let a
  pre-house operator through (§3.1).

Consequence for weakness A: **it largely dissolves.** Nothing gates "features or functionality
within the app." What is gated is registering and retaining a physical facility — the 3.1.3(e) case
in its plainest form. The operator retains the app shell: sign-in, billing, settings, support, and
account deletion. Retaining account deletion in the ungated shell also keeps Guideline 5.1.1(v)
reachable, which an app-entry paywall would have obstructed.

Review notes should now say: the subscription is what lets an operator run a licensed sober-living
house through Regroup, billed per bed and property; the app itself is not sold.

**Weakness B — tier feature flags.** `tierPricing.ts:3-9` declares `analytics`, `whiteLabel`,
`complianceExport`. These read as software entitlements. Review notes should lead with
physical-capacity metering and must not describe tiers as unlocking in-app software features. See
§6 for whether these flags gate anything at runtime.

**Judgement, not rule:** that the checkout must open in the system browser rather than a WebView is
**not** stated in the guideline text I retrieved. It comes from secondary sources and from the
reviewer-perception argument: a card form inside our own WebView is indistinguishable from in-app
purchase and forfeits the 3.1.3(e) framing. Treat as a strong design constraint on judgement
grounds, not as a cited requirement.

**Android:** Google announced 2026-07-22 that US developers enrolled in its external-content-links
and alternative-billing programs must report transactions and pay service fees from
**2026-10-01**. Currently 0%. Contested. Does not affect the iOS design; Android margin may change.

## 3. Current state (measured)

This feature is **mostly integration, not construction**. Several complete subsystems exist and
were never wired up.

### Exists and works

| Thing | Evidence |
|---|---|
| Card collector, `ngx-stripe` Elements (221 lines) | `regroup/web/src/app/components/billing/billing-info/billing-info.component.ts` |
| Billing callables incl. `createBillingPortalSession({ returnUrl })` | `regroup/web/src/app/services/functions/cloud-function.service.ts:36,56,62,68,74` |
| Gate logic, 5 states, fail-closed kill switch | `regroup/mobile/src/hooks/useSubscriptionGate.ts` |
| Gate UI + background→active cache refresh | `regroup/mobile/src/components/subscription/SubscriptionGate.tsx` |
| Dunning: escalation to `unpaid` at attempt 3 + FCM to admins | `regroup/functions/src/webhooks/stripeWebhook.ts:676-730` |
| House-level status/grace writer helper | `regroup/functions/src/webhooks/stripeWebhook.ts:198-264` |
| Native deep-link pipeline (`onLink`, `getLinkType`) — **mounted** | `regroup/mobile/src/services/native-deep-links`, used at `screens/Splash/Splash.tsx:120`, `screens/SignUp/SignUp.tsx:21` |
| Open-returned-URL-in-browser precedent | `regroup/mobile/src/screens/HouseSettings/StripeSettingsScreen.tsx:224` |
| Idempotent house-status backfill (pattern to copy) | `regroup/functions/src/scripts/migrateHouseSubscriptionStatus.ts` |
| **Operator WebView signup flow — mounted** | `regroup/mobile/src/screens/SignUp/SignUpWebView.tsx`, rendered at `screens/SignUp/SignUp.tsx:252` when `signUpRole === 'superAdmin'` |
| Guarded self-service onboarding claim | `regroup/functions/src/callable/auth.ts:300-338` (`givePotentialSuperAdminPrivilege`) |

### 3.1 `potentialSuperAdmin` — accurate account

`useSubscriptionGate.ts:102-104` returns `allowed` on `user.potentialSuperAdmin`, **before** the
kill-switch check and before any subscription check. The flag reaches the client from a custom
claim and is also set locally at `regroup/mobile/src/util/user.ts:25`.

The callable that grants it, `givePotentialSuperAdminPrivilege`
(`regroup/functions/src/callable/auth.ts:300-338`), **is guarded** — it refuses any caller holding
`admin` or `superAdmin` house claims, checked twice: once against the token and once against the
live Auth record, the latter specifically to defeat stale JWTs. It is therefore available only to
users with no house claims.

It is cleared when the user gains real house claims: `createClaims`
(`util/claims.ts:44-63`) defaults `potentialSuperAdmin` to `false`, and
`callable/auth.ts:119-126` rejects empty `addAdminAuthorization` payloads specifically because they
would otherwise reset the flag as a side effect.

**So the gap is bounded, not unlimited:** an operator can hold `potentialSuperAdmin` — and thus
bypass the paywall — for exactly as long as they own no houses. Acquiring a house clears the flag
and drops them behind the gate. The exposure is "unpaid access to an app with nothing in it,"
which is closer to a free tier than to a breach. It still must be specified rather than left
implicit, because after item 10 it becomes the documented route around the paywall (§4.3.1).

### 3.2 `SignUpWebView` — the original design already shipped, with a credential bridge

`SignUpWebView.tsx` is **mounted** (`SignUp.tsx:252`) for the `superAdmin` signup role. It loads
`https://regroup-app.com/pricing` in a `react-native-webview` and receives `postMessage` payloads;
when a message carries `email` and `password` it dispatches `login({ email, password })`.

Two consequences:

1. **The WebView operator-signup flow this project set out to build already exists.** §4.1's design
   is therefore a *change* to a live flow, not a greenfield addition. §4.7 covers the reconciliation.
2. **The session handoff is implemented by passing the password across the WebView bridge.** This is
   the exact fragility predicted when the flow was first discussed, realised in the least safe form.
   Origin is allowlisted and fails closed (`isAllowedSignupUrl`, `SIGNUP_ORIGIN_ALLOWLIST`), and the
   docstring records that a hardcoded dev URL was previously removed — so it has had one hardening
   pass. Handling a plaintext password in the page and relaying it over `postMessage` remains a
   design that §4.2's callable pattern removes entirely.

### Written but never wired

| Thing | State |
|---|---|
| `SubscriptionGate` | Zero references outside its own file and test. `App.tsx` mounts `RootNavigator`/`RootNavigatorMemo` with no gate. Its docstring claims it wraps `MainNavigator`, which does not exist. **The paywall is not enforced today.** |
| `BillingInfoComponent` | Declared at `regroup/web/src/app/app.module.ts:195`; no route, no `<app-billing-info>` in any template. The working card collector is unreachable. |
| `SubscribePageComponent` | 306-byte stub: empty constructor, empty `ngOnInit`, 0-byte CSS. Route `subscribe` renders nothing functional. |
| `linkingConfig` (141 lines) | `regroup/mobile/src/navigation/linking.ts`; only self-references. |

### Release blockers confirmed in code

1. **`process.env` is not populated in the mobile app.** `regroup/mobile/babel.config.js` contains
   only `presets: ['module:metro-react-native-babel-preset']` — no `react-native-config`,
   `react-native-dotenv`, or inline-env transform. Arbitrary `process.env.*` reads are `undefined`
   at runtime. Therefore:
   - **`App.tsx:11` ships `'pk_test_placeholder'` as the Stripe publishable key in every build,
     including production.** Release blocker, independent of this feature.
   - `RATS_WEB_URL` (`SubscriptionRequiredScreen.tsx:14`) can never be set, so the fallback always
     wins.
2. **The app's only subscription link-out is a hard 404.** The fallback is
   `https://regroup-app.com/billing`; `app-routing.module.ts` declares 27 routes and none is
   `billing`.
3. **Payment failure never reaches house state.** `handleInvoicePaymentFailed`
   (`stripeWebhook.ts:676-730`) updates only the subscription doc and notifies admins. It does not
   call the house-status helper at `:198-264` and never sets `guestGraceEndsAt`. Residents
   therefore keep full access through `past_due` by accident.
4. **Residents are never notified.** Only `sendFcmToHouseAdmins` fires. Residents lose access with
   no warning.
5. **Grace is 48 hours and keyed to the wrong event.** A comment at `stripeWebhook.ts:736`
   documents a 48-hour `guestGraceEndsAt`. The enclosing handler was not read — the trigger event
   must be confirmed (§6). 48h is well under the one-week policy and is not coordinated with the
   dunning schedule.
6. **Deep-link scheme mismatch.** `linking.ts:25-29` declares `regroup://`; native registers
   `regroup-app` (`ios/rats/Info.plist:32`, `android/app/src/main/AndroidManifest.xml:36`).
7. **Dead associated domain.** `applinks:cleanhouse.page.link` (`ios/rats/rats.entitlements`) is a
   Firebase Dynamic Links domain; that service shut down Aug 2025.
8. **Domain inconsistency.** `screens/SignUp/SignUpFormView.tsx:235,242` uses `regroup.app`;
   everything else uses `regroup-app.com`.
9. **Release push entitlement is `development`.** `rats.entitlements` sets
   `aps-environment = development`, which breaks production push — including every dunning
   notification this design depends on.

## 4. Design

### 4.1 Flow

1. Manager signs up **in the app**. Firebase Auth, free, no purchase, no gate.
2. App presents "Start 7-day trial" — permitted in-app under 3.1.1(a) for a US-storefront app, and
   required to be non-IAP under 3.1.3(e).
3. App calls a callable that returns a URL (§4.2) and opens it with `Linking.openURL` — the
   **system browser**, never a WebView.
4. Card details are entered on the web page; the trial starts.
5. Web redirects to a deep link back into the app. The app still holds its Firebase session, so
   nothing is restored; it refetches entitlement.
6. Webhooks write state to Firestore; `useSubscriptionGate` reads it and the gate opens.

### 4.2 Identity handoff — no token minting

**The browser never needs the Firebase session.** The authenticated app calls a callable; the
callable reads `request.auth.uid`, resolves that user's Stripe customer, creates the session, and
returns a URL already bound to the right user.

This is the existing shape of `createBillingPortalSession({ returnUrl })`
(`cloud-function.service.ts:74`), already consumed this way at `StripeSettingsScreen.tsx:224`.

Explicitly rejected: Firebase custom token over deep link, and one-time-code exchange. Both become
unnecessary once account creation precedes payment, and both put a credential in a URL for no gain.

Return leg uses `src/services/native-deep-links` (mounted, proven by the invitation flow), **not**
`linkingConfig`. Target `https://regroup-app.com/app/billing/complete` (universal link, already an
associated domain), with `regroup-app://` as fallback. Do not introduce `regroup://`.

### 4.3 Access policy

**Entitlement is scoped to the house, not to the app.**

An authenticated operator always reaches the app. What requires an `active` or `trialing`
subscription is:

1. **Creating a house.** No entitlement ⇒ creation is refused.
2. **Retaining access to an existing house.** On lapse, the house enters grace (§4.3 residents);
   when grace expires, house-scoped access is revoked for **every** user of that house, operator
   included.

What remains available to an unentitled operator, always: sign-in, the trial/billing flow, settings,
support, and **account deletion**. This is deliberate — it is the operator's route back to paying,
and it keeps Guideline 5.1.1(v) satisfiable.

This two-part rule is what makes the model coherent. Gating only *creation* would let a lapsed
operator manage existing houses indefinitely without paying, which would eliminate recurring
revenue. Gating *retention* alone would not stop an unpaid operator standing up new houses.

**The operator and resident rules therefore converge**: both hinge on the house's entitlement state,
and both revoke at `guestGraceEndsAt`. There is one entitlement question — "is this house paid
for?" — asked of every user of that house.

**Data integrity remains a correctness requirement.** `subscriptionStatus()` returns `undefined`
when `subscriptionMetadata` is absent, so a *paying* operator with a stale document would be refused
house creation. That this gap is real is established by
`regroup/functions/src/scripts/migrateHouseSubscriptionStatus.ts`, which exists because "House docs
created before the paywall have no subscriptionStatus," and by the grandfathered legacy houses at
`util/rentFee.ts:17,28`. Both mitigations from rev 2 still apply and are still prerequisites:

- **Reconciliation backfill**, modelled on `migrateHouseSubscriptionStatus.ts`: idempotent,
  `--dry-run` first, writes `user.subscriptionMetadata` from **Stripe as source of truth**.
- **Self-healing read path**: when entitlement is absent (as distinct from a real inactive status),
  a callable re-checks Stripe and repairs Firestore if a live subscription exists.

  **Bounded explicitly.** The server records `lastStripeReconcileAt` on the user document and
  returns early without calling Stripe if it is under 24h old. The client always calls; the server
  rate-limits.

#### 4.3.1 Operator lifecycle states

Every operator resolves to exactly one state. Under house-scoped entitlement the outcome is no
longer "app or no app" but "which surfaces".

| State | Condition | App shell | House creation | Existing houses |
|---|---|---|---|---|
| Onboarding | `potentialSuperAdmin`, no houses | yes | **refused** — routed to trial offer | n/a |
| Trialing | `status === 'trialing'` | yes | allowed | full |
| Active | `status === 'active'` | yes | allowed | full |
| Lapsed, in grace | inactive status, `guestGraceEndsAt` future | yes | **refused** | full, with banner |
| Lapsed, grace expired | inactive status, `guestGraceEndsAt` past | yes | **refused** | **revoked** |
| Never subscribed | operator claims, metadata absent, reconciliation confirms no Stripe subscription | yes | **refused** — trial offer | n/a |
| Role not yet assigned | no `isAdmin`/`isSuperAdmin`/`isGuest`, user doc loaded | yes | refused | n/a |

Two things this fixes that the app-entry model could not:

- `potentialSuperAdmin` (§3.1) stops being a paywall bypass **by construction**. Its purpose —
  letting a pre-house operator through — is now correct rather than a hole, because the paywall no
  longer sits at app entry. The operator reaches the app, and is stopped at house creation.
- The `loading`-forever fallthrough (§4.3.3) is no longer a blocking hang, since the app shell
  renders regardless. It remains a defect for house-scoped surfaces and is still fixed.

#### 4.3.2 Never-subscribed is not the same as lapsed

`SubscriptionRequiredScreen` is written for lapsed operators — its actions are "Manage
Subscription", "I've subscribed", "Sign out". A first-time operator needs a different screen: the
trial offer, the price, and the CTA that opens the browser (§4.1 step 3).

Distinguish on **absence of `subscriptionMetadata`** versus a present-but-inactive `status`. The
gate gains one state, `trial_available`, returned when an operator holds no subscription metadata
and reconciliation (§4.3) has confirmed no live Stripe subscription. `SubscriptionGate` renders the
new `TrialOfferScreen` for it.

This also answers where the trial CTA lives: on `TrialOfferScreen` for never-subscribed operators,
and on the existing `SubscriptionRequiredScreen` for lapsed ones.

#### 4.3.3 Role not yet assigned must be terminal

The hook's final `return { status: 'loading' }` is unreachable-by-accident today and becomes a hang
once the bypass tightens. Replace the fallthrough with an explicit decision:

- If the user document has loaded and carries no role, resolve to `subscription_required` with the
  `TrialOfferScreen` — fail **closed**, consistent with the kill switch's posture.
- Reserve `loading` for genuinely in-flight reads, bounded by a timeout, after which it resolves to
  the closed state rather than spinning.

No code path may return `loading` indefinitely. This is asserted by test (§8).

**Residents — time-limited access, then revoked.**

Residents read `house.subscriptionStatus` and `house.guestGraceEndsAt`
(`useSubscriptionGate.ts:129-158`). Policy:

- While the house is `active`/`trialing`: full access.
- On first payment failure: grace begins. Full access continues, with a visible banner stating the
  date access ends.
- After `guestGraceEndsAt`: `grace_expired` for **all** house users.
- Residents are **never shown a purchase CTA, price, or paywall** — they are not the purchaser.
  They see an informational screen directing them to their house manager. This also narrows the
  3.1.1 surface (§2.1).

**Grace window: 7 days from first payment failure.** Reasoning:

- It must be coordinated with dunning, which today escalates to `unpaid` at `attempt_count >= 3`
  (`stripeWebhook.ts:707`). If grace expires *before* retries are exhausted, residents are cut off
  while the operator's card may still succeed — the worst outcome for everyone. Stripe's retry
  schedule must therefore be configured so attempts 1-3 complete **inside** the 7 days, making
  grace expiry and dunning exhaustion coincide.
- 7 days is the stated maximum and gives residents a week to export or record data before losing
  access — the reason the window exists at all.
- The current 48 hours is too short and keyed to the wrong event; it is raised and re-keyed.

The window is a single named constant, server-side, so it can be tuned without a client release.

**Explicitly an open question (§6):** whether 7 days is optimal for conversion or retention cannot
be answered from this repository — it holds no funnel, churn, or pricing data. The structural
argument is that resident disruption, not operator inconvenience, is the real payment pressure,
because residents are the operator's own customers. That argues for a window long enough to be
humane and short enough that the operator feels the deadline. It does not tell us whether 7 is
better than 5 or 14.

### 4.4 Trial and payment validation

- `trial_period_days: 30` → `7` at `regroup/functions/src/api/stripe.ts:101` and `:127`. Replace
  both literals with one named constant rather than editing two numbers.
- **Applies to newly created subscriptions only.** In-flight 30-day trials are unaffected; no
  retroactive change, no migration.
- A card is already required at signup: `createCustomer(email, paymentMethod)` (`api/stripe.ts:48`).
  Collection is not the gap.
- **The gap is detection latency.** A bad card stays silent until `invoice.payment_failed` at trial
  end. Add a SetupIntent confirmation **inside `createCustomer`, immediately after the payment
  method is attached and before the subscription is created** — so a decline aborts signup rather
  than producing an account with an unusable card. It supplements rather than replaces the existing
  attach.

### 4.5 Failure UX

Already built, unreachable only because the gate is unmounted: `SubscriptionRequiredScreen` for
lapsed operators, `GraceExpiredScreen` and the grace banner for residents, and cache invalidation
on background→active so returning from the browser refreshes state without a restart.

New: resident-facing notification at grace start and 24h before expiry (blocker 4), and the
house-state write on payment failure that currently never happens (blocker 3).

### 4.6 Rollback

**The kill switch is the rollback lever, and it already exists.** Firestore `paywall/config`, field
`enabled`. Setting `enabled: false` makes `useSubscriptionGate` return `allowed` for every user
(`useSubscriptionGate.ts` — `usePaywallKillSwitch`), taking effect within the 5-minute
`staleTime` with no client release.

- Default is **fail-closed**: absent document or read error ⇒ paywall active. This must not be
  softened, including during testing.
- Before item 12 (mounting the gate), confirm the document exists and can be flipped, and record
  who has write access.
- Rollback for items 1-11 is ordinary revert; none is destructive except the backfill, which is
  idempotent, `--dry-run`-first, and writes only fields absent or stale.

### 4.7 Reconciling the existing `SignUpWebView`

`SignUpWebView` is live for `signUpRole === 'superAdmin'` (§3.2). The design must replace it rather
than add beside it, or operators will have two signup paths with different security properties.

Target end state:

- Operator signup happens natively in the app (§4.1 step 1) — no WebView.
- Payment happens in the **system browser** via the §4.2 callable URL — no WebView.
- `SignUpWebView` and its `postMessage` credential bridge are **removed**, along with
  `SIGNUP_ORIGIN_ALLOWLIST`, `isAllowedSignupUrl`, and the `signUpRole === 'superAdmin'` branch at
  `SignUp.tsx:252`.

Sequencing constraint: `SignUpWebView` is the only operator signup path today. It cannot be removed
until the native path plus browser checkout works end to end. Removal is therefore part of item 12
(mounting the gate), not an earlier item, and its removal is what closes the credential-bridge
exposure.

Interim risk while both exist: an operator who signs up through the WebView still authenticates by
password-over-`postMessage`. That is the status quo, not a regression, but it should not outlive
this project.

### 4.8 Enforcement architecture — where the gate actually has to live

**Houses are created by a direct client-side Firestore write.** `regroup/mobile/src/services/house.tsx:46`
(`createHouse`) and `:162` (`createHouseBatch`) write to Firestore from the device. There is **no
`createHouse` callable** in `regroup/functions/src/callable/`, and **no callable anywhere performs a
subscription check** — the only entitlement reads in that directory are `oxford.ts:175-176`, for a
different purpose.

A client-side gate on house creation is therefore **UX, not enforcement.** Anyone able to run the app
can write the house document directly. The design needs a server-side enforcement point, and the two
halves of the §4.3 policy need *different* ones.

#### Creating a house — enforce in a callable

Move creation to a `createHouse` callable that checks entitlement server-side before writing. This
matches the pattern already used for privileged operations (`callable/invitations.ts`,
`callable/auth.ts`) and is the only enforcement that cannot be bypassed by a modified client.

The client gate remains, for UX: an unentitled operator sees the trial offer instead of a failed
write.

#### Retaining a house — only Security Rules can enforce this

Revocation at grace expiry is a **read** concern, and reads go straight from the device to Firestore
across many collections. Rewriting every read as a callable is not proportionate. The enforceable
mechanism is Firestore Security Rules.

Rules can evaluate this without new plumbing, because house documents already carry the fields:
`house.subscriptionStatus` and `house.guestGraceEndsAt` (`regroup/functions/src/entities/House.ts:83`,
`regroup/mobile/src/entities/House.tsx:81`). A rule can `get()` the house document and permit
house-scoped access only when the status is `active`/`trialing` or grace has not expired.

Preferred over custom claims: a `subscriptionActive` claim would be cheaper per read, but claims
propagate only on token refresh — up to an hour — so a revoked operator would retain access for that
window, and a *reinstated* one would stay locked out after paying. Reading the house document is
immediate and has no staleness window. Cost is one document read per rule evaluation.

#### Hard prerequisite: the rules deploy path is broken

**This repo does not deploy Firestore or Storage rules.** As documented in `docs/launch-readiness/`,
every deploy path is `--only functions`, there are four separate `firebase.json` files under
`regroup/`, and a world-open Storage ruleset from 2020 survived in production for six years because
nothing ever shipped a rules change.

Enforcing revenue through a rules file that is never deployed is not enforcement. **Fixing the rules
deploy path is a prerequisite for the retention half of §4.3**, not a cleanup task. Until it is
fixed, only the creation half (callable) is actually enforced, and that limitation must be stated
rather than assumed away.

## 5. Work items, in dependency order

| # | Item | Type | Acceptance criterion |
|---|---|---|---|
| 0 | Determine why the subsystems in §3 were never wired | Investigation | `git log --follow` on each file, plus one direct ask. **Exit:** if no deliberate hold is found in one pass, record "no hold found" and proceed. |
| 1 | Build-time config mechanism for the mobile app | ENG | A build-time variable is readable at runtime on device; `STRIPE_PUBLISHABLE_KEY` resolves to a real `pk_live_` value in release and the `pk_test_placeholder` fallback is unreachable. Fixes blocker 1. |
| 2 | Reconciliation backfill + bounded self-heal (§4.3) | ENG | `--dry-run` reports counts; live run idempotent; every operator with a live Stripe subscription holds `active`/`trialing`. Self-heal issues ≤1 Stripe call per user per 24h, enforced server-side. |
| 3 | Real web billing page, routed | ENG | `GET /billing` returns 200 and renders the `ngx-stripe` card form; a test card creates a trialing subscription. Fixes blocker 2. |
| 4 | Callable returning a browser billing URL for the authed user | ENG | Unauthenticated ⇒ rejected. As operator A ⇒ URL resolves to A's Stripe customer, never another user's. |
| 5 | Operator lifecycle states + `TrialOfferScreen` + terminal `loading` fix | ENG | Every row of §4.3.1 resolves to its stated surfaces; no input produces `loading` indefinitely (§8.3). |
| 6 | Trial CTA opening the system browser | ENG | Tapping it leaves the app into the browser; no WebView instantiated in the path. |
| 7 | Deep-link return handler | ENG | Cold start and warm resume both reach the app and refresh entitlement; scheme matches native registration. Fixes blocker 6. |
| 8 | Trial 30 → 7 via one constant | ENG | New subscription shows a 7-day trial; in-flight trials unchanged. |
| 9 | SetupIntent at signup | ENG | A known-declined test card fails signup immediately; no account retains an unusable payment method. |
| 10 | **`createHouse` callable with server-side entitlement check** | ENG | Unentitled operator's creation attempt is refused server-side; entitled operator succeeds. **Primary enforcement** for §4.3 rule 1 (§4.8). |
| 11 | **Fix the Firestore rules deploy path** | ENG/OPS | A rules change made locally is provably live in `phoenix-cleanhouse`. Hard prerequisite for item 12 (§4.8). Cross-ref `docs/launch-readiness/`. |
| 12 | **Firestore rules enforcing house-scoped access on entitlement** | ENG | After grace expiry, a direct Firestore read of house-scoped data by any user of that house is denied. **Only enforcement** for §4.3 rule 2. Depends on 11. |
| 13 | Fix `aps-environment`, remove dead `cleanhouse.page.link`, settle canonical domain | ENG | Release build carries `aps-environment = production`; one canonical domain. Fixes blockers 7, 8, 9. **Precedes 14.** |
| 14 | Payment-failure → house state + resident notifications + 7-day grace | ENG | `invoice.payment_failed` sets `house.subscriptionStatus` and `guestGraceEndsAt = firstFailure + 7d`; residents notified at grace start and 24h before expiry; after expiry all house users lose house access. Fixes blockers 3, 4, 5. |
| 15 | Mount the house-scoped gate; remove `SignUpWebView` | ENG | Staged (§5.1). Kill switch verified flippable first (§4.6). WebView and its credential bridge deleted (§4.7). |
| 16 | CI job running `regroup/mobile` + `regroup/functions` suites on every PR | ENG | Both suites block merge on failure; §8.2 and §8.3 are in the run. **Land early** — every other acceptance criterion assumes tests run. |
| 17 | Review notes arguing 3.1.3(e) | OPS | §2.1 |

Item 15 is the last engineering item deliberately: the gate must not mount before a working purchase
path exists, and `SignUpWebView` cannot be removed until the native path replaces it.

Item 13 precedes 14 because 14's acceptance criterion is a *delivered* notification, and
`aps-environment = development` makes every production notification fail silently.

Items 10 and 12 are the only real enforcement in this design. Everything else is UX around them.

### 5.1 Staged rollout for item 15

1. Kill switch verified present and flippable.
2. Item 2's backfill run and reconciled against Stripe — operators with a live Stripe subscription
   must equal operators holding `active`/`trialing` in Firestore.
3. Gate enabled for internal/staff operator accounts only.
4. Gate enabled for newly created operator accounts.
5. Gate enabled for all existing operators.
6. `SignUpWebView` removed once no operator signup depends on it.

Stop and flip the kill switch if any operator with a live Stripe subscription is refused.

## 6. Open questions

- **RESOLVED (rev 4)** — entitlement is enforced at the house, not at app entry (§4.3, §4.8).
- **Is the retention half of §4.3 in scope for first launch?** It depends on item 11, fixing the
  rules deploy path, which has its own history in `docs/launch-readiness/`. If it is deferred, only
  house *creation* is enforced at launch and a lapsed operator retains access to existing houses.
  That is a revenue decision, and it must be made explicitly rather than discovered.
- **Why were the subsystems in §3 never wired?** Item 0. A deliberate hold changes the plan.
- **Does any production operator lack `subscriptionMetadata`, and how many?** Sizes item 2.
  Requires a Firestore count on `phoenix-cleanhouse`; not runnable from the repo.
- **What event currently sets the 48-hour `guestGraceEndsAt`?** `stripeWebhook.ts:736`'s enclosing
  handler was not read. Blocks item 11's re-keying.
- **Is 7 days the right grace window for conversion and retention?** Unanswerable here — the repo
  holds no funnel, churn, or pricing data. Decide from operator interviews or post-launch data.
- **Is `regroup.app` or `regroup-app.com` canonical?** Blocks items 7 and 10.
- **Are the 12 `STRIPE_PRICE_*` vars bound in deployed function config?** Carried from
  `docs/launch-readiness/plan-regroup-2026-09-27.md`; blocks any live charge regardless of this
  design.
- **Do tier feature flags gate anything at runtime?** If not, weakness B largely dissolves and the
  flags should be removed from marketing copy.

## 7. Risks

| Risk | Severity | Concrete failure |
|---|---|---|
| Reviewer reads whole-app gating as 3.1.1 | High | Rejection of a shipped app (iOS build 40). Mitigation: §2.1 review notes |
| Backfill incomplete when gate mounts | High | Paying operators locked out. Mitigation: items 2 + 5.1 gate on reconciled counts |
| `pk_test_placeholder` reaches production | High | No live charge ever succeeds from mobile. Mitigation: item 1 |
| Grace expires before dunning exhausts | Medium | Residents cut off while the operator's card would have succeeded. Mitigation: §4.3 coordination |
| `aps-environment = development` | Medium | Every dunning and grace notification silently fails in production |
| Kill switch softened to fail-open during testing | Medium | Paywall silently disabled in production |
| Google US link-out fees from 2026-10-01 | Medium | Android margin drops without warning |
| Client-side house creation bypasses a client-only gate | High | Unentitled operator writes the house document directly and uses the product free. Mitigation: item 10 |
| Rules deploy path unfixed when item 12 ships | High | Revocation rules exist in the repo but not in production; retention is unenforced while appearing enforced. Mitigation: item 11 gates item 12 |
| Claim-based entitlement chosen over document reads | Medium | Up to 1h staleness: revoked operators keep access, reinstated operators stay locked out after paying (§4.8) |
| Trial constant changed at one of two sites | Low | Inconsistent trial lengths between legacy and tier paths |

## 8. Automated testing

Release gate: **no item in §5 is done until its tests exist, pass, and run in CI.** Existing
harnesses to extend rather than replace: `regroup/mobile/src/hooks/__tests__/useSubscriptionGate.test.ts`,
`regroup/functions/src/__tests__/webhooks/stripeWebhook.test.ts`,
`regroup/mobile/src/integration/setup.ts` (Firestore/Auth emulator harness), and the Maestro flows
under `e2e-maestro/`.

### 8.1 Layers

| Layer | Runner | Scope |
|---|---|---|
| Unit — gate logic | Jest, `regroup/mobile` | `useSubscriptionGate` state resolution, pure |
| Unit — entitlement mapping | Jest, `regroup/functions` | `subscriptionStatus`, `subscriptionIsActive`, tier resolution |
| Unit — webhook handlers | Jest, `regroup/functions` | handler ⇒ Firestore write shape, mocked Stripe |
| Integration — emulator | Jest + Firebase emulators (Firestore 8080, Auth 9099, Functions 5001) | callable auth boundaries, backfill idempotency, claim transitions |
| E2E — device | Maestro | signup → browser handoff → deep-link return → gate opens |

### 8.2 Bypass enumeration — the regression net

The defect class this design is most exposed to is a new short-circuit added above the subscription
check, as `potentialSuperAdmin` sits today (§3.1). One test guards it:

> Enumerate the cartesian product of gate inputs — `anonymous`, `isAnonymous`,
> `potentialSuperAdmin`, `isAdmin`, `isSuperAdmin`, `isGuest`, every
> `subscriptionMetadata.status` including absent, every `house.subscriptionStatus` including absent,
> `guestGraceEndsAt` past/future/absent, kill switch on/off/erroring. Assert that when the kill
> switch is **enabled** and no active or trialing subscription exists, the result is `allowed` for
> **only** the explicitly allowlisted combinations, which the test names as data.

Adding a new bypass then fails the test until the allowlist is edited deliberately. Required
assertions:

- Kill switch enabled + operator with absent metadata ⇒ never `allowed`.
- Kill switch enabled + operator status in `INACTIVE_STATUSES` ⇒ never `allowed`.
- Kill switch **read throws** ⇒ paywall active (fail-closed), asserted directly, not incidentally.
- `potentialSuperAdmin === true` + operator holds house claims ⇒ not `allowed` (the onboarding
  window has closed).

### 8.3 `loading` is never terminal

Per §4.3.3, assert that for every input combination, either the result is a terminal state, or it is
`loading` **and** a subsequent resolution with loaded data produces a terminal state. A test that
drives the hook with fully-loaded-but-roleless user data and asserts a terminal closed state — not
`loading` — is the specific regression for the infinite-spinner defect.

### 8.4 Resident access and grace

- `active`/`trialing` ⇒ `allowed`, no banner.
- `past_due` with `guestGraceEndsAt` in the future ⇒ `grace_period`, banner shows the end date.
- `guestGraceEndsAt` in the past ⇒ `grace_expired` for residents **and** for every other role in
  that house.
- Absent `guestGraceEndsAt` on a non-active house ⇒ must not silently grant access; assert the
  chosen closed behaviour explicitly.
- **No resident state renders a price, purchase CTA, or paywall.** Snapshot or query-by-role
  assertion across all resident states — this is a compliance guardrail (§2.1), not cosmetics.

### 8.5 Webhooks and entitlement

In `stripeWebhook.test.ts`:

- `invoice.payment_failed`, attempt 1 ⇒ subscription `past_due`, `house.subscriptionStatus` written,
  `guestGraceEndsAt = firstFailure + 7d`.
- attempt 3 ⇒ `unpaid`; grace end **unchanged** (it is keyed to first failure, not latest attempt).
- `customer.subscription.deleted` ⇒ gate closes for operator and residents.
- Resident notifications dispatched at grace start and at the 24h-before-expiry boundary.
- Idempotency: replaying the same event produces no duplicate notification and no grace extension.
- Signature verification rejects an unsigned or wrongly-signed payload.

### 8.6 Backfill, self-heal, and callable boundaries

Emulator-backed:

- Backfill `--dry-run` mutates nothing; live run is a no-op on second invocation.
- Backfill writes `active`/`trialing` only where Stripe is the source of truth; never downgrades a
  live subscription.
- Self-heal: two calls within 24h issue **one** Stripe call; `lastStripeReconcileAt` enforced
  server-side, not client-side (§4.3).
- Billing-URL callable: unauthenticated ⇒ rejected; operator A can never obtain a URL bound to
  operator B's customer. Assert on the returned customer id, not on a 200.
- `givePotentialSuperAdminPrivilege` retains both guards: caller with token house claims rejected,
  and caller with live-record house claims but a stale token also rejected.

### 8.7 Server-side enforcement (the tests that matter most)

Client-gate tests prove UX. These prove the product cannot be used unpaid, and are emulator-backed:

- `createHouse` callable: unentitled operator ⇒ refused; entitled ⇒ succeeds; caller cannot create a
  house owned by another operator.
- **Direct-write bypass:** a client writing the house document straight to Firestore, bypassing the
  callable, is **denied by rules**. This is the test that would have caught the gap rev 3 missed.
- **Revocation:** with `guestGraceEndsAt` in the past, a direct Firestore read of house-scoped data
  is denied for operator, admin and resident alike.
- **Grace boundary:** the same read is permitted with `guestGraceEndsAt` in the future.
- Rules tests run against the emulator (Firestore 8080) and are part of item 16's CI job — a rules
  test that never runs is exactly how the 2020 Storage ruleset survived.

### 8.8 Compliance guardrails

Mechanical assertions, because these are the failures that cost a submission:

- **No `WebView` is imported or rendered anywhere in the payment path.** A static assertion over the
  trial-CTA and billing modules. After item 12, assert `SignUpWebView` no longer exists.
- Trial CTA calls `Linking.openURL`, not a WebView navigation.
- Release-config assertion: `aps-environment` is `production`; publishable key does not match
  `pk_test_` or the placeholder literal.

### 8.9 E2E (Maestro)

One flow, the money path: new operator signs up → taps trial CTA → leaves to browser → returns via
deep link → gate opens → creates a house. Plus cold-start return (app killed while in browser),
which is the variant that breaks in practice.

Maestro smoke tests were failing and then disabled in this repo as of 2026-09-04, and
`regroup/mobile` has **no unit test job in CI** — see item 16.

### 8.10 Not automatable here

- Real Apple review outcome (§2.1) — judgement, not testable.
- Live-card charge against production Stripe — manual, once, before launch.
- iOS release-build verification requires full Xcode, absent on the current machine.

## 9. Out of scope

StoreKit / IAP (prohibited under 3.1.3(e) for this purchase type). Non-US storefronts. Stripe
Connect rent collection (a separate 3.1.3(e) real-world service, already live). Launch blockers
tracked in `docs/launch-readiness/`: ITMS-91061 privacy manifest, in-app account deletion
(5.1.1(v)), Storage rules tenancy scoping.
