# Monetization Analysis — RecoveryConnect / Homegroups

**Date:** 2026-02-23
**Analyst:** Monetization Architect (Claude)
**Scope:** Full monetization model review — strategy, implementation, gaps, risks, and opportunities

---

## Table of Contents

1. [Current Monetization Model](#1-current-monetization-model)
2. [Implementation vs. Documentation Alignment](#2-implementation-vs-documentation-alignment)
3. [Revenue Leaks — Ungated Premium Features](#3-revenue-leaks--ungated-premium-features)
4. [Conversion Blockers](#4-conversion-blockers)
5. [Documented Opportunities Not Yet Implemented](#5-documented-opportunities-not-yet-implemented)
6. [Undocumented Monetization Opportunities](#6-undocumented-monetization-opportunities)
7. [Is $12/Year Strategically Sound?](#7-is-12year-strategically-sound)
8. [Subscription Enforcement Robustness](#8-subscription-enforcement-robustness)
9. [Summary Risk Matrix](#9-summary-risk-matrix)
10. [Priority Recommendations](#10-priority-recommendations)

---

## 1. Current Monetization Model

### What Exists

**Revenue stream 1: Group admin subscriptions**
- $12/year per group (flat rate, annual billing)
- $8/year for each group beyond the first (multi-group discount, requires `STRIPE_PRICE_ID_GROUP_ADDITIONAL` env var)
- 7-day free trial with no payment method required at sign-up
- Payment via Stripe Checkout (hosted page in a WebView) or the `createGroupSubscription` callable

**Revenue stream 2: Donations**
- Stripe Connect integration: groups can accept one-time donations from members
- 5% platform fee (`PLATFORM_FEE_PERCENT = 0.05`) on donations
- This is already in the webhook handlers (`handlePaymentIntentSucceeded`) and the schema has a `donations` subcollection

**Revenue stream 3: Intergroup subscriptions (V4.4)**
- Separate products (`productIdIntergroupA`, `productIdIntergroupB`) for intergroup-level subscriptions
- Webhook handlers exist for intergroup checkout, update, and deletion
- Not yet reflected in public pricing documentation

### Who Pays

Group administrators (trusted servants) — not individual members. The group subscription is conceptually a group expense, consistent with AA/NA service tradition.

### What They Get

As documented in `PRICING_MODEL.md` and enforced in practice:
- Treasury management (income/expense, reports, handoff)
- Admin announcement posting with push notifications
- Meeting management (exception handling, recurring patterns)
- Service position tracking
- Member management (add/remove/roles)
- Business meetings support
- Group chat moderation
- Admin dashboard (planned V1, slice exists)
- Referral dashboard

### Key Technical Facts

- Stripe product ID for groups: env `STRIPE_PRODUCT_ID_GROUP` (or test equivalent)
- Subscription status stored on the group Firestore document as `subscriptionStatus`
- Auth token carries `adminGroups` and `memberGroups` custom claims — these drive Firestore security rules
- Webhook idempotency: implemented via `processed_stripe_events` collection
- Dunning: `past_due` status set on payment failure, push + email notification sent to admins
- Trial-will-end notifications: 3 days before (Stripe webhook `customer.subscription.trial_will_end`)
- Referral program: 1 month subscription extension to referrer upon conversion

---

## 2. Implementation vs. Documentation Alignment

### Aligned

| Item | Status |
|------|--------|
| $12/year flat rate | Implemented — `createGroupSubscription.ts` uses `quantity: 1` |
| 7-day trial | Implemented — `TRIAL_PERIOD_DAYS = 7` in `stripe.ts` |
| Multi-group discount ($8 additional) | Implemented — `getMultiGroupPricing.ts`, `createGroupSubscription.ts` |
| Referral program with 1-month reward | Implemented — `processReferralConversion()` in `stripeUtils.ts` |
| Dunning (payment failure notifications) | Implemented — push + email in `handleInvoicePaymentFailed` |
| Trial-ending notifications | Implemented — push + email in `handleTrialWillEnd` |
| Customer portal for self-serve billing | Implemented — `createCustomerPortalSession.ts` |
| 30-day money-back guarantee on UI | Shown in `SubscriptionUpgradeScreen` — **not backed by any refund automation** |
| Subscription reactivation flow | Implemented — `reactivateGroupSubscription.ts` |

### Misaligned or Incomplete

| Item | Gap |
|------|-----|
| Annual billing cycle | `createGroupSubscription.ts` creates subscriptions but does NOT explicitly set `interval: 'year'` — the interval is controlled entirely by the Stripe product's default price. If that price is monthly, admins are charged monthly despite the UI showing "$12/year". This is a silent billing mismatch risk. |
| `allow_promotion_codes: true` | Only in `createStripeCheckoutSession.ts` — NOT in `createGroupSubscription.ts`. Users going through the direct-subscription path cannot apply promo codes. |
| Founding group discount ($8 lifetime) | Documented in `PRICING_MODEL.md` Phase 1 strategy — not implemented. |
| `canCreateSubscription` logic | `getGroupSubscriptionInfo.ts` returns `canCreateSubscription: !subscriptionId \|\| subscriptionStatus === "canceled"`. A `past_due` or `incomplete` group returns `canCreateSubscription: false`, which could block re-enrollment if the subscription ID exists but payment failed and the subscription has not been fully canceled yet. |
| Stripe customer has no email | `createGroupSubscription.ts` creates the customer with only `name` and `metadata` — no email address. This means Stripe cannot send hosted invoice emails to the group admin. `reactivateGroupSubscription.ts` does pass email but `createGroupSubscription.ts` and `createStripeCheckoutSession.ts` do not. |
| Trial requires no payment method | `createGroupSubscription.ts` passes `payment_behavior: "default_incomplete"` — a trial starts with no card on file. If the admin never adds a payment method, Stripe auto-cancels at trial end but the group document may retain `stripeSubscriptionId` with status `canceled` rather than being cleaned up. |

---

## 3. Revenue Leaks — Ungated Premium Features

This is the highest-urgency finding. Subscription enforcement is implemented at two layers:

1. **Firestore security rules** — gate what data can be read/written
2. **Mobile app UI** — controls what screens are navigable

The Firestore rules do NOT check subscription status anywhere. Rules gate by role (admin, treasurer, member) only. This means the enforcement model relies entirely on the mobile client deciding whether to show/navigate to a feature.

### Confirmed Ungated Features

| Feature | Rule Check | UI Gate | Risk Level |
|---------|-----------|---------|-----------|
| Treasury (transactions, overviews) | Role only (admin/treasurer) | None found in screen navigation | HIGH |
| Announcements posting | Role only (admin) | None found | HIGH |
| Service positions | Role only (admin) | None found | HIGH |
| Business meetings | Role only (admin) | None found | MEDIUM |
| Member management | Role only (admin) | None found | MEDIUM |
| Meeting management (create/edit/delete) | Role only (admin) | None found | MEDIUM |
| Financial reports | Role only (admin/treasurer) | None found | MEDIUM |
| Recurring transactions | Role only (admin/treasurer) | None found | MEDIUM |

**What this means in practice:** A user who is granted admin role on a group (e.g., claims an existing group) can use all premium features without subscribing. The admin role is gated to Cloud Functions in creation, but the subscription is never verified when premium features are accessed.

The `GroupOverviewScreen.tsx` navigates to admin features (Treasury, Announcements, AdminDashboard, etc.) checking only `isGroupAdmin` — not subscription status. There is a `SubscriptionUpgradeScreen` and `TrialStatusBanner` component, but the paths to premium features do not funnel through these when a user is already an admin without a subscription.

### Specific Scenario — Revenue Leak Path

1. User claims an existing group (100k+ pre-seeded groups available)
2. Via `requestAdminAccessWithSubscription`, they become admin
3. If the subscription flow is skipped or abandoned mid-trial, the admin role persists
4. Admin can access treasury, announcements, member management indefinitely — no subscription check
5. Firestore rules allow writes because the user is an admin, not because the group is subscribed

This is the most significant monetization gap in the codebase.

---

## 4. Conversion Blockers

### Blocker 1: Trial starts without a payment method

`createGroupSubscription.ts` uses `payment_behavior: "default_incomplete"`, allowing a subscription to be created with no card on file. The 7-day trial runs. If the admin never adds a payment method:
- Stripe cancels the subscription at trial end
- Admin may not realize what happened
- No re-engagement path in app (other than the `setupSubscriptionPaymentMethod` callable, which requires the admin to initiate)
- **Impact:** Trial-to-paid conversion likely understated due to silent abandonments

### Blocker 2: 30-day money-back guarantee is promised but unimplemented

The upgrade screen (`SubscriptionUpgradeScreen.tsx`) shows a "30-day money-back guarantee" badge. There is no refund callable, no refund logic in webhooks, no mention in `BILLING_AND_PAYMENTS.md`. If a group admin asks for a refund and it does not exist, this damages trust.

### Blocker 3: No trial counter in the UI

The `useTrialStatus` hook exists and returns `daysRemaining`. The `TrialStatusBanner` component exists. But per `ROADMAP.md`, this is a V1.1 planned item ("Trial day counter" / "Day 3 of 7" visible in app). Until this is live, admins may not realize their trial is running down — leading to accidental lapse.

### Blocker 4: Success URL is a web URL, not a deep link

Both `createStripeCheckoutSession.ts` hardcodes `SUCCESS_URL` to `https://homegroups-app.com/subscription/success`. After a successful checkout in the Stripe-hosted WebView, the admin lands on a website URL, not back in the app. If `homegroups-app.com` does not handle this redirect correctly with a deep link, the post-payment experience is broken and the admin has no immediate confirmation in-app.

### Blocker 5: No in-app payment on iOS (App Store compliance risk)

The subscription uses a WebView to load Stripe Checkout. On iOS, App Store guidelines (Rule 3.1.1) require in-app purchases to use StoreKit for digital goods unless the purchase is for a "multiplatform service" or a B2B tool used by businesses. A group admin subscription may qualify as a business/organization tool. However, this requires explicit architectural justification and Apple review could reject or flag it. This should be legally reviewed before App Store submission.

### Blocker 6: Stripe customer created without admin email

`createGroupSubscription.ts` creates the Stripe customer with no email. This means:
- Stripe cannot send the admin payment confirmation emails via hosted billing
- If the admin's card fails, Stripe's own dunning email system cannot reach them
- The app's custom dunning email relies on fetching email from the `users` Firestore collection — this works, but it is a single point of failure

---

## 5. Documented Opportunities Not Yet Implemented

The following items appear in `ROADMAP.md` with direct revenue impact but show no implementation in the codebase:

| Opportunity | Roadmap Phase | Revenue Impact | Notes |
|-------------|--------------|----------------|-------|
| Trial day counter + Day 5 reminder push notification | V1.1 | Conversion | Hook (`useTrialStatus`) exists, banner component exists, but V1.1 trigger notification (Day 5) is not in Cloud Functions |
| Admin dashboard with subscription status card | V1.0 | Retention | `dashboardSlice` and `AdminDashboard` screen exist but subscription status widget not confirmed |
| "Ask Admin to Upgrade" member-driven CTA | V3.2 | Conversion | Firestore rule for `upgradeRequests` subcollection exists, `notifyAdminUpgradeRequest` callable exists — but no UI flow confirmed to trigger it from member screens |
| Multi-group discount | V3.1 | Expansion | Backend is implemented; UI in `SubscriptionUpgradeScreen` shows discount banner — **this is actually implemented** |
| Referral program | V3.0 | Expansion | Backend fully implemented; `ReferralDashboard` screen navigation exists in `GroupOverviewScreen` |
| Annual churn re-engagement | V1.1+ | Retention | No implementation found for pre-renewal reminder (e.g., 30 days before annual renewal) |

### Most Valuable Unimplemented Item

The **Day 5 trial push notification** is the highest-leverage missing piece. It is planned, partially scaffolded, and has been shown in SaaS contexts to increase trial-to-paid conversion by 15-25%. The webhook for `customer.subscription.trial_will_end` fires 3 days before trial end — an additional in-app trigger at Day 5 (i.e., `daysRemaining === 2`) would require a scheduled Cloud Function or the app to observe trial status locally via the `useTrialStatus` hook.

---

## 6. Undocumented Monetization Opportunities

These opportunities are not in any current planning document.

### Opportunity 1: Annual Renewal Push Notification Campaign

The subscription renews annually. There is no pre-renewal notification (e.g., 30 days out). At $12/year, admins may not remember the charge is coming, leading to card declines and churn. A 30-day pre-renewal push + email ("Your subscription renews on [date] for $12 — here's what your group accomplished this year") reinforces value at the moment of decision. The `subscriptionExpiresAt` timestamp on the group document makes this trivial to implement as a scheduled Cloud Function.

### Opportunity 2: Soft-Paywall for Group Creation

Currently, any authenticated user can call `createGroupWithSubscription` — which presumably creates a group AND starts a trial. However, group creation and subscription creation are conceptually decoupled in the codebase (separate callables: `createGroupWithSubscription` vs. `createGroupSubscription`). There is no enforcement preventing a user from creating multiple groups with multiple fresh 7-day trials, never converting. A rate limit on trial creation per user (e.g., 2 free trials per calendar year) would close this gap.

### Opportunity 3: Treasury Report Generation as a Conversion Lever

The STRATEGIC_ANALYSIS.md identifies treasury report generation as a "killer feature." Currently, generating reports does not gate behind a subscription check in the rules. This is a missed conversion opportunity: if a non-subscribed admin could preview a report but see it watermarked, or if members of a non-subscribed group see a prompt — "Your group could generate this report automatically with a subscription" — it would create bottom-up pressure.

### Opportunity 4: Donation Platform Fee as a Revenue Stream (Underutilized)

A 5% platform fee on donations is implemented (`PLATFORM_FEE_PERCENT = 0.05`). This is only triggered through the Stripe Connect flow. The strategic analysis documents this as a future opportunity but the platform fee is already coded. If donation volume grows, this could become meaningful. However, there is no analytics tracking donation volume per group, making it impossible to surface this as a revenue metric today.

### Opportunity 5: Intergroup Subscription Tier (V4.4, Underdocumented)

The codebase has full intergroup subscription support: two product IDs (`productIdIntergroupA`, `productIdIntergroupB`), webhook handlers, and an `intergroupSlice`. This is entirely absent from `PRICING_MODEL.md` and `ROADMAP.md`. Intergroup subscriptions could be a meaningful expansion revenue stream (an intergroup managing 10-30 groups is a high-value customer). The pricing for these products has not been defined in any doc reviewed.

### Opportunity 6: Data Export as a Paid Feature

`exportGroupData.ts` and `exportFacilityComplianceReport.ts` callables exist. Data export has high perceived value among admins handling treasurer handoffs or accountability workflows. Limiting export format (CSV vs. PDF) or frequency by subscription tier creates natural upgrade pressure.

### Opportunity 7: Year-End Treasury Summary Report

Documented in V2.1 as a retention feature. It could also be a conversion trigger: show free/trial groups a preview of their year-end summary and require subscription to download/share it. Given that AA groups are expected to report finances at a December business meeting, this has a predictable, high-intent moment where the feature creates direct willingness to pay.

---

## 7. Is $12/Year Strategically Sound?

### Arguments For

- **Accessibility:** At $1/month equivalent, it removes price as a barrier for groups with tight budgets. Recovery groups often subsist on 7th Tradition collections of small amounts.
- **Framing:** "Less than one coffee per month" is a tested framing that converts well.
- **Competitive moat:** No competitor offers purpose-built group management at this price. WhatsApp and Facebook are "free" but carry privacy risk — the primary differentiator argument.
- **Fairness:** Flat rate avoids the complexity and resentment of per-member pricing as groups grow.
- **Path to scale:** At 5,000 groups (2.8% of the North American market), this yields $60k ARR. Infrastructure at that scale is well under $1k/month per the roadmap.

### Arguments Against and Risks

**Risk 1: Revenue ceiling at scale.**
At 50,000 groups (27% market penetration), $600k ARR is the ceiling. This is sustainable for a small team but limits hiring capacity. If the product succeeds significantly, pressure will mount to raise prices. A price increase on existing customers in the recovery community could damage trust disproportionately. Recommendation: consider grandfathering early adopters explicitly and communicating a pricing roadmap upfront.

**Risk 2: No annual price increase path is documented.**
The pricing model docs do not address when or how prices will increase. This creates a long-term liability: a group subscribing in year 1 at $12 expects $12 forever. Adding price increase communication to the ToS now is easier than retroactive justification later.

**Risk 3: The multi-group discount ($8) erodes ARPU at scale.**
A power admin running 5 groups pays $12 + (4 × $8) = $44/year for 5 groups instead of $60. That is 27% below full rate. This is intentional as a growth lever, but at high multi-group rates, ARPU drops meaningfully. Monitor the percentage of admins with 2+ groups closely.

**Risk 4: $12/year is below the Stripe fee floor for low-frequency payments.**
Stripe charges 2.9% + $0.30 per charge. On a $12 annual charge, the fee is approximately $0.65 (5.4%). That leaves ~$11.35 net. For a $1/month plan, the fee on each charge is ~$0.33, leaving $0.67 net — effectively the same annual take but with 12x the processing overhead. Annual billing is the right choice here and is documented correctly.

**Risk 5: The 30-day money-back guarantee is not implemented.**
As noted above, if admins request refunds and this is handled manually/inconsistently, it creates trust risk and potential chargebacks. Formalizing the refund policy (either remove the UI claim or implement a refund callable) is necessary before launch.

**Risk 6: iOS App Store 30% cut risk.**
If Apple determines in-app admin subscriptions are subject to IAP rules, Apple would take 30% of revenue (15% after year 1), reducing net to $8.40 (or $10.20) per group. This is not the end of the business, but it would require raising prices or renegotiating value. The WebView payment flow is specifically designed to route around IAP requirements. This is a common approach (e.g., Netflix, Spotify on iOS) but carries ongoing platform policy risk.

### Verdict

$12/year is sound for MVP launch and early growth. It is not a permanent ceiling — the documentation should acknowledge that pricing will evolve as feature depth increases. The primary near-term risk is not the price itself but the conversion rate: at 15% trial-to-paid (the V1 target), 7 of 8 trials are lost. Every conversion optimization improvement multiplies on this base.

---

## 8. Subscription Enforcement Robustness

### How Enforcement Works (Actual)

Enforcement is **role-only, not subscription-aware**, at every data layer:

```
Firestore Rules → isGroupAdmin(groupId) → allows write
                  No subscriptionStatus check anywhere in rules
```

The mobile app navigates to admin screens based on `selectIsGroupAdmin()` from the Redux store — again, no subscription check.

The only subscription enforcement that exists is:
1. The trial/upgrade UI shown when an admin first claims/creates a group
2. The `SubscriptionUpgradeScreen` and `TrialStatusBanner` which can be shown, but are not required on any path to premium functionality
3. The `useTrialStatus` hook — calculates trial status but does not block navigation

### Bypass Scenarios

**Scenario A — Admin granted before subscription created:**
A user is made admin of a group via `requestAdminAccessWithSubscription`. If the subscription step is skipped, abandoned, or the trial expires without conversion, the admin role remains in the `members` collection and custom claims. All premium features remain accessible via Firestore rules.

**Scenario B — Stale subscription status in Redux:**
The app caches group data with a 5-minute TTL (`CACHE_TTL = 5 * 60 * 1000`). If a subscription lapses and the Firestore document is updated via webhook, the mobile client may show the admin as active for up to 5 minutes — a minor window but worth noting.

**Scenario C — Claims lag:**
Custom JWT claims are refreshed via `syncUserClaims` on join/leave, but not on subscription status change. An admin whose subscription lapses retains their `adminGroups` claim until the next token refresh. Firestore rules based on these claims will continue to allow writes during this window.

**Scenario D — Direct API calls:**
A technically sophisticated user who knows the Firestore structure could call Cloud Functions directly (e.g., `createAnnouncement`, `addTransaction`) from outside the app. The Cloud Functions currently check `isGroupAdmin` but not subscription status. This is a lower-probability attack surface for a community app but is worth noting.

### Assessment

Subscription enforcement is weak-to-nonexistent at the data layer. This is a common early-stage startup decision — moving fast and trusting the community — but as the product scales it creates material revenue leakage. The fix requires either:

1. Adding subscription status checks to Cloud Function callables for premium operations (most secure)
2. Adding subscription status to custom JWT claims so Firestore rules can check them (performant, but adds claim size)
3. A middleware layer in the mobile app that intercepts navigation to premium screens and shows the upgrade prompt (user-facing fix only, not data-layer secure)

Option 1 is recommended for high-value operations (treasury writes, announcement creation). Option 3 is a low-cost improvement that captures the majority of legitimate users.

---

## 9. Summary Risk Matrix

| Risk | Severity | Probability | Effort to Fix |
|------|----------|------------|---------------|
| Premium features fully accessible without subscription | HIGH | CERTAIN (by design currently) | MEDIUM |
| 30-day money-back guarantee promised but not implemented | HIGH | CERTAIN | LOW |
| Annual billing interval set only in Stripe dashboard, not enforced in code | HIGH | MEDIUM | LOW |
| Stripe customer created without email — Stripe dunning bypassed | MEDIUM | HIGH | LOW |
| Trial abandonment (no payment method required) with no re-engagement | MEDIUM | HIGH | LOW |
| iOS App Store IAP compliance risk | HIGH | MEDIUM | HIGH |
| Multiple trials per user (no rate limit) | MEDIUM | LOW | LOW |
| Intergroup pricing undocumented and undefined | LOW | CERTAIN | LOW |
| Price increase strategy undocumented | LOW | CERTAIN (future) | LOW |

---

## 10. Priority Recommendations

Listed by impact-to-effort ratio:

### P0 — Before Launch (Critical)

1. **Remove or implement the 30-day money-back guarantee.** Either add a `refundGroupSubscription` callable or remove the badge from `SubscriptionUpgradeScreen.tsx`. A promise you cannot keep is worse than no promise.

2. **Pass admin email when creating Stripe customer.** In `createGroupSubscription.ts` and `createStripeCheckoutSession.ts`, fetch the user's email from Firestore and pass it to `stripe.customers.create()`. This enables Stripe's built-in receipt and dunning emails as a backup layer.

3. **Verify Stripe product price interval is annual.** Confirm the product configured via `STRIPE_PRODUCT_ID_GROUP` has a default price with `interval: year`. Add a startup assertion or test that validates the price interval. Silent monthly billing would be a serious trust violation.

### P1 — First Two Weeks Post-Launch

4. **Implement subscription gate on at least one high-value screen.** Add a subscription status check in the Treasury screen and Announcements posting screen. Show an upgrade prompt if `subscriptionStatus` is not `active` or `trialing`. This closes the most visible revenue leak without a full rules rewrite.

5. **Activate the Day 5 trial notification.** Use the `subscriptionExpiresAt` field and a scheduled Cloud Function (or Firebase Extensions) to send a push + email 2 days before trial end (day 5 of 7). Expected impact: 15-25% improvement in trial-to-paid conversion.

6. **Add a 30-day pre-renewal reminder.** Schedule a push notification 30 days before `subscriptionExpiresAt` for active subscriptions. Body: "Your Homegroups subscription for [group name] renews on [date]. Here's what your group accomplished this year: [X transactions, X announcements, X messages]." This reinforces value at the highest-churn moment.

### P2 — V1 Window

7. **Add subscription-status check to subscription info endpoint.** Fix `getGroupSubscriptionInfo.ts`'s `canCreateSubscription` logic to return `true` for `past_due` and `incomplete` statuses — those are re-enrollment opportunities, not blocked states.

8. **Add trial rate limiting.** In `createGroupSubscription.ts`, query whether the calling user has had more than 2 trials in the last 12 months. Log and soft-block repeat trial creation. This does not need to be aggressive — just close the free-forever loophole.

9. **Surface the "Ask Admin to Upgrade" flow from member screens.** The backend (`notifyAdminUpgradeRequest` callable, `upgradeRequests` Firestore rules) is in place. Member-driven upgrade requests apply bottom-up conversion pressure. This is particularly powerful in large groups where the admin may not see daily treasury friction but the treasurer does.

10. **Document and price intergroup subscriptions.** The V4.4 intergroup product IDs are in the code but not in any pricing documentation. Define a price (suggested: $48-$96/year for an intergroup managing 10-30 groups, creating 4-8x ARPU vs. single groups) and add to `PRICING_MODEL.md`.

---

## Appendix: Key File Index

| File | Purpose |
|------|---------|
| `/functions/src/utils/stripe.ts` | Stripe config, product/price IDs, `getDefaultPriceForProduct` |
| `/functions/src/utils/stripeUtils.ts` | Webhook handlers, referral conversion, notification helpers |
| `/functions/src/callable/createGroupSubscription.ts` | Direct subscription creation with trial |
| `/functions/src/callable/createStripeCheckoutSession.ts` | Hosted checkout session creation |
| `/functions/src/callable/getMultiGroupPricing.ts` | Multi-group discount pricing logic |
| `/functions/src/callable/createCustomerPortalSession.ts` | Stripe billing portal for self-serve management |
| `/functions/src/callable/reactivateGroupSubscription.ts` | Re-subscription after cancellation |
| `/functions/src/callable/getGroupSubscriptionInfo.ts` | Admin billing info endpoint |
| `/functions/src/callable/setupSubscriptionPaymentMethod.ts` | Adds payment method to trialing subscription |
| `/mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx` | Upgrade paywall screen |
| `/mobile/src/hooks/useTrialStatus.ts` | Trial status hook (daysRemaining, isActive) |
| `/mobile/src/store/slices/groupsSlice.ts` | Group state, subscription-related selectors |
| `/mobile/src/store/slices/referralSlice.ts` | Referral code generation and stats |
| `/firestore.rules` | Security rules — role-gated, NOT subscription-gated |
| `/docs/PRICING_MODEL.md` | Pricing rationale and feature gate breakdown |
| `/docs/BILLING_AND_PAYMENTS.md` | Technical billing architecture |
| `/docs/ROADMAP.md` | Version-by-version revenue roadmap |

---

_Analysis based on code state as of 2026-02-23. Prioritization assumes MVP is not yet in the App Store._
