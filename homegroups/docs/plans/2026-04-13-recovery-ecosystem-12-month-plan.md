# Recovery Ecosystem — 12-Month Implementation Plan

## Context

The Product & Market Intelligence Brief describes a three-product recovery ecosystem mapping to the ASAM Continuum of Care. No competitor connects treatment discharge → sober living → community recovery digitally. This plan sequences work across three existing/planned products to generate revenue as early as possible while building toward the ecosystem flywheel.

---

## Current State of the Three Products

### Product 1: 12-Step App (RecoveryConnect / "Homegroups")

- **Repo**: `/Users/marcusklein/dev/RecoveryConnect`
- **Stack**: React Native 0.72 (TypeScript), Firebase, Redux Toolkit, Stripe
- **Status**: Built (MVP→V4), pre-revenue. 108 screens, 81 Cloud Functions, 100K+ pre-seeded meetings
- **V4 features** (governance, analytics, enterprise): all hidden behind feature flags per bloat reduction plan
- **Pricing**: $12/year group subscription
- **Current focus**: Feature bloat reduction, privacy fixes, launch to 30 groups in 90 days

### Product 2: Sober Living App (rats-v2 / "Regroup")

- **Repo**: `/Users/marcusklein/dev/rats-v2`
- **Stack**: React Native 0.72 (TypeScript), Firebase, Redux Toolkit + React Query, Stripe, Sentry
- **Status**: Active development, 414 commits, 28 unpushed. 431 source files, 235 tests, 16 E2E tests
- **What's built**: Resident management, payments (Stripe), phases, chores, disputes, Oxford House governance (officers, voting, business meetings, EES), house search, chat, notifications
- **Cloud Functions**: In separate `regroup-functions` repo (not in rats-v2)
- **Pricing**: Currently $10/house + $1/resident; docs recommend raising to $49-129 range
- **Gap analysis vs intelligence brief**: ~50% Sprint 1, ~40% Sprint 2, ~20% Sprint 3 (see breakdown below)

### Product 3: Aftercare Management System

- **Status**: Not built — concept only in intelligence brief
- **Recommended stack**: Next.js, Node.js/TypeScript, PostgreSQL (Neon), GCP Cloud Run, FHIR R4
- **Compliance**: HIPAA, 42 CFR Part 2, SOC 2 Type II target

### Legacy: rats-web (Angular 9)

- **Repo**: `/Users/marcusklein/dev/rats-web`
- **Status**: Legacy operator web app, superseded by rats-v2 mobile app. Same Firebase project (`phoenix-cleanhouse`)
- **Action**: No further development. Keep deployed as marketing site if useful; operator features now in rats-v2

---

## rats-v2 Feature Gap Analysis

### Sprint 1 — Table Stakes

| #   | Feature                       | Status       | Key Files                                                           | What's Missing                                                                                          |
| --- | ----------------------------- | ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Resident intake & profiles    | PARTIAL      | `screens/CreateGuest/`, `entities/Guest.tsx`                        | Formal application workflow, waitlist, emergency contacts, insurance, referring center                  |
| 2   | Billing & rent collection     | BUILT (core) | `services/payments.ts`, `screens/Payments/`, `screens/RentPayment/` | Recurring invoices, prorated calc, ACH/cash, family portal, installment plans, reminders, auto-receipts |
| 3   | Outstanding balance dashboard | PARTIAL      | `screens/HouseSettings/PaymentDashboard.tsx`, `Guest.rentOwed`      | Per-resident balance view, house-wide summary, aging report                                             |
| 4   | Drug testing module           | MISSING      | —                                                                   | Entire feature: scheduling, logging, escalation                                                         |
| 5   | Resident mobile portal        | PARTIAL      | `screens/Profile/GuestHome.tsx`, payment screens                    | Maintenance requests, announcements, balance visibility                                                 |

### Sprint 2 — Competitive Parity

