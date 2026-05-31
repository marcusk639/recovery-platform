# Regroup Platform: Strategic Assessment & Prioritized Roadmap

**Date:** 2026-05-24
**Scope:** Full platform — mobile app (regroup-rn7), Cloud Functions (regroup-functions), marketing site (regroup-web)
**Audience:** Human operators and AI LLM agents

---

## Executive Summary

Regroup (RATS) is a React Native sober living house management platform backed by Firebase. It has demonstrated real product-market fit — 5–10 paying houses — but has three critical blocking issues that must be resolved before any growth push:

1. **Security:** Realtime Database security rules are open — all customer data is publicly readable/writable right now.
2. **Pricing mismatch:** Cloud Functions have hardcoded subscription pricing of $9.99/$19.99 per month. Documentation recommends $39–99/month. The platform is charging a fraction of what it should.
3. **Missing rent payment function:** The mobile service layer (`src/services/payments.ts`) is fully built and correctly calls `httpsCallable('createPaymentIntent')`. That Cloud Function **does not exist** in `regroup-functions`. The index exports 24 callable functions — none are `createPaymentIntent`, `listPayments`, or `listHousePayments`. `onboardStripeConnectUser` exists (HTTP, not callable) for operator Stripe Connect onboarding only. Rent collection is entirely blocked at the backend.

Beyond these blockers, the platform has strong bones: 289+ screens, 32 Cloud Functions, 38 services, and the only Oxford House governance tooling on the market. The marketing site (regroup-web) is an Angular 9 landing page — not an admin portal — so there is no web management UI to maintain or sunset.

**Highest-leverage actions, in order:**

1. Fix open security rules (48-hour emergency)
2. Fix subscription pricing in Cloud Functions ($9.99 → $39–99/month tiers)
3. Build and deploy the rent payment callable function
4. Enable the `oxfordEnabled` write path and launch Oxford House acquisition
5. Build the resident accountability experience that drives daily engagement

---

## Platform Architecture (Three Repos)

### regroup-rn7 — Mobile App (Primary Product)

- React Native 0.72, Firebase backend
- 289+ screens, 121 routes, 38 service files, 23+ entities, 19+ React Query hooks
- Redux Toolkit (12 slices) + React Query for state management
- Phase 6.1 flat RootStack navigation
- Offline-first via `offlineQueue.ts`
- Stripe Connect screens built; payment callable function missing from backend

### regroup-functions — Cloud Functions Backend

- Node.js 16, Firebase Functions v4.4.1, firebase-admin v11.10.1
- 32+ exported functions across HTTP callable, Firestore triggers, Realtime DB triggers, and scheduled Pub/Sub
- Stripe v8.50.0 for subscription billing (checkout session + webhook)
- SendGrid v7.3.0 for email
- **No unit or integration tests**
- **No rate limiting on HTTP functions**
- **Hardcoded pricing: FREE / $9.99 Basic / $19.99 Premium / Enterprise custom**
- Geospatial meeting search via `ngeohash`, `haversine-distance`, `x-ray` (web scraping)

### regroup-web — Marketing Site (Not an Admin Portal)

- Angular 9.1.0, TypeScript 3.8.3 — released 2020, significantly outdated
- 29 routes: 6 theme/landing variants, blog layouts, pricing page, subscribe page, download, login/signup
- **This is a product marketing website, not a management dashboard**
- No house management, guest tracking, or operator UI
- Stripe subscribe flow for subscription signup
- Firebase Hosting with Universal SSR (pre-rendering)
- Key services: `house.service.ts`, `subscription.service.ts`, `auth-service.ts`, `cloud-function.service.ts`

---

## Critical Issues (Fix Before Anything Else)

### Issue 1 — Open Security Rules [CRITICAL — 48 hours]

Realtime Database security rules are fully open. All customer data is readable and writable without authentication. This is a live data breach risk.

