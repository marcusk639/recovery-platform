# RATS: Go-To-Market Action Plan

> **Generated:** February 23, 2026
> **Basis:** Full codebase audit (rats-v2, regroup-functions, rats-web) + strategic synthesis
> **Scope:** Pre-launch readiness → revenue optimization → user acquisition

---

## Executive Summary

RATS has two functional products built into one app:

1. **Traditional Sober Living Management** — compliance tracking, dispute resolution, rent payments for manager-operated houses
2. **Oxford House Governance Suite** — democratic officer management, voting, business meetings, EES financial tracking for self-governed Oxford Houses

**The Oxford House vertical is the near-term wedge.** ~2,500 Oxford Houses exist with zero dedicated digital tools. Every feature is already built and tested. One distribution unlock (OHI partnership) could drive more users than all other channels combined.

**Three revenue killers must be fixed before any marketing spend:**
1. `handleStripeConnectWebhook` is unimplemented — operators completing Stripe onboarding get stuck in PENDING state; rent payments fail silently
2. Oxford Plan upgrade exits the app to a mobile browser — conversion at this step is catastrophic
3. `subscriptionIsActive()` returns `false` for `'trialing'` — any paywall using this guard blocks paying trial users

---

## Section 1: Critical Bugs / Launch Blockers

> Fix all of these before running any paid acquisition or outreach.

### Blocker 1: `handleStripeConnectWebhook` Not Implemented
**File:** `regroup-functions/src/index.ts` — `handleStripeConnectWebhook` is exported but the function body does not exist
**Impact:** Stripe `account.updated` and `account.deauthorized` events are silently dropped. Operators who complete Express account onboarding never transition from `PENDING → ACTIVE`. Resident payments fail. The `StripeSettingsScreen.tsx` already has requirement UI (lines 324-355) and error banner (250-265) — it just never receives updated state.
**Fix:** Implement the webhook to handle `account.updated` → sync `stripeStatus`, `stripeChargesEnabled`, `stripePayoutsEnabled`, `stripeRequirements` to the house document. Handle `account.deauthorized` → set status to `DISCONNECTED`.
**Effort:** ~1 day backend work. Zero frontend changes required.

### Blocker 2: Oxford Upgrade Exits the App
**File:** `/src/screens/Oxford/OxfordDashboard.tsx` line 136
**Impact:** The only CTA for the entire Oxford revenue stream calls `Linking.openURL('https://regroup-app.com/my-account')`. User leaves the app, lands in Safari, must re-authenticate on web, navigate to billing. 7-step friction wall. Conversion abandonment rate is very high.
**Fix (quick):** Replace `Linking.openURL` with `navigation.navigate(Routes.SubscriptionHandler)` — the `SubscriptionHandler` WebView component is already built. 2 hours.
**Fix (proper):** Implement in-app Stripe purchase using `createPaymentIntent` Cloud Function pattern. Weeks.
**Same issue:** `SubscriptionUpdateModal.tsx` line 98 (`goToAccount`) has the same problem.

### Blocker 3: `subscriptionIsActive()` Returns False for Trialing
**File:** `/src/util/subscription.ts` + `/src/util/__tests__/subscription.test.ts` line 128
**Impact:** The test explicitly confirms this behavior. Any paywall that calls `subscriptionIsActive()` instead of checking `subscriptionMetadata.status === 'trialing'` directly will block all trialing operators.
**Fix:** Audit all paywall guards in the codebase. Replace any `subscriptionIsActive(user)` paywall checks with `subscriptionIsActive(user) || user.subscriptionMetadata?.status === 'trialing'`.

### Blocker 4: Oxford Officer Names Show "Unknown"
**File:** `/src/screens/Oxford/OfficerManagement.tsx`
**Impact:** `Officer.userId` stores a Firebase Auth UID. The `guests` Redux store is keyed by Firestore guest document ID. These are different identifiers. Every officer name display likely shows "Unknown" — making the core Oxford feature look broken on day one.
**Fix:** In the `getGuestName` function, look up by `userId` field on guest documents rather than by document ID key. OR when storing officer records, store both `userId` (Auth UID) and `guestId` (Firestore doc ID).

