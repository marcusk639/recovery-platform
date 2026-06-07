# Regroup (RATS) Launch Readiness Assessment

**Date:** 2026-06-06
**Product:** RATS (Regroup Addiction Tracking System)
**Firebase Project:** `phoenix-cleanhouse`
**Branch:** feat/regroup-tier-billing-migration
**Purpose:** Spec- and plan-ready launch readiness document

---

## 1. Executive Summary

RATS is a full-stack platform for running sober living homes, targeting operators, house managers, and residents. The product has **core feature depth** (bed management, activities, messaging, Oxford House governance, Stripe Connect rent collection) but is **further from launch than Homegroups** due to an incomplete pricing tier migration, an outdated Angular web frontend, and a lower overall quality bar on production hardening. The recently implemented subscription tier system (6 tiers across traditional and Oxford house types) is architecturally sound but **has not been tested end-to-end with real payments**.

**Overall readiness: 5/10** -- solid functional base, but pricing activation, web modernization, and production validation are all required before revenue.

---

## 2. Things Done Well

### 2.1 Feature Set

| Module                             | Status   | Evidence                                                                         |
| ---------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Bed & room management              | Complete | Guest CRUD, room assignments, capacity tracking                                  |
| Resident profiles                  | Complete | Demographics, health, housing status, phase tracking                             |
| Phase advancement                  | Complete | Phase system with configurable criteria per house                                |
| Unified Activities                 | Complete | Meetings, chores, work, medication, supporters -- all tracked per guest per week |
| Drug testing records               | Complete | Full history with date/result/notes                                              |
| Oxford House governance            | Complete | Officer roles, business meetings, voting, Equal Expense Share (EES)              |
| Direct messaging + house chat      | Complete | FCM push notifications                                                           |
| Rent collection via Stripe Connect | Complete | Payment intents, webhook-driven receipts                                         |
| Scheduled rent collection          | Complete | Automated job: `scheduledRentCollection.ts`                                      |
| Overdue rent notifications         | Complete | Automated job: `overdueRentNotification.ts`                                      |
| Officer term reminders             | Complete | Automated job: `officerTermReminder.ts`                                          |
| Invitation system                  | Complete | Create/peek/redeem with email delivery                                           |
| Stripe Connect account management  | Complete | Onboard/deauthorize, `isAlreadyDeauthorized` idempotency                         |
| Marketing web portal               | Partial  | Angular 9 with SSR, 6 theme variants, billing portal exists                      |

### 2.2 Subscription Tier Architecture

The recently implemented `SUBSCRIPTION_TIERS` config in `config.ts` is well-structured:

```
Traditional:  Starter ($69/mo, 10 residents, 1 property)
              Professional ($129/mo, 20 residents, 3 properties)
              Enterprise ($249/mo, unlimited)

Oxford:       Standard ($49/mo, 15 residents, 1 property)
              Plus ($89/mo, 25 residents, 1 property)
              Network ($299/mo, unlimited -- regional chapters)
```

Each tier maps to a Stripe price via environment variable (`STRIPE_PRICE_TRAD_STARTER`, etc.), supports `maxResidents` and `maxProperties` limits, and is resolved dynamically at checkout. Input validation uses Zod schemas. This is a clean, extensible architecture.

### 2.3 Stripe Integration

- **Stripe Connect Express** for rent collection -- operators receive payouts directly.
- **Webhook handler** covers 10 event types including `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`, `invoice.*`, `customer.subscription.*`, `account.updated`, `payout.failed`, and Connect-specific events (`account.updated`, `account.application.deauthorized`).
- **Event deduplication**: `checkAndMarkEventProcessed()` prevents double-processing.
- **Dispute handling**: Dedicated dispute utility (`disputes.ts`) with tests.
- **Stripe error mapping**: `mapStripeError()` translates Stripe errors to Firebase `HttpsError` codes.
- **Billing portal**: `createBillingPortalSession` with origin-validated `returnUrl` (allow-list: `regroup-app.com`, `phoenix-cleanhouse.web.app`, `phoenix-cleanhouse.firebaseapp.com`, `localhost:4200`).

### 2.4 Backend Quality

