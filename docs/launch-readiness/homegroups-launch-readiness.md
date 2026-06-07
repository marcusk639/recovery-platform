# Homegroups Launch Readiness Assessment

**Date:** 2026-06-06
**Product:** Homegroups
**Firebase Project:** `recovery-connect-cad4b`
**Branch:** feat/regroup-tier-billing-migration
**Purpose:** Spec- and plan-ready launch readiness document

---

## 1. Executive Summary

Homegroups is a privacy-first mobile and web platform for running 12-step recovery groups (AA, NA, and similar fellowships). The product is **feature-complete for its V1-V4.3 scope** with 90 callable Cloud Functions, 17 Firestore triggers, 14 scheduled jobs, and a mature Stripe subscription system. Launch is **activation-gated, not build-gated**: all 30 code items on the pre-launch checklist are resolved, but 7 infrastructure items, 3 App Store items, 3 revenue items, and 2 validation items remain unstarted.

**Overall readiness: 7.5/10** -- code and architecture are strong; go-to-market execution and Stripe production activation are the bottlenecks.

---

## 2. Things Done Well

### 2.1 Feature Depth and Breadth

| Module                                       | Status               | Evidence                                                                                                           |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Authentication (email/Google/Apple/Facebook) | Complete             | 4 SSO providers wired, custom JWT claims with 1000-byte limit management                                           |
| Geolocated meeting finder                    | Complete             | Geohash-based queries, filters (format, program, day, time), map view, online meeting links                        |
| Group discovery & management                 | Complete             | Create/join/leave, member directory, invite codes with deep links                                                  |
| Service positions                            | Complete             | Term dates, rotation tracking, position reminders (scheduled job)                                                  |
| Treasury                                     | Complete             | Income/expenses, balance, prudent reserve, recurring transactions, treasurer handoff protocol, year-end summary    |
| Announcements                                | Complete             | FCM push delivery, scheduled publishing, dedup guard against double-send                                           |
| Real-time chat + DMs                         | Complete             | @mentions, reactions, replies, attachments, stale FCM token cleanup                                                |
| Sobriety tracking                            | Complete             | Live counter, milestone medallions (24hr to multi-year), celebration animations                                    |
| Governance                                   | Complete             | Conscience votes, elections (nominate/vote/close), business meeting minutes, bylaws ratification                   |
| Sponsorship                                  | Complete             | Cross-group sponsor/sponsee links, step-work companion, sponsor access grants                                      |
| Literature & resources                       | Complete             | Daily reflections (seeded + scheduled), bookmarks, meeting topics, group contributions                             |
| Intergroup (V4.4)                            | Built, not activated | Tier A (up to 10 groups) + Tier B (unlimited), affiliation, multi-group announcements, intergroup reports          |
| Treatment center (V4.4)                      | Built, not activated | Same checkout as intergroup with `type: "treatment_center"`, facility engagement metrics, compliance report export |

**13 functional modules** are implemented. This is unusually deep for a pre-launch product.

### 2.2 Stripe Integration Quality

