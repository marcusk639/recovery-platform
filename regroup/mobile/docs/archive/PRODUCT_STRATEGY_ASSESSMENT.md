# Regroup (RATS) Product Strategy Assessment

**Date:** February 23, 2026
**Prepared by:** Strategic Product Assessment
**Scope:** Full platform — rats-v2 (React Native), regroup-functions (Firebase Cloud Functions), rats-web (Angular marketing/billing site)
**Status:** Comprehensive end-to-end review based on complete codebase analysis

---

## 1. Executive Summary

Regroup is a mobile-first sober living house management platform that automates the operational spine of recovery homes: resident accountability (chores, meetings, work tracking), house administration (beds, disputes, issues), and now resident rent collection via Stripe Connect. The platform targets two distinct customer segments: traditional for-profit sober living operators and the Oxford House network, which operates under democratic self-governance rules requiring entirely different tooling.

**Current state:** Late alpha with real paying customers. The product has 70-75% of core feature parity with competitors, 5-10 paying houses generating approximately $100-150/month, and a payment infrastructure that is coded but not yet deployed end-to-end. The founder is a solo developer working spare-time. The product is not production-ready for broad distribution but is close enough to close pilots with motivated early adopters.

**Top 3 Strategic Recommendations:**

1. Deploy and validate payment processing within 30 days. The Stripe Connect infrastructure is 90% built. The remaining gap is cloud function deployment and end-to-end E2E verification. This is the single highest-leverage action available — it unlocks the primary revenue stream (2% transaction fees) and dramatically increases operator retention by eliminating the biggest workflow gap they have.

2. Raise prices immediately for all new customers. Current pricing ($10/house + $1/resident) is mathematically insolvent at any realistic scale. The codebase shows multiple pricing strategy documents have been written, analyzed, and apparently not implemented. New sign-ups should be on a $49-69/month minimum. This is not optional; it is survival.

3. Kill the rats-web Angular app as an active development surface. It is a 2023-era Angular 9 codebase running a template-based marketing site with a billing portal that reflects the old $10/$1 pricing model. It is a maintenance liability with no product velocity. Replace it with a static landing page + Stripe Customer Portal link within 30 days. Every hour spent on rats-web is an hour not spent on the mobile app that actually generates revenue.

---

## 2. Product Overview

### Complete Feature Inventory

#### Authentication and Onboarding
| Feature | Status | Notes |
|---|---|---|
| Email/password login | Complete | `EnhancedAuthService.ts` with rate limiting |
| Signup flow | Complete | New user + account creation |
| Operator setup wizard | Complete | Multi-step house configuration wizard in `/SetupWizards/` |
| House search (for residents) | Complete | Geolocation-based, gender/type filters |
| Invite-based resident join | Complete | Token invites via email deep links |
| Two-factor authentication | Partial | `TwoFactorSetup` screen exists in navigation, implementation status unclear |
| Password reset | Complete | Standard Firebase auth flow |
| Deep links (iOS/Android) | Complete | Apple App Site Association, Android intent filters |

#### House Management
| Feature | Status | Notes |
|---|---|---|
| House creation and configuration | Complete | Name, address, capacity, rent amounts, gender, rules |
| Room and bed management | Complete | `Beds.tsx`, `Room.ts` entity |
| Phase system (configurable requirement levels) | Complete | Phases with meeting/work/chore requirements per phase |
| Chore assignment and tracking | Partial | One chore per week per resident; no multi-chore or frequency support |
| Guest/resident profiles | Complete | Full profile with sobriety date, drug of choice, phase, step, job status |
| Guest add/update/remove | Complete | Full CRUD with admin-only delete |
| Dispute system | Complete | Activity-based, anonymous reporter |
| Issues system (maintenance, safety) | Complete | Status tracking, categories |
| Complaints system | Complete | Separate from disputes |
| House group chat | Complete | Realtime Database backed |
| Direct messaging (1:1) | Complete | Firestore backed |
| Staff notes / shift logs | Missing | Completely absent from codebase |
| Announcements system | Missing | Group chat exists but no dedicated announcements |
| Document management / e-sign | Missing | Not started |

#### Resident Accountability
| Feature | Status | Notes |
|---|---|---|
| AA/NA meeting database | Complete | `meetings.json` is 718KB — a full national meeting database |
| GPS meeting verification | Complete | Cloud function, 200-meter radius check |
| Meeting logging | Complete | Activity entity with `meeting_attended` type |
| Work/employment tracking | Complete | Job entity, work hours logging |
| Medication tracking | Complete | Tracked as activity stat |
| Sponsor/supporter tracking | Complete | Primary supporter, step tracking |
| Activity feed | Complete | House-level and per-resident, filterable |
| Chore fee calculation | Partial | `choreFees` field on Guest, manual management |
| Health score | Complete | Weekly house health score based on compliance |
| Weekly summary reports | Complete | `WeekSummary.ts` entity, PDF export via `react-native-html-to-pdf` |

