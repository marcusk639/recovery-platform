# Revenue Opportunities

**Last updated:** May 2026
**Purpose:** Actionable backlog of revenue improvements — fixes, conversion lifts, and new streams. Ordered by impact-to-effort ratio.

---

## P0 — Fix Before Any Growth Outreach

These leak revenue or create broken promises today.

### ~~1. Gate premium screens behind subscription status~~ ✅ DONE (2026-05-20)

`GroupTreasuryScreen` and `GroupAnnouncementsScreen` now check `useTrialStatus` and redirect to `SubscriptionUpgradeScreen` when the subscription is not active/trialing. Gate expression: `(isInTrial && !isExpired) || isActive`. `AskAdminUpgradeModal` is wired into both screens for non-admin members.

### ~~2. Remove or implement the 30-day money-back guarantee~~ ✅ RESOLVED

The money-back guarantee badge is **not present** in the current `SubscriptionUpgradeScreen.tsx` — it was either removed or never shipped. No action needed.

### ~~3. Pass admin email to Stripe customer creation~~ ✅ DONE

Both `createGroupSubscription.ts` and `createStripeCheckoutSession.ts` now pass `email: request.auth?.token.email` to `stripe.customers.create()`.

### 4. Verify Stripe price interval is annual

**What's wrong:** `createGroupSubscription.ts` does not set `interval: 'year'` — it relies on the Stripe dashboard product's default price. If that price is monthly, admins are charged monthly while the UI shows "$12/year."

**Fix:** Add a startup assertion or CI test that fetches the product's default price and validates `interval === 'year'`.

**Files:** `functions/src/utils/stripe.ts`

---

## P1 — High-Impact Conversion Improvements

### ~~5. Day 5 trial push notification~~ ✅ DONE

`scheduledTrialReminders.ts` runs daily at 10 AM UTC. Sends a Day 5 reminder (2–3 days remaining) and a Day 7 reminder (0–1 days remaining) to all admins of trialing groups via FCM.

### ~~6. 30-day pre-renewal reminder~~ ✅ DONE

`scheduledRenewalReminders.ts` runs daily at 10 AM UTC. Sends reminders at 30 days and 7 days before `subscriptionExpiresAt` to all admins of `active` or `trialing` groups via FCM.

### ~~7. "Ask admin to upgrade" flow from member screens~~ ✅ DONE

`AskAdminUpgradeModal` component is wired into `GroupTreasuryScreen` and `GroupAnnouncementsScreen`. When a non-admin hits the paywall, the modal calls `notifyAdminUpgradeRequest`.

### 8. Trial rate limiting

**What's missing:** Any user can create multiple groups and run multiple 7-day trials indefinitely.

**Fix:** In `createGroupSubscription.ts`, query whether the calling user has started more than 2 trials in the past 12 months. Soft-block on the third attempt.

---

## P2 — B2B Revenue (Highest ARPU)

### 9. Treatment center partnership tier

**What exists:** `createIntergroup`, `affiliateGroupToIntergroup`, `configureSSO`, and `exportIntergroupData` callables are in production. The facility stats concept is in V4.4 code.

**What's needed:**

1. A treatment center landing page with pricing (Basic $99/mo, Professional $299/mo, Enterprise $999/mo)
2. A `createFacility` onboarding flow
3. A facility dashboard showing anonymized alumni engagement — meetings checked in, milestones hit, sponsorship formed

**Revenue math:** One center at $299/month = 300 group subscriptions. Ten centers = $36K ARR.

**Reference:** `docs/03-integration-treatment-centers.md` has the full sales narrative and objection handling.

### 10. Define and price the intergroup subscription tier

**What exists:** `productIdIntergroupA` and `productIdIntergroupB` environment variables and webhook handlers are in the codebase. No price is set. No customer sees this tier.

**What's needed:**

1. Set a Stripe product price: suggested $99–$199/year per intergroup
2. Document in `BUSINESS_MODEL.md`
3. Add intergroup upgrade flow to the intergroup module