**Action:** Write and deploy least-privilege rules for all Firestore collections and Realtime Database paths. Use `isAdmin()` helper in Firestore rules (returns true for both `admin` and `superAdmin`).

### Issue 2 — Wrong Subscription Pricing in Cloud Functions [CRITICAL — This Week]

The `createOrUpdateSubscription` and `createCheckoutSession` functions have hardcoded pricing:

- FREE tier: $0
- BASIC tier: $9.99/month
- PREMIUM tier: $19.99/month

The platform documentation and market analysis recommend:

- Starter (traditional houses, ≤8 residents): $49/month
- Professional (traditional houses, ≤20 residents): $99/month
- Oxford Standard (≤12 residents): $39/month
- Oxford Plus (≤20 residents): $69/month

Every paying customer is being charged $9.99–$19.99 instead of $39–$99. This is the primary reason MRR is $100–150 instead of $400–1,000+ on the same customer base.

**Action:** Update pricing in Cloud Functions. Update Stripe products/prices in Stripe dashboard. Notify existing customers with a grandfather period.

### Issue 3 — Rent Payment Cloud Functions Missing [HIGH — This Month]

The mobile service layer (`src/services/payments.ts`) is fully and correctly implemented:

- `createRentPaymentIntent()` (line 65) → calls `httpsCallable('createPaymentIntent')`
- `createPaymentIntent()` (line 143) → also calls `httpsCallable('createPaymentIntent')`
- `listPayments()` (line 163) → calls `httpsCallable('listPayments')`
- `listHousePayments()` (line 176) → calls `httpsCallable('listHousePayments')`

None of these three Cloud Functions (`createPaymentIntent`, `listPayments`, `listHousePayments`) exist in `regroup-functions/functions/src/index.ts`. The index exports 24 callable functions — `onboardStripeConnectUser` handles Stripe Connect operator onboarding (HTTP, not callable) and `stripeEvents` handles Stripe webhooks, but there is no rent payment intent creation. The mobile UI, mobile service layer, and Stripe Connect onboarding are all built. Only three backend callables are missing.

**Action:** Build `createPaymentIntent`, `listPayments`, and `listHousePayments` callable Cloud Functions in `regroup-functions`. `createPaymentIntent` should use Stripe PaymentIntent with a Stripe Connect application fee (2%) routed to the house operator's connected account.

### Issue 4 — `oxfordEnabled` Flag Has No Write Path [HIGH — This Month]

Oxford House features are gated by `oxfordEnabled == true` in Firestore rules. There is no mechanism in the app or Cloud Functions to set this flag. Houses eligible for Oxford features cannot access them.

**Action:** Add the flag write path in `src/services/house.tsx` + expose a toggle in the `HouseSettings` screen + update Firestore rules to allow admin writes to this field.

### Issue 5 — No Tests in Cloud Functions [MEDIUM — 30 Days]

The `regroup-functions` codebase has zero unit or integration tests. Cloud Functions handle payment processing, subscription management, and user data — the highest-risk operations in the platform. A bug in production has no safety net.

**Action:** Add Jest tests for the Stripe webhook handler, payment functions, and Firestore triggers before deploying the rent payment function.

---

## Prioritized Roadmap

Scored across three criteria: **Attract** (new operator acquisition), **Retain** (existing operator/resident engagement), **Revenue** (direct MRR impact).

---

### Priority 1 — Survival (Days 1–7)

| Item                                      | Attract | Retain | Revenue      | Action                                                       |
| ----------------------------------------- | ------- | ------ | ------------ | ------------------------------------------------------------ |
| Fix Realtime DB security rules            | —       | —      | **CRITICAL** | Deploy rules immediately                                     |
| Fix subscription pricing ($9.99 → $39–99) | —       | —      | **CRITICAL** | Update Cloud Functions + Stripe dashboard + notify customers |
| Enable `oxfordEnabled` write path         | High    | High   | High         | 1-line service fix + HouseSettings toggle                    |