### Blocker 5: BusinessMeetings Date is Raw TextInput
**File:** `/src/screens/Oxford/BusinessMeetings.tsx` lines 171-183
**Impact:** The scheduled date field is a plain `TextInput` with placeholder `YYYY-MM-DD`. Non-technical house presidents will struggle with ISO date format. Generates support tickets.
**Fix:** Replace with `RatsDatepicker` which already exists in `/src/components/rats-datepicker/`. ~1 hour.

### Blocker 6: Password Reset Completion Page Missing on rats-web
**Impact:** Operators who forget their password cannot return. Non-technical operators will uninstall rather than call support.
**Fix:** Complete the password reset confirmation page on `rats-web`.

---

## Section 2: Revenue Infrastructure Fixes

> These directly unlock or protect revenue streams.

### Fix A: Configure Stripe Smart Retries
**Where:** Stripe Dashboard (no code change)
**Impact:** Smart Retries recovers 15-25% of failed subscription payments that would otherwise churn involuntarily. Configure immediately.

### Fix B: Subscription State Freshness
**File:** User Redux slice
**Issue:** `userRTK.user.subscriptionMetadata` is loaded once at login and never updated via live Firestore listener. Operators whose payment fails mid-session see stale state.
**Fix:** Add `onSnapshot` listener on the user's Firestore document to update Redux when `subscriptionMetadata` changes.

### Fix C: Stripe Connect Activation in Setup Wizard
**File:** `/src/screens/SetupWizards/OperatorSetupWizard.tsx`
**Issue:** Stripe Connect is buried in House Settings. Most operators never find it.
**Fix:** Add a "Get Paid" step to the setup wizard that surfaces Stripe Connect setup. The 2% rent processing fee is the highest-margin revenue line — every operator not connected is leaving money on the table.
**Revenue impact:** A 10-bed house with $700/month average rent generates $140/month in platform fees. Each operator not connected costs $1,680/year.

### Fix D: Annual Billing Option
**Current gap:** Zero references to annual billing anywhere in the codebase.
**Fix:**
1. Create annual Price objects in Stripe Dashboard
2. Add `billingInterval: 'monthly' | 'annual'` to `OperatorSubscription` entity in `User.tsx`
3. Update `updateSubscriptionHouses` and `updateSubscriptionGuests` Cloud Functions to support annual interval
4. Surface annual option in `SubscriptionHandler` WebView with "Save 17%" anchor

**Impact:** Annual subscribers have 12x higher commitment, dramatically lower churn risk. If 30% of new converts choose annual, that cohort's expected LTV increases by ~4x.

### Fix E: Operator Onboarding Email Sequence
**Current gap:** SendGrid is integrated but there is no nurture sequence. Operators sign up and receive silence.
**Fix:** Build 6-email sequence using existing SendGrid integration:
- Day 0: Welcome + setup checklist
- Day 3: "Have you invited your residents?" (conditional — only if no guests created)
- Day 7: Feature spotlight — GPS meeting verification
- Day 14: Midpoint check-in, unused feature highlight
- Day 25: Trial ending in 5 days
- Day 30: Trial expired + data safety reassurance + upgrade CTA

**Effort:** Backend only, ~2 days. Zero mobile changes.

### Fix F: Transaction Fee Optimization
**Current state:** 2% flat fee on all payments. Math shows platform is subsidizing payments (Stripe costs ~$29.30 on a $1,000 transaction; platform collects $20).
**Recommended new fee structure:**
- Standard: 3.0%
- Annual subscriber: 2.5%
- This change is a single constant update in the `createPaymentIntent` Cloud Function. Zero mobile changes.

---

## Section 3: Pricing Model

> Raise prices on new signups. Current pricing is leaving significant revenue on the table.

### Current vs. Recommended Pricing

| Plan Component | Current | Recommended |
|---|---|---|
| Traditional house | $10/mo | $25/mo |
| Per resident | $1/mo | $2/mo |
| Oxford add-on | $49/mo | $69/mo |
| Annual (new) | — | 17% off monthly |
| Multi-house (5+) | — | Volume discount |