- **320 test files** (functions + mobile, excluding 100 Angular spec files).
- **Zod validation** on subscription, payment, and invitation callables.
- **Secret Manager integration**: 7 secrets defined via `defineSecret()` (Stripe, SendGrid, RATS API key, Maps API key).
- **Auth guard**: `authGuard.ts` utility for consistent authentication checks.
- **Error tracking**: Both Crashlytics (`@react-native-firebase/crashlytics` v17.3.1) and Sentry (`@sentry/react-native` v7.12.0) installed.
- **CI pipelines**: `ci.yml`, `deploy.yml`, `e2e-tests.yml`, `unit-tests.yml` all present.
- **Integration tests**: 5 integration test files covering week summaries, activities, meetings, guest CRUD, and guest week transfers.

### 2.5 Security

- **322-line Firestore security rules** (more compact than Homegroups but covering the core entities).
- **URL validation** on billing portal return URLs with explicit allow-list.
- **Maps API key moved to Secret Manager** (callable proxies created for `reverseGeocodeLocation`, `googlePlacesProxy`).
- **Auth escalation fixes** applied (C1-C4 from security hardening track).
- **Firestore scoping rules** hardened (C7-C8).
- **`fromApp` referral validation** fixed (C5).

---

## 3. Things That Need Work

### 3.1 Pricing Tier Activation (P0 -- Revenue-Blocking)

The subscription tier system is built in code (`config.ts`, `subscriptions.ts`) but the **Stripe prices have not been created**. Each tier references an environment variable (`STRIPE_PRICE_TRAD_STARTER`, etc.) that must map to a real Stripe Price ID.

| Tier                     | Env Var                          | Price to Set | Stripe Status |
| ------------------------ | -------------------------------- | ------------ | ------------- |
| Traditional Starter      | `STRIPE_PRICE_TRAD_STARTER`      | $69/month    | Not created   |
| Traditional Professional | `STRIPE_PRICE_TRAD_PROFESSIONAL` | $129/month   | Not created   |
| Traditional Enterprise   | `STRIPE_PRICE_TRAD_ENTERPRISE`   | $249/month   | Not created   |
| Oxford Standard          | `STRIPE_PRICE_OXFORD_STANDARD`   | $49/month    | Not created   |
| Oxford Plus              | `STRIPE_PRICE_OXFORD_PLUS`       | $89/month    | Not created   |
| Oxford Network           | `STRIPE_PRICE_OXFORD_NETWORK`    | $299/month   | Not created   |

**Action**: Create 6 Stripe Products with 6 monthly Prices, upload Price IDs to Secret Manager, and deploy functions.

### 3.2 End-to-End Payment Flow (P0)

No one has completed a full subscription + rent payment cycle with a real card. The flow is:

1. Operator signs up -> selects house type (traditional/oxford) -> selects tier -> enters payment method.
2. `createOperatorSubscription` callable creates Stripe customer + subscription.
3. Operator onboards Stripe Connect account for rent collection.
4. Resident pays rent -> `createPaymentIntent` -> webhook updates Firestore.

Each step is individually coded but the **integrated flow has not been tested end-to-end**.

### 3.3 Web Frontend (P1 -- Angular 9 is EOL)

The web app is **Angular 9** -- released February 2020, end-of-life since August 2020. This creates:

| Risk                                      | Impact                                          |
| ----------------------------------------- | ----------------------------------------------- |
| No security patches since 2020            | Vulnerability surface in SSR rendering pipeline |
| Angular 9 uses View Engine (not Ivy)      | Performance and bundle size penalty             |
| TypeScript version locked to ~3.8         | Cannot use modern TS features                   |
| Dependency conflicts with modern packages | Limits adding new web features                  |
| Investor/partner due diligence            | "6-year-old EOL frontend" is a red flag         |

The Angular web app serves the marketing site (6 themes), billing portal, and SSR for link previews. It is **functional but technically indebted**.

**Spec-ready action**: Either (a) accept Angular 9 for launch and plan a rewrite post-revenue, or (b) scope a minimal Next.js/React replacement for the billing portal + marketing pages. Option (a) is pragmatic if the web app is not customer-facing for core operations. Option (b) is required if the web billing portal is in the critical revenue path.

### 3.4 Mobile App Readiness

| Item                               | Status                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| React Native version               | 0.72 (July 2023) -- 2 major versions behind current                  |
| Package name                       | `rats` -- needs branding decision                                    |
| Version                            | `0.0.1` -- not release-ready                                         |
| iOS bundle ID                      | `com.rats.dev` -- dev suffix, not production                         |
| Android bundle ID                  | Needs verification                                                   |
| TypeScript migration               | 91% complete per roadmap (some JS files remain)                      |
| CocoaPods/BoringSSL install issues | Observed in recent sessions -- git clone failures during pod install |