### Priority 2 — Revenue Activation (Days 7–30)

| Item                                                 | Attract | Retain   | Revenue        | Action                                                             |
| ---------------------------------------------------- | ------- | -------- | -------------- | ------------------------------------------------------------------ |
| Build `createRentPaymentIntent` Cloud Function       | Medium  | **High** | **High**       | New callable function in regroup-functions; wire to mobile service |
| Add Cloud Functions tests (Stripe webhook + payment) | —       | —        | Risk reduction | Jest tests before deploying payment function                       |
| Add rate limiting to HTTP Cloud Functions            | —       | —        | Risk reduction | Firebase App Check or custom middleware                            |

### Priority 3 — Oxford House Market Acquisition (Days 30–60)

Oxford Houses are 2,500 houses nationally, 100% underserved, concentrated network. The platform has 80%+ feature parity for this segment. Once `oxfordEnabled` is writeable, these features unlock immediately.

| Item                                                | Attract  | Retain   | Revenue | Action                                                                          |
| --------------------------------------------------- | -------- | -------- | ------- | ------------------------------------------------------------------------------- |
| Oxford onboarding wizard                            | **High** | High     | High    | Build guided setup: house config → officer election → first EES → first meeting |
| Oxford network directory                            | **High** | Medium   | Medium  | `HouseDirectory` screen sourced from Firestore public house index               |
| GPS-verified meeting attendance (validate existing) | **High** | **High** | Medium  | Validate existing meeting check-in flow writes GPS + compares against database  |
| Shareable charter compliance PDF                    | **High** | Medium   | Medium  | Cloud Function PDF export wired to CharterCompliance screen                     |
| EES auto-calculation on resident add/remove         | **High** | High     | Medium  | Firestore trigger in regroup-functions recalculates EES on guest write          |

### Priority 4 — Resident Retention (Days 60–120)

The core value proposition is behavioral accountability — making resident behavior visible, structured, and measurable. The operator side is largely built. The resident-facing daily experience needs investment.

| Item                                   | Attract | Retain   | Revenue | Action                                                                                                                           |
| -------------------------------------- | ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Resident daily dashboard (`TodayView`) | Medium  | **High** | Medium  | Aggregate today's chores + required meetings + curfew into PersonalScreen                                                        |
| Push notification accountability loop  | —       | **High** | Medium  | 6 triggers: chore reminder, meeting reminder, missed check-in, phase advancement, missed curfew (operator), late rent (operator) |
| Phase advancement progress visibility  | —       | **High** | —       | Wire `phaseAdvancementQueries.ts` into a progress bar on guest detail                                                            |
| Activity dispute filing UX             | —       | **High** | —       | Surface "Dispute This" action in activity feed → existing dispute screen                                                         |

### Priority 5 — Payment Expansion (Days 90–120)

Once rent payment processing is live, expand the financial surface.

| Item                                    | Attract | Retain | Revenue  | Action                                                          |
| --------------------------------------- | ------- | ------ | -------- | --------------------------------------------------------------- |
| Automated rent reminders                | —       | Medium | **High** | Scheduled Cloud Function triggered by rent due dates → FCM push |
| Auto-pay / recurring payment enrollment | Medium  | Medium | **High** | Stripe saved payment method enrollment in RentPayment screen    |
| Payment fee revenue (2% Stripe Connect) | —       | —      | **High** | Activate application fee in `createRentPaymentIntent` at 2%     |

### Priority 6 — Marketing Site Modernization (Days 60–90)

The regroup-web Angular site serves as the product's public face and subscription signup funnel. It is 4–5 major Angular versions behind (v9 vs. current v17+) and uses Node.js with a legacy OpenSSL flag.