**Rationale:**
- 1 house, 8 residents: $18/month → $41/month (still <0.5% of typical house revenue)
- Oxford House at $69/month: No competing product. Oxford Houses spend $125-175/person/month in dues ($1,000-1,750/month total house income). $69 is 4-7% of income for a purpose-built governance platform.
- Still far below any general property management SaaS ($400+/month for comparable operators)

**Implementation:** Grandfather existing customers for 6 months, then step up. All new trial signups hit new pricing immediately.

### Three-Tier Structure (Phase 2)

| Tier | Price | Target | Key Differentiators |
|---|---|---|---|
| **Starter** | $25/house + $2/resident | Single-house operators | All core features, 2.5% payment fee |
| **Growth** | $22/house + $1.75/resident (3+ houses) | Multi-house operators | Compliance report exports, 2.0% fee |
| **Professional** | $20/house + $1.50/resident (5+ houses) | Large operators | Oxford included, API access, 1.75% fee |
| **Oxford add-on** | $69/house | Oxford operators on Starter/Growth | All Oxford governance features |

---

## Section 4: Oxford House Launch Package

### What Is Ready Now (post-blocker fixes)
- ✅ Officer Management — roles, terms, active status
- ✅ Business Meetings — agenda, quorum, attendance, minutes (needs date picker fix)
- ✅ Voting — motions, elections, real-time tally
- ✅ EES Tracker — equal expense tracking, paid/unpaid status, period grouping
- ✅ Oxford Dashboard with paywall and feature preview
- ✅ 14-day free trial flow (after upgrade UX is fixed)

### What's Missing But Not Launch-Blocking
- **Charter Compliance Tracking** — not built; acknowledge as Q2 in marketing
- **House Application Portal** — `Application.ts` entity is empty stub; presidents can add residents manually for MVP
- **Treasurer Financial Records** — `FinancialRecord.ts` entity is fully defined, no screens built; EES Tracker covers acute pain for MVP

### Oxford Launch Sprint

**Sprint 1 — Fix Before Launch:**
1. Fix userId/guestId mismatch in OfficerManagement (Blocker 4)
2. Replace TextInput with RatsDatepicker in BusinessMeetings (Blocker 5)
3. Replace `Linking.openURL` with `navigation.navigate` for Oxford upgrade (Blocker 2)
4. Implement `handleStripeConnectWebhook` (Blocker 1)

**Sprint 2 — Launch:**
1. Submit App Store/Play Store update with Oxford features prominent in screenshots/description
2. Oxford-specific landing page on `regroup-app.com` (separate from traditional SLH)
3. Begin OHI outreach (see Section 5)
4. Seed 3-5 Oxford Houses with free trials in exchange for feedback + willingness to post in Oxford Facebook communities

**Sprint 3 — 30 Days Post-Launch:**
1. Charter compliance dashboard
2. `FinancialRecord` screen for treasurer reports (entity already defined in `/src/entities/oxford/FinancialRecord.ts`)
3. House application portal

---

## Section 5: User Acquisition Strategy

### Channel 1: Oxford House Inc. (OHI) Partnership — Highest Leverage

**Why it matters:** OHI is the central authority for all 2,500 Oxford Houses. A single newsletter mention or resource guide listing is equivalent to $500K in targeted ad spend.

**The approach:**
- Do NOT lead with a sales pitch
- Lead with: "We built a free tool for Oxford Houses and want to know if it solves real problems"
- Request 30-minute call with OHI program director
- Offer 6 months free for any OHI-referred Oxford House
- Get one testimonial from a real house president who has used it

**The ask:** A listing in their resource guide and a mention in one newsletter.

**Partnership economics:** Offer 20% revenue share to OHI for referred subscriptions. At $69/month per house: OHI earns $13.80/month per referred house. If 10% of 2,500 houses adopt RATS: $3,450/month in OHI revenue — meaningful to a nonprofit, durable referral pipeline.