| #   | Feature                | Status  | Key Files                                                | What's Missing                                |
| --- | ---------------------- | ------- | -------------------------------------------------------- | --------------------------------------------- |
| 6   | Phase/program tracking | PARTIAL | `entities/Phase.tsx`, `screens/SetupWizards/PhaseSetup/` | Auto-advancement criteria, progress dashboard |
| 7   | Chore management       | PARTIAL | `entities/Chore.tsx`, chore overview screens             | Rotation system, photo verification           |
| 8   | Accountability scoring | PARTIAL | Health score refs in 4 files                             | Clear composite formula, dashboard            |
| 9   | Consequence workflows  | MISSING | —                                                        | Warning → probation → discharge automation    |
| 10  | Incident reporting     | PARTIAL | `entities/Issue.ts`, `entities/Complaint.ts`             | Escalation workflow, severity/priority        |
| 11  | Compliance reports     | PARTIAL | `services/reportExport.ts` (PDF)                         | NARR tracking, state checklists               |
| 12  | Multi-house dashboard  | PARTIAL | `screens/HousesOverview/`                                | Cross-portfolio analytics                     |

### Sprint 3 — Differentiation

| #   | Feature                          | Status  | Key Files                                                 | What's Missing                                                                         |
| --- | -------------------------------- | ------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 13  | Oxford House mode                | PARTIAL | `entities/oxford/`, `services/oxford/`, `screens/Oxford/` | Treasurer dashboard, comptroller approval, chapter roll-ups, EES calculator refinement |
| 14  | Directory & public listing       | MISSING | `screens/HouseSearch/` (internal only)                    | Public-facing directory, SEO, application pipeline                                     |
| 15  | Treatment center referral portal | MISSING | —                                                         | Entire feature                                                                         |
| 16  | 12-Step meeting integration      | PARTIAL | `screens/StatUpdates/MeetingSearch.tsx`                   | RecoveryConnect's 100K+ database integration                                           |
| 17  | Outcomes analytics dashboard     | MISSING | —                                                         | Occupancy, LOS, collection rate, phase completion, employment                          |

---

## Month-by-Month Plan

### Month 1 (April): RecoveryConnect Launch Prep + rats-v2 Stabilization

**RecoveryConnect (2 weeks):**

- Execute Phase 1 of `docs/plans/2026-02-26-reduce-feature-bloat.md`
  - Fix MemberModel privacy defaults (`mobile/src/models/MemberModel.ts:34-35`)
  - Fix pricing copy ($9.99 → $12/year in `GroupOverviewScreen.tsx:1582`)
  - Hide V4 features via `featureFlags.ts`
  - Remove hardcoded Google Maps API key from `LocationPicker.tsx`
- Target: app ready for first 5 beta groups

**rats-v2 (2 weeks):**

- Push the 28 unpushed commits (payment refactoring, Oxford voting, business meetings)
- Stabilize: run full test suite, fix any broken tests
- Complete Oxford House voting workflow (anonymous + attributed)
- Complete business meeting attendance toggle and quorum calculation
- Deploy to TestFlight / internal testing

**Deliverable:** Both apps beta-ready.

---

### Month 2 (May): rats-v2 Sprint 1 Gaps — Intake + Billing Automation