**Revenue ceiling:** ~1,000 US intergroups × $149/year = $149K ARR. At 5% penetration: $7,500/year with near-zero marginal cost.

### 11. Meeting attendance verification API for sober living houses

**What exists:** `checkInToMeeting` callable and QR check-in flow are production-ready in Homegroups.

**What's needed:** An authenticated Cloud Function that RATS can call to pull a resident's meeting check-in history by `userId` — without requiring the full Homegroups UI embed.

**Revenue:** $29/month/house. At 100 houses: $34,800/year.

**Why it matters:** This is the integration bridge between Homegroups and RATS that enables the treatment center story (see `docs/03-integration-treatment-centers.md`).

---

## P3 — Features That Create New Revenue Touch Points

### 12. Treasury report preview gate

**What exists:** Treasury reports generate as Firestore documents. No subscription check exists on the report generation path.

**Opportunity:** Show non-subscribed admins a watermarked PDF preview of the monthly report. Full download requires an active subscription.

**Why it converts:** The report is the highest-intent moment in the app — the admin needs it for a business meeting. Showing it and requiring payment to unlock converts better than any abstract value proposition.

### 13. Year-end summary as a November conversion trigger

**What exists:** Year-end treasury summary is implemented (V2.1).

**Opportunity:** In November, push to groups with 10+ months of treasury data: "Your group's 2026 annual summary is ready. Subscribe to download it for your December business meeting."

**Why it works:** AA/NA groups present annual financial reports at December business meetings. This ties the conversion moment to an existing group obligation.

### 14. Promote the donation platform fee

**What exists:** A 5% platform fee on group donations is fully coded in `functions/src/utils/stripeUtils.ts` (`PLATFORM_FEE_PERCENT = 0.05`). Groups can accept 7th Tradition contributions via Stripe Connect. Nothing in the UI promotes this feature.

**Opportunity:** Add a callout in the admin dashboard: "Accept 7th Tradition contributions through the app." Enable it with one toggle.

**Revenue math:** 500 groups × $500/year in donations × 5% fee = $12,500/year. Zero new code required.

### 15. Promote QR check-in as a member adoption driver

**What exists:** `MeetingQRCodeScreen` and `checkInToMeeting` are production-ready. Members who aren't in the app scan a code at a meeting → prompted to download and join the group.

**Opportunity:** Surface this prominently in admin onboarding and the admin dashboard. One callout: "Share your check-in QR code at the next meeting — members join the app in under 60 seconds."

**Why it matters for revenue:** Member adoption increases group stickiness. Groups with more active members renew at higher rates.

---

## Priority Summary

Items marked ✅ are **complete as of May 2026**.

| #   | Item                          | Effort | Revenue Impact | When      | Status |
| --- | ----------------------------- | ------ | -------------- | --------- | ------ |
| 3   | Pass email to Stripe          | Low    | High           | Week 1    | ✅     |
| 2   | Money-back badge fix          | Low    | High           | Week 1    | ✅     |
| 4   | Verify annual interval        | Low    | High           | Week 1    | —      |
| 5   | Day 5 trial notification      | Medium | High           | Week 1–2  | ✅     |
| 6   | 30-day pre-renewal            | Medium | High           | Week 2    | ✅     |
| 1   | Subscription screen gate      | Medium | High           | Week 2–3  | ✅     |
| 7   | "Ask admin to upgrade" UI     | Low    | Medium         | Week 3–4  | ✅     |
| 14  | Donation feature promotion    | Low    | Medium         | Week 4    | —      |
| 15  | QR check-in promotion         | Low    | Medium         | Week 4    | —      |
| 8   | Trial rate limiting           | Low    | Medium         | Week 4    | —      |
| 9   | Treatment center landing page | Medium | Very High      | Month 2   | —      |
| 10  | Intergroup pricing            | Low    | Medium         | Month 2   | —      |
| 12  | Treasury report gate          | Medium | High           | Month 2–3 | —      |
| 11  | Meeting attendance API        | Medium | High           | Month 3   | —      |
| 13  | Year-end summary trigger      | Low    | High           | November  | —      |