- **Lazy initialization via Proxy pattern** -- Stripe client is not instantiated at module load (prevents `firebase deploy` source-analysis crash). This is a sophisticated pattern that solves a real Firebase deployment pain point.
- **Webhook handler covers 12 event types**: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.dispute.created`, `invoice.upcoming`, `charge.succeeded`, `charge.failed`.
- **Idempotency**: Event dedup is handled.
- **Stripe Connect** for group donations (5% platform fee) with a separate Connect webhook.
- **Intergroup tier upgrade** (A to B) handles old subscription cancellation, Firestore-first writes, and error recovery.
- **Annual assertion enforced**: `assertGroupPriceIsAnnual()` validates the Stripe price is yearly before checkout.

### 2.3 Security Posture

- **937-line Firestore security rules** with claims-based fallback for groups exceeding the 1000-byte JWT limit.
- **Maps API key moved to Cloud Functions** (callable proxy) -- removed from client bundle.
- **URL validation** on all redirect origins (`ALLOWED_REDIRECT_ORIGINS`).
- **Zod input validation** on Stripe-touching callables (intergroup creation, tier upgrade).
- **Stale FCM token cleanup** after every multicast send.
- **Auth token logging guarded** behind `__DEV__`.
- **Fictional bios removed**, real legal pages with real addresses.

### 2.4 Code Quality and Infrastructure

- **67 test files** across functions (unit + integration + rules tests).
- **CI pipeline**: `ci.yml` with TypeScript check as blocking gate (no `continue-on-error`).
- **PR review**: `claude-code-pr-review.yml` for automated code review.
- **Crashlytics** installed (`@react-native-firebase/crashlytics` v18.9.0).
- **Pre-launch checklist**: 30/30 code items marked complete.

---

## 3. Things That Need Work

### 3.1 Launch-Blocking Infrastructure (P0)

| ID  | Item                                                         | Status      | Effort                | Spec-Ready?          |
| --- | ------------------------------------------------------------ | ----------- | --------------------- | -------------------- |
| I-1 | Run full claim-and-pay funnel as real first customer         | Not started | 2-3 hours manual      | No -- manual action  |
| I-2 | Firebase Auth authorized domains includes deployed domain    | Not started | 5 min console         | No -- console action |
| I-3 | Email sender configured (avoid spam folder for verification) | Not started | 30 min DNS + console  | No -- ops action     |
| I-4 | `RATS_API_KEY` uploaded to Cloud Secret Manager              | Not started | 10 min CLI            | No -- ops action     |
| I-5 | Verify production Stripe key is `pk_live_` (not test key)    | Not started | 10 min DevTools check | No -- verification   |
| I-6 | Firebase Hosting deployed                                    | Not started | 5 min CLI             | No -- deploy action  |
| I-7 | Email inboxes (`privacy@`, `info@`) confirmed active         | Not started | 30 min                | No -- ops action     |

### 3.2 App Store Submission (P0 -- Critical Path)

| ID  | Item                                                       | Status      | Effort               |
| --- | ---------------------------------------------------------- | ----------- | -------------------- |
| A-1 | iOS submitted to App Store Connect                         | Not started | 1-7 day review       |
| A-2 | Android submitted to Google Play Console                   | Not started | 1-3 day review       |
| A-3 | Real App Store ID replaces placeholder in `deepLinks.js:9` | Not started | 5 min after approval |

**This is the long pole**: Apple review takes 1-7 days, rejection resets the clock.

### 3.3 Revenue Activation (P1)

| ID  | Item                                                            | Status      | Effort          |
| --- | --------------------------------------------------------------- | ----------- | --------------- |
| R-1 | Default price set on `productIdIntergroupA` in Stripe Dashboard | Not started | 10 min          |
| R-2 | Default price set on `productIdIntergroupB` in Stripe Dashboard | Not started | 10 min          |
| R-3 | Custom domain decision (homegroups-app.com vs Firebase default) | Not started | Decision needed |

**R-1 and R-2 are silent revenue-zero failure modes**: `getDefaultPriceForProduct()` throws at runtime when default prices are unset, breaking every intergroup/treatment-center checkout.

### 3.4 Mobile Test Coverage

Homegroups has 67 test files, but coverage is concentrated in Cloud Functions. Mobile unit test coverage appears thin -- only 1 test file (`__tests__/App.test.tsx`) in the mobile directory. Critical mobile flows (group creation, subscription checkout, treasury editing, governance voting) lack automated tests.

**Spec-ready action**: Write a test plan targeting the 5 highest-risk mobile flows:

1. Group admin onboarding (create group -> Stripe checkout -> claim)
2. Treasury transaction CRUD
3. Invite share sheet deep link generation
4. Sobriety milestone recording
5. Election/voting flow

### 3.5 V4.4 Feature Flag Management

V4.4 features (intergroup, treatment center, white-label) are built but gated behind feature flags set to `false`. The flags are documented but:

- No **runtime feature flag service** (Firebase Remote Config or LaunchDarkly) -- flags are hardcoded constants.
- No **gradual rollout** capability -- flipping a flag requires a code deploy.
- No **per-user or per-group** flag targeting.

**Spec-ready action**: Decide whether to implement Remote Config before launch or accept hardcoded flags for the initial rollout.

---

## 4. Inconsistencies

### 4.1 Brand Identity

| Location                      | Brand Name Used          | Correct?                                                  |
| ----------------------------- | ------------------------ | --------------------------------------------------------- |
| `mobile/package.json` `name`  | `Homegroups`        | Outdated -- should be `Homegroups`                        |
| `mobile/package.json` version | `0.0.1`                  | Not updated for launch                                    |
| iOS bundle ID                 | `org.recoveryconnect`    | Uses old brand; may need to keep for App Store continuity |
| Web/share text                | `Homegroups`             | Correct (C-21 rebrand completed)                          |
| Firebase project              | `recovery-connect-cad4b` | Immutable, acceptable                                     |

### 4.2 Domain and URL Inconsistencies

- `JOIN_BASE_URL` in `InviteShareSheet.tsx` -- fixed to Firebase domain but will need to flip again if custom domain is configured.
- `PAYMENT_BASE_URL` in `SubscriptionWebView.tsx` -- same situation.
- `ALLOWED_REDIRECT_ORIGINS` in `createIntergroup.ts` -- server-side allow-list needs new domain added when switching.
- **9 files** total need coordinated update if/when custom domain is adopted (documented in launch-blockers.md #5).

### 4.3 Stripe API Version Drift

- Homegroups functions use Stripe API version `2025-12-15.clover`.
- Regroup functions use Stripe API version `2026-01-28.clover`.
- These are different API versions on the same platform. While not immediately breaking, it creates divergent behavior expectations for webhook payloads and subscription lifecycle events.

### 4.4 Pricing-to-Product Mapping Complexity

Three UI entry points (intergroup, district/area, treatment center) map to two Stripe products (tier A, tier B). The `type` field on the Firestore document is the only differentiator. This 3-to-2 fan-in is documented but creates:

- Difficulty segmenting revenue by customer type in Stripe Dashboard.
- No way to offer type-specific pricing without adding new Stripe products.
- Reporting complexity when treatment centers need different support than intergroups.

---

## 5. Pricing Strategy Assessment

### 5.1 Current Pricing

| Tier                                 | Price              | Billing | Trial |
| ------------------------------------ | ------------------ | ------- | ----- |
| Group Admin                          | $12/year           | Annual  | 7-day |
| Intergroup Tier A (up to 10 groups)  | TBD                | Annual  | None  |
| Intergroup Tier B (unlimited groups) | TBD                | Annual  | None  |
| Treatment Center                     | Same as Intergroup | Annual  | None  |

### 5.2 Market Comparison

There is **no direct competitor** offering a 12-step group management platform with treasury, governance, service positions, and sponsorship. Closest substitutes:

- **Pink Cloud**: Meeting finder only, no group admin features. Free / freemium.
- **In The Rooms**: Online meeting platform, not group administration. Free.
- **Meeting Guide** (AA official): Meeting finder, read-only data. Free.

### 5.3 Pricing Analysis

**$12/year is extremely low.** For context:

- A group treasury handles $200-2,000+/year in 7th Tradition collections.
- The treasurer handoff feature alone saves 2-4 hours of manual reconciliation per transition.
- The value delivered is $50-200/year minimum in time savings.

**Risks of $12/year:**

- Signals "hobby project" to institutional buyers (treatment centers, intergroups).
- Cannot sustain even minimal support (a single email support interaction costs more than the annual fee in time).
- Makes it difficult to layer premium features without a massive relative price jump.

**Risks of raising price pre-launch:**

- No validated willingness-to-pay data yet.
- 12-step groups are volunteer-run and cost-sensitive.
- Risk of early adopter friction if price is set too high before product-market fit is confirmed.

### 5.4 Pricing Recommendations (Spec-Ready)

| Tier                          | Recommended Price        | Rationale                                                                                        |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------ |
| Group Admin                   | $24-36/year ($2-3/month) | 2-3x current; still trivially affordable for any group collecting 7th Tradition. Test $24 first. |
| Intergroup Tier A (10 groups) | $99/year                 | ~$10/group/year; positioned well below any B2B software.                                         |
| Intergroup Tier B (unlimited) | $249/year                | Network effect pricing -- makes sense only at scale.                                             |
| Treatment Center Tier A       | $199/year                | Premium over intergroup; treatment centers have institutional budgets.                           |
| Treatment Center Tier B       | $499/year                | Still negligible vs. EHR costs ($5K-50K/year).                                                   |
| Facility dashboard (future)   | $99/month                | Per-facility monthly; aligns with behavioral health SaaS norms.                                  |

**Decision needed**: Whether to launch at $12/year and raise later (validates faster, risks anchoring) or launch at $24-36/year (higher revenue per user, risk of slower adoption).

---

## 6. Stripe Readiness

### 6.1 What's Working

| Capability                                        | Status                            | Evidence                                                                                |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Group subscription checkout                       | Built + tested                    | `createGroupSubscription`, `createGroupWithSubscription`, `createStripeCheckoutSession` |
| Subscription lifecycle (create/cancel/reactivate) | Built + tested                    | Webhook handler + `stripeUtils.ts`                                                      |
| Annual billing with 7-day trial                   | Configured                        | `TRIAL_PERIOD_DAYS = 7` in `stripe.ts`                                                  |
| Stripe Connect for donations                      | Built                             | 5% platform fee, Connect webhook handler                                                |
| Intergroup checkout                               | Built, untested with real payment | `createIntergroup` callable                                                             |
| Tier upgrade (A to B)                             | Built, untested with real payment | `upgradeIntergroupTier` callable                                                        |
| Customer billing portal                           | Built                             | `createCustomerPortalSession` callable                                                  |
| Payment method management                         | Built                             | `setupSubscriptionPaymentMethod` callable                                               |
| Stripe key guard                                  | Deployed                          | `SubscribePage.js` throws on missing/placeholder key                                    |

### 6.2 What's Missing or Unverified

| Gap                                                                                  | Severity           | Action Required                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| Intergroup Stripe products have no default price set                                 | CRITICAL           | Set default prices in Stripe Dashboard for both `productIdIntergroupA` and `productIdIntergroupB` |
| No end-to-end payment flow tested with real card                                     | CRITICAL           | Manual walkthrough required (I-1)                                                                 |
| Production vs test key verification                                                  | CRITICAL           | Check deployed env for `pk_live_` vs `pk_test_`                                                   |
| App Check not enforced on Stripe callables                                           | HIGH (post-launch) | Full 5-step rollout documented in launch-blockers.md                                              |
| No idempotency keys on payment intents                                               | MEDIUM             | Low risk at current scale; becomes important at 1000+ groups                                      |
| Stripe Dashboard reporting: no way to segment intergroup vs treatment center revenue | LOW                | Both use same Stripe products; add metadata if segmentation needed                                |

### 6.3 Stripe Environment Configuration

| Secret                                         | Required For                  | Status                                          |
| ---------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `STRIPE_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY` | All Stripe operations         | Configured (lazy-loaded)                        |
| `STRIPE_WEBHOOK_SECRET`                        | Platform webhook verification | Warns if missing (non-fatal at startup)         |
| `STRIPE_CONNECT_WEBHOOK_SECRET`                | Connect webhook verification  | Warns if missing                                |
| `STRIPE_PRODUCT_ID_GROUP`                      | Group subscriptions           | Configured                                      |
| `STRIPE_PRODUCT_ID_INTERGROUP_A`               | Intergroup Tier A             | Env var defined; **price not set in Dashboard** |
| `STRIPE_PRODUCT_ID_INTERGROUP_B`               | Intergroup Tier B             | Env var defined; **price not set in Dashboard** |

---

## 7. Gaps and Risks

### 7.1 Technical Gaps

| Gap                                                                                 | Impact                                         | Effort to Close                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| No mobile unit tests beyond `App.test.tsx`                                          | Regression risk on mobile flows                | L (40-60 hours for meaningful coverage)       |
| No error tracking dashboard (Crashlytics installed but not configured for alerting) | Blind to production crashes                    | S (configure alerting rules)                  |
| No App Check enforcement                                                            | Abuse risk at scale                            | M (5-step rollout over 2-3 weeks)             |
| `package.json` version still `0.0.1`                                                | App Store confusion                            | S (bump to `1.0.0`)                           |
| OG meta tags unrenderable (CRA is client-side rendered)                             | No social previews when sharing group links    | M (SSR or prerender proxy)                    |
| No sitemap for 62K scraped group pages                                              | SEO invisible until flipped                    | S (Cloud Function generator)                  |
| Angular 9 shared web components (web app)                                           | Security vulnerability surface (EOL framework) | L (full rewrite needed; defer to post-launch) |

### 7.2 Market Risks

| Risk                                                                   | Severity | Mitigation                                                                                                                                         |
| ---------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12-step anonymity culture creates adoption resistance                  | HIGH     | Product is already anonymity-first (no real names required, per-group privacy toggles). Marketing must lead with this.                             |
| $12/year price anchors below sustainability                            | HIGH     | Decide now: launch at $12 and validate fast, or start at $24-36. Either way, set intergroup/TC pricing at professional SaaS levels ($99-499/year). |
| No validated demand from real group admins                             | HIGH     | P1 validation items (attend 3 intergroup meetings, 30-group pilot) are the single most important pre-marketing actions.                            |
| Meeting finder requires local density to be useful                     | MEDIUM   | 62K scraped meeting pages provide initial density. Focus launch geography on metros with pre-seeded data.                                          |
| Treatment center sales cycle is 3-12 months                            | MEDIUM   | Don't plan revenue from TC sales in Year 1. It's a Year 2 play.                                                                                    |
| App Store rejection risk (health/recovery category has extra scrutiny) | MEDIUM   | Prepare for App Store review questions about health claims. The app facilitates peer support, not medical treatment.                               |

### 7.3 Business Model Risks

| Risk                                                   | Severity | Mitigation                                                                                                             |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| $12/year ARPU cannot sustain any level of support      | HIGH     | Even 1,000 groups = $12K/year. Not viable. Intergroup/TC tiers are the revenue path; groups are the adoption flywheel. |
| Free group members have no upgrade path                | MEDIUM   | Consider premium member features in V5 (expanded sobriety tracking, literature access, step-work tools).               |
| Stripe Connect donations are low-frequency, low-margin | LOW      | 5% of occasional donations is negligible revenue. Don't count on it.                                                   |

---

## 8. Recommended Launch Sequence

### Week 1: Activate Revenue Infrastructure

1. Set Stripe default prices for intergroup Tier A and Tier B products.
2. Verify production Stripe publishable key.
3. Configure Firebase Auth authorized domains.
4. Configure email sender (SPF/DKIM for deliverability).
5. Upload `RATS_API_KEY` to Secret Manager.
6. Deploy Firebase Hosting.

### Week 1-2: Manual Validation

7. Run full claim-and-pay funnel yourself (incognito, real card).
8. Document every friction point.
9. Fix top 3 friction points.

### Week 2: App Store Submission

10. Bump version to `1.0.0`.
11. Submit to App Store Connect and Google Play Console.
12. Prepare for review questions.

### Week 3-4: Pilot Validation

13. Attend 3 intergroup meetings with laptop.
14. Demo treasury handoff to real GSRs.
15. Begin 30-group pilot outreach.

### Month 2+: Scale

16. Flip `noindex` on claimed group pages.
17. Begin intergroup/treatment-center outreach.
18. Monitor Stripe revenue and churn.

---

## 9. Spec Backlog (Actionable Items for Plan Generation)

Each item below is scoped enough to generate a spec or implementation plan from.

| ID         | Title                                                                 | Type                | Priority | Est. Effort      |
| ---------- | --------------------------------------------------------------------- | ------------------- | -------- | ---------------- |
| HG-SPEC-01 | Stripe product price activation and end-to-end payment verification   | Ops runbook         | P0       | 2 hours          |
| HG-SPEC-02 | App Store submission preparation (metadata, screenshots, review prep) | Checklist           | P0       | 8 hours          |
| HG-SPEC-03 | Mobile test coverage plan (5 critical flows)                          | Test plan           | P1       | 40 hours         |
| HG-SPEC-04 | Custom domain migration (9-file coordinated update)                   | Migration plan      | P1       | 4 hours          |
| HG-SPEC-05 | Pricing strategy decision ($12 vs $24-36/year + intergroup/TC tiers)  | Decision doc        | P1       | 2 hours decision |
| HG-SPEC-06 | App Check rollout (5-step process)                                    | Implementation plan | P2       | 16 hours         |
| HG-SPEC-07 | OG meta / social preview implementation (SSR or prerender proxy)      | Feature spec        | P2       | 20 hours         |
| HG-SPEC-08 | Sitemap generator for 62K group pages                                 | Feature spec        | P2       | 8 hours          |
| HG-SPEC-09 | Firebase Remote Config for V4.4 feature flags                         | Feature spec        | P2       | 12 hours         |
| HG-SPEC-10 | Version bump and release versioning strategy                          | Process doc         | P0       | 1 hour           |

---

## Sources

Market research data referenced in this document:

- [AA Membership Estimates](https://www.aa.org/estimates-aa-groups-and-members)
- [Pink Cloud AA Meeting Finder](https://apps.apple.com/us/app/pink-cloud-aa-meeting-finder/id1178847734)
- [Behavioral Health Software Market Report](https://www.thebusinessresearchcompany.com/report/behavioral-and-mental-health-software-global-market-report)