### 3.5 Production Current State

From the product roadmap doc:

- **5 active sober living houses** currently using the product.
- **~50-100 residents** total (estimated).
- **$100-150/month revenue** at current pricing ($10/house + $1/resident).
- **0% automated test coverage** per roadmap (though 320 test files exist now -- this claim may be stale).
- **No active marketing** -- word of mouth only.

This is a small but real user base. The product has production validation at a micro-scale.

---

## 4. Inconsistencies

### 4.1 Pricing Strategy vs Implementation

The `PRICING_STRATEGY.md` document recommends specific prices. The `config.ts` tier system implements a subset. But there are inconsistencies:

| Aspect                      | PRICING_STRATEGY.md                                     | config.ts                                          |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Traditional Starter         | $69/month                                               | `STRIPE_PRICE_TRAD_STARTER` (price TBD)            |
| Traditional Professional    | $129/month                                              | `STRIPE_PRICE_TRAD_PROFESSIONAL` (price TBD)       |
| Traditional Enterprise      | $249/month                                              | `STRIPE_PRICE_TRAD_ENTERPRISE` (price TBD)         |
| Oxford Standard             | $49/month                                               | `STRIPE_PRICE_OXFORD_STANDARD` (price TBD)         |
| Oxford Plus                 | $89/month                                               | `STRIPE_PRICE_OXFORD_PLUS` (price TBD)             |
| Oxford Network              | $299/month (10-50 houses)                               | `STRIPE_PRICE_OXFORD_NETWORK` (price TBD)          |
| Stripe platform fee on rent | 2.5% recommended                                        | Not implemented (no platform fee code found)       |
| Bundle discount             | Mentioned in code (`applyBundleDiscountToSubscription`) | Logic exists but bundle criteria undefined         |
| Current pricing ($10 + $1)  | Called "unsustainable"                                  | No migration path documented for existing 5 houses |

**Key question**: How do you migrate existing 5 houses from $10+$1/resident to $49-249/month without losing them?

### 4.2 Stripe API Version Mismatch

- Regroup uses `2026-01-28.clover`.
- Homegroups uses `2025-12-15.clover`.
- Same platform, different API versions. Webhook payload shapes may differ between the two.

### 4.3 Stripe Client Instantiation Pattern Mismatch

- **Homegroups**: Singleton lazy Proxy pattern (`new Proxy({} as Stripe, { get(...) { return Reflect.get(ensureStripe(), ...) } })`). Sophisticated, prevents deploy-time crashes.
- **Regroup**: Factory function pattern (`createStripeClient()` returns a new instance on every call). Simpler but creates a new Stripe client per function invocation. Not wrong, but inconsistent with homegroups and slightly less efficient.

### 4.4 Test Count Discrepancy

The product roadmap claims "0% test coverage" but 320 test files exist in the repo. This is likely stale documentation from before the recent test-writing campaigns. The actual test coverage is non-zero but its extent is unclear without running coverage.

### 4.5 Dual Error Tracking

Both Crashlytics (v17.3.1) and Sentry (v7.12.0) are installed. This is unusual -- most projects pick one. It creates:

- Duplicate crash reports.
- Two dashboards to monitor.
- Double the SDK overhead.

**Spec-ready action**: Decide on one error tracking service (Sentry is more feature-rich; Crashlytics integrates with Firebase natively). Remove the other.

---

## 5. Pricing Strategy Assessment

### 5.1 Current Pricing (Legacy)

| Item         | Price     | Revenue at 5 Houses                    |
| ------------ | --------- | -------------------------------------- |
| Per house    | $10/month | $50/month                              |
| Per resident | $1/month  | ~$50-100/month                         |
| **Total**    |           | **$100-150/month ($1,200-1,800/year)** |

The PRICING_STRATEGY.md correctly identifies this as unsustainable: $60K/year at 250 houses vs. $170K/year in estimated costs.

### 5.2 Proposed Pricing (config.ts Tiers)

| Segment     | Tier         | Price   | Target Operator             |
| ----------- | ------------ | ------- | --------------------------- |
| Traditional | Starter      | $69/mo  | Single house, ≤10 residents |
| Traditional | Professional | $129/mo | 1-3 houses, ≤20 residents   |
| Traditional | Enterprise   | $249/mo | Multi-property, unlimited   |
| Oxford      | Standard     | $49/mo  | Single Oxford House, ≤15    |
| Oxford      | Plus         | $89/mo  | Larger house, ≤25           |
| Oxford      | Network      | $299/mo | Regional chapter, unlimited |

