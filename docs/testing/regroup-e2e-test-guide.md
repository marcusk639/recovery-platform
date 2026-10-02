# Regroup — Release-Gating E2E Test Guide

## 1. Scope and date

**Verified:** 2026-09-29, refreshed 2026-10-01.
**Commit:** `142ffee05dfb2cf3ae5608f5c8540236fb935a72` on branch `feat/regroup-tier-billing`
(originally written against `13407ae`; nine commits landed since, and every anchor in
changed files was re-resolved for this refresh).

**Changed since the first pass — read this before trusting an older copy:**
`d30015c` fixed the mobile operator gate (SEAM-1), `392ccac`/`1ed7c8a` added
server-side entitlement enforcement to three callables, `30cae0a` made an absent
subscription status deny, `87a835d` deleted the legacy per-house/per-guest billing
path, and `9a33389` added SetupIntent card validation at signup. Sections 4, 6, 8 and
9 were rewritten accordingly.
**Working tree was dirty** at verification time (~35 modified files plus untracked
config). Every anchor below was resolved against the working tree, not against a
clean checkout of `13407ae`. Re-resolve anchors before executing if the tree has
moved — line numbers in `regroup/functions/src` drift within days.

**What was verified:** every `path:line` cited in this document was resolved with
`git grep -n` / `sed -n` at the time of writing, and the cited line was read.
`regroup/FUNCTION_AUDIT.md` was regenerated from source (`node
regroup/scripts/generate-function-inventory.js` → `✓ wrote regroup/FUNCTION_AUDIT.md
— 52 functions`).

**What was executed:** the `regroup/functions` and `regroup/mobile` Jest suites
(results quoted verbatim in §5). **Nothing else was run.** No emulator was started,
no Maestro flow was executed, no browser session was driven, no Stripe event was
triggered. Every manual step in §4–§7 is **unexecuted** and is written as an
instruction, not as a passing result.

**Excluded:** build artifacts (`**/public/`, `*.min.js`, `*-es5.js`, `*-es2015.js`,
`lib/`, `dist/`, `build/`, `node_modules/`, `_legacy/`, `_archive/`), the other three
products in the monorepo, and the abandoned Detox suite (see §8).

---

## 2. Environment setup

### 2.1 Emulator config — read this before starting anything

The only emulator configuration in the `regroup/` tree is
`regroup/mobile/firebase.json`:

```json
{
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

`regroup/firebase.json` contains **only** a `functions` key with a `predeploy` hook —
no `emulators` block at all.

**Consequences you must plan around:**

- **There is no functions emulator.** Nothing configures port 5001. Every callable
  and every webhook test in this guide therefore runs against either a deployed
  function or a locally-served function you stand up yourself. `:5001` in the docs is
  the Firebase CLI default, not this repo's configuration.
- **Start emulators from `regroup/mobile/`, not `regroup/`.** Running
  `firebase emulators:start` from `regroup/` picks up a config with no emulators
  block.
- **UI port is unset**, so it defaults to 4000. The seed script hard-codes that
  assumption (`regroup/mobile/maestro/scripts/reset-and-seed.sh:24`).

```bash
cd regroup/mobile && firebase emulators:start   # Firestore :8080, Auth :9099, UI :4000
```

**Monorepo rule (binding):** never run two products' emulators at once — homegroups,
regroup and detox-recovery all use 8080/9099 and will collide silently.

### 2.2 Prerequisites that will actually bite

- `regroup/mobile` and `regroup/web` postinstall runs `pod install`. On a machine
  without working Xcode command-line tools, `npm ci` fails in `regroup/mobile`. For
  JS-only work (Jest, ESLint, typecheck) use `npm ci --ignore-scripts`. You need real
  Xcode CLT only for the iOS simulator builds Maestro drives.
- `regroup/web` is Angular 9 with Angular Universal SSR. The `AuthGuard` deliberately
  returns `true` during server-side render
  (`regroup/web/src/app/guards/auth.guard.ts:42`) and only enforces on the client
  (`:24-35`). A curl of `/my-account` will therefore return 200 HTML with no redirect;
  that is correct behaviour, not a bug.
- Stripe: the happy-path checkout needs only `STRIPE_SECRET_KEY`. Webhook tests
  additionally need a signing secret — reference the variable names
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, declared at
  `regroup/functions/src/webhooks/stripeWebhook.ts:1003` and read at `:1011`. Never
  paste key material into this repo or into a test plan.

### 2.3 Bringing up each surface

| Surface           | Command (from repo root)                                                                                                                                                   | Notes                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| functions (tests) | `cd regroup/functions && npm test`                                                                                                                                         | Runs; see §5                       |
| functions (serve) | **UNKNOWN — could not verify.** No emulator config exists; I did not identify a working local-serve path. Would need a `firebase.json` emulators block adding `functions`. |
| mobile            | `cd regroup/mobile && npm run ios` (or `android`)                                                                                                                          | Needs Xcode CLT                    |
| mobile E2E        | `cd regroup/mobile && npm run maestro:smoke:ios`                                                                                                                           | **Seed step is broken — see §3.2** |
| web               | `cd regroup/web && npm start`                                                                                                                                              | Angular 9 dev server               |
| web tests         | **BLOCKED** — no runnable suite; see §5                                                                                                                                    |

---

## 3. Test data and personas

### 3.1 Roles the product distinguishes

| Role                        | Where it lives                                        | Set by                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `potentialSuperAdmin`       | **Both** a custom claim and a `users/{uid}` doc field | Claim: `regroup/functions/src/util/superAdminClaim.ts:39-42` and `regroup/functions/src/callable/auth.ts:339`. Doc field: web `regroup/web/src/app/entities/User.ts:64`, mobile `regroup/mobile/src/util/user.ts:25` |
| `superAdmin` (house-scoped) | Custom claim + `users/{uid}.isSuperAdmin`             | `regroup/mobile/src/services/setup-wizard.ts:215-233`                                                                                                                                                                    |
| `admin` (house-scoped)      | Custom claim + `users/{uid}.isAdmin`                  | `regroup/functions/src/callable/invitations.ts:241`                                                                                                                                                                  |
| `guest` / resident          | Custom claim + `users/{uid}.isGuest`                  | `regroup/functions/src/callable/invitations.ts:237`                                                                                                                                                                  |

The rules helpers that consume these claims are at
`regroup/mobile/firebase/firestore.rules:4` (`signedIn`), `:19` (`isHouseAdmin`),
`:26` (`isHouseSuperAdmin`), `:30` (`isHouseGuest`), `:34` (`isPotentialSuperAdmin`),
`:58` (`isAdmin`), `:62` (`isSameUser`), `:66` (`isGuestOrAdmin`), `:70`
(`houseOxfordActive`), `:76` (`isDemoAccount`).

**The claim and the doc field are written by different code and are not kept in
sync.** This is the root of SEAM-1's failure mode — see §4.

### 3.2 Seed scripts — the Maestro seed is broken

`regroup/mobile/package.json:29` defines
`"maestro:seed": "./maestro/scripts/reset-and-seed.sh"`. That script's last real step
is `regroup/mobile/maestro/scripts/reset-and-seed.sh:36`:

```
node e2e/setup/seedTestData.js
```

**`regroup/mobile/e2e/setup/seedTestData.js` does not exist.** `ls
regroup/mobile/e2e/setup/` returns only `testAccounts.json`, `testActivities.json`,
`testDisputes.json`. `find regroup -name "seedTestData*" -not -path "*/node_modules/*"`
returns nothing, and `git log -- regroup/mobile/e2e/setup/seedTestData.js` is empty —
the file has never been committed.

The same script also instructs the operator to start the emulator from the wrong
directory (`regroup/mobile/maestro/scripts/reset-and-seed.sh:9` and `:29` both say `cd regroup && firebase
emulators:start`; per §2.1 the config is in `regroup/mobile`).

**Status: `npm run maestro:seed` is BLOCKED. Every Maestro flow depends on it.**

### 3.3 Personas defined in fixture data

`regroup/mobile/e2e/setup/testAccounts.json` defines five accounts (passwords
redacted here — they are committed in plaintext, see below):

| id                 | email                               | role                                                                   |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------- |
| `guest-a`          | `test-guest-a@rats-e2e.com`         | guest, `test-house-123`                                                |
| `guest-b`          | `test-guest-b@rats-e2e.com`         | guest, `test-house-123`                                                |
| `manager`          | `test-manager@rats-e2e.com`         | admin, `test-house-123`                                                |
| `multi-house-user` | `test-multi-house@rats-e2e.com`     | admin of `test-house-a`, guest of `test-house-b`                       |
| `oxford-operator`  | `test-oxford-operator@rats-e2e.com` | admin, `test-house-oxford`, `subscriptionMetadata.oxfordEnabled: true` |

There is **no `potentialSuperAdmin` persona and no operator-with-subscription
persona** in the fixtures. Creating one is currently manual (§4, SEAM-1).

**Committed test credentials are not secret.** A literal test password appears across
~35 tracked files under `regroup/mobile`, including `testAccounts.json`. Treat every
one of these as public. Never reuse any of them against `phoenix-cleanhouse`
production.

---

## 4. Cross-surface seam tests

### SEAM-1 Web tier checkout → claims + Firestore → mobile SubscriptionGate

**Surfaces:** web → functions → Firestore/Auth → mobile
**Anchors:** `regroup/web/src/app/components/accounts/signup/signup.component.ts:84`,
`regroup/web/src/app/components/billing/billing-info/billing-info.component.ts:169`,
`regroup/web/src/app/services/auth/auth-service.service.ts:214-248`,
`regroup/web/src/app/entities/User.ts:58-68`,
`regroup/web/src/app/services/functions/cloud-function.service.ts:23-48`,
`regroup/functions/src/callable/subscriptions.ts:173`,
`regroup/functions/src/callable/subscriptions.ts:257`,
`regroup/functions/src/callable/subscriptions.ts:265`,
`regroup/functions/src/util/superAdminClaim.ts:32-67`,
`regroup/mobile/src/hooks/useSubscriptionGate.ts:139`,
`regroup/mobile/src/navigation/navigators.tsx:193-195`

**Preconditions:** emulators up per §2.1; a functions host reachable by the web app;
`STRIPE_SECRET_KEY` configured; `TIER_BILLING_ENABLED` set deliberately (see the
matrix in §6 — it changes which branch runs at
`regroup/functions/src/callable/subscriptions.ts:237`).

**Steps:**

1. In the browser, open `/pricing` (`regroup/web/src/app/app-routing.module.ts:39`)
   and choose a tier. The picker navigates to
   `/signup?houseType=<traditional|oxford>&tier=<key>&period=<month|year>` — the query
   contract is parsed at `regroup/web/src/app/components/accounts/signup/signup.component.ts:84` and `:107`.
2. Complete the signup form and submit payment. This calls
   `AuthService.subscribeOperator` (`regroup/web/src/app/services/auth/auth-service.service.ts:214`) from
   `regroup/web/src/app/components/billing/billing-info/billing-info.component.ts:169`.
3. Observe that `subscribeOperator` first creates the Auth user **and** the Firestore
   user doc with `createSuperAdmin` (`regroup/web/src/app/services/auth/auth-service.service.ts:224` →
   `regroup/web/src/app/entities/User.ts:58-68`), which sets `isSuperAdmin: true` **and**
   `potentialSuperAdmin: true` on the doc.
4. Observe the callable `createOperatorSubscription` run
   (`regroup/functions/src/callable/subscriptions.ts:173`).
5. Install/open the mobile app, sign in as the same account, and reach the main
   navigator.

**Expected observable state:**

- Firestore `users/{uid}`: `isSuperAdmin: true`, `potentialSuperAdmin: true`,
  `subscriptionMetadata.status` = `trialing` (written at `regroup/functions/src/callable/subscriptions.ts:257`),
  plus `maxResidents` / `maxProperties` copied from the tier config (`:254-255`).
- Firestore `subscriptions/{id}`: created by `upsertSubscriptionDoc`
  (`regroup/functions/src/callable/subscriptions.ts:265` on the tier path, `:322` on the legacy path).
- Firebase Auth custom claims for the uid include `potentialSuperAdmin: true`
  (`regroup/functions/src/util/superAdminClaim.ts:39-42`). The callable response carries
  `claimGranted` (`regroup/functions/src/callable/subscriptions.ts:160-168`); if the grant failed twice it is
  `false` and the subscription still exists (`regroup/functions/src/util/superAdminClaim.ts:64`).
- Mobile: `SubscriptionGate` (mounted at `regroup/mobile/src/navigation/navigators.tsx:193-195`) renders children.

**Token refresh — the classic false failure here:** the mobile gate does **not** read
custom claims at all. `useSubscriptionGate` reads Redux `s.user.user`
(`regroup/mobile/src/hooks/useSubscriptionGate.ts:124`), which is the Firestore user document. Claims are read
separately by `regroup/mobile/src/components/auth/auth.tsx:66`, and the only forced
refresh paths are `getAuthUser(true)` (`regroup/mobile/src/services/users.tsx:177-181`)
called from `regroup/mobile/src/screens/SignUp/SignUpForm.tsx:132-133` and `:199-200`
(each after a hard-coded `setTimeout(…, 1000)`) and from
`regroup/mobile/src/services/setup-wizard.ts:244`. **A stale ID token will not make
this seam fail** — but a stale Redux user document will.

**Known failure modes — FIXED in `d30015c`, retained here as regression context:**

1. ~~**The operator paywall on mobile is unreachable.**~~ Fixed. The short-circuit is
   now scoped to `!orgSetupCompleted`, and the operator branch reads the house rather
   than the never-updated user field. Regression test:
   `regroup/mobile/src/hooks/__tests__/useSubscriptionGate.test.ts`, case *"gates a
   completed operator who still carries potentialSuperAdmin"*. The original defect, for
   context:
   `regroup/mobile/src/hooks/useSubscriptionGate.ts:139` short-circuits to `allowed` whenever
   `user.potentialSuperAdmin` is truthy, _before_ the operator subscription check at
   `:121-126`. Both signup funnels set that field permanently — web at
   `regroup/web/src/app/entities/User.ts:64`, mobile at `regroup/mobile/src/util/user.ts:25` — and nothing
   in `regroup/functions/src`, `regroup/web/src` or `regroup/mobile/src` ever clears
   it. `regroup/mobile/src/services/setup-wizard.ts:227-233` updates `orgSetupCompleted`/`isAdmin`/`isSuperAdmin`
   and leaves `potentialSuperAdmin` alone. Net effect: for every operator created by
   either funnel, the mobile gate returns `allowed` regardless of subscription state.
2. If the account somehow has `potentialSuperAdmin` falsy but no role flags yet, the
   gate falls through to `regroup/mobile/src/hooks/useSubscriptionGate.ts:192` and returns `loading` forever —
   an infinite spinner rather than a paywall.

**Status:** `READY`, both paths. The negative path is now reachable: set the
operator's house `subscriptionStatus` to `canceled` and the gate returns
`subscription_required`. No hand-editing of `users/{uid}` is needed any more.

---

### SEAM-2 Stripe webhook → Firestore status → mobile gate and web `/my-account`

**Surfaces:** Stripe → functions → Firestore → mobile + web
**Anchors:** `regroup/functions/src/index.ts:40-44`,
`regroup/functions/src/webhooks/stripeWebhook.ts:1002`,
`regroup/functions/src/webhooks/stripeWebhook.ts:1027`,
`regroup/functions/src/webhooks/stripeWebhook.ts:680-754`,
`regroup/functions/src/webhooks/stripeWebhook.ts:212-266`,
`regroup/mobile/src/hooks/useSubscriptionGate.ts:167-190`,
`regroup/web/src/app/components/accounts/my-account/my-account.component.ts:93-95`

**Preconditions:** a subscription exists from SEAM-1. Webhook endpoint reachable.
Note the deployed name differs from the export: `regroup/functions/src/index.ts:40-44` re-exports
`stripeWebhook as stripeEvents`, so the Stripe dashboard endpoint and any `stripe
listen --forward-to` target must use **`stripeEvents`**, not `stripeWebhook`.

**Steps:**

1. Trigger `invoice.payment_failed` for the subscription.
2. Inspect Firestore.
3. Open the mobile app as a **guest** of one of that operator's houses.
4. Open the mobile app as the **operator**.
5. Open `/my-account` in the web app (`regroup/web/src/app/app-routing.module.ts:59`).

**Expected observable state:**

- `subscriptions/{doc}.status` becomes `past_due`, or `unpaid` once
  `invoice.attempt_count >= 3` (`regroup/functions/src/webhooks/stripeWebhook.ts:706-707`, written at `:712-716`).
- Every house owned by the operator gets `subscriptionStatus` and a
  `guestGraceEndsAt` 48 hours out (`regroup/functions/src/webhooks/stripeWebhook.ts:737-745` →
  `updateHouseSubscriptionStatus` at `:212-266`, fields written at `:246` and `:250`).
  House lookup is by `adminIds array-contains` **or** legacy `adminId` (`:221-227`);
  an operator in neither field produces a warn at `:234-239` and **no house update**.
- A push goes to house admins (`regroup/functions/src/webhooks/stripeWebhook.ts:729-733`).
- Mobile guest: gate returns `grace_period` with the banner while
  `guestGraceEndsAt` is in the future (`regroup/mobile/src/hooks/useSubscriptionGate.ts:97-99`), then
  `grace_expired` (`:157`). This half of the seam is intact.
- Mobile operator: **no change.** Nothing in `stripeWebhook.ts` writes
  `users/{uid}.subscriptionMetadata`. The only touch of the `users` collection is a
  read-only lookup by `subscriptionMetadata.subscriptionId` at `:173-183`. The
  operator's `subscriptionMetadata.status` stays at whatever checkout wrote.
- Web `/my-account`: `get status()` reads `user.subscriptionMetadata.status`
  (`regroup/web/src/app/components/accounts/my-account/my-account.component.ts:93-95`), so it shows the same stale value.

**Known failure modes:** the mobile half is now correct — since `d30015c` the operator
branch reads the same house fields the webhook writes, so a lapse reaches the operator's
app. **The web half is still broken:** `/my-account` reads
`user.subscriptionMetadata.status`, which no webhook updates, so the portal page keeps
showing the checkout-time status. Treat a stale status there as the expected current
behaviour, not a test failure. Separately, `guestGraceEndsAt` is recomputed from `Date.now()` on every
retry (`regroup/functions/src/webhooks/stripeWebhook.ts:738-740`), so Stripe's dunning schedule extends resident
access on each attempt rather than from the first failure.

**Status:** `READY` for the guest half and the mobile operator half.
`BLOCKED — no write path exists` for web `/my-account`, which still reads the user doc.

---

### SEAM-3 Invitation issue → redeem

**Surfaces:** mobile → functions → Firestore/Auth → mobile
**Anchors:** `regroup/functions/src/callable/invitations.ts:78` (`createInvitation`),
`:161` (`peekInvitation`), `:195` (`redeemInvitation`),
`regroup/mobile/src/services/admin.tsx:58`,
`regroup/mobile/src/screens/SignUp/SignUp.tsx:193`,
`regroup/mobile/src/screens/SignUp/SignUpForm.tsx:123`,
`regroup/mobile/src/screens/Splash/Splash.tsx:126`,
`regroup/mobile/firebase/firestore.rules:406-411`

**Preconditions:** an operator account with at least one house; a second device or a
signed-out state for the invitee.

**Steps:**

1. As the operator on **mobile**, invite a resident. The call originates at
   `regroup/mobile/src/services/admin.tsx:58` via
   `regroup/mobile/src/services/invitations.ts:34-37`. Other issue points are
   `regroup/mobile/src/services/setup-wizard.ts:55`, `:101` and `:118`.
   `createInvitation` authorizes the caller as house `ownerId`, house-scoped `admin`
   claim, or house-scoped `superAdmin` claim (`regroup/functions/src/callable/invitations.ts:99`) and checks
   resident capacity for slot-consuming roles (`:113-115`).
2. Open the deep link on the invitee's device. The server issues
   `regroup-app://?type=invitation&token=<token>`
   (`regroup/functions/src/callable/invitations.ts:74`). `regroup/mobile/src/screens/Splash/Splash.tsx:126` (warm
   start) and `:273` (cold start) parse it; `createInvitationFromLink`
   (`regroup/mobile/src/services/native-deep-links.ts:115`) carries only the token —
   role, houseId and email are placeholders overwritten by `peekInvitation`.
