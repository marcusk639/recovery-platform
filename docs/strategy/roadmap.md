# Recovery Ecosystem Roadmap — 2026

**Date:** 2026-05-24 (reviewed + corrected 2026-05-24)
**Scope:** Full ecosystem — regroup-rn7 (RATS mobile), regroup-functions (Cloud Functions backend), regroup-web (marketing site), RecoveryConnect / Homegroups, detox-recovery
**Audience:** Developers, product owner, AI agents

> **⚠️ Review note:** This roadmap was cross-verified against actual codebase state after initial synthesis. Several items in `STRATEGIC_PLATFORM_ASSESSMENT_2026.md` (the primary source doc) were found to be stale. Corrections are applied in all sections below. The source doc should not be treated as authoritative on implementation status — code review overrides it.

---

## Section 0: Source of Truth Verdict

| Doc                                                                         | Repo            | Verdict                            | Rationale                                                                                                                                                     |
| --------------------------------------------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/STRATEGIC_PLATFORM_ASSESSMENT_2026.md`                                | regroup-rn7     | **SOURCE_OF_TRUTH (with caveats)** | Most recent (2026-05-24), covers all 3 Regroup repos. Strategic priorities are sound. **Implementation status claims are stale** — see Section 1 corrections. |
| `RecoveryConnect/docs/ROADMAP.md`                                           | RecoveryConnect | **SOURCE_OF_TRUTH**                | May 2026, current launch phase, explicit P0/P1/P2/P3 with completion status                                                                                   |
| `RecoveryConnect/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md` | RecoveryConnect | **SOURCE_OF_TRUTH**                | Ecosystem sequencing — defines cross-product dependencies and revenue timeline                                                                                |
| `RecoveryConnect/docs/REVENUE_OPPORTUNITIES.md`                             | RecoveryConnect | **SOURCE_OF_TRUTH**                | Actionable backlog with ✅ completion markers (authoritative for "what's done")                                                                               |
| `RecoveryConnect/docs/LAUNCH_BLOCKERS.md`                                   | RecoveryConnect | **SOURCE_OF_TRUTH**                | Specific manual actions blocking user acquisition                                                                                                             |
| `docs/superpowers/specs/2026-05-23-current-roadmap.md`                      | regroup-rn7     | **SUPPORTING**                     | May 2026, rn7-only view, superseded by STRATEGIC_PLATFORM_ASSESSMENT_2026                                                                                     |
| `RecoveryConnect/docs/BUSINESS_MODEL.md`                                    | RecoveryConnect | **SUPPORTING**                     | Pricing model and 3-year projections                                                                                                                          |
| `detox-recovery/docs/features.md`                                           | detox-recovery  | **SUPPORTING**                     | Product spec for Next.js PDF delivery site                                                                                                                    |
| `regroup-web/CLAUDE.md`                                                     | regroup-web     | **SUPPORTING**                     | Architecture reference; no product vision content                                                                                                             |
| `docs/FEATURE_PRIORITY_ROADMAP.md`                                          | regroup-rn7     | **STALE**                          | Superseded by STRATEGIC_PLATFORM_ASSESSMENT_2026                                                                                                              |
| `docs/FULL_PLATFORM_REQUIREMENTS.md`                                        | regroup-rn7     | **STALE**                          | Pre-dates recent feature completions                                                                                                                          |
| `docs/archive/`                                                             | regroup-rn7     | **ARCHIVE**                        | Historical analysis                                                                                                                                           |
| `RecoveryConnect/docs/archive/`                                             | RecoveryConnect | **ARCHIVE**                        | Feb 2026 analysis                                                                                                                                             |

---

## Section 1: Implementation Status Matrix

Only MISSING, PARTIAL, and BLOCKED items are shown. Items marked **DONE** (confirmed by code review) are excluded.

### Code-verified corrections vs. source assessment

| Claim in STRATEGIC_PLATFORM_ASSESSMENT_2026 | Actual status (code-verified) | Evidence                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPaymentIntent` CF is MISSING         | **DONE**                      | `functions/src/callable/payments.ts:90`                                                                                                                                    |
| `listPayments` CF is MISSING                | **DONE**                      | `functions/src/callable/payments.ts:161`                                                                                                                                   |
| `listHousePayments` CF is MISSING           | **DONE**                      | `functions/src/callable/payments.ts:214`                                                                                                                                   |
| 2% application fee needs wiring             | **DONE**                      | `payments.ts:133` already computes `Math.round(amount * 0.02)`                                                                                                             |
| RTDB rules are open to public               | **DONE**                      | `database.rules.json` is `{".read": false, ".write": false}`                                                                                                               |
| Pricing hardcoded $9.99/$19.99 in code      | **DONE**                      | `api/stripe.ts:21-42` uses `process.env.STRIPE_HOUSE_PRICE_ID` ($49 comment) and `STRIPE_OXFORD_PRICE_ID` ($79 comment) — pricing is already env-var driven, not hardcoded |
| Cloud Functions have no tests               | **PARTIAL**                   | `functions/src/__tests__/` contains extensive tests including `payments.test.ts` (1600+ lines), `subscriptions.test.ts`, `stripeWebhook.test.ts`                           |