**Action item:** Identify OHI program director, draft introduction email, request call within the next 2 weeks.

### Channel 2: Oxford House Facebook Communities

Multiple large Facebook groups exist for Oxford House residents and officers. These are tight-knit communities where peer recommendations carry high weight.

**Tactic:** Seed early adopter houses who are willing to post genuine experiences in Oxford House Facebook groups. A real house president saying "we use this for our business meetings and EES" is worth more than any paid campaign.

### Channel 3: Treatment Center Referrals (Traditional SLH)

Treatment centers refer patients to sober living homes on discharge. Getting RATS-managed houses on the "Preferred Partner" list creates a passive referral funnel.

**Target:** 50 treatment centers in 5 markets with highest SLH density (Los Angeles, Phoenix, Nashville, Boston, Denver).

**Value prop for treatment centers:** Accountability infrastructure gives case managers confidence in referred placements. Compliance reports show outcomes.

### Channel 4: App Store Optimization

Target keywords with low competition and high intent: "sober living management," "Oxford House app," "recovery house management," "AA meeting tracker."

The Oxford House category is essentially uncontested on app stores today.

### Channel 5: Court and Probation Officer Outreach

The GPS meeting check-ins, weekly compliance stats, and dispute tracking are exactly what probation officers need to verify compliance for court-mandated residents. Reaching county probation departments with "here's how RATS verifies sober living compliance" opens a new institutional buyer and creates switching costs (compliance records become part of legal documentation).

### Referral / Virality Mechanics

**Operator-to-operator referral:** "Refer another operator, get one month free." Requires a referral code field on `User` entity + Cloud Function that validates it at subscription creation + Stripe coupon. ~2 days backend work.

**Resident-to-house pull referral:** When a resident completes their program (status → 'inactive'), send an in-app prompt: "Congratulations. If your next house doesn't use RATS, share it with your manager." Deep link with attribution tracking.

**House Search Marketplace:** The `HouseSearch` entity and geo-search Cloud Function are already built. A public, SEO-optimized house directory drives organic operator acquisition through the "be found by residents" value prop. The `certified: boolean` field on `House` already exists for a premium listing product.

---

## Section 6: Retention and Monetization Improvements

### Trial-to-Paid Conversion

**Activation event definition:** Operator has created at least one house, invited at least one resident, and that resident has logged at least one activity. Operators who reach activation by Day 7 have significantly higher trial-to-paid conversion.

**In-app trial lifecycle:**
- Day 21: Surface first upgrade CTA as informational banner (not aggressive)
- Day 28: Push notification — "2 days left, data is safe, resume with one tap"
- Day 30: `SubscriptionUpdateModal` fires with stronger copy: "Your data is safe — resume access with one tap" instead of current generic text

**Critical missing piece: Analytics**

There are zero analytics events instrumented in the mobile app. The product team cannot measure conversion funnel, drop-off points, or feature engagement. Install Firebase Analytics with minimum viable events before optimizing anything:

```
subscription_trial_started
subscription_activated (day 7 still active)
subscription_upgraded
subscription_churned
oxford_upgrade_shown
oxford_upgrade_tapped
resident_payment_initiated
resident_payment_completed
```

### Weekly Operator Digest

Build a weekly summary email for operators: "This week: 3 residents at 100%, 1 dispute pending, $2,400 in rent payments processed." Creates habit loop, keeps app top-of-mind during quiet weeks, reduces churn. Backend has all the data; SendGrid integration is live. ~1 day implementation.

### LTV Expansion via Multi-House Upsell

When a house reaches `maximumCapacity`, surface a prompt: "You're at full capacity — add a second house for $25/month." When an operator has been active for 6 months, surface: "You've helped X residents track their recovery — ready to expand?" These are navigation prompts in `HousesOverview` — minimal code.

---

## Section 7: Prioritized 90-Day Roadmap