**Resident intake workflow (Sprint 1, #1):**

- Add `Application` entity with screening questions, status (pending/approved/rejected/waitlisted)
- Build intake form screen: emergency contacts, insurance, referring center, drug of choice
- Waitlist management: queue position, auto-notify on bed availability
- Files: new `screens/Intake/`, extend `entities/Guest.tsx`

**Billing automation (Sprint 1, #2 gaps):**

- Recurring rent invoicing: Cloud Function in `regroup-functions` to auto-create payment intents on schedule
- Automated SMS/email reminders (Twilio or FCM for overdue rent)
- Auto-generated receipts (PDF via reportExport pattern)
- Outstanding balance dashboard improvements: per-resident view, house-wide aging report
- Files: extend `services/payments.ts`, `screens/HouseSettings/PaymentDashboard.tsx`

**Deliverable:** Complete Sprint 1 features #1, #2, #3. First operators can run real intake + billing.

---

### Month 3 (June): rats-v2 Sprint 1 Complete + First Revenue

**Drug testing module (Sprint 1, #4):**

- New entity: `DrugTest` (scheduledDate, guestId, result, observer, timestamp, escalation status)
- Random scheduling algorithm (weighted by phase requirements)
- Result logging with observer name + timestamp
- Positive result escalation workflow → incident report auto-created
- Files: new `entities/DrugTest.ts`, `services/drugTesting.ts`, `screens/DrugTesting/`

**Resident portal completion (Sprint 1, #5):**

- Maintenance request submission (new entity + screen)
- Announcements system (admin posts, residents view)
- Balance visibility for residents in `GuestHome.tsx`

**Pricing increase for new operators:**

- Implement tiered pricing per `docs/PRICING_STRATEGY_OPTIONS.md`: $49-129/house/month
- Update Stripe subscription products in `regroup-functions`
- Grandfather existing operators at current rate

**RecoveryConnect: Continue beta onboarding → 15-20 groups**

**Deliverable:** Sprint 1 complete. Price increase live. **First meaningful sober living revenue.**

---

### Month 4 (July): rats-v2 Sprint 2 — Competitive Parity

**Phase auto-advancement (Sprint 2, #6):**

- Configurable advancement criteria per phase (min meetings, min days, clean drug tests, employment)
- Auto-advance with manager approval gate
- Resident-facing progress dashboard showing criteria completion %
- Files: extend `entities/Phase.tsx`, new `screens/PhaseProgress/`

**Chore rotation + verification (Sprint 2, #7):**

- Rotation scheduling (weekly/bi-weekly rotation algorithm)
- Photo evidence capture for chore completion
- Completion verification by admin/manager
- Files: extend `entities/Chore.tsx`, chore overview screens

**Accountability scoring (Sprint 2, #8):**

- Define composite formula: meetings (30%) + chores (20%) + curfew (15%) + drug tests (20%) + rent (15%)
- Score calculation service
- Per-resident score card in dashboard

**Deliverable:** Phase tracking, chores, and scoring at competitive parity with Sobriety Hub.

---

### Month 5 (August): rats-v2 Sprint 2 Complete + Oxford Finish

**Consequence workflows (Sprint 2, #9):**

- Warning → probation → discharge state machine
- Configurable triggers (e.g., score < 40% for 2 weeks → warning)
- Notification to resident + admin on state transitions
- Discharge documentation with audit trail
- Files: new `services/consequences.ts`, extend `entities/Guest.tsx` with `complianceStatus`

**Incident reporting + compliance (Sprint 2, #10-11):**

- Add severity/priority to Issue and Complaint entities
- Escalation workflow: auto-notify house admin → operator → authorities
- NARR compliance tracking (Level I-IV requirements checklist)
- State-specific compliance checklists (start with TX, NC, VA)

**Multi-house analytics (Sprint 2, #12):**

- Cross-portfolio dashboard: occupancy %, revenue, collection rate, compliance score per house
- Files: extend `screens/HousesOverview/`

**Oxford House completions (Sprint 3, #13 gaps):**

- Treasurer dashboard: dedicated screen with rent collection status, expense tracking, auto-generated weekly Financial Status Report
- Comptroller dual-approval workflow for expenses
- EES calculator refinement: auto-recalculate per-bed EES when vacancy changes
- Files: extend `screens/Oxford/`, `services/oxford/`

**Deliverable:** Sprint 2 complete. Oxford House feature-complete. Ready for Oxford pilot.

---

### Month 6 (September): Oxford Pilot Launch + Directory + Meeting Integration

**Oxford House free tier launch:**

- Feature-gate Oxford features to free tier for individual houses
- Chapter-level premium ($200-500/chapter/month) for multi-house roll-ups
- Pilot in TX or NC (largest Oxford House populations)
- Outreach to state Oxford House associations

**Directory & public listing (Sprint 3, #14):**

- Public-facing web directory (Next.js static site or Firebase Hosting)
- SEO-optimized house profiles with availability, photos, program type
- Geographic search (reuse `HouseSearch` geolocation patterns)
- Application-to-admission pipeline: prospect applies from directory → appears in operator's intake queue
- Files: new web project or Firebase Hosting site

**12-Step meeting integration (Sprint 3, #16):**

- Expose RecoveryConnect's `findMeetings` as HTTP API endpoint
  - New file: `RecoveryConnect/functions/src/api/meetingSearch.ts`
- rats-v2 calls this API for meeting search (replaces current search)
- Meeting attendance logged in rats-v2 feeds back to resident compliance tracking

**Deliverable:** Oxford pilot live. Public directory live. Meeting data connected across products.

---

### Month 7 (October): Outcomes Analytics + Shared Identity Bootstrap

**Outcomes analytics dashboard (Sprint 3, #17):**

- Occupancy trends over time (chart)
- Average length of stay
- Collection rate (rent paid / rent owed)
- Phase completion rates
- Employment status at admission vs. current
- Exportable for grants, NARR accreditation, marketing
- Files: new `screens/Analytics/`, Victory Native charts (already in deps)

**Shared identity layer bootstrap:**

- PostgreSQL (Neon) `persons` table linking identities across apps
- Cloud Function in RecoveryConnect: sync user email to persons table on registration
- Cloud Function in rats-v2 (regroup-functions): sync resident data to persons table
- Google Cloud Pub/Sub topics: `meeting.attended`, `housing.status.changed`

**Deliverable:** All 17 Sprint features complete across rats-v2. Shared identity infrastructure in place.

---

### Month 8 (November): Aftercare System Foundation

**Bootstrap aftercare system:**

- New repo or monorepo module: `aftercare-web` (Next.js 14+, App Router)
- Deploy on GCP Cloud Run (HIPAA BAA)
- PostgreSQL (Neon) with AES-256 encryption at rest
- RBAC: clinician, admin, discharge coordinator roles
- Audit logging for all PHI access (42 CFR Part 2)
- OAuth 2.0 authentication

**MVP features:**

- Treatment center onboarding (facility profile, staff accounts)
- Patient intake (demographics, admission info, insurance)
- Sober living directory search (reads from rats-v2 directory API)
- Meeting finder (calls RecoveryConnect meeting search HTTP API)

**Deliverable:** Aftercare infrastructure deployed. Clinicians can search homes + meetings.

---

### Month 9 (December): Aftercare — Discharge Planning

**Discharge planning workflow:**

- Discharge date scheduling
- Sober living referral: clinician selects home → sends referral
- Meeting assignment from 100K+ database into discharge plan
- 42 CFR Part 2 digital consent forms
- PDF discharge plan generation

**Referral portal (rats-v2 side, Sprint 3 #15):**

- Inbound referral queue in operator dashboard
- Referral source tracking
- Auto-create resident profile from referral data (with consent)
- Pub/Sub events: `discharge.completed` → `referral.accepted`

**Deliverable:** End-to-end: clinician creates plan → selects home → sends referral → operator accepts. **First flywheel connection.**

---

### Month 10 (January 2027): Aftercare — Outcome Tracking + Sales

**Outcome tracking dashboard:**

- Meeting attendance from RecoveryConnect (via Pub/Sub trigger)
- Phase completion from rats-v2
- Rent payment status from rats-v2
- Aggregate compliance score per patient

**Relapse risk scoring v1 (rule-based):**

- Missed meetings > threshold, rent failure, phase regression → flag
- Clinical alert in dashboard

**Alumni engagement:**

- Automated check-in SMS (Twilio)
- Milestone celebrations (sobriety anniversaries)

**Sales push:** Pitch to 5-15 treatment centers (< 50 beds)

- Pricing: $800-3,000/facility/month
- Lead with outcome tracking demo (the differentiator)

**Deliverable:** 3-5 paying treatment centers. Flywheel active.

---

### Month 11 (February 2027): FHIR R4 + Cross-Product Polish

- FHIR R4 API: Patient, Encounter, CarePlan resources for EHR overlay
- Full identity layer connected: patient → resident → member tracked end-to-end
- Payer-ready outcome reports (PDF/CSV for value-based care contracts)
- RecoveryConnect: un-hide intergroup features for larger organizations

**Deliverable:** FHIR API available. Outcome reports for payers.

---

### Month 12 (March 2027): Enterprise + Convention Prep

- Multi-facility dashboard for treatment center chains
- SOC 2 Type II prep (documentation, controls)
- Oxford House World Convention pitch deck + demo (convention: Aug/Sept 2027)
- Anonymized outcomes data aggregation for benchmarking
- White-label options for sober living operators

**Deliverable:** Platform ready for enterprise sales and Oxford World Convention.

---

## Revenue Timeline

| Month | Source          | Event                                                 | Est. MRR               |
| ----- | --------------- | ----------------------------------------------------- | ---------------------- |
| 1-2   | RecoveryConnect | First $12/year groups (beta)                          | ~$10-50                |
| 1-2   | rats-v2         | Existing operators at $10+$1                          | ~$100-200              |
| 3     | rats-v2         | Price increase ($49-129/house) for new operators      | ~$200-500              |
| 4-6   | rats-v2         | 10-20 paying operators                                | ~$1,000-2,500          |
| 6+    | Oxford          | Free tier drives adoption; chapters at $200-500/month | ~$500-1,500            |
| 10    | Aftercare       | First treatment centers ($800-3K/mo)                  | ~$2,000-5,000          |
| 12    | Combined        | Target                                                | **~$5,000-10,000 MRR** |

---

## Cross-Product Code Reuse

### From RecoveryConnect → rats-v2 / Aftercare

| Asset                            | Source                                              | Reuse In                   |
| -------------------------------- | --------------------------------------------------- | -------------------------- |
| Meeting search (100K+ meetings)  | `functions/src/callable/findMeetings.ts`            | Both (via new HTTP API)    |
| Service position patterns        | `mobile/src/store/slices/servicePositionsSlice.ts`  | Oxford officer terms       |
| Stripe webhook handling          | `functions/src/utils/stripeUtils.ts`                | rats-v2 billing automation |
| Claims-based RBAC                | `functions/src/triggers/firestore/onMemberWrite.ts` | Aftercare roles            |
| Firestore security rules pattern | `firestore.rules`                                   | rats-v2 rules review       |

### From rats-v2 → Aftercare

| Asset                  | Source                                     | Reuse In                    |
| ---------------------- | ------------------------------------------ | --------------------------- |
| House/resident data    | `entities/Guest.tsx`, `entities/House.tsx` | Directory API for aftercare |
| Phase completion data  | `entities/Phase.tsx`                       | Outcome tracking            |
| Payment/rent status    | `services/payments.ts`                     | Outcome tracking            |
| Report export patterns | `services/reportExport.ts`                 | Payer reports               |
| Outcomes analytics     | `screens/Analytics/` (Month 7)             | Aftercare dashboard         |

---

## Risk Mitigation

| Risk                           | Mitigation                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Solo founder bandwidth         | Months 8-10 (aftercare) can slip to 10-12 without losing sober living revenue                         |
| HIPAA complexity               | Scoped to aftercare only; 12-step and sober living don't handle PHI                                   |
| Oxford adoption pace           | Free tier removes budget; target chapters for top-down push                                           |
| Treatment center sales cycle   | Lead with < 50 bed facilities; outcome demo is the hook                                               |
| Two mobile apps, one developer | Both are React Native 0.72 with near-identical stacks — shared patterns reduce context-switching cost |

---

## Verification Plan

- **rats-v2**: `npm test` (235 unit tests), `npm run test:e2e:ios` (16 E2E tests), `npm run test:integration` (5 integration tests)
- **RecoveryConnect**: `cd mobile && npm test` (357 tests / 28 suites), `npm run test:e2e:test` (Detox)
- **Aftercare**: Set up Jest + Playwright from project init; target 80% coverage
- **Cross-product**: Manual flow test: discharge → referral → acceptance → meeting attendance → outcome dashboard
- **HIPAA audit**: Budget $15-30K before aftercare goes to production (Month 8)