### regroup-functions — actual MISSING/PARTIAL items

| Requirement                                                | Status         | Notes                                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify correct Stripe Price IDs are deployed in production | **UNVERIFIED** | Env vars are the pattern, but which Price IDs are live is unknown. The difference between $9.99 (wrong) and $49 (correct) is in which value is stored in the Firebase env config, not in source code. |
| `getMeetingAttendance` CF in regroup-functions             | **MISSING**    | Does not exist in regroup-functions. CF exists in RecoveryConnect's separate Firebase project. Cross-project bridge spec needed before P1.3.                                                          |
| Stripe webhook handler for `payment_intent.succeeded`      | **UNVERIFIED** | `stripeWebhook.ts` exists; whether it handles `payment_intent` events and persists to `payments` collection needs confirmation before `listPayments` is meaningful.                                   |
| Rate limiting on HTTP Cloud Functions                      | **MISSING**    | No rate limiting on unauthenticated-accessible CFs.                                                                                                                                                   |
| Automated rent reminders (scheduled CF)                    | **MISSING**    | No scheduled rent-reminder function.                                                                                                                                                                  |

### regroup-rn7 — actual MISSING/PARTIAL items

| Requirement                                         | Status                     | Notes                                                                                                                                                                                                                |
| --------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oxfordEnabled` — single source of truth            | **PARTIAL / DESIGN ISSUE** | Two independent flags: `houses/{id}.oxfordEnabled` (Firestore rules gate) vs `user.subscriptionMetadata.oxfordEnabled` (UI gate via `useOxfordGate` + Stripe billing). P1.2 must consolidate, not just add a toggle. |
| Oxford onboarding wizard                            | **MISSING**                |                                                                                                                                                                                                                      |
| Oxford network directory                            | **MISSING**                |                                                                                                                                                                                                                      |
| Shareable charter compliance PDF                    | **MISSING**                |                                                                                                                                                                                                                      |
| Resident TodayView (daily accountability dashboard) | **MISSING**                |                                                                                                                                                                                                                      |
| Push notification accountability loop (6 triggers)  | **PARTIAL**                | Some FCM triggers exist; full 6-trigger loop unconfirmed                                                                                                                                                             |
| Phase advancement progress bar (wire queries → UI)  | **PARTIAL**                | `phaseAdvancementQueries.ts` exists; UI wire missing                                                                                                                                                                 |
| Activity dispute "Dispute This" action in feed      | **PARTIAL**                | Dispute screen exists; entry point not surfaced in feed                                                                                                                                                              |
| Auto-pay / recurring rent enrollment                | **MISSING**                |                                                                                                                                                                                                                      |
| 2FA Cloud Function integration                      | **PARTIAL**                | Screen exists; CF status unverified                                                                                                                                                                                  |
| Custom reporting export                             | **PARTIAL**                | AdminReportScreen built; no data export yet                                                                                                                                                                          |

### regroup-web — actual MISSING/PARTIAL items

| Requirement                                            | Status      | Notes                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Store / Play Store download buttons as primary CTA | **MISSING** | No download buttons; primary CTA is an email form                                                                                                                                                                             |
| Stripe checkout flow                                   | **MISSING** | Subscribe page is an email capture form, not a Stripe checkout. The "connect subscribe page to updated pricing" item requires building a checkout flow, not just swapping IDs. Scope is larger than the original 2h estimate. |
| Operator testimonials + house count                    | **MISSING** |                                                                                                                                                                                                                               |
| Angular 9 → 17+ upgrade                                | **MISSING** | Security and maintainability debt                                                                                                                                                                                             |

### RecoveryConnect — actual MISSING/PARTIAL items

| Requirement                                             | Status               | Notes                                                               |
| ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| Run claim-and-pay flow end-to-end                       | **MISSING** (manual) |                                                                     |
| Verify Stripe production key on deployed web            | **MISSING** (manual) |                                                                     |
| Configure Firebase Auth authorized domains              | **MISSING** (manual) |                                                                     |
| Fix Firebase email sender spam issue                    | **MISSING** (manual) |                                                                     |
| Submit to App Store + Google Play                       | **MISSING** (manual) | Move to P1 (after P0 fixes soak 72h); use TestFlight in P0          |
| Set Stripe prices for intergroup Tier A + Tier B        | **MISSING** (manual) | Checkout silently breaks without these                              |
| Treatment Center Facility Dashboard                     | **MISSING**          | Depends on `getMeetingAttendance` bridge being confirmed            |
| Verify `getMeetingAttendance` cross-project callability | **UNVERIFIED**       | CF is in RC project; RATS must call across Firebase projects        |
| Flip `noindex` → `index` on unclaimed groups            | **MISSING**          | Trigger: ≥100 _claimed_ groups with rich content (not just created) |
| Custom domain setup                                     | **MISSING**          | See LAUNCH_BLOCKERS.md §5 for multi-file checklist                  |

### detox-recovery — actual MISSING/PARTIAL items

| Requirement                                       | Status      | Notes                                                                     |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| Wire PDF delivery via Lemon Squeezy webhooks      | **PARTIAL** | Migration in progress; needs webhook signature verification + retry logic |
| Wire MailerLite automations for lead magnet email | **MISSING** |                                                                           |

---

## Section 2: Growth-Optimized Roadmap

Growth score axes: **U** = Usability · **A** = Acquisition · **R** = Revenue

---

### P0 — Survival and Unblocking (Days 1–7)

> **Key principle:** No new feature work until verification pass completes. Several "fixes" from the source assessment turn out to be already done. Spend Day 1 on auditing, not building.

| Item                                                                                                                                          | Repo              | U     | A   | R     | Type   | Effort |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----- | --- | ----- | ------ | ------ |
| **Audit deployed Stripe Price IDs** — confirm prod env vars resolve to $49/$79, not legacy $9.99                                              | regroup-functions | —     | —   | **H** | Manual | 30min  |
| **Audit deployed RTDB rules** — confirm Firebase console matches deny-all in `database.rules.json` (`firebase database:get /.settings/rules`) | regroup-functions | —     | —   | M     | Manual | 30min  |
| **Count houses with `stripeStatus == "active"`** — determine addressable base for rent collection                                             | regroup-functions | —     | —   | **H** | Manual | 1h     |
| **Confirm `getMeetingAttendance` cross-project spec** — which Firebase project, what auth, what API contract                                  | RecoveryConnect   | —     | M   | M     | Manual | 2h     |
| If Stripe env vars wrong: update Firebase env config + redeploy                                                                               | regroup-functions | —     | —   | **H** | Ops    | 1h     |
| Run claim-and-pay flow end-to-end (RC)                                                                                                        | RecoveryConnect   | **H** | M   | **H** | Manual | 2h     |
| Verify Stripe production key on deployed web (RC)                                                                                             | RecoveryConnect   | —     | —   | **H** | Manual | 30min  |
| Configure Firebase Auth authorized domains (RC)                                                                                               | RecoveryConnect   | **H** | —   | —     | Manual | 30min  |
| Fix Firebase email sender spam issue (RC)                                                                                                     | RecoveryConnect   | **H** | —   | —     | Manual | 1h     |

**Excluded from P0:** App Store submission — moved to P1 (submit after P0 fixes have soaked 72h; use TestFlight in P0 week).

---

### P1 — Revenue Activation (Days 7–30)

| Item                                                                                                                   | Repo                                | U     | A     | R     | Effort      |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----- | ----- | ----- | ----------- |
| Verify payment CFs end-to-end in test mode                                                                             | regroup-functions                   | **H** | —     | **H** | S (1d)      |
| Confirm Stripe webhook writes `payment_intent.succeeded` → `payments/{id}` Firestore doc                               | regroup-functions                   | M     | —     | **H** | S (2h)      |
| `oxfordEnabled` unification — CF-based toggle that atomically updates house + user subscription metadata + Stripe plan | regroup-rn7 + regroup-functions     | **H** | **H** | **H** | M (2–3d)    |
| Treatment Center Facility Dashboard (RC)                                                                               | RecoveryConnect                     | M     | **H** | **H** | M–L (3–7d)  |
| Cross-project bridge for `getMeetingAttendance` (if spec confirms RC-only)                                             | regroup-functions + RecoveryConnect | M     | M     | M     | M (2–3d)    |
| Set Stripe prices for intergroup Tier A + Tier B (RC)                                                                  | RecoveryConnect                     | —     | M     | **H** | Manual (1h) |
| Rate limiting on `createPaymentIntent` and other HTTP CFs                                                              | regroup-functions                   | —     | —     | M     | S (4h)      |
| Add App Store / Play Store buttons to regroup-web                                                                      | regroup-web                         | M     | **H** | M     | S (1h)      |
| Wire MailerLite automations + Lemon Squeezy webhook (detox-recovery)                                                   | detox-recovery                      | M     | M     | M     | S (1d)      |
| Submit to App Store + Google Play (RC)                                                                                 | RecoveryConnect                     | **H** | **H** | **H** | Manual      |

---

### P2 — Oxford Acquisition + Retention (Days 30–60)

| Item                                                                       | Repo              | U     | A     | R     | Effort        |
| -------------------------------------------------------------------------- | ----------------- | ----- | ----- | ----- | ------------- |
| Oxford onboarding wizard                                                   | regroup-rn7       | **H** | **H** | **H** | L (5–7d)      |
| Oxford network directory                                                   | regroup-rn7       | M     | **H** | M     | M (2–3d)      |
| Resident TodayView (daily accountability dashboard)                        | regroup-rn7       | **H** | —     | M     | M (3d)        |
| Push notification accountability loop (6 triggers)                         | regroup-rn7       | **H** | —     | M     | M (3d)        |
| Phase advancement progress bar (wire queries → UI)                         | regroup-rn7       | M     | —     | M     | S (1d)        |
| Activity dispute "Dispute This" action in feed                             | regroup-rn7       | M     | —     | —     | S (1d)        |
| Shareable charter compliance PDF                                           | regroup-rn7       | M     | M     | M     | M (2–3d)      |
| Automated rent reminders (scheduled CF)                                    | regroup-functions | M     | —     | **H** | S–M (1–2d)    |
| Flip `noindex` → `index` at ≥100 _claimed_ groups with rich content (RC)   | RecoveryConnect   | —     | **H** | M     | S (1h)        |
| Operator testimonials + house count (regroup-web)                          | regroup-web       | —     | M     | M     | S (2h)        |
| Evaluate RC trial-to-paid conversion rate                                  | RecoveryConnect   | —     | —     | —     | Manual        |
| Pricing migration for existing operators (grandfather → renew-at-new-rate) | regroup-functions | —     | —     | **H** | S (4h script) |

---

### P3 — Payment Expansion + Long-Term (Days 60–120+)

| Item                                      | Repo                            | U   | A     | R     | Notes                                                                                        |
| ----------------------------------------- | ------------------------------- | --- | ----- | ----- | -------------------------------------------------------------------------------------------- |
| Auto-pay / recurring rent enrollment      | regroup-rn7 + regroup-functions | M   | —     | **H** | Requires P1 payment verification first                                                       |
| Custom domain (`homegroups-app.com`) (RC) | RecoveryConnect                 | M   | M     | —     | See LAUNCH_BLOCKERS.md §5 for multi-file checklist                                           |
| Regroup-web Stripe checkout flow          | regroup-web                     | M   | —     | M     | Subscribe page is currently email-only; requires Stripe Elements integration — not a 2h task |
| Angular 9 → 17+ upgrade                   | regroup-web                     | M   | —     | —     | Security/maintainability; low acquisition impact                                             |
| CF unit/integration test gap analysis     | regroup-functions               | —   | —     | M     | Identify uncovered paths before scaling                                                      |
| Aftercare Management System (new product) | New                             | —   | **H** | **H** | Month 8; HIPAA + PostgreSQL + GCP                                                            |
| Enterprise sales push                     | All                             | —   | **H** | **H** | Month 10; requires Facility Dashboard + getMeetingAttendance bridge                          |

**Excluded from roadmap:**

- Intergroup governance/analytics (RC) — no users yet; deferred post-launch
- Elections, bylaws ratification, group health dashboards (RC) — deferred
- Video calling (regroup-rn7) — niche
- Paid acquisition (RC) — only after trial-to-paid > 30%

---

## Section 3: Implementation Plans (P0 + P1)

### P0.A — Stripe Price ID Verification and Fix

**Status:** UNVERIFIED → ops action | **Repo:** regroup-functions | **Effort:** 30min–1h
**Growth Score:** U: — | A: — | R: H

**Context:** Source code uses env-var-driven price IDs (`process.env.STRIPE_HOUSE_PRICE_ID`, `STRIPE_OXFORD_PRICE_ID`). Source comments say $49/$79 but the actual deployed env var value may still point to old $9.99 Stripe Price IDs. This is an ops audit, not a code change.

**What's needed:**

- [ ] `firebase functions:config:get stripe` (or `firebase functions:secrets:get`) — capture the current deployed `STRIPE_HOUSE_PRICE_ID` value
- [ ] Look up that Price ID in the Stripe dashboard → confirm it maps to the correct dollar amount
- [ ] If wrong: create new Stripe Products + Prices at target rates (Oxford Standard $39, Oxford Plus $69, Starter $49, Professional $99) in **test mode** first
- [ ] Verify checkout works against new prices in test mode (call `createCheckoutSession` with test Stripe key)
- [ ] Update Firebase Functions env config: `firebase functions:secrets:set STRIPE_HOUSE_PRICE_ID` (or `functions:config:set stripe.house_price_id=...`)
- [ ] Deploy: `firebase deploy --only functions`
- [ ] Verify ONE new checkout in live mode before sending any customer communication
- [ ] **ONLY THEN**: notify existing customers of grandfather period (this is the one-way door)
- [ ] Keep old Stripe Price IDs active (not archived) for 60 days — existing subscriptions reference them

**Acceptance criteria:**

- [ ] `createCheckoutSession` in test mode shows correct price to user
- [ ] Old Stripe Price IDs remain active for existing subscription renewals
- [ ] No customer notification sent until live checkout verified

---

### P0.B — RC Manual Launch Actions (Ordered)

**Status:** MISSING | **Repo:** RecoveryConnect | **Effort:** 1 day total

Execute in this order (dependencies are real):

1. [ ] **Set Stripe prices in dashboard** for Tier A ($99–149/year) and Tier B ($199–249/year) on intergroup products — without this, intergroup checkouts throw at runtime
2. [ ] **Configure Firebase Auth authorized domains** — Console → Auth → Authorized Domains → add `recovery-connect-cad4b.web.app` + `.firebaseapp.com`
3. [ ] **Fix email sender** — Console → Auth → Templates → customize "From" to "Homegroups"; send test to Gmail; configure custom domain if landing in spam
4. [ ] **Verify Stripe production key** — open deployed web in DevTools → Network → filter Stripe → confirm `pk_live_`
5. [ ] **Replace `id0000000000` placeholder** in `web/src/lib/deepLinks.js:9` with real App Store ID (only possible after App Store submission is approved — placeholder is fine during review but must be replaced before v1 marketing push)
6. [ ] **Run claim-and-pay flow** in incognito, real card, real group — verify Firestore `isClaimed: true`, email received, mobile app shows admin access
7. [ ] **Submit to App Store + Google Play** (P1 — after above 6 steps complete and P0 fixes have soaked 72h; use TestFlight in P0 week)

---

### P1.A — Verify Payment CFs End-to-End

**Status:** CFs exist, integration unverified | **Repo:** regroup-functions | **Effort:** S (1d)
**Growth Score:** U: H | A: — | R: H

`functions/src/callable/payments.ts` contains `createPaymentIntent`, `listPayments`, `listHousePayments`. Verify they work before mobile payments go live.

**What's needed:**

- [ ] Read `payments.ts` fully — confirm `payment_intent.succeeded` result is persisted to Firestore `payments/{id}` collection (either in the CF or in `stripeWebhook.ts`)
- [ ] If webhook handler does NOT write to `payments` collection: add `payment_intent.succeeded` event handler in `stripeWebhook.ts` that persists `{ guestId, houseId, amount, status, stripeIntentId, createdAt }` to `payments/{id}`
- [ ] Count houses with `stripeStatus == "active"` (one-off Firestore query) — this is the addressable P1 population
- [ ] Run `createPaymentIntent` against a test connected account with a valid `stripeAccountId`
- [ ] Confirm `listPayments` returns the test payment after it succeeds
- [ ] Confirm `listHousePayments` requires admin claim (attempt with non-admin — expect PERMISSION_DENIED)
- [ ] Verify mobile UI wires correctly: `createRentPaymentIntent()` in `src/services/payments.ts:65` reaches the CF and Stripe payment sheet opens
- [ ] Add caller authorization check if not already present: `request.auth.uid === residentUserId` OR caller has admin claim for `houseId`

**Acceptance criteria:**

- [ ] End-to-end: resident initiates payment → Stripe sheet opens → payment succeeds → Firestore `payments/{id}` doc exists → `listPayments` returns it
- [ ] Unauthorized caller cannot create payment intent for another user's `guestId`
- [ ] Missing `stripeAccountId` returns `HttpsError("failed-precondition", "House has not completed Stripe Connect onboarding")` — not an opaque 500

---

### P1.B — `oxfordEnabled` Unification (Oxford Toggle)

**Status:** DESIGN ISSUE — dual source of truth | **Repo:** regroup-rn7 + regroup-functions | **Effort:** M (2–3d)
**Growth Score:** U: H | A: H | R: H

**Context — the problem:** Two independent `oxfordEnabled` values exist:

1. `houses/{id}.oxfordEnabled` — checked by `houseOxfordActive()` in `firestore.rules:66`, gates writes to `officers`, `business-meetings`, `votes` subcollections
2. `user.subscriptionMetadata.oxfordEnabled` — checked by `useOxfordGate.ts:22` and `OxfordDashboard.tsx:93` (UI gate), also drives Stripe plan selection in `subscriptions.ts:130`

Building a HouseSettings toggle that only updates field #1 will: leave the upgrade-prompt showing to all residents (field #2 unchanged), leave Stripe billing at the house rate (field #2 drives plan), and allow admins to write Oxford-rule-gated docs without paying for Oxford (billing arbitrage).

**What's needed:**

- [ ] Decide on single source of truth: recommend `user.subscriptionMetadata.oxfordEnabled` (already drives billing + UI)
- [ ] If keeping user-subscription as SoT: update `firestore.rules:64-68` to read from `users/{userId}.subscriptionMetadata.oxfordEnabled` OR from a house-level field that is only written by a trusted CF (not direct client write)
- [ ] Create callable CF `setOxfordEnabled(houseId: string, enabled: boolean)` in regroup-functions that atomically:
  1. Fetches house doc + operator's user doc
  2. Updates `houses/{houseId}.oxfordEnabled = enabled`
  3. Updates `users/{operatorId}.subscriptionMetadata.oxfordEnabled = enabled`
  4. Calls Stripe to swap subscription item: enabled → `OXFORD_PRICE_ID`, disabled → `STRIPE_HOUSE_PRICE_ID`
  5. Rolls back Firestore writes if Stripe call fails
- [ ] Add toggle UI in HouseSettings (admin-only), calling the CF above
- [ ] Verify `useOxfordGate` unlocks Oxford screens after toggle
- [ ] Verify Stripe subscription shows correct plan after toggle

**Acceptance criteria:**

- [ ] Admin toggles Oxford on → Oxford screens unlock for all house residents immediately
- [ ] Stripe subscription migrates to Oxford price on toggle (not on next renewal)
- [ ] Toggling Oxford off reverts to house price and re-hides Oxford screens
- [ ] Non-admins cannot call `setOxfordEnabled` (CF checks claim)

---

### P1.C — `getMeetingAttendance` Cross-Project Bridge

**Status:** MISSING in regroup-functions | **Effort:** M (2–3d) if bridge needed
**Growth Score:** U: M | A: M | R: M (gates P1.3 Facility Dashboard and Month 10 enterprise revenue)

**Context:** The CF exists in RecoveryConnect's Firebase project. For RATS to call it cross-project, auth must be federated.

**What's needed:**

- [ ] Confirm RC's `getMeetingAttendance` endpoint details: URL, auth mechanism (`RATS_API_KEY` bearer header), request/response shape
- [ ] Confirm composite Firestore index (commit 0b0e88a) is deployed in RC's project
- [ ] Make a test call from a RATS Cloud Function using `RATS_API_KEY` to `getMeetingAttendance`
- [ ] If successful: document the API contract; wire into Facility Dashboard data pipeline (P1.3)
- [ ] If auth fails or endpoint unreachable: escalate — P1.3 cannot ship until bridge is operational

**Acceptance criteria:**

- [ ] RATS CF can call `getMeetingAttendance` and receive meeting attendance records for a given `groupId + userId`
- [ ] P1.3 Facility Dashboard has live data from the bridge

---

## Section 4: Cross-Product Sequencing

```
┌───────────────────────────────────────────────────────────────────┐
│  DAY 1: Audit before building                                     │
│                                                                   │
│  ① Verify Stripe Price IDs in prod env (30min)                    │
│  ② Verify RTDB rules match deny-all (30min)                       │
│  ③ Count houses with stripeStatus == "active" (1h)                │
│  ④ Confirm getMeetingAttendance cross-project spec (2h)           │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  DAYS 2–7: Fix what's actually broken (P0)                        │
│                                                                   │
│  regroup-functions:                                               │
│    ⑤ If Stripe env wrong: update + redeploy (1h)                  │
│                                                                   │
│  RecoveryConnect manual (in order):                               │
│    ⑥ Set intergroup Stripe prices                                  │
│    ⑦ Firebase Auth authorized domains                              │
│    ⑧ Email sender fix                                              │
│    ⑨ Verify Stripe production key                                  │
│    ⑩ Run claim-and-pay flow                                        │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  DAYS 7–30: Revenue activation (P1)                               │
│                                                                   │
│  regroup-functions:                                               │
│    ⑪ Verify payment CFs + webhook handler end-to-end              │
│    ⑫ Rate limiting on payment + HTTP CFs                           │
│                                                                   │
│  regroup-rn7:                                                     │
│    ⑬ oxfordEnabled unification via CF (M, 2–3d)                   │
│       → unlocks 2,500 Oxford Houses                               │
│                                                                   │
│  RecoveryConnect:                                                 │
│    ⑭ getMeetingAttendance cross-project bridge verify             │
│    ⑮ Treatment Center Facility Dashboard (M–L, 3–7d)              │
│       Depends on ⑭                                                │
│    ⑯ App Store + Google Play submission                            │
│                                                                   │
│  regroup-web:                                                     │
│    ⑰ Add App Store download buttons (1h)                           │
│                                                                   │
│  detox-recovery:                                                  │
│    ⑱ MailerLite + Lemon Squeezy PDF delivery                       │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  MONTH 2: Oxford acquisition + resident retention (P2)            │
│                                                                   │
│  regroup-rn7:                                                     │
│    ⑲ Oxford onboarding wizard (L, 5–7d)                           │
│    ⑳ Oxford network directory (M, 2–3d)                           │
│    ㉑ Resident TodayView daily dashboard (M, 3d)                   │
│    ㉒ Push notification accountability loop (M, 3d)               │
│                                                                   │
│  regroup-functions:                                               │
│    ㉓ Automated rent reminders (scheduled CF)                      │
│       (payment CF verified in P1, so this can ship in P2)         │
│                                                                   │
│  RecoveryConnect:                                                 │
│    ㉔ noindex flip at ≥100 claimed groups                          │
│    ㉕ Evaluate trial-to-paid conversion                            │
│       > 30%: scale outreach                                        │
│       < 30%: fix trial experience before features                  │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  MONTH 6–8: Oxford pilot + enterprise setup                       │
│                                                                   │
│  Free Oxford tier drives adoption                                 │
│  Chapter premium: $200–500/month                                  │
│  ⑮ Facility Dashboard + ⑭ bridge enable enterprise sales demo     │
│                                                                   │
│  Aftercare system (new product):                                  │
│    Next.js + GCP Cloud Run + PostgreSQL (HIPAA BAA)               │
│    Reads from: RC meetingInstances + RATS directory API           │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│  MONTH 10: Enterprise sales push                                  │
│  Target: 3–5 treatment centers @ $800–3K/month                   │
│  Requires: ⑮ Facility Dashboard + ⑭ getMeetingAttendance bridge   │
│            + RATS Oxford module live                              │
└───────────────────────────────────────────────────────────────────┘
```

### Integration Bridges

| Bridge                                           | Status                                 | Enables                                                  |
| ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------- |
| `getMeetingAttendance` HTTP endpoint (RC → RATS) | UNVERIFIED cross-project callability   | RATS meeting compliance; treatment center outcome data   |
| `createPaymentIntent` with Stripe Connect (RATS) | EXISTS — needs end-to-end verification | Rent collection; 2% platform fee (already wired in code) |
| Oxford network directory API (RATS)              | MISSING (P2)                           | Public house listing; referral entry point               |
| Treatment Center Facility Dashboard (RC)         | MISSING (P1)                           | Enterprise sales demo; B2B unlock                        |
| RATS directory → Aftercare referrals             | Future                                 | Month 8 Aftercare system                                 |

---

## Section 5: Revenue Timeline

> **Important caveats on Month 1-2 projections:**
>
> - Month 1 MRR jump depends on whether the deployed Stripe Price IDs are currently wrong. If already correct ($49/$79), no immediate jump — the gain from P0.A audit may be zero.
> - Existing operator subscription migration to new prices requires a separate script and opt-in communication. Without migration, MRR from existing operators does not change at renewal until the operator's current subscription period ends.
> - Month 2 rent collection MRR depends on the % of houses with `stripeStatus == "active"`. If <30%, revenue impact is much smaller.

| Month | Source          | Event                                                        | Est. MRR (if all goes well)    |
| ----- | --------------- | ------------------------------------------------------------ | ------------------------------ |
| 1     | RATS            | Audit reveals actual pricing; fix env vars if wrong          | ~$400–1,000 (depends on audit) |
| 1     | RecoveryConnect | First $12/year groups (beta launch)                          | ~$10–50                        |
| 2     | RATS            | Rent collection verified live; 2% fee begins flowing         | ~$600–1,500                    |
| 3     | RATS            | New operators onboard at correct pricing; Oxford toggle live | ~$1,000–2,500                  |
| 3     | RecoveryConnect | 30 groups in paid trial conversion                           | ~$50–300                       |
| 6     | RATS            | Oxford pilot: free drives adoption; chapter billing          | ~$500–1,500                    |
| 8     | Aftercare       | Product in development                                       | —                              |
| 10    | All             | First treatment centers ($800–3K/month)                      | ~$2,000–5,000                  |
| 12    | Combined        | Target                                                       | **~$5,000–10,000 MRR**         |

---

## Section 6: Confidence Notes

| Item                                                        | Confidence | Note                                                                                                 |
| ----------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Payment CFs exist (`createPaymentIntent`, etc.)             | **HIGH**   | Verified at `functions/src/callable/payments.ts`                                                     |
| 2% application fee already live in code                     | **HIGH**   | `payments.ts:133` computes it; whether it runs depends on houses having `stripeConnectId`            |
| RTDB rules already deny-all                                 | **HIGH**   | Verified at `database.rules.json`; Firebase console should be independently confirmed                |
| Pricing is env-var driven (not hardcoded)                   | **HIGH**   | Confirmed `api/stripe.ts:21-42`; actual deployed env var values unverified                           |
| `getMeetingAttendance` exists in RC (not regroup-functions) | **HIGH**   | Searched regroup-functions — no match; RC has the CF                                                 |
| Oxford module completeness                                  | **MEDIUM** | Committed (58cd4d5); UI flows unverified against full acceptance criteria                            |
| `oxfordEnabled` dual-source design issue                    | **HIGH**   | Confirmed: house doc + user subscriptionMetadata. Billing arbitrage hole exists if not consolidated. |
| Stripe Connect coverage (% of houses with active accounts)  | **LOW**    | Unverified; drives entire rent collection revenue projection                                         |
| Stripe webhook persisting payment events to Firestore       | **MEDIUM** | `stripeWebhook.ts` exists; whether it handles `payment_intent` events is unconfirmed                 |
| Phase advancement UI wire missing                           | **MEDIUM** | Queries confirmed; UI gap not directly verified                                                      |
| Push notification FCM coverage (6 triggers)                 | **MEDIUM** | Some FCM triggers exist; full scope unconfirmed                                                      |
| RC intergroup checkout will fail without Stripe prices set  | **HIGH**   | `getDefaultPriceForProduct()` throws if no default price; prices not set = silent checkout breakage  |

---

## Key Manual Actions (Non-Code, Ordered)

These require human operator action and cannot be automated. Execute in order — dependencies are real:

**RecoveryConnect (must complete before App Store submission):**

1. Set Stripe prices for intergroup Tier A + Tier B in Stripe dashboard (products mapped to `productIdIntergroupA` / `productIdIntergroupB`)
2. Firebase Auth → Authorized Domains → add `recovery-connect-cad4b.web.app` + `.firebaseapp.com`
3. Firebase Auth → Templates → customize email "From" name to "Homegroups"; test for spam; configure custom sender domain if needed
4. Deploy updated web app; DevTools verify `pk_live_` in Stripe network requests
5. Run claim-and-pay flow in incognito, real card, real group — verify Firestore + email + mobile access
6. Submit to App Store (replaces `id0000000000` with real ID post-approval); submit to Google Play
7. Attend 3 intergroup meetings in metro for treasury handoff demos

**RATS (regroup-functions):**

1. Audit deployed Stripe Price IDs (Firebase console or CLI) — verify $49/$79, not $9.99
2. Audit RTDB rules in Firebase console — confirm deny-all is deployed
3. Query Firestore: count houses where `stripeStatus == "active"` — baseline for rent collection revenue
4. If pricing is wrong: update env config, redeploy, verify one test checkout before notifying customers
5. Customer notification of pricing grandfather period — only after test checkout passes (this is the one-way door)

---
*Last reviewed: 2026-05-24 | Audience: mixed | Type: reference*