### 5.3 Competitive Pricing Comparison

| Competitor                           | Pricing Model    | Entry Price                                     | Notes                                                                                 |
| ------------------------------------ | ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Sobriety Hub**                     | Per-user (staff) | $75/mo per full user, $25/mo per client manager | $250 onboarding fee. 3.9% CC / 1.2% ACH processing fees. Scales with staff, not beds. |
| **One Step Software**                | Custom quotes    | Not published                                   | Higher than Sobriety Hub per user reviews. Established in drug court programs.        |
| **Sober Living App (Behave Health)** | Custom quotes    | Not published                                   | NARR affiliate discounts. Best for clinical-adjacent operations.                      |
| **RATS (proposed)**                  | Per-house tiered | $49-299/mo                                      | Scales with house capacity, not staff. Includes Stripe Connect rent collection.       |

**Key insight**: Sobriety Hub's per-user model means a 3-house operator with 2 staff pays $150-200/month. RATS Professional at $129/month is competitive. For a single-house Oxford House with 1 house manager, Sobriety Hub costs $75/month vs RATS Standard at $49/month -- RATS is cheaper.

**RATS's pricing advantage is at the low end** (single Oxford Houses). At the high end (multi-property operators with multiple staff), per-user pricing could actually be cheaper than RATS Enterprise ($249) if staff count is low.

### 5.4 Platform Fee Opportunity

The PRICING_STRATEGY.md recommends 2.5% of rent processed via Stripe Connect. This is additional revenue on top of subscription fees.

At scale:

- Average rent: $500-800/resident/month.
- Average house: 8-12 residents.
- Monthly rent per house: $4,000-9,600.
- 2.5% of $6,000 avg = $150/month per house in platform fees.

At 100 houses, that's $15,000/month ($180K/year) in platform fees alone -- potentially exceeding subscription revenue. **This is not yet implemented.**

### 5.5 Pricing Recommendations (Spec-Ready)

1. **Launch at proposed tier prices** ($49-299/month). They are market-competitive and justified by the value analysis.
2. **Grandfather existing 5 houses** at current pricing for 6 months, then migrate. Communicate early.
3. **Implement 2.5% platform fee** on Stripe Connect rent processing. This becomes the dominant revenue driver at scale.
4. **Add annual discount** (2 months free = ~17% discount) to reduce churn and improve cash flow.
5. **Do not launch the Oxford Network tier** until you have a regional chapter signed. Price it based on actual multi-house demand.

---

## 6. Stripe Readiness

### 6.1 What's Working

| Capability                           | Status         | Evidence                                                          |
| ------------------------------------ | -------------- | ----------------------------------------------------------------- |
| Stripe Connect Express onboarding    | Built + tested | `subscriptions.ts` (`createOperatorSubscription` + Connect flows) |
| Payment intent creation for rent     | Built + tested | `payments.ts` (`createPaymentIntent`)                             |
| Webhook handler (platform + Connect) | Built + tested | `stripeWebhook.ts` with event deduplication                       |
| Subscription CRUD                    | Built + tested | Create, cancel, reactivate, update guests/houses                  |
| Billing portal                       | Built          | Origin-validated return URL                                       |
| Dispute handling                     | Built + tested | `disputes.ts` with dedicated test suite                           |
| Error mapping                        | Built          | `mapStripeError()` maps to Firebase error codes                   |
| Bundle discount application          | Built          | `applyBundleDiscountToSubscription` (criteria undefined)          |

### 6.2 What's Missing or Unverified

| Gap                                                           | Severity | Action Required                                             |
| ------------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| 6 Stripe price IDs not created in Stripe Dashboard            | CRITICAL | Create products + prices, upload env vars                   |
| No end-to-end payment tested with new tier pricing            | CRITICAL | Manual walkthrough after price creation                     |
| Platform fee on rent processing not implemented               | HIGH     | Code the 2.5% application fee on payment intents            |
| Bundle discount criteria undefined                            | MEDIUM   | Define what triggers a bundle discount (RATS + Homegroups?) |
| Existing house migration from $10+$1 to tiered pricing        | HIGH     | Build migration callable + communication plan               |
| Connect account icon upload script exists but unclear if used | LOW      | `upload-stripe-icon.ts` -- verify brand consistency         |

### 6.3 Stripe Secret Configuration