| Item                                        | Attract  | Retain | Revenue  | Action                                                                   |
| ------------------------------------------- | -------- | ------ | -------- | ------------------------------------------------------------------------ |
| Upgrade Angular 9 → 17+                     | Medium   | —      | Medium   | Security/performance; required for modern tooling                        |
| Connect subscribe page to updated pricing   | Medium   | —      | **High** | Update Stripe product IDs on pricing and subscribe pages                 |
| Add App Store / Play Store download buttons | **High** | —      | Medium   | Primary CTA should be mobile app download, not web signup                |
| Add operator testimonials / house count     | **High** | —      | Medium   | Social proof drives operator sign-ups                                    |
| Blog as content marketing                   | Medium   | —      | Medium   | Regular content on Oxford governance, sober living operations drives SEO |

### Priority 7 — Recovery Ecosystem Integration (120+ Days)

The 3-part ecosystem vision positions Regroup as the operating layer across the full recovery continuum:

```
[Treatment Centers] ──→ [Sober Living Houses] ──→ [Ongoing Community Support]
       Phase 3                 Phase 1 (now)               Phase 2
```

**Phase 2 — Withdrawal Recovery Support Service**

- Serves individuals in acute withdrawal and early recovery before sober living placement
- Key features: daily mood/symptom check-ins, medication tracking, sponsor connection, crisis escalation (emergency contact + 988 Lifeline integration), peer support matching
- Integration: resident completing withdrawal support flows into a sober living placement with data transfer (sobriety date, medications, sponsor contact)
- Architecture note: The existing `Guest` entity already has `sobrietyDate`, `step`, and `supporters[]` — the right primitives are in place

**Phase 3 — Treatment Center Management**

- Patient intake/discharge, bed management, treatment plan tracking, outcomes reporting, insurance/billing, referral coordination
- The sober living platform already has analogs: intake forms, bed management, activity tracking, payment processing, reporting
- Critical addition: HIPAA compliance and 42 CFR Part 2 (substance abuse confidentiality) — requires significant security and data handling changes
- Key integration: Treatment center discharge → automatic sober living referral within the Regroup network

**Cross-Platform Referral Network (Design Before Phase 2)**

- A `Referral` entity connecting all three platform tiers is the connective tissue
- Every new node in the ecosystem increases the referral surface for every other node
- This is the moat: competitors can build individual tools; they cannot replicate a referral network

---

## Feature Parity vs. Competitors

| Feature                                   | Regroup Status                                  | Competitive Standard |
| ----------------------------------------- | ----------------------------------------------- | -------------------- |
| Resident profiles + intake                | Implemented                                     | Standard             |
| Phase/level management                    | Implemented                                     | Standard             |
| Chore tracking                            | Implemented                                     | Standard             |
| Drug test tracking                        | Implemented                                     | Common               |
| Staff notes + shift logs                  | Implemented                                     | Common               |
| GPS meeting attendance verification       | Implemented                                     | Rare — unique        |
| Oxford governance (voting, officers, EES) | Implemented (locked by missing write path)      | Unique               |
| Charter compliance monitoring             | Implemented                                     | Unique               |
| Stripe subscription billing               | Implemented — wrong prices                      | Standard             |
| Stripe rent payment processing            | Mobile UI built, Cloud Function missing         | Standard             |
| Auto-pay / recurring rent                 | Not built                                       | Common               |
| Automated rent reminders                  | Not built                                       | Common               |
| Document management                       | Partial (upload/list; no e-signature)           | Common               |
| Bed/room visualization                    | Implemented                                     | Standard             |
| Custom reporting + export                 | Partial                                         | Common               |
| 2FA                                       | Screen exists; Cloud Function status unknown    | Standard             |
| Offline-first mobile                      | Implemented                                     | Good                 |
| Web admin portal                          | Does not exist (web app is marketing site only) | Varies               |
| Video calling                             | Not built                                       | Niche                |
| Alumni network                            | Not built                                       | Niche                |

---

## Pricing (Recommended — Must Update Cloud Functions)

The following prices must be set in both the `regroup-functions` codebase and the Stripe dashboard:

| Plan                 | Target                     | Price     | Resident Limit |
| -------------------- | -------------------------- | --------- | -------------- |
| Oxford Standard      | Single Oxford House        | $39/month | ≤12 residents  |
| Oxford Plus          | Larger Oxford House        | $69/month | ≤20 residents  |
| Starter              | Small traditional house    | $49/month | ≤8 residents   |
| Professional         | Mid-size traditional house | $99/month | ≤20 residents  |
| Enterprise / Network | Multi-house operators      | Custom    | Unlimited      |

**Secondary revenue:** 2% application fee on rent payments via Stripe Connect. At $800 avg rent × 15 residents × 2% = $240/house/month. This equals or exceeds subscription revenue at scale.

**12-month revenue projection (post-fix):**

| Source            | Houses | Avg/mo | MRR                         |
| ----------------- | ------ | ------ | --------------------------- |
| Subscriptions     | 50     | $70    | $3,500                      |
| Rent payment fees | 30     | $200   | $6,000                      |
| **Total**         |        |        | **$9,500 MRR (~$114K ARR)** |

Path to $200K ARR: 100+ houses. Each Oxford House acquired through word-of-mouth typically brings 2–3 neighboring houses within 6 months.

---

## Key Risks

| Risk                                                 | Likelihood                | Impact   | Mitigation                                                        |
| ---------------------------------------------------- | ------------------------- | -------- | ----------------------------------------------------------------- |
| Security breach before rules are patched             | **High** (rules open now) | Critical | Fix in 48 hours                                                   |
| Price increase causes churn                          | Medium                    | Medium   | Grandfather existing customers 90 days                            |
| Rent payment function bugs in production             | Medium                    | High     | Test with 1–2 beta houses; add Cloud Functions tests first        |
| No backend tests — production bug has no safety net  | High                      | High     | Add Jest tests to regroup-functions before payment function ships |
| Oxford House network rejects platform culturally     | Low                       | High     | Involve an Oxford House member in product decisions               |
| Phase 2/3 expansion dilutes Phase 1 focus            | Medium                    | Medium   | Don't start Phase 2 until 100+ houses on Phase 1                  |
| Angular 9 security vulnerabilities on marketing site | Medium                    | Medium   | Upgrade to Angular 17+ within 60 days                             |

---

## 90-Day Sprint Plan

### Days 1–7: Emergency Stabilization

- [ ] Deploy Realtime Database and Firestore security rules
- [ ] Update Cloud Function pricing ($9.99 → $39–99/month tiers)
- [ ] Update Stripe product/price IDs in dashboard
- [ ] Notify existing customers of price change with 90-day grandfather period
- [ ] Add `oxfordEnabled` write path + HouseSettings toggle

### Days 8–30: Revenue Activation

- [ ] Add Jest tests to regroup-functions (Stripe webhook, subscription flow)
- [ ] Build `createRentPaymentIntent` callable Cloud Function with 2% Connect fee
- [ ] Add rate limiting to HTTP Cloud Functions
- [ ] Wire mobile app service layer to `createRentPaymentIntent`
- [ ] Beta test rent payment end-to-end with 1–2 houses
- [ ] Update regroup-web subscribe/pricing pages with correct Stripe product IDs

### Days 31–60: Oxford House Acquisition

- [ ] Build Oxford onboarding wizard (house config → officer election → EES → first meeting)
- [ ] Implement EES auto-calculation Firestore trigger in regroup-functions
- [ ] Build `HouseDirectory` screen (Oxford network)
- [ ] Validate GPS meeting attendance verification flow end-to-end
- [ ] Build shareable charter compliance PDF export

### Days 61–90: Retention + Marketing