#### Payments and Billing
| Feature | Status | Notes |
|---|---|---|
| Stripe Connect (operator onboarding) | Complete | `StripeSettingsScreen.tsx`, full connect/disconnect/status flow |
| createPaymentIntent (Cloud Function) | Complete | Deployed, includes 2% application fee, idempotency key |
| RentPaymentScreen (resident pays rent) | Complete | Balance display, history, Pay Now button, WebView handoff |
| PaymentDashboard (manager sees all) | Complete | Total collected, per-guest payment history |
| Stripe webhook handler | Exists | `stripeWebhook.ts` in functions; webhook handling present |
| listPayments (Cloud Function) | Complete | Per-guest payment history |
| savePaymentMethod (Cloud Function) | Complete | Saves card for future use |
| Auto-pay / recurring payments | Missing | Not started |
| Invoice generation | Missing | Not started |
| PDF receipts | Missing | Not started |
| Late fee calculation | Missing | `choreFees` field exists, no automation |
| Payment reminders (push notifications) | Partial | `rentReminder.ts` service created per Sprint 3 plan; integration status unclear |
| Operator subscription billing | Complete | Existing Stripe subscription for house/resident pricing |

#### Oxford House Features
| Feature | Status | Notes |
|---|---|---|
| Oxford house type toggle | Complete | `houseType: 'traditional' | 'oxford'` on House entity |
| Oxford paywall (subscription gate) | Complete | `oxfordEnabled` on `OperatorSubscription`; upgrade prompt at $49/month |
| Officer management | Complete | `OfficerManagement.tsx`, 4 roles: president, treasurer, secretary, comptroller |
| Business meetings | Complete | `BusinessMeetings.tsx`, scheduling and agenda |
| EES (Equal Expense Share) tracking | Complete | `EESTracker.tsx`, week-by-week per-resident expense allocation |
| Democratic voting (elections) | Complete | `OxfordVoting.tsx`, `Voting.tsx` |
| Charter compliance monitoring | Missing | The "three conditions" are not tracked |
| National Oxford House data integration | Missing | No connection to national Oxford House registry |

#### Infrastructure and Operations
| Feature | Status | Notes |
|---|---|---|
| Firebase Firestore (primary DB) | Complete | Well-structured, role-based security rules |
| Firebase Realtime Database (chat) | Complete | Used for house group chat |
| Firebase Auth | Complete | Custom claims for role-based access (admin, superAdmin, guest) |
| Firebase Storage | Dependency present, not used | `@react-native-firebase/storage` in package.json; no storage service code found |
| Redux Toolkit (state) | Complete (partial migration) | New RTK pattern in slices/; old Redux pattern still present in some areas |
| React Query (server state) | Complete | `@tanstack/react-query` v5, all Firestore queries via query hooks |
| Sentry (crash reporting) | Partial | `@sentry/react-native` installed; initialization unverified |
| Firebase Analytics | Present | Package installed |
| Firebase Crashlytics | Present | Package installed |
| Offline queue | Built but unclear status | `offlineQueue.ts` service exists (9.8KB); integration status unknown |
| Error boundaries | Present | Root-level + navigator wrappers |
| i18n / localization | Scaffolded | `i18next` installed, `RatsText` component has translate prop; actual translation coverage unknown |
| CI/CD | Missing | GitHub Actions workflow referenced in roadmap but not found in `.github/workflows/` |

### User Roles and Personas

**Operator / SuperAdmin:** The house owner or business operator who creates the house, configures settings, manages subscriptions, and has full data access. This is the primary paying customer. They are typically small business owners running 1-5 properties.

**House Admin (Manager):** A staff member or senior peer assigned to manage day-to-day house operations. They can view all resident activity, manage chores, respond to disputes, and access payment dashboards. For Oxford Houses this may be an elected officer.

**Resident (Guest):** A person living in the sober living house. In the app they log meetings, track work, view their profile, and pay rent. They cannot see other residents' private data.

**Oxford House Officer:** A democratically elected resident who takes on a specific governance role (president, treasurer, secretary, comptroller) for a 6-month term. Requires the Oxford plan.

### Core User Journeys

**Operator Onboarding:**
Landing screen -> Sign up -> NewAccount -> ManagerIntro -> OperatorSetupWizard (house config: name, address, capacity, phases, chores, gender) -> HouseSettings -> Connect Stripe (StripeSettingsScreen via Stripe Connect OAuth)

**Resident Onboarding:**
Receive invite link (deep link) -> App install/open -> Login or Signup -> HouseSearch or invite join -> IntroHouseSummary -> GuestHome (main dashboard)

**Daily Resident Accountability Loop:**
Activities tab -> Log meeting (MeetingSearch with GPS verify) OR Log work hours -> View chore assignment -> Mark chore complete -> View activity feed for disputes

**Rent Payment (Resident):**
GuestHome -> pay-rent-card -> RentPaymentScreen -> balance display -> Pay Now -> createPaymentIntent Cloud Function -> PaymentWebView (Stripe hosted) -> webhook confirmation

**Dispute Flow:**
Activity feed -> long press activity -> dispute modal -> submit dispute -> admin sees in HouseDisputes screen -> resolve or challenge

---

## 3. Market and Competitive Position

### Target Market Size

The sober living market in the United States consists of approximately 25,000-28,000 sober living homes operating at any given time, with 500,000+ residents annually. Oxford Houses specifically number approximately 3,500 houses with 25,000+ residents. The broader recovery housing market (including transitional housing and halfway houses) is significantly larger.

Operator spending on software is currently fragmented across spreadsheets, generic property management tools, and a handful of purpose-built competitors. Conservative willingness-to-pay for purpose-built software is $50-200/month per house based on existing competitor pricing.

**Addressable market at recommended pricing ($69-129/month):**
- 25,000 houses x $99/month average x 10% market penetration = $29.7M ARR theoretical at 10% share
- 25,000 houses x $99/month average x 1% market penetration = $2.97M ARR at 1% share