3. The signup screen calls `peekInvitation` to prefill metadata
   (`regroup/mobile/src/screens/SignUp/SignUp.tsx:193`).
4. Complete signup. `regroup/mobile/src/screens/SignUp/SignUpForm.tsx:123` (guest) or `:190` (admin) calls
   `redeemInvitation`.

**Expected observable state:**

- `invitations/{token}` gains `redeemedAt` and `redeemedByUid`
  (`regroup/functions/src/callable/invitations.ts:246`).
- Custom claims are set for the house: `guest` at `regroup/functions/src/callable/invitations.ts:237`, `admin`
  at `:230-231`, both through `createClaims`.
- The client force-refreshes its ID token at `regroup/mobile/src/screens/SignUp/SignUpForm.tsx:132-133` / `:199-200`
  after a fixed 1-second sleep. **This sleep is the classic flake here** — if claim
  propagation exceeds 1s the token comes back without the new claim and every
  subsequent rules-gated read fails with permission-denied until the app is
  restarted.
- Direct client access to `invitations/{token}` is denied by
  `regroup/mobile/firebase/firestore.rules:406-411` (`allow read, write: if false`), so the token is only
  observable through the callables or the emulator UI.

**Negative cases to run in the same pass:** unauthenticated redeem must fail
`unauthenticated` (`regroup/functions/src/callable/invitations.ts:207`); redeeming with a signed-in account whose
email differs from the invited address must fail `permission-denied`
(`regroup/functions/src/callable/invitations.ts:218`).

