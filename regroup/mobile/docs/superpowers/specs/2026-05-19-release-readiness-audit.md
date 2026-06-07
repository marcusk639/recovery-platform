# Release Readiness Audit — Regroup v2

**Date:** 2026-05-19  
**App:** Regroup — React Native sober living house management  
**Baseline:** ~80% production readiness assessed against codebase at commit `fcb2ac4`  
**Scope:** App Store launch (covers soft launch as a strict subset)

---

## Executive Summary

The codebase has completed three major cleanup phases (P0 security fixes, Redux→React Query migration, code-quality pass). What remains before launch is concentrated in four domains:

| Domain                   | Gap                                        | Blocking?                         |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| App Store compliance     | No metadata, screenshots, privacy policy   | YES — submission will be rejected |
| Monetization enforcement | Stripe integrated, no subscription paywall | YES — revenue leaks               |
| Security manual actions  | 3 leaked keys, 4 E2E prod accounts         | YES — critical                    |
| Agentic AI opportunities | Not yet evaluated                          | NO — post-launch                  |

---

## Audit Domains

### Domain 1 — App Store Requirements (Hard blockers)

#### 1.1 Apple App Store

- [ ] **App Privacy Policy URL** — Required field in App Store Connect. Must describe Firestore data collection, Firebase Auth, Sentry, Stripe PII handling.
- [ ] **App Store screenshots** — 6.7" (iPhone 15 Pro Max) and 5.5" required; 12.9" iPad optional but recommended if supporting iPad.
- [ ] **App description & keywords** — 4000-char limit; keyword field drives ASO ranking.
- [ ] **Age rating** — Evaluate: sober living context likely 17+ (medical/health references) or 4+ (no objectionable content). Submit App Store questionnaire.
- [ ] **IDFA disclosure** — Firebase Analytics uses IDFA; must check "Collect data used to track" and specify purposes.
- [ ] **App Review notes** — Provide test account credentials and house setup context so reviewers can demo the app without real users.
- [ ] **Entitlements audit** — Run `codesign -d --entitlements - Payload/Regroup.app`; confirm only Push Notifications and In-App Purchase entitlements are present.

#### 1.2 Google Play Store

- [ ] **Data Safety form** — Declare: Firebase Auth (email), Firestore (user messages, financial transactions), Sentry (crash data), Stripe (payment info). All fields mandatory since May 2023.
- [ ] **Target API level** — Must target Android 14 (API 34) as of August 2024.
- [ ] **64-bit requirement** — Verify RN 0.72 build includes arm64-v8a ABI.
- [ ] **Permissions declaration** — Justify POST_NOTIFICATIONS and CAMERA permissions in console.
- [ ] **Feature graphic** — 1024×500 banner required for Play Store listing.

#### 1.3 Legal / Privacy

- [ ] **Privacy policy** — Must be hosted at a stable public URL (not a GitHub gist). Cover: data collected, retention, third-party processors (Firebase, Stripe, Sentry), CCPA/GDPR rights.
- [ ] **Terms of service** — Define admin vs guest roles, payment responsibility, acceptable use in recovery context.
- [ ] **HIPAA surface audit** — Sober living management touches protected health information (resident status, substance history). Assess whether HIPAA Business Associate Agreements are needed with Firebase/Google Cloud.
- [ ] **Stripe merchant agreement** — Ensure payout account is business (not personal) and platform terms allow recurring rent collection.

---

### Domain 2 — Feature Completeness

#### 2.1 Core Flows (must be end-to-end tested before launch)

| Flow                                             | Status                   | Gap                                    |
| ------------------------------------------------ | ------------------------ | -------------------------------------- |
| Admin onboarding (create house, invite guests)   | Implemented              | Needs E2E test against emulator        |
| Guest onboarding (accept invite, set up profile) | Implemented              | Deep-link invite URL not tested        |
| Rent payment (Stripe, receipt sharing)           | Implemented this session | `shareReceipt()` needs device test     |
| Activity logging (meeting, chore, work)          | Implemented              | Offline queue path untested            |
| Oxford voting + business meetings                | Migrated this session    | useOxfordGate gate needs emulator test |
| Push notifications (payment, chat, activity)     | Implemented              | FCM token refresh cycle untested       |
| House chat (real-time)                           | Implemented              | Message pagination untested            |

#### 2.2 Admin Experience Gaps (identified during review)

- [ ] **Bulk guest import** — No CSV import; admins must onboard guests one at a time. High friction for houses with 10+ residents.
- [ ] **Payment failure recovery** — Stripe webhook delivers `payment_intent.payment_failed`; UI has no retry/dispute surface for failed payments.
- [ ] **Guest discharge flow** — No structured offboarding (disable access, archive records, final billing).
- [ ] **Reporting / exports** — No PDF or CSV export of payment history, activity logs, EES records for house compliance reporting.