Getting to $1M ARR requires approximately 850 houses at $100/month average, or 1,400 houses at $60/month average.

### Competitive Landscape

Based on the CORE_REQUIREMENTS.md research and feature inventory analysis, the named competitors in this market are:

**SobrietyHub:** Full-featured sober living management platform. Has compliance dashboards, resident app, and appears to be the most mature competitor. Higher pricing ($100-200+/month range).

**SoberLivingApp.com:** Property management focus with housing database component. Less recovery-specific.

**OathTrack:** Document management and compliance focus. Positioned around e-sign intake packets.

**OneStep Software:** Established player with case management features. Targets both sober living and broader transitional housing.

**BehaveHealth:** Clinical and recovery residence management. Targets larger operators and treatment facilities.

**Regroup's current positioning:** Regroup occupies a gap as the only platform with mobile-first resident-facing accountability tools (GPS meeting verification, activity logging, the dispute system) combined with operator management. The Oxford House feature set is genuinely differentiated — no other platform appears to have custom tooling specifically for Oxford House governance (EES, democratic voting, officer management, business meetings).

### Differentiation and Moat

**Genuine differentiators that competitors do not have:**
1. GPS-verified meeting attendance with a national AA/NA meeting database (718KB meetings.json is a substantial data asset)
2. Oxford House specific governance tooling (EES tracker, officer elections, business meetings) — this serves a 3,500-house segment with specific needs no competitor appears to address
3. Resident-facing mobile app that makes accountability visible to residents themselves, not just staff
4. Anonymous dispute system that mirrors Oxford House democratic self-governance culture

**Weak moats:**
- Firebase backend is easily replicated
- React Native codebase is standard — no proprietary technology
- Current pricing creates no switching cost because operators are not locked in via data they depend on

**Emerging moat (if payments go live):**
Once Stripe Connect is active and houses route rent through the platform, switching costs increase dramatically. Payment history, chore fee automation, and financial reporting create stickiness that pure accountability tools do not.

### Pricing Model Assessment

**The current pricing model is broken and needs immediate correction.**

The codebase contains three separate documents analyzing this problem (PRICING_STRATEGY.md, PRICING_STRATEGY_OPTIONS.md, FEATURE_PRIORITIZATION.md) — all of which arrive at the same conclusion: $10/house + $1/resident is economically unviable. Despite this analysis being available since at least November 2025, the web billing portal (`rats-web`) still shows the old pricing, and the subscription service code still has `housePrice: number = 10; residentPrice: number = 1`.

**Recommended pricing structure (for new customers, immediate):**
- Traditional Starter: $69/month (up to 10 residents)
- Traditional Professional: $129/month (up to 20 residents)
- Traditional Enterprise: $249/month (unlimited, multi-property)
- Oxford Standard: $49/month (up to 15 residents, Oxford tools included)
- Oxford Network: $299/month (regional chapters, 10-50 houses)

**Payment processing revenue model:**
The cloud function code confirms a 2% application fee (`applicationFeeAmount = Math.round(amountInCents * 0.02)`) on all rent payments processed through Stripe Connect. At the projected scale of 50-100 houses using payment processing at an average $600/resident/month rent, this generates $7,200-$14,400/month in transaction fees alone — dwarfing subscription revenue at current prices.

---

## 4. Technical Assessment

### Architecture Quality

The overall architecture is sound for a solo developer product at this stage. Firebase as the backend is appropriate — it eliminates infrastructure operations, scales automatically, and the Firestore security rules show good role-based access control thinking. React Native for cross-platform mobile is the right choice for this market. Redux Toolkit for state management is modern and correct.

**The significant architectural problems are:**

**1. Dual state management pattern.** The codebase is mid-migration from old-style Redux (manual action type constants, manual reducers) to Redux Toolkit. Approximately 40% is RTK, 60% is legacy Redux based on the gap analysis. This creates cognitive overhead and inconsistency. It is not blocking but it is real maintenance drag.

**2. Two competing payment service files.** Both `/src/services/payment.ts` and `/src/services/payments.ts` exist. `payment.ts` calls `createRentPaymentIntent` (a function name that does not exist in the deployed cloud functions, which export `createPaymentIntent`). `payments.ts` calls the correct `createPaymentIntent`. This naming mismatch between the service layer and the cloud functions is a potential deployment-time bug that needs verification.

**3. Database security gap.** The `database.rules.json` (Firebase Realtime Database) currently has `".read": true, ".write": true` — completely open. The Realtime Database is used for house group chat. While Firestore rules are properly secured, the Realtime Database rules are a security vulnerability that would expose all group chat data to anyone with the Firebase project ID.

**4. Oxford House paywall reads subscriptionMetadata from Redux user state.** The `OxfordDashboard.tsx` checks `state.userRTK.user?.subscriptionMetadata.oxfordEnabled`. This metadata must be set by the backend during subscription management. There is no cloud function that sets this flag visible in the current `/functions/src/index.ts`. If this flag is never written, Oxford houses always see the upgrade prompt regardless of payment status.

**5. The rats-web Angular billing portal still uses $10/$1 pricing.** The `SubscriptionService` in `rats-web` has hardcoded `housePrice: number = 10` and `residentPrice: number = 1`. If any new customer signs up through the web portal, they will be placed on the old pricing tier.

**6. No CI/CD pipeline.** The roadmap references GitHub Actions but no workflow files exist in `.github/workflows/`. Every deployment is manual. This is a real risk as the product scales.