**Status:** `READY`. Both halves are on mobile — `git grep -n
"createInvitation\|peekInvitation\|redeemInvitation" -- 'regroup/web/src'` returns no
output, so **the web surface implements no part of this seam.**

---

### SEAM-4 Mobile lapsed-operator deep link → web `/billing` → `/my-account` → Stripe portal

**Surfaces:** mobile → web → functions → Stripe
**Anchors:** `regroup/mobile/src/screens/Subscription/SubscriptionRequiredScreen.tsx:18-21`,
`:39-41`, `regroup/web/src/app/app-routing.module.ts:65`,
`regroup/web/src/app/app-routing.module.ts:59`,
`regroup/web/src/app/components/accounts/my-account/my-account.component.ts:76-91`,
`regroup/web/src/app/services/functions/cloud-function.service.ts:77-79`,
`regroup/functions/src/callable/subscriptions.ts:672`

**Preconditions:** the mobile app must actually render `SubscriptionRequiredScreen`.
Per SEAM-1 failure mode 1 this is unreachable through the product; to test the link
itself, either hand-edit `users/{uid}.potentialSuperAdmin` to `false` in the emulator
with the account flagged `isSuperAdmin`, or open the screen directly.

**Steps:**

1. Reach `SubscriptionRequiredScreen` and press "Manage Subscription".
2. Confirm the URL opened is `${RATS_WEB_URL}/billing`
   (`regroup/mobile/src/screens/Subscription/SubscriptionRequiredScreen.tsx:18-21`, opened at `:39-41`; the env fallback is
   `https://regroup-app.com`).
3. Confirm the web app redirects `/billing` → `/my-account`
   (`regroup/web/src/app/app-routing.module.ts:65`, `pathMatch: 'full'`).
4. Confirm `AuthGuard` (`regroup/web/src/app/app-routing.module.ts:59`) sends a signed-out visitor to
   `/login` on the client (`regroup/web/src/app/guards/auth.guard.ts:32`).
5. Signed in, press the billing-portal button. `regroup/web/src/app/components/accounts/my-account/my-account.component.ts:83` calls
   `createBillingPortalSession` (`regroup/web/src/app/services/functions/cloud-function.service.ts:77-79` →
   `regroup/functions/src/callable/subscriptions.ts:672`) with `window.location.href` as the return URL
   (`regroup/web/src/app/components/accounts/my-account/my-account.component.ts:81`) and then navigates (`:84`).
6. Return from the Stripe portal and background/foreground the mobile app.

**Expected observable state:** a Stripe billing-portal session URL is returned and
the browser lands on it. On returning to mobile, `SubscriptionGate`'s AppState
listener invalidates the `['user', uid]`, house-detail and `['paywall','config']`
query keys (`regroup/mobile/src/components/subscription/SubscriptionGate.tsx:50-67`), guarded on `currentUser?.id` (`:53`).

**Known failure modes:** `/billing` was specified but never built as a real route —
the redirect at `regroup/web/src/app/app-routing.module.ts:65` exists precisely because shipped mobile
builds hard-code that path and were landing on a 404. The comment at `:60-64`
documents this. Do not delete the redirect while any shipped build targets it.

**Status:** `READY` for steps 2–6. Step 1 is `BLOCKED` — see SEAM-1.

---

### SEAM-5 Firestore security rules as the shared contract

**Surfaces:** mobile ↔ rules ↔ web
**Anchors:** `regroup/mobile/firebase/firestore.rules:98-100`, `:114-120`, `:192-193`,
`:244-259`, `:346-348`, `:401-404`, `:406-411`

**Preconditions:** Firestore emulator up with the real rules file loaded.

**Steps and expected results:**

| #   | Attempted write                                    | Rule                                                             | Expected                                                |
| --- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 5a  | Guest writes a `houses/{id}` doc                   | `regroup/mobile/firebase/firestore.rules:192-193` — create requires `isAdmin([houseId])` | Rejected                                                |
| 5b  | Any client writes `invitations/{token}`            | `:406-411` — `allow read, write: if false`                       | Rejected                                                |
| 5c  | Any client writes `webhookEvents/{id}`             | `:401-404` — `allow read, write: if false`                       | Rejected                                                |
| 5d  | Guest updates a `houses/{id}/votes/{voteId}` tally | `:244-259` — `allow update: if false`                            | Rejected; vote casting must go through `castOxfordVote` |
| 5e  | Non-admin reads `subscriptions/{id}`               | `:114-120` — read requires `isAdmin([resource.data.houseId])`    | Rejected                                                |
| 5f  | House **admin** (not superAdmin) updates `stripeAccountId`, `stripeStatus`, `monthlyRent`, `weeklyRent`, `adminIds` or `ownerId` on a house | `:221-224` — the admin/guest branch fails if `affectedKeys().hasAny([...])` | Rejected; only superAdmin may touch those |
| 5g  | Guest self-updates a field outside the allowlist on their own `guests/{id}` doc (e.g. `rentOwed`, `phase`) | `:159-171` — self-branch requires `affectedKeys().hasOnly([...])` | Rejected |

**The contract hole to test explicitly:** `regroup/mobile/firebase/firestore.rules:346-348` is
`match /users/{userId} { allow read, write: if isSameUser(userId); }` — an
unconditional self-write. A signed-in user can set their own
`users/{uid}.potentialSuperAdmin = true` and, per SEAM-1, the mobile
`useSubscriptionGate` will then short-circuit to `allowed` at
`regroup/mobile/src/hooks/useSubscriptionGate.ts:139`. They can equally set
`subscriptionMetadata.status = "active"`. **Run this as a positive-write /
negative-outcome case: the write succeeds (correct per rules) and the paywall is
bypassed (a real entitlement defect).**

**Second hole:** `paywall/config` is read by the mobile client
(`regroup/mobile/src/services/paywall.ts:3`, fetched at
`regroup/mobile/src/hooks/useSubscriptionGate.ts:49`) but `grep -n "paywall"
regroup/mobile/firebase/firestore.rules` returns **no output** — there is no match
block for that collection, and the catch-all is commented out (`regroup/mobile/firebase/firestore.rules:98-100`).
Firestore default-denies, so the read throws, is caught at
`regroup/mobile/src/hooks/useSubscriptionGate.ts:60`, and returns `{ enabled: true }`. The kill switch is
therefore permanently fail-closed and **cannot be used to disable the paywall.**

**Status:** `READY` for 5a–5g and both holes. Rules-test automation:
**UNKNOWN — could not verify.** I did not locate a rules test suite or npm script for
`regroup`; confirm before relying on this line.

---

### SEAM-6 Scheduled functions whose output users see