| Secret                           | `defineSecret()` Status | Secret Manager Status |
| -------------------------------- | ----------------------- | --------------------- |
| `STRIPE_SECRET_KEY`              | Defined                 | Needs verification    |
| `STRIPE_CLIENT_ID`               | Defined                 | Needs verification    |
| `STRIPE_WEBHOOK_SECRET`          | Defined                 | Needs verification    |
| `STRIPE_CONNECT_WEBHOOK_SECRET`  | Defined                 | Needs verification    |
| `SENDGRID_API_KEY`               | Defined                 | Needs verification    |
| `RATS_API_KEY`                   | Defined                 | Needs verification    |
| `GOOGLE_MAPS_API_KEY`            | Defined                 | Configured            |
| `STRIPE_PRICE_TRAD_STARTER`      | **Not defined**         | Not created           |
| `STRIPE_PRICE_TRAD_PROFESSIONAL` | **Not defined**         | Not created           |
| `STRIPE_PRICE_TRAD_ENTERPRISE`   | **Not defined**         | Not created           |
| `STRIPE_PRICE_OXFORD_STANDARD`   | **Not defined**         | Not created           |
| `STRIPE_PRICE_OXFORD_PLUS`       | **Not defined**         | Not created           |
| `STRIPE_PRICE_OXFORD_NETWORK`    | **Not defined**         | Not created           |

Note: The 6 price env vars are referenced in `config.ts` as `priceEnvVar` strings but are **not** defined as `defineSecret()` -- they are expected as plain `process.env` variables. This means they need to be set either as Firebase environment config or as secrets. Decision needed on which approach.

---

## 7. Gaps and Risks

### 7.1 Technical Gaps

| Gap                                                             | Impact                                           | Effort to Close                                     |
| --------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Angular 9 web app (EOL since 2020)                              | Security risk, technical debt, investor red flag | XL (full rewrite)                                   |
| React Native 0.72 (2 major versions behind)                     | Missing Fabric architecture, Hermes improvements | L (upgrade path is complex)                         |
| iOS bundle ID is `com.rats.dev` (dev suffix)                    | Cannot submit to App Store with dev bundle ID    | S (but requires new provisioning profile)           |
| `package.json` version `0.0.1`                                  | Not release-ready                                | S                                                   |
| CocoaPods install instability (BoringSSL/Stripe clone failures) | Blocks iOS builds                                | M (pin versions, shallow clones)                    |
| No platform fee implementation on Stripe Connect rent           | Missing revenue stream                           | M (add `application_fee_amount` to payment intents) |
| Existing customer migration path undefined                      | Risk of losing 5 current houses                  | M (build migration callable + email)                |
| TypeScript migration 91% complete                               | Remaining JS files lack type safety              | M (finish migration)                                |

### 7.2 Market Risks

| Risk                                                                                    | Severity | Mitigation                                                                                                      |
| --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| Sober living operators are cost-sensitive small businesses                              | HIGH     | Price positioning is competitive vs Sobriety Hub. Lead with ROI: rent collection alone saves 5+ hours/month.    |
| Sobriety Hub has 5.0 Capterra rating and momentum (3:1 switching from One Step)         | HIGH     | Differentiate on Oxford House governance features (Sobriety Hub has no EES/voting). RATS owns the Oxford niche. |
| Operators may not adopt digital rent collection                                         | MEDIUM   | Stripe Connect is opt-in. Core value prop (activity tracking, phase management) works without payments.         |
| 5 existing houses at legacy pricing creates awkward migration                           | MEDIUM   | Grandfather for 6 months, personal outreach to explain value. 5 houses is small enough to call each one.        |
| Angular 9 web is a liability in due diligence                                           | MEDIUM   | Plan rewrite for Q3/Q4 2026. Don't let it block launch -- most operators use mobile, not web.                   |
| Drug court / compliance reporting is a potential competitor differentiator for One Step | MEDIUM   | Prioritize compliance report export in roadmap. RATS activity + drug testing data is already captured.          |

### 7.3 Competitive Positioning

**RATS vs Sobriety Hub:**