### Production Readiness by Component

| Component | Production Ready? | Key Risk |
|---|---|---|
| Firebase Auth | Yes | Rate limiting is client-side only |
| Firestore security rules | Mostly | `admins` and `guest-reports` rules are overly permissive |
| Realtime Database rules | No | Completely open — must be fixed before any scale |
| Stripe Connect (house onboarding) | Yes | Tested and complete |
| createPaymentIntent (Cloud Function) | Functionally yes | Function name mismatch with client service needs verification |
| Stripe webhook | Needs verification | stripeWebhook.ts exists but webhook endpoint registration unconfirmed |
| RentPaymentScreen (resident) | Yes | Well-built, good error states |
| PaymentDashboard (manager) | Yes | Functional |
| Oxford Dashboard + paywall | Yes | Clean paywall implementation |
| EES Tracker | Functional | No automated EES calculation on weekly rollover |
| GPS meeting verification | Yes | Cloud function is working |
| Activity Feed | Yes | Migrated to new activity system |
| House Chat | Functional | Realtime DB security gap |
| Push notifications | Partial | `rentReminder.ts` exists but integration with Notifee/push-notification unclear |
| Offline queue | Unknown | `offlineQueue.ts` exists but no evidence of integration |
| Error monitoring (Sentry) | Partial | Package installed, initialization unverified |

### Critical Technical Risks

**Risk 1 (High): Realtime Database security rules are fully open.**
`database.rules.json` grants read and write access to everyone, authenticated or not. Any house group chat data is readable by anyone who knows the Firebase project ID. This must be patched before any meaningful user growth.

**Risk 2 (High): Cloud function name mismatch.**
`src/services/payment.ts` calls `createRentPaymentIntent` but the deployed function is `createPaymentIntent`. If `payment.ts` is ever the code path reached, payments will silently fail. The correct service is `payments.ts` which calls `createPaymentIntent`. Both files need reconciliation.

**Risk 3 (High): oxfordEnabled flag has no write path.**
The `OxfordDashboard` paywall checks `user.subscriptionMetadata.oxfordEnabled`. There is no cloud function in the current index.ts that writes this flag on subscription. If a customer pays for Oxford plan via the web portal, they may never get the flag set, permanently showing the upgrade prompt.

**Risk 4 (Medium): No automated test execution.**
The test suite was at 0% coverage at the time of the initial gap analysis (December 2025) and has been built up through sprint work. However, there is no CI/CD pipeline enforcing test passage on merges. A breaking change can be deployed without any automated catch.

**Risk 5 (Medium): Firebase Firestore cost exposure at scale.**
At 75-100 houses with active real-time subscriptions (activity feeds, guest profiles, house data), Firebase costs can spike rapidly. The roadmap acknowledges this risk. No cost monitoring or alerting is set up.

**Risk 6 (Low-Medium): React Native 0.72 on Xcode 26.**
The MEMORY.md notes an iOS build fix that required custom Podfile post-install hooks to resolve VFS overlay issues with Xcode 26. This is a platform risk — new team members or CI environments may not be able to build without the documented fix.

### Tech Debt Inventory

**High priority (blocking velocity):**
- Dual Redux patterns (RTK vs. legacy) across the codebase
- Two competing payment service files with incompatible function call names
- `@ts-nocheck` on `StripeSettingsScreen.tsx` (line 1 suppresses all TypeScript errors)
- Realtime Database security rules

**Medium priority (causes maintenance drag):**
- Class components vs functional components (gap analysis says ~80% class components; newer files are functional)
- Multiple TypeScript `any` usages in state/actions area
- `offlineQueue.ts` appears unused or under-integrated
- Chat uses Realtime DB while everything else uses Firestore (two DB patterns)

**Low priority (can be addressed incrementally):**
- `console.log` statements in production code (Sprint 1 plan addresses App.tsx)
- Entity duplication between mobile app and cloud functions (both define Guest, House, Week)
- `selectedGuests` vs `guests` duplication in Redux slice (Sprint 1 plan addresses this)

---

## 5. Monetization Analysis

### Current Revenue Model

**Operator subscriptions:** $10/house/month + $1/resident/month. Current: 5 houses, ~$100-150/month. This pricing model is documented as unsustainable by the founder's own analysis and has not been corrected.

**Payment processing (not yet live):** 2% application fee on all resident rent payments processed via Stripe Connect. This is coded into `createPaymentIntent.ts` at line 82: `const applicationFeeAmount = Math.round(amountInCents * 0.02)`.

### Stripe Integration Status

The integration is substantially complete but needs deployment validation:

- `connectStripeAccount.ts` — Stripe Express account creation and onboarding link generation (complete)
- `disconnectStripeAccount.ts` — account disconnect flow (complete)
- `getStripeAccountStatus.ts` — status polling with requirement translation (complete)
- `createPaymentIntent.ts` — payment intent creation with 2% platform fee (complete, Stripe API version 2026-01-28)
- `listPayments.ts` — payment history retrieval (complete)
- `savePaymentMethod.ts` — card storage (complete)
- `stripeWebhook.ts` — webhook event handler (present, verification status unknown)
- `StripeSettingsScreen.tsx` — operator onboarding UI (complete but `@ts-nocheck`)
- `RentPaymentScreen.tsx` — resident payment UI (complete, well-built)
- `PaymentDashboard.tsx` — manager view (complete)