**Surfaces:** functions (cron) → Firestore/FCM → mobile
**Anchors:** `regroup/FUNCTION_AUDIT.md:90-95` (generated from source), and within it:
`regroup/functions/src/scheduled/officerTermReminder.ts:131` (`0 8 * * *` UTC),
`regroup/functions/src/scheduled/overdueRentNotification.ts:70` (`0 9 * * *` UTC),
`regroup/functions/src/scheduled/scheduledRentCollection.ts:155` (`0 10 * * *` UTC,
secret `STRIPE_SECRET_KEY`), `regroup/functions/src/scheduled/index.ts:82`
(`weeklyTransfers`, `0 8 * * 0` UTC).

**Preconditions:** none of these can be triggered from a client. Invoke each directly
against a staging project, or extract the handler and call it.

**Steps:** invoke each function; then check the mobile surface.

**Expected observable state:**

- `overdueRentNotification` sends an FCM to house admins via
  `sendFcmToHouseAdmins` (`regroup/functions/src/scheduled/overdueRentNotification.ts:60`,
  helper imported at `:4`).
- `officerTermReminder` builds a notification payload
  (`regroup/functions/src/scheduled/officerTermReminder.ts:85`) and prunes dead FCM
  tokens by writing `messagingToken` back to the user doc (`:119`).
- `scheduledRentCollection` writes nothing to Firestore itself. It queries
  `guestCollection` for `autoPayEnabled == true` and `rentOwed > 0`
  (`regroup/functions/src/scheduled/scheduledRentCollection.ts:40-43`) and creates a
  Stripe PaymentIntent (`:112`); `rentOwed` is decremented elsewhere, so **verify
  through the payment webhook, not this function**. The user-visible field is
  `guest.rentOwed`, rendered at
  `regroup/mobile/src/screens/HouseSettings/PaymentDashboard.tsx:345` and
  filtered/sorted at `:133-134`.
- `weeklyTransfers` (`regroup/functions/src/scheduled/index.ts:82-84`) calls
  `transferStats` (`:97` → `regroup/functions/src/util/guest.ts:182`), which
  recomputes and writes the house doc at `regroup/functions/src/util/guest.ts:236`.
  The user-visible field is `house.health`, rendered at
  `regroup/mobile/src/screens/IntroHouseSummary/IntroHouseSummary.tsx:198` and
  `:289-292` via `calculateHouseHealth`. It sends no push or email.

**Known failure modes:** all 52 functions run in `us-central1` (none sets `region:`)
and `regroup/functions/src/init.ts` pins `cpu: 0.167, maxInstances: 2` via
`setGlobalOptions` as a quota stopgap. Fan-out under a real tenant load is throttled
by design — do not read a slow scheduled run as a regression without checking that.

**Status:** `READY` for all four. Note that two of them (`scheduledRentCollection`,
`overdueRentNotification`) write nothing, so the assertion is on the Stripe side and
the FCM banner respectively, not on a Firestore diff.

---

### SEAM-7 Oxford governance written server-side, rendered on mobile

**Surfaces:** functions → Firestore → mobile
**Anchors:** `regroup/functions/src/callable/oxford.ts:42` (`setOxfordEnabled`),
`:43-44`, `:54-55`, `:57-60`, `:111`, `:114`, `:173` (`castOxfordVote`),
`regroup/mobile/src/hooks/useOxfordGate.ts:21-25`,
`regroup/mobile/src/services/oxford/votes.ts:73`,
`regroup/mobile/firebase/firestore.rules:244-259`

**Preconditions:** an operator who owns the house (`house.superAdminId` must equal the
caller uid — `regroup/functions/src/callable/oxford.ts:61`), with a Stripe subscription (the callable declares
`STRIPE_SECRET_KEY` at `regroup/functions/src/callable/oxford.ts:42`).

**Steps:**

1. Invoke `setOxfordEnabled({ houseId, enabled: true })` **directly** — there is no UI
   for it (see status).
2. Confirm the batch write sets `houses/{id}.houseType = "oxford"` (`regroup/functions/src/callable/oxford.ts:116`)
   and `users/{uid}.subscriptionMetadata.oxfordEnabled = true` (`regroup/functions/src/callable/oxford.ts:119`).
3. Open the mobile app as that operator and navigate to the Oxford area
   (`regroup/mobile/src/screens/Oxford/`).
4. Cast a vote. `regroup/mobile/src/services/oxford/votes.ts:73` calls
   `castOxfordVote`.

**Expected observable state:** `useOxfordGate` returns `allowed: true` only when both
`house.houseType === 'oxford'` **and** `user.subscriptionMetadata.oxfordEnabled`
(`regroup/mobile/src/hooks/useOxfordGate.ts:21-25`) — the two-sided check the callable's comment at
`regroup/functions/src/callable/oxford.ts:38` describes. A vote write lands through the callable, not the client;
direct client vote updates are rejected by `regroup/mobile/firebase/firestore.rules:244-259`.

**Status:** `BLOCKED — no implementation found` for step 1's UI.
`git grep -n "setOxfordEnabled" -- 'regroup/web/src' 'regroup/mobile/src'` returns **no
output**: the callable has zero client call sites on either surface. Oxford can only be
enabled by invoking the callable out-of-band. Steps 2–4 are `READY` once it is.

---

## 5. Per-surface functional tests

### 5.1 Functions — executed

```
cd regroup/functions && npm test
```

Real output at `142ffee` (re-run for the 2026-10-01 refresh):

```
Test Suites: 51 passed, 51 total
Tests:       767 passed, 767 total
```

(The first pass at `13407ae` reported `47 passed, 47 total` / `732 passed, 732 total`;
the growth is the entitlement, authGuard and cardValidation suites.)

This confirms the `<verified_environment>` note: `regroup/functions` has no
`coverageThreshold`, correctly, since the monorepo ratchet scopes to recovery-api,
homegroups/functions and detox-recovery.

### 5.2 Mobile — executed, and flaky

```
cd regroup/mobile && npm test
```

Run 1:

```
Test Suites: 2 failed, 287 passed, 289 total
Tests:       2 failed, 2 todo, 4791 passed, 4795 total
Time:        161.053 s
```

Run 2, same tree, no changes:

```
Test Suites: 1 failed, 288 passed, 289 total
Tests:       1 failed, 2 todo, 4792 passed, 4795 total
Time:        41.222 s, estimated 124 s
```

**Refresh, 2026-10-01 at `142ffee`:** a second, *deterministic* failure has appeared —
`regroup/mobile/src/state/queries/__tests__/paymentQueries.test.ts`, case
*"should call createRentPaymentIntent and recordRentPayment then return intent result"*
(an unwrapped-`act()` async update). It failed on three consecutive runs, including two
in isolation with identical timing, and it still fails with all refresh-era changes
stashed — so it arrived with one of the nine commits after `13407ae`, not from the gate
work. It is a real regression, distinct from the flake below, and should be fixed before
this branch merges.