### Week 1-2: Revenue Protection (No Marketing Until Done)
- [ ] Configure Stripe Smart Retries in Dashboard (0 code, immediate)
- [ ] Implement `handleStripeConnectWebhook` Cloud Function (backend, ~1 day)
- [ ] Audit all paywall guards for `subscriptionIsActive()` trialing bug
- [ ] Fix userId/guestId mapping in `OfficerManagement.tsx`
- [ ] Replace `TextInput` with `RatsDatepicker` in `BusinessMeetings.tsx`
- [ ] Complete password reset flow on `rats-web`
- [ ] Replace `Linking.openURL` with `navigation.navigate` for Oxford upgrade (quick fix)

### Week 3-4: Revenue Infrastructure
- [ ] Build operator onboarding email sequence in SendGrid (6 emails, ~2 days)
- [ ] Add Stripe Connect "Get Paid" step to `OperatorSetupWizard`
- [ ] Add "Manage Subscription" item in `HouseSettings.tsx` → in-app WebView
- [ ] Add "Add Another House" upsell prompt in HousesOverview
- [ ] Instrument minimum viable analytics events (8 events, ~1 day)
- [ ] Add Firestore `onSnapshot` listener for subscription state freshness

### Week 5-6: Oxford House Launch Preparation
- [ ] Build Oxford-specific landing page on `regroup-app.com`
- [ ] Update App Store/Play Store: screenshots, description, ASO keywords for Oxford
- [ ] Begin OHI outreach — identify contact, draft intro email, request call
- [ ] Seed 3-5 Oxford Houses with free trials, request testimonials
- [ ] Add `billingInterval` to `OperatorSubscription` entity + annual Stripe Price objects

### Week 7-8: Oxford House Public Launch + Price Increase
- [ ] Launch Oxford Plan at $69/month with 14-day free trial
- [ ] Raise traditional pricing to $25/house + $2/resident for new signups
- [ ] OHI introductory call
- [ ] Post in relevant Oxford House Facebook groups (authentic engagement)
- [ ] Target: 10 Oxford Houses on paid plan by end of week 8

### Week 9-10: Oxford Feature Completeness
- [ ] Charter compliance dashboard
- [ ] `FinancialRecord` screen using existing entity in `/src/entities/oxford/FinancialRecord.ts`
- [ ] Weekly operator digest email (compliance summary + rent processed)

### Week 11-12: Public Directory + Virality
- [ ] SEO-optimized public house listing pages on `regroup-app.com`
- [ ] Operator referral code mechanic (referral field on `User` + Cloud Function + Stripe coupon)
- [ ] Compliance report export (PDF/CSV) — uses existing `/src/util/compliance.ts` engine
- [ ] Transaction fee adjustment to 3.0% standard, 2.5% annual subscribers

---

## Section 8: Revenue Projections

### Market Assumptions
- Traditional sober living: ~8,000 professionally-operated homes addressable
- Oxford Houses: ~2,500, zero digital tools today
- Recommended pricing: $25/house + $2/resident (traditional), $69/house (Oxford)
- Transaction fee: 3% standard, 2.5% annual
- Average house: 8 residents, $700/month average rent per resident
- 2% fee revenue per house (connected to Stripe): $700 × 8 × 0.03 = $168/month

### Scenario Summary

| Scenario | Month 12 MRR | Month 24 MRR | ARR at Month 24 |
|---|---|---|---|
| **Conservative** | ~$7K | ~$13K | ~$155K |
| **Realistic** | ~$39K | ~$72K | ~$866K |
| **Optimistic (OHI partnership)** | ~$190K | ~$330K | ~$4M |

**Time to $1M ARR:**
- Conservative: Never without GTM investment
- Realistic: Month 27-30
- Optimistic: Month 14-16

**The transaction fee stream dominates all scenarios.** Each operator who connects Stripe generates $168/month in fee revenue vs. ~$41/month SaaS revenue — a 4:1 ratio. **The highest-leverage metric is: % of operators who connect Stripe and process rent through the platform.**

### Realistic 12-Month Build (at recommended pricing with good execution)