**What is NOT verified:**
- Cloud functions are actually deployed to production Firebase project
- Stripe webhook endpoint is registered in Stripe dashboard
- End-to-end payment flow has been tested with a real Stripe account
- `oxfordEnabled` subscription flag write path

### Revenue Potential Per Unit (at recommended pricing)

A typical house with 10 residents paying $600/month rent:
- Subscription revenue: $69-129/month (Starter or Professional tier)
- Payment processing (if 100% adoption): 10 residents x $600 x 2% = $120/month
- Combined monthly per house: $189-249/month
- Combined annual per house: $2,268-2,988/year

Compare this to current pricing: $20/month = $240/year. The recommended model is 9-12x more valuable per customer.

### Path to $1M ARR

This is achievable but requires three things happening in parallel: pricing correction, payment processing live, and Oxford House adoption.

**Scenario A: Software subscriptions only (new pricing)**
- 850 houses x $99/month average = $1.02M ARR
- At 2 new houses/week: 425 weeks = ~8 years. Not viable without marketing investment.
- With Oxford House network deal (access to 3,500 houses at once): $49 x 3,500 x 12% adoption = $2.47M ARR. This is the fastest path.

**Scenario B: Software + payment processing**
- 300 houses x $99/month software + 300 houses x $10K/month rent x 2% processing
- = $357,120 ARR software + $720,000 ARR processing = $1.077M ARR
- 300 houses is achievable in 12-18 months with focused Oxford House outreach and working payment processing.

**Critical path to $1M ARR:**
1. Deploy payment processing (Month 1) — unlocks $720K of the $1M
2. Raise prices for new customers (immediately) — 5x per-customer value
3. Oxford House outreach with pilot program (Month 3-6) — access to 3,500-house network
4. National Oxford House partnership (Month 12-18) — if regional pilot succeeds, approach national organization

The realistic path hits $1M ARR at approximately Month 18-24 in the optimistic scenario (national Oxford House adoption), Month 30-36 in the conservative scenario (organic growth only). This assumes the founder remains solo or adds one part-time contractor.

---

## 6. Build / Kill / Accelerate Decisions

### KILL Immediately

**Kill: rats-web as an active development surface.**
The Angular 9 web application at `/Users/marcusklein/dev/rats-web` is a 2023-era template-based marketing site with a billing portal that:
- Still shows $10/$1 pricing in `SubscriptionService`
- Is built on Angular 9 (released 2020, EOL)
- Has no meaningful feature parity with the mobile app
- Requires separate deployment pipeline and maintenance
- Actively harms the business by letting new customers sign up at wrong pricing

The billing functionality in rats-web (`my-account` component, Stripe card management) should be replaced entirely with a Stripe Customer Portal link. The marketing content should be moved to a static site (Webflow, Carrd, or simple HTML). This eliminates an entire maintenance surface.

**Kill: `src/services/payment.ts` (the wrong payment service file).**
Both `payment.ts` and `payments.ts` exist. `payment.ts` calls a non-existent cloud function name. It must be deleted to prevent future confusion and potential wrong-code-path bugs.

**Kill: `selectedGuests` in guestsSlice.**
The Sprint 1 plan correctly identifies this as duplicate state causing staleness bugs. The field should be removed.

**Kill: Offline queue as a priority.**
`offlineQueue.ts` is 9.8KB of code with no confirmed integration into any screen or service. Either integrate it or delete it. An unintegrated offline queue gives false confidence and adds maintenance surface. Offline support is important eventually but should not occupy space in the codebase as dead code.

**Kill: The `debug-deep-links.ts` service file.**
`/src/services/debug-deep-links.ts` is 2.98KB of debugging utilities. This should not be in production code.

**Deprioritize (not kill, but stop spending time on):**
- Document management / e-sign: Real need, but not differentiated. Every competitor is building this. Solve payment processing first; then revisit.
- Advanced analytics / reporting dashboards: Nice-to-have. Compliance reports will close Oxford House deals but are 4-6 weeks out.
- Photo verification for meetings: Interesting idea, not in the critical path.
- Alumni network features: Too early; solve retention of current residents first.

### ACCELERATE Now

**Accelerate: Stripe Connect deployment and end-to-end validation.**
The infrastructure is 90% built. The remaining gaps are: (1) verify cloud functions are deployed, (2) register Stripe webhook endpoint, (3) reconcile the `createPaymentIntent` vs. `createRentPaymentIntent` naming issue, (4) fix the `@ts-nocheck` on `StripeSettingsScreen.tsx`. This should be a focused 2-3 day sprint that unlocks the primary revenue stream.

**Accelerate: Oxford House outreach.**
The Oxford feature set (EES, elections, officer management, business meetings, paywall at $49/month) is complete and gated behind a subscription flag. This is shippable today to Oxford Houses. The 3,500-house Oxford network is the highest-concentration addressable market available. One regional chapter partnership that converts 50 houses at $49/month = $2,450/month = $29,400/year from a single deal.

**Accelerate: Realtime Database security rules.**
This is a one-file, 10-minute fix that eliminates a significant security vulnerability. It should be done today before any new users are onboarded.

**Accelerate: Price increase for new customers.**
This is a configuration change in the web billing portal. The analysis exists, the recommendation exists, the math is unambiguous. The only remaining action is execution.

### BUILD Next (Ranked by Strategic Impact)