The intermittently-failing case is
`regroup/mobile/src/screens/Payments/__tests__/StalePendingBanner.test.tsx` —
`● StalePendingBanner › calls Linking.openURL with the support mailto when "Contact
Support" is pressed`. **Two identical invocations produced different failure counts,
so this suite is not a reliable release gate as it stands.** Note that
`npm test | tail -n` masks the exit code (the pipeline reports `tail`'s status); gate
on the summary line or on an unpiped exit code.

Screens present under `regroup/mobile/src/screens/`: Activity, AdminReport,
Application, Applications, BalanceDashboard, Beds, Complaints, Contacts, CreateGuest,
DirectChat, Disputes, Documents, DrugTesting, GuestChoreOverview, GuestImport,
GuestList, GuestMedicationOverview, GuestMeetingOverview, GuestSupporterOverview,
GuestUpdate, GuestWorkOverview, HouseChat, HouseChoreOverview, HouseConfig,
HouseOverview, HouseSearch, HouseSettings, HousesOverview, IntroHouseSummary, Issues,
Landing, Login, NewAccount, NewManager, Notifications, Oxford, Payments, Personal,
Profile, RentPayment, ResidentIntake, SetupWizards, SignUp, Splash, StaffNotes,
StatUpdates, Subscription, SubscriptionHandler, SubscriptionUpdateModal, Treasury.

### 5.3 Mobile E2E (Maestro) — not executed

17 flows exist in `regroup/mobile/maestro/flows/`: `debug-login.yaml`,
`debug-signup.yaml`, `guest-activity-dispute.yaml`, `guest-home.yaml`,
`guest-log-chore.yaml`, `guest-payment-history.yaml`, `guest-rent-payment.yaml`,
`operator-applications.yaml`, `operator-disputes.yaml`,
`operator-house-settings.yaml`, `operator-manage-guests.yaml`,
`operator-setup-wizard.yaml`, `oxford-dashboard.yaml`, `oxford-onboarding.yaml`,
`run-all.yaml`, `signup.yaml`, `smoke.yaml`.

Scripts: `regroup/mobile/package.json:29-35` (`maestro:seed`, `maestro:ios`,
`maestro:android`, `maestro:smoke:ios`, `maestro:smoke:android`, `maestro:suite:ios`,
`maestro:suite:full`). Workspace config at `regroup/mobile/maestro/config.yaml`:
animations disabled on both platforms (`:10-14`), `continueOnFailure: false`
(`:16-17`), output to `maestro/output` (`:20`).

**Status: BLOCKED on the seed step** — see §3.2. Until `seedTestData.js` exists, every
flow runs against whatever happens to be in the emulator.

### 5.4 Web — no runnable suite

`regroup/web/angular.json:85` sets `"karmaConfig": "karma.conf.js"`. `ls
regroup/web/karma.conf.js` → `No such file or directory`. **`regroup/web` has no
executable test suite.** Specs typecheck only:

```
cd regroup/web && npx tsc --noEmit -p tsconfig.spec.json
```

(unexecuted in this pass). Every web assertion in this guide is therefore manual or
browser-driven.

Routes to exercise manually, all from `regroup/web/src/app/app-routing.module.ts`:
`/pricing` (`:39`), `/subscribe` (`:41`), `/download` (`:40`), `/login` (`:51`),
`/signup` (`:52`), `/reset` (`:53`), `/contact` (`:56`), `/privacy-policy` (`:57`),
`/terms` (`:58`), `/my-account` (`:59`, guarded), `/billing` (`:65`, redirect).
The `theme-two`…`theme-six` and `blog-*` routes (`:33-50`) are marketing-template
leftovers; exclude them from release gating unless someone links to them.

---

## 6. Billing matrix

Tier definitions: `regroup/functions/src/config.ts:60-158`. Trial:
`TRIAL_PERIOD_DAYS = 7` at `regroup/functions/src/api/stripe.ts:14`, applied at `:109`
(legacy builder) and `:135` (tier builder). Path selector:
`isTierBillingEnabled()` at `regroup/functions/src/config.ts:167-168`, branched at
`regroup/functions/src/callable/subscriptions.ts:237`.

| Tier                                         | Monthly                                          | Annual                           | Tier-billing path (`TIER_BILLING_ENABLED=true`) | Legacy path (flag unset)  |
| -------------------------------------------- | ------------------------------------------------ | -------------------------------- | ----------------------------------------------- | ------------------------- |
| Traditional Starter (`regroup/functions/src/config.ts:62-76`, $69) | Testable                                         | **BLOCKED — test-mode price ID** | READY                                           | READY (no tier item)      |
| Traditional Professional (`:77-91`, $129)    | Testable                                         | **BLOCKED**                      | READY                                           | READY                     |
| Traditional Enterprise (`:92-106`, $249)     | Testable                                         | **BLOCKED**                      | READY                                           | READY                     |
| Oxford Standard (`:109-123`, $49)            | Testable                                         | **BLOCKED**                      | READY                                           | READY                     |
| Oxford Plus (`:124-138`, $89)                | Testable                                         | **BLOCKED**                      | READY                                           | READY                     |
| Oxford Network (`:139-156`, $299)            | **BLOCKED — `availableForSale: false` (`:148`)** | BLOCKED                          | Rejected at `regroup/functions/src/callable/subscriptions.ts:212`          | Rejected at the same gate |

**Legacy column caveat (`87a835d`).** The legacy *per-house/per-guest quantity* path is
deleted: both legacy branches of `updateSubscriptionHouses` and `updateSubscriptionGuests`
are gone, and a subscription with no tier now raises `failed-precondition` instead of
silently no-opping. The legacy branch of **checkout** still exists — `isTierBillingEnabled()`
is still branched at `regroup/functions/src/callable/subscriptions.ts:237`. So "legacy path"
in the table below means legacy checkout only; there is no longer a legacy capacity path to
test.

**Why annual is blocked:** `regroup/scripts/stripe-prices.env:16` marks the six
monthly IDs live-mode; `:27` marks the annual block "TEST MODE — replace with live IDs
before deploy". Annual checkout against production will transact on test prices.
Monthly/annual is selected by the `period` query param
(`regroup/web/src/app/components/accounts/signup/signup.component.ts:107`) and passed
through `regroup/web/src/app/services/functions/cloud-function.service.ts:45` to the callable schema at
`regroup/functions/src/callable/subscriptions.ts:105`.

**Lifecycle cases (all unexecuted):**

| Case                         | Trigger                          | Expected                                                              | Anchor                                          |
| ---------------------------- | -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Trial expiry → first invoice | advance 7 days                   | `invoice.payment_succeeded` → `subscriptions/{id}.status = active`    | `regroup/functions/src/webhooks/stripeWebhook.ts:1100-1105`, handler at `:605` |
| Payment failure → grace      | `invoice.payment_failed`         | `past_due`, then `unpaid` at attempt 3; house `guestGraceEndsAt` +48h | `regroup/functions/src/webhooks/stripeWebhook.ts:706-707`, `:737-745`          |
| Cancel                       | `cancelUserSubscription`         | subscription cancelled                                                | `regroup/functions/src/callable/subscriptions.ts:405`                          |
| Subscription deleted         | `customer.subscription.deleted`  | status propagated                                                     | `regroup/functions/src/webhooks/stripeWebhook.ts:1111-1115`, handler at `:760` |
| Reactivate                   | `reactivateOperatorSubscription` | requires existing `subscriptionId` + `customerId`                     | `regroup/functions/src/callable/subscriptions.ts:347`, schema at `:108-117`    |
| Bundle discount              | `applyBundleDiscount`            | mobile-only call site                                                 | `regroup/functions/src/callable/subscriptions.ts:628`                          |

**Note on decline testing — changed in `9a33389`.** Signup now validates the card with
a SetupIntent before creating the subscription
(`regroup/functions/src/api/cardValidation.ts:83`, `assertPaymentMethodUsable`), so an
unusable card fails *at checkout* rather than silently starting a 7-day trial. Two
distinct paths to cover: an unusable card at signup (surfaces immediately, see
`CARD_UNUSABLE_MESSAGE` at `regroup/functions/src/api/cardValidation.ts:23` and
`CARD_REQUIRES_ACTION_MESSAGE` at `:19`), and a card that validates then fails on the
first real invoice (still only reachable by driving `invoice.payment_failed`).

---

## 7. Negative and security cases

| #       | Case                                                                | Expected                                                               | Anchor                                                                     |
| ------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| N1      | `createOperatorSubscription` called unauthenticated                 | `unauthenticated`                                                      | `regroup/functions/src/callable/subscriptions.ts:177`                                                 |
| N2      | `createOperatorSubscription` with `user.id` ≠ caller uid            | `permission-denied`                                                    | `regroup/functions/src/callable/subscriptions.ts:180`                                                 |
| N3      | Missing email on the user payload                                   | `invalid-argument`                                                     | `regroup/functions/src/callable/subscriptions.ts:184`                                                 |
| N4      | Unknown tier key for the houseType                                  | `invalid-argument`                                                     | `regroup/functions/src/callable/subscriptions.ts:205`                                                 |
| N5      | Oxford Network checkout                                             | `failed-precondition`, message names the tier label                    | `regroup/functions/src/callable/subscriptions.ts:212`, `regroup/functions/src/config.ts:148`                                |
| N6      | Tier price env var unset                                            | `internal`                                                             | `regroup/functions/src/callable/subscriptions.ts:224`                                                 |
| N7      | Resident cap exceeded via `updateSubscriptionGuests`                | `failed-precondition` "Resident limit reached for your plan"           | `regroup/functions/src/callable/subscriptions.ts:485`                                                 |
| N8      | Single-property tier adding a 2nd house                             | `failed-precondition` "Your plan does not include multiple properties" | `regroup/functions/src/callable/subscriptions.ts:575`                                                 |
| N9      | Property cap exceeded                                               | `failed-precondition` "Property limit reached for your plan"           | `regroup/functions/src/callable/subscriptions.ts:586`                                                 |
| N10     | Webhook POST with a bad/absent Stripe signature                     | rejected before dispatch                                               | `regroup/functions/src/webhooks/stripeWebhook.ts:1011`, `:1027`; Connect webhook `:1217`                  |
| N11     | `redeemInvitation` unauthenticated                                  | `unauthenticated`                                                      | `regroup/functions/src/callable/invitations.ts:207`                                                   |
| N11b | `peekInvitation` called **unauthenticated** with a valid token | **Succeeds by design** — the token is the credential (`regroup/functions/src/callable/invitations.ts:167`, no `request.auth` check at `:161`). Confirm the response leaks no more than email + role; a leaked token discloses the invitee's email address | `regroup/functions/src/callable/invitations.ts:171` |
| N11c | `peekInvitation` / `redeemInvitation` with a redeemed or expired token | `failed-precondition` | `regroup/functions/src/callable/invitations.ts:36` |
| N12     | `redeemInvitation` with a mismatched email                          | `permission-denied`                                                    | `regroup/functions/src/callable/invitations.ts:218`                                                   |
| N13     | `setOxfordEnabled` by a non-owner                                   | `permission-denied`                                                    | `regroup/functions/src/callable/oxford.ts:61`                                                          |
| N14     | `setOxfordEnabled` for a missing house                              | `not-found`                                                            | `regroup/functions/src/callable/oxford.ts:55`                                                          |
| N15     | Client write to `invitations` / `webhookEvents`                     | rejected                                                               | `regroup/mobile/firebase/firestore.rules:406-411`, `:401-404`                                      |
| N16     | Client update of an Oxford vote doc                                 | rejected                                                               | `regroup/mobile/firebase/firestore.rules:244-259`                                                  |
| **N17** | **Self-write `users/{uid}.potentialSuperAdmin = true`**             | **Write SUCCEEDS (rules allow it) and the mobile paywall is bypassed** | `regroup/mobile/firebase/firestore.rules:346-348`, bypass at `regroup/mobile/src/hooks/useSubscriptionGate.ts:139`      |
| **N18** | **Self-write `users/{uid}.subscriptionMetadata.status = "active"`** | **Write SUCCEEDS; `subscriptionIsActive` returns true**                | `regroup/mobile/firebase/firestore.rules:346-348`, `regroup/mobile/src/util/subscription.ts:19-22` |

N17 and N18 are the two cases most worth running: both are entitlement bypasses that
the rules file permits by design and no server-side check catches.

---

## 8. What is not covered and why

- **`regroup/web` has no runnable test suite at all** (§5.4). Nothing on the web
  surface is automatically verified; the tier funnel, `/my-account`, the billing
  portal hop and the SSR guard behaviour are all manual-only.
- **The `test:e2e:*` npm scripts are dead.** `regroup/mobile/package.json:14-27`
  defines fourteen Detox scripts. I did not locate any Detox configuration to go with
  them. `regroup/mobile/e2e/README.md` and `SETUP_REQUIRED.md` describe that
  abandoned suite. Do not build on them; use the Maestro flows.
- **Maestro cannot be run end-to-end** until `seedTestData.js` exists (§3.2).
- **There is no functions emulator**, so no callable or webhook in this guide can be
  exercised purely locally (§2.1).
- **`complianceExport` and `rentRoiMetrics` have no client callers.** Verified:
  `git grep -n "rentRoiMetrics" -- 'regroup/web/src' 'regroup/mobile/src'` returns no
  output. The `complianceExport` hits in web are the _tier feature flag_ of the same
  name (e.g.
  `regroup/web/src/app/components/pricing/pricing-one/pricing-one.component.html:93`
  renders `tier.features.complianceExport`), **not** the callable. Both functions can
  only be exercised by invoking them directly.
- **`setOxfordEnabled` has no client callers on either surface** (SEAM-7).
- **Server-side entitlement enforcement now exists and is partial by design.**
  `regroup/functions/src/util/entitlement.ts` holds the ladder; it is wired into
  `createInvitation` (`regroup/functions/src/callable/invitations.ts:116`),
  `setOxfordEnabled` (`regroup/functions/src/callable/oxford.ts:67`), `castOxfordVote`
  (`:202`) and the shared claim-grant guard
  (`regroup/functions/src/util/authGuard.ts:88`). Four callables are **deliberately
  exempt**, each carrying a `Do not add enforceHouseEntitlement here.` comment:
  `createPaymentIntent` (`regroup/functions/src/callable/payments.ts:152`),
  `connectStripeAccount`, `complianceExport` and `rentRoiMetrics`. A lapsed operator on
  a qualifying tier therefore keeps compliance export and ROI metrics indefinitely —
  `tierAllows` asks only whether the plan includes the feature, never whether it is
  paid for. That is an accepted product decision, not a gap to file.
- **Mobile has no in-app purchase path.** `git grep -n
"createOperatorSubscription" -- 'regroup/mobile/src'` returns no output; operators are
  routed to the web portal (SEAM-4).
- **Seams I could not fully trace:** whether a Firestore rules test harness exists
  for `regroup` (SEAM-5), and a local functions-serve path (§2.3). Both are marked
  `UNKNOWN` in place rather than papered over.
- **Load and concurrency behaviour is out of scope** — `regroup/functions/src/init.ts`
  pins `cpu: 0.167, maxInstances: 2` globally as a quota stopgap, so any throughput
  measurement taken now measures the stopgap, not the system.

---

## 9. Automation gaps, prioritised

1. ~~**A Jest spec asserting that an operator with a lapsed subscription is _blocked_ by
   `useSubscriptionGate`.**~~ **CLOSED** by `d30015c`, which fixed the gate and added the
   regression case. Kept because the shape of the miss is instructive. The
   `potentialSuperAdmin` short-circuit at
   `regroup/mobile/src/hooks/useSubscriptionGate.ts:139` made the operator paywall
   unreachable for every account either funnel creates, and no test caught it. Worse,
   the then-current case `it('returns allowed when user.potentialSuperAdmin is true')`
   encoded the short-circuit as intended behaviour in isolation, with no case covering a user who
   holds `potentialSuperAdmin: true` **and** `isSuperAdmin: true` **and** a lapsed
   subscription — which is what every real operator looks like. A test can assert a
   branch is correct in isolation while an earlier branch makes it unreachable; neither
   the unit test nor the type system catches that.
2. **A test that web `/my-account` reflects a webhook-driven status change.** Now the
   single highest-value missing coverage: the mobile half of SEAM-2 is fixed and tested,
   so the web page is the only surface still showing a stale subscription status, and
   `regroup/web` has no runnable suite to catch it (§5.4). Cost: an operator whose
   payment failed sees "active" on the exact page they would use to fix it.
3. **Fix and then test the Maestro seed.** `seedTestData.js` must be written before
   any of the 17 flows means anything. Until then the E2E suite reports on undefined
   state. Cost: false green across the whole mobile suite.
4. **A functions spec asserting the webhook updates the operator's user doc** — or an
   explicit decision that it should not, plus a spec asserting the gate reads
   `subscriptions/{id}` instead. Today `stripeWebhook.ts` never writes
   `users/{uid}.subscriptionMetadata`, so no operator-facing surface ever learns that
   billing failed. Cost: unpaid operators keep full access indefinitely.
5. **A Firestore rules test suite.** N17/N18 are one-line rules bugs with entitlement
   consequences and nothing guards `regroup/mobile/firebase/firestore.rules:346-348` against regression. The
   emulator supports `@firebase/rules-unit-testing`; there is no wiring for it here.
   Cost: silent authorization bypass.
6. **A `karma.conf.js` for `regroup/web`, or removal of the dead test target.** The
   web specs are written and typecheck but have never executed. Either make them run
   or stop pretending they are coverage. Cost: a whole surface with zero
   verification, and specs rotting undetected.
7. **De-flake `StalePendingBanner.test.tsx`.** Two identical runs disagreed (§5.2). A
   gate that reports differently on the same commit cannot block a release.
8. **A CI check on `stripe-prices.env` mode consistency.** The annual block is
   test-mode (`regroup/scripts/stripe-prices.env:27`) while monthly is live
   (`:16`). `regroup/scripts/preflight-billing.js` already runs as a
   `predeploy` hook (`regroup/firebase.json`) — extend it to fail on mixed modes.
   Cost: annual subscriptions transacting on test prices in production.

---

## 10. Doc discrepancies found

| #   | Doc claim                                                                                                                                                                               | Source reality                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `regroup/CLAUDE.md:31-38` — "Firebase Emulators (from `regroup/` root) … Firestore :8080, Functions :5001, Auth :9099 … Emulator config is in `firebase.json` at this directory level." | `regroup/firebase.json` has only a `functions` key. The emulator config is `regroup/mobile/firebase.json` and defines **no functions emulator** — Firestore 8080, Auth 9099, UI only. |
| D2  | `regroup/mobile/maestro/scripts/reset-and-seed.sh:9` and `:29` — "Start it first: `cd regroup && firebase emulators:start`"                                                             | Same as D1: that directory has no emulator config. Should be `cd regroup/mobile`.                                                                                                     |
| D3  | `regroup/mobile/maestro/scripts/reset-and-seed.sh:36` invokes `node e2e/setup/seedTestData.js`                                                                                          | The file does not exist and never has (`git log` on the path is empty).                                                                                                               |
| D4  | `regroup/mobile/package.json:14-27` advertises a Detox E2E suite; `regroup/mobile/e2e/README.md` and `SETUP_REQUIRED.md` document it                                                    | No Detox configuration was found. The live suite is Maestro.                                                                                                                          |
| D5  | `regroup/web/angular.json:85` points the Karma target at `karma.conf.js`                                                                                                                | That file does not exist; `ng test` cannot run.                                                                                                                                       |
| D6  | Comment at `regroup/functions/src/callable/oxford.ts:38` says the house doc and user doc "must agree — this CF is the only" writer                                                   | True, but the CF has **zero client call sites**, so the agreement can only be established out-of-band.                                                                                |

---

## Self-check

- **Every test case carries at least one `path:line` anchor** — yes. SEAM-1 through
  SEAM-7, all 18 negative cases, and every billing-matrix row cite at least one.
- **Every cited path resolves and the cited line contains what is claimed** — every
  anchor in this document was produced by a `git grep -n` or `sed -n` run during this
  session and the line content was read before being described. Paths are written
  relative to the repo root. Two caveats: (a) the working tree was dirty, so these are
  working-tree line numbers, not clean-`13407ae` line numbers; (b) `regroup/FUNCTION_AUDIT.md`
  line numbers for the scheduled functions are the generator's, regenerated from
  source in this session.
- **Everything unconfirmed is marked** — `UNKNOWN — could not verify` on the existence of a
  rules test suite and on a local functions-serve path. (The
  `scheduledRentCollection`/`weeklyTransfers` consumers were traced and closed in a
  follow-up pass.) `BLOCKED` on the Maestro
  seed, the web suite, mobile in-app purchase, `setOxfordEnabled`'s UI, Oxford Network
  checkout, annual billing, and the operator half of SEAM-1/SEAM-2.
- **No suite is claimed to have passed that was not run** — `regroup/functions`
  (passed, quoted) and `regroup/mobile` (2 runs, both quoted, both with failures) were
  executed. Everything else in this guide is explicitly unexecuted, including all
  emulator, Maestro and browser steps.
- **All known gaps from the brief are represented as explicit cases** — no mobile IAP
  (§8, SEAM-4), `complianceExport`/`rentRoiMetrics` with no callers (§8), single-region
  - throttled CPU (SEAM-6, §8), committed test credentials not secret (§3.3), dead
    Detox scripts (§8, D4), web has no runnable suite (§5.4, D5).
- **Refresh pass (2026-10-01):** all 139 `path:line` anchors were re-verified
  mechanically against `142ffee` — every file resolves and every line is in range, and
  the surface-relative shorthand the first pass left behind (80 anchors that named only
  a basename and a line) has been expanded to repo-root-relative form. Anchors in the
  eleven cited files that changed were re-resolved by symbol, not adjusted by guesswork.
- **No credential, key or signing secret appears in this document** — Stripe price IDs
  and secret names are referenced by variable name and file location only; fixture
  passwords are redacted in §3.3.