#### 2.3 Guest Experience Gaps

- [ ] **Offline payment confirmation** — If guest submits payment while offline, `offlineQueue` enqueues it, but guest sees no pending state indicator.
- [ ] **In-app notification center** — Notifications arrive via FCM but there's no persistent inbox to view missed notifications.
- [ ] **Guest-to-guest contact visibility** — HouseChat is house-wide; no private messaging between residents (different from admin DMs).

---

### Domain 3 — Monetization Enforcement

#### 3.1 Current State

Stripe is integrated for guest rent payments. There is no subscription paywall — any house can use all features including Oxford (oxfordEnabled flag exists in Firestore but is not enforced server-side).

#### 3.2 Recommended Tier Structure

| Tier               | Monthly   | Features                                    |
| ------------------ | --------- | ------------------------------------------- |
| **Starter** (free) | $0        | 1 house, up to 6 guests, basic activity log |
| **House**          | $49/house | Unlimited guests, payments, chat, reporting |
| **Oxford**         | $79/house | House tier + Oxford governance suite        |
| **Network**        | Custom    | Multi-house orgs, bulk billing, API access  |

#### 3.3 Implementation Checklist

- [ ] **Subscription products in Stripe** — Create recurring Price objects for House and Oxford tiers.
- [ ] **`subscriptionStatus` field on House document** — `active | trialing | past_due | canceled`. Cloud Function webhook updates this on subscription events.
- [ ] **Firestore rules enforcement** — Gate Oxford subcollection writes on `get(/databases/(default)/documents/houses/$(houseId)).data.oxfordEnabled == true && get(...).data.subscriptionStatus == 'active'`.
- [ ] **App Store In-App Purchase** — If subscription is purchased through the app, Apple requires IAP with 30% cut. Evaluate: direct Stripe billing (web-only signup) vs IAP.
- [ ] **Trial period** — 14-day trial for new house signups; `trialing` status grants full access.
- [ ] **Grace period for past_due** — 7-day grace before feature lockout to avoid disrupting active residents.
- [ ] **Admin subscription management screen** — Show current plan, next billing date, upgrade/downgrade, cancel.

#### 3.4 Revenue Model Assumptions (validate with pilot houses)

- Average house size: 8 residents
- Average rent: $600/month per resident
- Total house revenue: ~$4,800/month
- Regroup fee at $49/house: ~1% of managed revenue (low friction price point)
- Target: 50 houses at launch → $2,450 MRR
- Oxford upsell at ~40% attach rate → additional ~$600 MRR

---

### Domain 4 — Security Manual Actions (Cannot be automated — must be done by human)

**These block release. The app should not go to production with these open.**

#### 4.1 Leaked Firebase Service Account Keys

Three service account key files were found committed to git history:

1. `rats-fe9c3` project key
2. `rats-dev` project key
3. `phoenix-cleanhouse` project key

**Action:** Rotate all three in GCP Console → IAM & Admin → Service Accounts → Manage Keys. Then purge from git history with BFG Repo Cleaner:

```bash
# Install BFG
brew install bfg

# Remove files from history (run from repo root)
bfg --delete-files 'service-account*.json' --no-blob-protection
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force-with-lease
```

#### 4.2 E2E Test Accounts in Production Firebase

Four test accounts exist in the production Firebase Auth tenant:

- `test-guest-a@rats-e2e.com`
- `test-guest-b@rats-e2e.com`
- `test-admin-a@rats-e2e.com`
- `test-admin-b@rats-e2e.com`

**Action:** Delete from Firebase Console → Authentication → Users. Also delete test house documents `e2e-test-house-001` and `e2e-test-house-002` from Firestore.

#### 4.3 E2E Test Infrastructure (prevent recurrence)

- [ ] Configure Detox to use Firebase Emulator Suite exclusively (already in `src/config/firebase-emulator.ts` — verify Detox configuration points there)
- [ ] Add CI check: `firebase auth:export` from prod and fail if any `@rats-e2e.com` emails found

---

### Domain 5 — Agentic AI Opportunities (Post-launch roadmap)

These are revenue-generating features that can differentiate Regroup from generic property management software in the recovery space.

#### 5.1 Near-Term (3-6 months post-launch)

**AI Meeting Attendance Verifier**