| Month | Paying Operators | Houses | Residents | SaaS MRR | Oxford MRR | Txn Fee MRR | Total MRR |
|---|---|---|---|---|---|---|---|
| 3 | 15 | 22 | 176 | $902 | $415 | $3,696 | $5,013 |
| 6 | 58 | 87 | 696 | $3,567 | $1,614 | $14,616 | $19,797 |
| 9 | 85 | 127 | 1,019 | $5,206 | $2,415 | $21,399 | $29,020 |
| 12 | 108 | 162 | 1,296 | $6,642 | $3,105 | $27,216 | $36,963 |

---

## Section 9: Revenue Add-On Opportunities (Phase 2)

### Compliance Report Export ($15/resident/month or $99/house/month)
The compliance engine in `/src/util/compliance.ts` is fully built. PDF/CSV export of per-resident compliance history is directly required by court-ordered housing programs, probation officers, and state licensing bodies. Exporting structured data is a feature sprint using existing infrastructure.

### Premium House Listings ($15/house/month)
The `certified: boolean` field already exists on the `House` entity. The `HouseSearch` geo-query Cloud Function is fully built. Premium listings with priority ranking and "Verified" badge require: a listing tier field on `House`, a listing management screen, and a Stripe add-on subscription.

### Background Check Integration (~$15-20 margin per check)
The `User` entity already collects SSN (last 4), dateOfBirth, and full name — the inputs for a background check. Integration with Checkr would add a "Run Background Check" button on the guest intake screen. At 2 new residents/house/month across 200 houses: 400 checks × $17.50 = $7,000/month.

### Operator Referral Program
Referral code on `User` entity + validation Cloud Function + Stripe coupon = viral expansion engine. Low implementation cost, high acquisition value.

---

## Section 10: Critical Open Questions

1. **What is the current active subscriber count?** Are there existing paying users hitting the `handleStripeConnectWebhook` gap right now? If yes, that is Day 1 mandatory, not Week 1.

2. **Is `Officer.userId` the Firebase Auth UID or Firestore guest document ID?** This must be answered before Oxford launch — wrong answer = all officer names show "Unknown."

3. **Has the Oxford end-to-end purchase flow been manually tested?** The upgrade flow exits to `regroup-app.com/my-account`. Has anyone verified that completing the web checkout correctly sets `subscriptionMetadata.oxfordEnabled: true` back in Firebase? If this link is broken, paying Oxford customers will be locked out.

4. **Is there an actual relationship with OHI, or is this aspirational?** If someone has spoken to OHI, what was the response? This changes the priority order.

5. **Is `phoenix-cleanhouse` the production Firebase project or staging?** Confirm before running any Oxford launch marketing that sends real users into the app.

---

## Appendix: File Reference for Implementation

| Priority | File | Change |
|---|---|---|
| P0 | `regroup-functions/src/webhooks/stripeWebhook.ts` | Implement `handleStripeConnectWebhook` |
| P0 | `/src/util/subscription.ts` | Audit all paywall guards for trialing bug |
| P0 | `/src/screens/Oxford/OfficerManagement.tsx` | Fix userId/guestId lookup |
| P1 | `/src/screens/Oxford/OxfordDashboard.tsx:136` | Replace `Linking.openURL` with `navigation.navigate` |
| P1 | `/src/screens/Oxford/BusinessMeetings.tsx:171-183` | Replace TextInput with RatsDatepicker |
| P1 | `/src/entities/User.tsx` | Add `billingInterval: 'monthly' \| 'annual'` to `OperatorSubscription` |
| P1 | `/src/screens/SetupWizards/OperatorSetupWizard.tsx` | Add Stripe Connect "Get Paid" step |
| P2 | `regroup-functions/src/callable/payments.ts` | Adjust transaction fee to 3.0% |
| P2 | `/src/screens/HouseSettings/HouseSettings.tsx` | Add "Manage Subscription" menu item |
| P2 | `/src/entities/House.tsx` | Add `listingTier: 'standard' \| 'premium'` for marketplace |
| P3 | `/src/util/compliance.ts` | Add PDF/CSV serializer for compliance export |
| P3 | `/src/entities/User.tsx` | Add `referralCode` field for referral program |