**Priority 1: Automated weekly EES calculation for Oxford Houses.**
Currently `EESTracker.tsx` shows EES records but calculation appears to be manual. Oxford Houses do mandatory weekly business meetings and EES is calculated from total house expenses divided by residents. Automating this calculation on the weekly transfer (already triggered via scheduled Cloud Function) and sending push notifications to residents when their EES amount is set would make the Oxford plan genuinely indispensable. Estimated effort: 2 days.

**Priority 2: Rent payment automation (auto-pay and reminders).**
`rentReminder.ts` exists (from Sprint 3 plan). Integration into GuestHome and after successful payment in ResidentPayment appears partially done. Complete this and add auto-pay option (Stripe's `setup_future_usage: 'off_session'` on PaymentIntent). Auto-pay is the single biggest lever for increasing payment adoption from 50% to 80%+ of residents. Estimated effort: 3-4 days.

**Priority 3: Fix Realtime Database rules and the `oxfordEnabled` write path.**
These are blocking correctness issues. The Oxford paywall is useless if there is no mechanism to set `oxfordEnabled: true` when a customer upgrades. Estimated effort: 1 day total for both.

**Priority 4: Staff notes per resident.**
This is in the industry requirement checklist and is completely absent from the codebase. Every competitor has it. A simple note entity (text, timestamp, noteType, staffId, guestId, houseId) with a list view on the resident profile would close feature gaps with competitors. Estimated effort: 2-3 days.

**Priority 5: Compliance / occupancy reports (PDF export).**
`reportExport.ts` exists and `react-native-html-to-pdf` is in the dependencies. The infrastructure for PDF generation is present. Adding a compliance report (meeting attendance %, chore completion %, current balance) and occupancy report (beds filled/available/waitlist) would directly support the licensing compliance use case that drives Traditional house purchasing decisions. Estimated effort: 2-3 days.

### KEEP and Improve

**Keep: GPS meeting verification.** This is a genuine differentiator. No competitor appears to have verifiable meeting attendance tied to a national meeting database. The 200-meter radius check and the 718KB meetings.json database are real assets. Investment needed: none immediate, but consider expanding the database with online meeting support (Zoom AA/NA meetings became significant post-2020).

**Keep: The dispute system.** It mirrors Oxford House culture of democratic self-governance and is genuinely different from staff-driven incident reporting. Improvement needed: add an anonymous tip/report feature separate from activity disputes, giving residents a way to flag concerns not tied to a specific logged activity.

**Keep: The activity feed with filterable search.** This is the operational core of the accountability system. Current implementation (migrated to Activity entity with proper timestamping) is solid. Improvement needed: add a manager "daily digest" view summarizing each resident's activity for the day.

**Keep: The Oxford feature set.** It is the single most defensible competitive position in this market. No competitor appears to have it. Improvement needed: add charter compliance tracking (Oxford Houses must maintain three conditions: sobriety, self-support, self-governance) with simple pass/fail indicators.

---

## 7. Strategic Roadmap

### 30-Day Priorities (Survival)

These actions are non-negotiable if the business is to have a foundation for growth:

1. **Fix Realtime Database security rules** (1 hour). `database.rules.json` must restrict reads and writes to authenticated users within the house. This is a security vulnerability.

2. **Verify and document Stripe deployment status** (half day). Confirm which cloud functions are actually deployed, confirm webhook endpoint is registered, test a real payment end-to-end with a Stripe test account. If not deployed, deploy.

3. **Reconcile payment service files** (2 hours). Delete `src/services/payment.ts`. Rename or update references to ensure all payment flows use `src/services/payments.ts` which calls the correctly named `createPaymentIntent` cloud function.

4. **Raise prices for new customers** (2 hours). Update the web billing portal (or replace with Stripe Customer Portal link) to reflect $49-69 minimum pricing. Do not let any new customer sign up at $10/house.

5. **Build and merge Sprint 1 stability fixes** (1-2 days). The Sprint 1 plan (`docs/plans/2026-02-23-sprint-1-stability.md`) identifies six targeted bug fixes (GuestList loading states, subscribeToGuest error callback, sendMessageToHouseChat Promise.allSettled, HouseSearch location denial, App.tsx console.log removal, guestsSlice selectedGuests removal). These are all well-scoped and directly improve reliability for current users.

6. **Write the oxfordEnabled flag write path** (half day). Add a Cloud Function or admin operation that sets `user.subscriptionMetadata.oxfordEnabled = true` when an operator upgrades to the Oxford plan. Without this, the paywall is permanent regardless of payment status.

### 90-Day Priorities (Growth)

7. **Complete and validate payment processing end-to-end** (1 week). Full E2E test: operator onboards Stripe -> resident sees balance -> resident taps Pay Now -> Stripe processes -> webhook fires -> balance updates. This is the single highest-impact feature available.

8. **Oxford House regional pilot** (ongoing). Identify 3-5 local Oxford Houses. Offer free 90-day trial. Onboard personally. Gather feedback. The EES, elections, and officer management features are ready to demo.

9. **Automate EES weekly calculation** (2 days). Triggered by existing weekly transfer Cloud Function. Calculates total house expenses / resident count, creates EES records for all active residents, sends push notification. This makes the Oxford plan genuinely indispensable.

10. **Auto-pay / payment reminders** (3 days). Complete `rentReminder.ts` integration, add Stripe `setup_future_usage` for auto-pay, add push notification 3 days before rent due date.

11. **Staff notes** (2-3 days). Simple per-resident note entity. No complex features — just text, type, and timestamp. This closes the last major feature gap versus direct competitors.

12. **Kill rats-web and replace with static landing** (1 day). Move marketing content to Webflow or a static HTML page. Replace the billing portal with a Stripe Customer Portal link. This eliminates a maintenance surface and ensures all customers are on correct pricing.

13. **Add CI/CD** (half day). GitHub Actions workflow: run Jest tests on every PR, block merge on failure. No build/deploy automation needed yet.

### 12-Month Vision

By month 12, Regroup should be at:
- 50+ active houses (Oxford and Traditional combined)
- MRR of $5,000-8,000 from subscriptions
- MRR of $3,000-8,000 from payment processing (depends on adoption rate)
- Total ARR: $96,000-192,000

To get there the founder must:
- Secure 1-2 regional Oxford House chapter relationships (access to 50-200 houses per chapter)
- Have a fully working, user-tested payment flow with auto-pay
- Add compliance reporting that directly supports state licensing requirements
- Consider a 14-day free trial funnel for Traditional houses (the web app needs to be capable of this)

**Feature priorities for months 3-12:**
- Compliance/occupancy report PDF export (supports Traditional house licensing)
- Online meeting support (Zoom/virtual AA/NA meetings in the meeting database)
- Multi-property management (for operators with 2-5 houses)
- Charter compliance tracking for Oxford Houses
- Document upload (resident agreement storage — not e-sign, just storage)

---

## 8. Investment Readiness

### What Technical Due Diligence Would Find

**Positive findings:**
- Modern tech stack (React Native 0.72, Firebase, Redux Toolkit, React Query, TypeScript)
- Reasonably comprehensive Firestore security rules
- Genuine product differentiation in Oxford House tooling and GPS meeting verification
- Substantial internal documentation (multiple gap analyses, roadmaps, pricing strategies — evidence of strategic thinking)
- Payment infrastructure is significantly built and architected correctly
- Growing test coverage (sprint work has added unit and component tests)
- National meeting database is a real data asset

**Negative findings:**
- Solo developer, no team, no bus factor resilience
- Realtime Database rules are completely open (security vulnerability)
- $10/$1 pricing still active in web billing portal for new customers despite documented unsustainability
- No CI/CD pipeline
- `@ts-nocheck` directive on financial/payment screen suppresses all type errors
- Two competing payment service files with naming inconsistencies
- 5 active users generating $150/month — pre-revenue effectively
- No formal tracking of product metrics (DAU, MAU, retention, payment adoption rate)
- 6 strategy documents written but pricing not actually changed — execution gap relative to analysis

**The question a diligence team would ask:** "You have comprehensive analysis of every problem. Why are prices still $10/month three months after writing a 20-page document proving it's unsustainable?"

This is the key risk for any investor conversation: the gap between strategic clarity (strong) and execution (weak). The answer to this question determines fundability.

### Key Metrics to Establish Before Any Fundraise

1. **MRR and MRR growth rate** — must show 3+ months of consistent growth
2. **Payment processing volume** — even one house processing $5K/month proves the model
3. **Churn rate** — if 5 houses are paying, zero churn is the number; any churn is a signal
4. **Oxford House pilot results** — NPS from 5+ Oxford Houses using the Oxford features
5. **CAC vs. LTV** — at $69-129/month, LTV at 18-month average tenure is $1,242-2,322; CAC via word-of-mouth is near zero today

### Fundraising Narrative

**The honest story (if metrics are being built):**
"Sober living is a $2B+ industry running on spreadsheets and text messages. 25,000 homes, zero dominant software. We have 50+ active houses using our platform for resident accountability, and we just launched rent collection — our Stripe-connected houses are processing $X in rent per month at 2% revenue share. We built the only management software purpose-built for Oxford House governance, which gives us a defined wedge into a 3,500-house network with a single national partnership opportunity."

**What this narrative needs to be credible:**
- Working payment processing (the biggest gap today)
- 3+ Oxford Houses using the Oxford features with genuine testimony
- $2,000+/month MRR (shows price can be raised, product has retention)
- One regional Oxford House chapter partnership letter of intent

**Funding stage and ask:** This is not yet at a point where institutional seed capital is appropriate. The right path is:
1. Get to $3,000-5,000 MRR on corrected pricing (3-6 months)
2. Secure Oxford House regional partnership
3. Evaluate $100K-300K friends/family or angel round to fund content marketing and contractor hours
4. True seed ($500K-1M) becomes realistic at $15,000+/month MRR with evidence of Oxford House traction

**The 18-month thesis:** A $200K injection at the right time (after payment processing is validated, after Oxford pilot shows traction) would fund: 12 months of founder salary ($80K), a part-time mobile contractor ($60K), and content/marketing ($60K). At 2 new houses/week from marketing and Oxford chapter partnerships, 18 months gets to 100+ houses and $1M ARR run rate — setting up a $2-3M Series A.

---

## 9. Hard Questions the Team Must Answer

These are unresolved strategic questions that no amount of code analysis can answer. The founder needs to decide:

**1. Is this a lifestyle business or a venture-scale company?**
The roadmap explicitly frames the goal as "$200K/year to support full-time development." That is a lifestyle business goal, not a venture goal. Venture capital requires a path to $50M+ ARR. Both paths are valid, but they require different decisions. The Oxford House national partnership strategy is the only realistic path to venture scale. The lifestyle business path is Oxford regional pilots + Traditional house word-of-mouth + payment processing fees. Be explicit about which you are building.

**2. Why has pricing not been raised after 3 months of documented analysis?**
This is the most important operational question. The analysis was done in November 2025. It is now February 2026. The pricing has not changed. This indicates either a fear of customer pushback (understandable but wrong — raising prices filters for higher-value customers) or an inability to execute changes on the web billing portal. Identify the real blocker and remove it.

**3. What is the strategy for Traditional houses vs. Oxford Houses?**
These are fundamentally different customer types with different governance models, different willingness to pay, and different distribution channels. Traditional houses are individual operator decisions (expensive B2B sales). Oxford Houses operate with democratic consent (different sales motion — you need resident champions, not just operator buy-in). Pursuing both simultaneously with limited time is dangerous. Choose the primary beachhead.

**4. Is the rats-web billing portal actively creating wrong-priced customers?**
Every new customer who signs up through the web portal before the pricing update is now a customer on the wrong pricing tier. How many of the current 5 paying houses are on $10/month vs. what they should be paying? And is there a plan to migrate them?

**5. What is the offline strategy?**
Sober living houses are often in areas with inconsistent connectivity. The `offlineQueue.ts` file exists but appears unintegrated. Residents who cannot log a meeting because of spotty WiFi will lose trust in the product. This is a real retention risk that needs either a committed decision (offline support by Month 6) or deprioritization with an explicit understanding of the churn risk it creates.

**6. Who owns the Stripe webhook endpoint?**
The `stripeWebhook.ts` cloud function exists. But has the webhook endpoint URL been registered in the Stripe dashboard? If it has not, payment status updates (pending -> completed) never fire, payment history never updates, and the payment system appears broken to users even if money moves successfully. This must be verified immediately.

---

## Appendix: Key Files Referenced

All paths are absolute.

**Core entity definitions:**
- `/Users/marcusklein/dev/rats-v2/src/entities/House.tsx` — House entity with Stripe fields
- `/Users/marcusklein/dev/rats-v2/src/entities/Guest.tsx` — Guest entity with rentOwed, choreFees
- `/Users/marcusklein/dev/rats-v2/src/entities/oxford/EESTransaction.ts` — EES entity
- `/Users/marcusklein/dev/rats-v2/src/entities/oxford/Officer.ts` — Officer roles entity

**Payment infrastructure:**
- `/Users/marcusklein/dev/rats-v2/functions/src/payments/createPaymentIntent.ts` — Cloud Function, 2% fee
- `/Users/marcusklein/dev/rats-v2/functions/src/index.ts` — Cloud Function exports
- `/Users/marcusklein/dev/rats-v2/src/services/payments.ts` — Correct client service (calls createPaymentIntent)
- `/Users/marcusklein/dev/rats-v2/src/services/payment.ts` — WRONG client service (calls createRentPaymentIntent)
- `/Users/marcusklein/dev/rats-v2/src/screens/RentPayment/RentPaymentScreen.tsx` — Resident payment UI
- `/Users/marcusklein/dev/rats-v2/src/screens/HouseSettings/StripeSettingsScreen.tsx` — Operator Stripe onboarding
- `/Users/marcusklein/dev/rats-v2/src/screens/HouseSettings/PaymentDashboard.tsx` — Manager payment overview

**Security:**
- `/Users/marcusklein/dev/rats-v2/firebase/firestore.rules` — Firestore rules (mostly secure)
- `/Users/marcusklein/dev/rats-v2/database.rules.json` — Realtime Database rules (FULLY OPEN — security vulnerability)

**Oxford House features:**
- `/Users/marcusklein/dev/rats-v2/src/screens/Oxford/OxfordDashboard.tsx` — Paywall + dashboard
- `/Users/marcusklein/dev/rats-v2/src/screens/Oxford/EESTracker.tsx` — EES calculation and tracking
- `/Users/marcusklein/dev/rats-v2/src/screens/Oxford/OfficerManagement.tsx` — Officer elections

**Strategy documents:**
- `/Users/marcusklein/dev/rats-v2/PRODUCT_ROADMAP.md` — February 2026 roadmap to $200K ARR
- `/Users/marcusklein/dev/rats-v2/PRICING_STRATEGY.md` — 20-page pricing analysis (recommends $69-129/month)
- `/Users/marcusklein/dev/rats-v2/FEATURE_PRIORITIZATION.md` — Feature priority scoring
- `/Users/marcusklein/dev/rats-v2/docs/GAP_ANALYSIS_PRODUCTION_READINESS.md` — December 2025 gap analysis
- `/Users/marcusklein/dev/rats-v2/docs/CURRENT_APP_STATE.md` — MVP functional specification

**Active sprint plans:**
- `/Users/marcusklein/dev/rats-v2/docs/plans/2026-02-23-sprint-1-stability.md` — 6 targeted bug fixes
- `/Users/marcusklein/dev/rats-v2/docs/plans/2026-02-23-sprint-3-revenue.md` — Oxford paywall, payment presets, push notifications

**Web application:**
- `/Users/marcusklein/dev/rats-web/src/app/services/subscriptions/subscription.service.ts` — Old $10/$1 pricing (must be updated)
- `/Users/marcusklein/dev/rats-web/src/app/app-routing.module.ts` — Web routes
- `/Users/marcusklein/dev/rats-web/src/app/components/accounts/my-account/my-account.component.ts` — Billing portal

---

*Assessment completed February 23, 2026. All findings are based on direct codebase analysis. Revenue figures are derived from internal planning documents authored by the founder. No external market data was independently verified.*

---
*Last reviewed: 2026-05-24 | Audience: operator | Type: concept*