- [ ] Build resident daily dashboard (`TodayView` in PersonalScreen)
- [ ] Implement 6 core push notification triggers (regroup-functions scheduled + Firestore triggers)
- [ ] Wire phase advancement progress bar to guest detail screen
- [ ] Surface dispute filing action in activity feed
- [ ] Begin Angular 9 → 17+ upgrade for regroup-web
- [ ] Add App Store / Play Store CTAs to marketing site

---

## Appendix: Codebase Reference for AI Agents

### regroup-rn7 (Mobile App)

- **Entry:** `App.tsx` — provider tree: ErrorBoundary > SafeAreaProvider > StripeProvider > ThemeProvider > DataProvider > NotificationProvider > ModalProvider > Auth > RootNavigator
- **Navigation:** All routes in `src/navigation/types.ts`. Phase 6.1 flat RootStack — no nested stacks except AuthStack and MainTab.
- **State:** Redux Toolkit slices in `src/state/slices/`. React Query hooks in `src/state/queries/`.
- **Services:** `src/services/` — wraps all Firestore reads/writes and Cloud Function calls.
- **Entities:** `src/entities/` — TypeScript interfaces for Firestore document shapes. Use `.ts` not `.tsx` for new entities.
- **Auth:** Singleton `auth` from `firebase-setup.ts`. Use `auth.currentUser`, not `auth().currentUser`.
- **Roles:** Firebase custom claims: `guest`, `admin`, `superAdmin`, `potentialSuperAdmin`. In Firestore rules, `isAdmin()` covers both `admin` and `superAdmin`.
- **Error logging:** `logException(error)` from `src/util/logging.ts`. Never `console.error` or `console.log`.
- **Imports:** No `@/` alias in source files. Relative paths only. `@/` works in Jest tests only.
- **Oxford gate:** `houseOxfordActive()` in Firestore rules requires `oxfordEnabled == true` AND `subscriptionStatus ∈ {active, trialing}`.
- **Paywall:** `src/services/paywall.ts` — operators hard-blocked on lapse; guests get 7-day grace window.
- **Offline:** `src/services/offlineQueue.ts` — queues failed Firestore writes, retries with backoff via AsyncStorage.

### regroup-functions (Cloud Functions)

- **Entry:** `src/index.ts` — exports all 32+ functions.
- **Auth pattern:** `requireAuth()` middleware on callable functions. Custom claims via `hasRole()`.
- **Stripe:** `createOperatorSubscription`, `reactivateOperatorSubscription`, `updateSubscriptionGuests`, `updateSubscriptionHouses`, `getPaymentMethod`, `updatePaymentInfo`, `cancelUserSubscription` (subscription management); `stripeEvents` HTTP webhook handler; `onboardStripeConnectUser` HTTP (operator Connect onboarding). **`createPaymentIntent`, `listPayments`, `listHousePayments` do not exist — these are the missing rent payment callables.**
- **Email:** SendGrid (`@sendgrid/mail`) primary; Nodemailer fallback.
- **Geospatial:** `ngeohash` + `haversine-distance` for meeting proximity search. `x-ray` for AA/NA meeting scraping.
- **Scheduled:** `dailyScheduledTask` (2AM UTC), `weeklyScheduledTask` (3AM Sunday), `monthlyScheduledTask` (4AM 1st).
- **Tests:** None. Add Jest before shipping payment functions.
- **Node version:** 16.

### regroup-web (Marketing Site)

- **Framework:** Angular 9.1.0 (upgrade to 17+ needed).
- **Purpose:** Product marketing — landing pages, pricing, subscribe flow, blog. Not a management portal.
- **Stripe:** Subscribe page connects to Stripe checkout for subscription signup. Must be updated with correct product IDs.
- **Deployment:** Firebase Hosting with Universal SSR. Build: `ng build` → `build:ssr` → `build:functions` → `firebase deploy`.
- **Key services:** `house.service.ts`, `subscription.service.ts`, `auth-service.ts`, `cloud-function.service.ts`.

---
*Last reviewed: 2026-05-24 | Audience: operator | Type: reference*