- RATS advantage: Oxford House governance (EES, voting, officer terms), Stripe Connect integrated rent collection, lower single-house pricing.
- Sobriety Hub advantage: More mature, higher reviews, transparent per-user pricing (operators know exactly what they'll pay), no per-bed/per-house scaling surprises.

**RATS vs One Step:**

- RATS advantage: Modern mobile app, Stripe payments, lower cost.
- One Step advantage: Drug court integrations, established in court-ordered programs.

**RATS vs Sober Living App (Behave Health):**

- RATS advantage: Purpose-built for sober living (not adapted from EHR), mobile-first.
- Behave Health advantage: Clinical integration pathway, NARR affiliation, enterprise positioning.

**RATS whitespace**: The **Oxford House** segment is underserved. No competitor has EES calculation, democratic voting, officer term tracking, or chapter-level network management. This is a defensible niche.

---

## 8. Recommended Launch Sequence

### Phase 0: Revenue Infrastructure (Week 1-2)

1. Create 6 Stripe Products with monthly prices in Stripe Dashboard.
2. Decide: set price env vars as `process.env` config or `defineSecret()`.
3. Upload all price IDs and verify existing secrets.
4. Change iOS bundle ID from `com.rats.dev` to production (`com.recoveryconnect.rats` or similar).
5. Bump `package.json` version to `1.0.0`.
6. Resolve CocoaPods install stability issues.

### Phase 1: End-to-End Validation (Week 2-3)

7. Run full operator subscription flow with real card (all 6 tiers).
8. Run full rent collection flow: resident pays -> operator receives payout.
9. Verify webhook processing for payment success, failure, dispute.
10. Test on both iOS and Android.

### Phase 2: Existing Customer Migration (Week 3-4)

11. Design migration path for 5 existing houses.
12. Personal outreach to each operator.
13. Build migration callable or manual Stripe update process.
14. Grandfather at legacy pricing for 6 months.

### Phase 3: App Store Submission (Week 4)

15. Submit iOS to App Store Connect.
16. Submit Android to Google Play Console.
17. Deploy updated web (or accept Angular 9 for now).

### Phase 4: Oxford House Pilot (Month 2-3)

18. Create Oxford House-specific marketing materials.
19. Contact local Oxford Houses via existing connections.
20. Offer 30-day free trial on Standard tier.
21. Target: 10-15 Oxford Houses by end of Month 3.

---

## 9. Spec Backlog (Actionable Items for Plan Generation)

| ID         | Title                                                     | Type                  | Priority | Est. Effort        |
| ---------- | --------------------------------------------------------- | --------------------- | -------- | ------------------ |
| RG-SPEC-01 | Stripe product and price creation for 6 tiers             | Ops runbook           | P0       | 2 hours            |
| RG-SPEC-02 | End-to-end payment flow test plan (subscription + rent)   | Test plan             | P0       | 4 hours            |
| RG-SPEC-03 | iOS bundle ID and provisioning profile update             | Build config          | P0       | 4 hours            |
| RG-SPEC-04 | Existing customer pricing migration plan (5 houses)       | Migration plan        | P0       | 8 hours            |
| RG-SPEC-05 | Platform fee implementation (2.5% on Stripe Connect rent) | Feature spec          | P1       | 12 hours           |
| RG-SPEC-06 | Angular 9 web replacement scoping (Next.js or React)      | Architecture decision | P1       | 4 hours (decision) |
| RG-SPEC-07 | Oxford House market entry playbook                        | Go-to-market plan     | P1       | 8 hours            |
| RG-SPEC-08 | React Native 0.72 -> 0.74+ upgrade plan                   | Migration plan        | P2       | 40 hours           |
| RG-SPEC-09 | Compliance report export for drug court programs          | Feature spec          | P2       | 20 hours           |
| RG-SPEC-10 | Error tracking consolidation (Sentry vs Crashlytics)      | Decision doc          | P2       | 2 hours            |
| RG-SPEC-11 | Bundle discount criteria definition (RATS + Homegroups)   | Product spec          | P2       | 4 hours            |
| RG-SPEC-12 | Stripe API version alignment with Homegroups              | Tech debt             | P3       | 4 hours            |

---

## Sources

Market research data referenced in this document:

- [Sobriety Hub Pricing](https://www.sobrietyhub.com/pricing)
- [Sober Living Software Comparison 2026](https://soberlivingapp.com/blog/sober-living-software-comparison)
- [Buyer's Guide: Best Sober Living Software 2026](https://www.sobrietyhub.com/our-blog/2026-buyers-guide-the-big-3-of-sober-living-software)
- [U.S. Sober Living Homes Market Size](https://www.credenceresearch.com/report/united-states-sober-living-homes-market)
- [Sobriety Hub on Capterra](https://www.capterra.com/p/10002753/Sobriety-Hub/)
- [Best Sober Living Management Software 2026](https://anchorliving.io/blog/best-sober-living-management-software-2026)