- Guest submits meeting attendance by photo of sign-in sheet or meeting slip
- Claude vision model extracts meeting name, date, GSO number
- Validates against known meeting database (AA GSO scrape or user-submitted)
- Auto-logs verified meeting to activity record
- Value: reduces admin verification burden, prevents fraudulent logs
- Implementation: Cloud Function → `anthropic.messages.create` with vision, `haiku-4-5` model for cost efficiency

**Smart Chore Rotation Generator**

- Admin defines chores and frequency; AI generates fair weekly rotation
- Considers guest check-in date (new residents get lighter load), house size, chore complexity
- Integrates with activity logging for completion tracking
- Implementation: one-shot prompt with house roster, simple rule-based output validation

**Payment Dispute Summarizer**

- When guest disputes a charge, AI summarizes the dispute thread and relevant payment history
- Drafts admin response template
- Reduces admin time on disputes from ~30 min to ~5 min
- Implementation: Claude Sonnet 4.6 with conversation history + payment records as context

#### 5.2 Medium-Term (6-12 months)

**Resident Risk Scoring (opt-in)**

- Analyze activity patterns (meeting attendance drops, chore non-completion, late payments) to surface early relapse risk signals
- Admin sees aggregated risk signal, NOT raw data — preserves guest dignity
- Requires explicit guest consent and HIPAA legal review before implementation
- High sensitivity — implement with ethics review

**AI House Manager Assistant**

- Admin natural-language interface: "Show me who hasn't paid this month" → query + formatted response
- "Draft a house meeting agenda for Thursday" → structured agenda based on pending votes, EES updates
- Implementation: tool-use Claude agent with Firestore read-only tools

**Oxford Business Meeting Summarizer**

- After business meeting, AI generates structured minutes from officer reports
- Tags action items, assigns follow-up owners
- Exports to PDF for house records

#### 5.3 Infrastructure Required for AI Features

- [ ] **Anthropic API key** in Firebase Secret Manager (not in `.env` files)
- [ ] **AI Cloud Function template** — rate limiting (max 10 calls/house/day for pilot), cost tracking per house, graceful degradation when quota exceeded
- [ ] **Consent framework** — Guest opt-in for any AI analysis of their personal data; admin opt-in for AI features that cost money
- [ ] **AI feature flags** — Per-house toggle in Firestore so pilots can be enabled selectively

---

## Audit Execution Plan

### Phase 1 — Blockers Only (Week 1, target: testflight build)

1. Manual security actions (Domain 4) — 2 hours human time
2. Privacy policy + Terms of Service draft — 4 hours (use lawyer template)
3. Stripe subscription products created — 2 hours
4. `subscriptionStatus` field + Firestore rules enforcement — 1 day engineering
5. App Store Connect account setup + metadata draft — 3 hours

### Phase 2 — Store Submission (Week 2)

1. App Store screenshots (6.7", 5.5") — 2 hours (use simulator)
2. Play Store Data Safety form — 1 hour
3. App Review notes + test account for reviewers — 1 hour
4. IDFA disclosure decision — 30 min
5. TestFlight beta with 5 pilot houses — ongoing

### Phase 3 — Monetization Live (Week 3-4)

1. Admin subscription management screen
2. Trial period + grace period logic
3. IAP vs direct Stripe decision
4. Billing webhook Cloud Function updates `subscriptionStatus`

### Phase 4 — AI Foundation (Month 2)

1. Anthropic API key in Secret Manager
2. AI Cloud Function template with rate limiting
3. Pilot: Meeting Attendance Verifier (lowest risk, highest admin value)

---

## Success Metrics

| Metric                  | Target                | Measurement                 |
| ----------------------- | --------------------- | --------------------------- |
| App Store approval      | First submission      | Binary                      |
| Pilot house onboarding  | 5 houses in week 1    | Firebase Analytics          |
| Payment processing      | $0 in errors/month 1  | Stripe Dashboard            |
| Subscription conversion | 80% trial → paid      | Stripe MRR                  |
| Admin NPS               | >50                   | In-app survey after 30 days |
| AI feature adoption     | >60% of Oxford houses | Feature flag analytics      |

---

## Open Questions

1. **HIPAA decision** — Does sober living management constitute covered entity activity? Needs legal opinion before collecting structured health data (substance history, medication).
2. **IAP vs web billing** — Apple will reject a subscription-gated app that doesn't offer IAP. Either implement StoreKit 2 alongside Stripe, or require web signup before app use.
3. **Oxford House Inc. partnership** — If pursuing OHI endorsement, their national office may require specific data handling agreements and feature parity with their existing tools.
4. **Multi-tenancy billing** — Current data model is per-house. Network-tier pricing requires org-level entity (one admin managing multiple houses under one subscription).
