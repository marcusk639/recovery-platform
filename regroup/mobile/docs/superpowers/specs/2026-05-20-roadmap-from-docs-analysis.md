# Regroup v2 — Docs-Derived Roadmap (v2)

**Date:** 2026-05-20 (updated — v2 supersedes earlier same-day run)
**Method:** Full doc audit (22 docs reviewed) cross-referenced against codebase + git history
**Baseline commit (rats-v2):** `d0fbaec` (add run-rats-v2 skill — historical commit name; skill since renamed to run-regroup-mobile)
**Baseline commit (functions):** `98bd845` (add run-regroup-functions skill)
**Primary sources:** `2026-05-19-release-readiness-audit.md`, `docs/business/business-case-2026-05-20.md`

---

## Executive Summary

The codebase is in a strong pre-launch position. Since the v1 roadmap run earlier today, every outstanding functions-repo plan has been executed: Zod validation on all callable boundaries, auth guards on all callables, dmNotification dead trigger removed, onGuestWrite merged, and backfill migration scripted. The subscription paywall, Oxford governance suite, payment system, and Redux→React Query migration are all shipped.

Two things changed in this session that shift priorities:

1. **All functions-repo plans: DONE.** The three open superpowers plans in regroup-functions are fully executed as of commits `cca6f2d`, `a687e05`, and `d6dc24d`.

2. **Resident application workflow elevated to competitive P0.** The business case analysis revealed Sobriety Hub launched a read-only resident directory in March 2026 — but has no application workflow. Regroup's ability to let residents apply through the app (not just browse listings) is the primary structural moat. Sobriety Hub can ship application workflow within 6–12 months. This changes the sequencing: the application workflow is now the highest-urgency _engineering_ item, ahead of the post-launch cleanup sprint.

What remains before App Store launch is almost entirely **non-engineering human work** (security manual actions, legal artifacts, App Store metadata, Stripe dashboard configuration).

---

## Section 1: Doc Audit Summary

| Document                                                                            | Date        | Type          | Verdict                                                                       |
| ----------------------------------------------------------------------------------- | ----------- | ------------- | ----------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-05-19-release-readiness-audit.md`                      | 2026-05-19  | Audit         | **Primary technical source of truth**                                         |
| `docs/business/business-case-2026-05-20.md`                                         | 2026-05-20  | Strategy      | **New — primary strategic source of truth**                                   |
| `docs/business/competitive-landscape-2026-05-20.md`                                 | 2026-05-20  | Analysis      | **New — elevates resident app workflow to competitive P0**                    |
| `docs/business/market-opportunity-analysis-2026-05-20.md`                           | 2026-05-20  | Analysis      | New — TAM/SAM/SOM validated                                                   |
| `docs/business/financial-projections-2026-05-20.md`                                 | 2026-05-20  | Model         | New — 5-year bootstrapped model                                               |
| `docs/superpowers/specs/2026-05-19-subscription-paywall-design.md`                  | 2026-05-19  | Spec          | **DONE** — all tasks shipped                                                  |
| `docs/superpowers/plans/2026-05-19-paywall-completion.md`                           | 2026-05-19  | Plan          | **DONE** — all 3 tasks shipped                                                |
| `docs/superpowers/plans/2026-05-19-callable-validation-and-dead-trigger-cleanup.md` | 2026-05-19  | Plan          | **DONE** — all 6 tasks shipped this session                                   |
| `regroup-functions: 2026-05-19-consolidate-guest-write-triggers.md`                 | 2026-05-19  | Plan          | **DONE** — deployed this session                                              |
| `regroup-functions: 2026-04-14-consolidate-scheduled-weekly-transfers.md`           | 2026-04-14  | Plan          | **DONE** — shipped in prior session                                           |
| `docs/superpowers/plans/2026-04-14-oxford-treasury-dashboard.md`                    | 2026-04-14  | Plan          | **DONE** — fully implemented                                                  |
| `docs/superpowers/plans/2026-04-13-redux-to-react-query-migration.md`               | 2026-04-13  | Plan          | **DONE/STALE** — migration complete                                           |
| `docs/superpowers/plans/2026-04-08-sober-living-roadmap.md`                         | 2026-04-08  | Roadmap       | Partially stale — status matrix outdated                                      |
| `docs/plans/ACTIVE_PLAN.md`                                                         | 2026-02-27  | Plan          | **STALE** — most items shipped; Oxford screens now done                       |
| `CLAUDE.md`                                                                         | Git-tracked | Architecture  | Always current                                                                |
| `docs/FEATURE_PRIORITY_ROADMAP.md`                                                  | Nov 2025    | Roadmap       | Partially stale — Oxford built; market strategy still valid                   |
| `docs/GAP_ANALYSIS_PRODUCTION_READINESS.md`                                         | Dec 2025    | Audit         | **STALE** — most MISSING items shipped                                        |
| `docs/plans/2026-02-*`                                                              | Feb 2026    | Plans         | **STALE** — superseded by superpowers plans                                   |
| `regroup-functions/FUNCTION_AUDIT.md`                                               | Feb 2026    | Audit         | Partially stale — orphaned functions removed; ghost exports need verification |
| `docs/archive/*`                                                                    | Various     | Archive       | **IGNORE**                                                                    |
| `docs/e2e/*`                                                                        | Various     | E2E status    | Partially stale — 16 E2E tests now exist                                      |
| `docs/type-fixes/*`                                                                 | Various     | Type-fix logs | **STALE/DONE** — type errors resolved                                         |

---

## Section 2: Implementation Status Matrix

### Functions Repo — Updated Since Earlier Today

| Plan / Feature                                                                       | Status      | Evidence                                                                                            |
| ------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------- |
| dmNotification removed                                                               | **DONE**    | Commit `cca6f2d`                                                                                    |
| Zod `parseInput` helper                                                              | **DONE**    | Commit `a687e05` — `functions/src/validation/index.ts`                                              |
| Zod validation: auth.ts callables                                                    | **DONE**    | Commit `a687e05`                                                                                    |
| Zod validation: meetings.ts callables                                                | **DONE**    | Commit `a687e05`                                                                                    |
| Zod validation: payments.ts callables                                                | **DONE**    | Commit `a687e05`                                                                                    |
| Zod validation: subscriptions.ts callables                                           | **DONE**    | Commit `a687e05`                                                                                    |
| Auth guards (request.auth) on all callables                                          | **DONE**    | Commit `d6dc24d`                                                                                    |
| URL scheme allowlist (javascript:/data:/vbscript: blocked)                           | **DONE**    | Commit `d6dc24d`                                                                                    |
| onGuestWrite merged handler                                                          | **DONE**    | Commit `547f36c`                                                                                    |
| subscriptionStatus backfill migration script                                         | **DONE**    | Commit `a687e05` context                                                                            |
| Ghost exports (handleStripeConnectWebhook, stripeConnectReturn, stripeConnectReauth) | **PARTIAL** | Still referenced in `index.ts:27`; `./http/stripeConnect` file exists but verify all 3 are exported |

### Subscription / Paywall — DONE

| Requirement                          | Status      | Evidence                                                       |
| ------------------------------------ | ----------- | -------------------------------------------------------------- |
| `useSubscriptionGate` hook           | DONE        | `src/hooks/useSubscriptionGate.ts`                             |
| `SubscriptionGate` component wired   | DONE        | `src/navigation/navigators.tsx:183`                            |
| `SubscriptionRequiredScreen`         | DONE        | `src/screens/Subscription/SubscriptionRequiredScreen.tsx`      |
| `GraceExpiredScreen`                 | DONE        | `src/screens/Subscription/GraceExpiredScreen.tsx`              |
| `GracePeriodBanner`                  | DONE        | `src/components/subscription/GracePeriodBanner.tsx`            |
| Firestore rules Oxford gate          | DONE        | Commit `13d4004`                                               |
| House entity default → `trialing`    | DONE        | Commit `6acee5e`                                               |
| Backfill migration script            | DONE        | Ran live 2026-05-20 — 180 houses, 57 → `canceled`, 123 skipped |
| Stripe webhook → House doc updates   | DONE        | `stripeWebhook.ts:updateHouseSubscriptionStatus()`             |
| Admin subscription WebView           | DONE        | `src/screens/SubscriptionHandler/SubscriptionHandler.tsx`      |
| rats-web `SubscriptionGuard`         | DONE        | `rats-web/src/app/guards/subscription.guard.ts`                |
| Stripe subscription products created | **MISSING** | Manual Stripe Dashboard action required                        |

### Oxford House — DONE

| Requirement                             | Status | Evidence                                          |
| --------------------------------------- | ------ | ------------------------------------------------- |
| EES tracking                            | DONE   | `src/screens/Oxford/`, `src/services/oxford/`     |
| Officer roles + `useTreasuryRole`       | DONE   | Commit `feat(treasury): add useTreasuryRole hook` |
| Business meetings + voting              | DONE   | Oxford screens, `oxfordQueries`                   |
| Treasury dashboard + financial records  | DONE   | `src/screens/Treasury/TreasuryDashboard.tsx`      |
| Firestore rules (`houseOxfordActive()`) | DONE   | Deployed live 2026-05-20 to `phoenix-cleanhouse`  |

### Payments — DONE (core), MISSING (advanced)

| Requirement                    | Status      | Evidence                                   |
| ------------------------------ | ----------- | ------------------------------------------ |
| Resident payment portal (card) | DONE        | `src/screens/Payments/ResidentPayment.tsx` |
| Payment history                | DONE        | `src/screens/Payments/PaymentHistory.tsx`  |
| Receipt sharing                | DONE        | `src/services/receiptService.ts`           |
| Payment failure recovery UI    | **MISSING** | No admin retry/dispute surface             |
| Automated payment reminders    | **MISSING** |                                            |
| ACH payments                   | **MISSING** |                                            |

### Resident Intake — DONE (core), MISSING (pipeline)

| Requirement                                 | Status      | Evidence                                               |
| ------------------------------------------- | ----------- | ------------------------------------------------------ |
| Multi-step intake form                      | DONE        | `src/screens/ResidentIntake/IntakeFormScreen.tsx`      |
| Guest discharge / offboarding flow          | **MISSING** | No `GuestDischargeScreen`, no discharge Firestore rule |
| Application / screening / waitlist pipeline | **MISSING** | No applicant entity or screens                         |
| Bulk guest CSV import                       | **MISSING** |                                                        |

### Reporting / Exports — PARTIAL

| Requirement                | Status                  | Evidence                                     |
| -------------------------- | ----------------------- | -------------------------------------------- |
| Weekly compliance PDF      | DONE (Android/web only) | `src/services/reportExport.ts` — iOS blocked |
| Treasury weekly report     | DONE                    | `src/services/treasuryReport.ts`             |
| CSV export (payments, EES) | **MISSING**             |                                              |
| Admin reporting dashboard  | **MISSING**             |                                              |
| Scheduled email reports    | **MISSING**             |                                              |

### **NEW: Resident Application Workflow — MISSING (elevated to competitive priority)**

| Requirement                                   | Status                     | Urgency                           |
| --------------------------------------------- | -------------------------- | --------------------------------- |
| Operator directory listing (public)           | DONE (basic search exists) | —                                 |
| Resident profile / intake questionnaire       | MISSING                    | HIGH                              |
| In-app application submission                 | **MISSING**                | **CRITICAL — competitive window** |
| Application status tracking (resident-facing) | **MISSING**                | HIGH                              |
| Application review UI (operator-facing)       | **MISSING**                | HIGH                              |
| Applicant → resident conversion flow          | **MISSING**                | HIGH                              |

**Context:** Sobriety Hub launched a read-only directory in March 2026. They have no application workflow. Regroup's two-sided application layer is the primary structural moat per the competitive analysis. Sobriety Hub can ship this within 6–12 months.

### App Store Compliance — ALL MISSING

No privacy policy URL, screenshots, App Store metadata, age rating, IDFA disclosure, Play Store Data Safety form, or App Review credentials found anywhere in the codebase.

### Security Manual Actions — ALL MISSING (human-only)

Three leaked Firebase service account keys in git history. Four E2E test accounts in production Firebase Auth.

---

## Section 3: Pruned Roadmap

**Excluded from roadmap (DONE or OUT_OF_SCOPE):**

- Full paywall (SubscriptionGate, screens, hook, webhook, Firestore rules)
- Oxford House governance suite (EES, voting, treasury, officers, rules)
- Drug testing module
- Resident payments + receipts
- Redux → React Query migration
- Phase auto-advancement
- Resident intake form (core)
- Weekly compliance PDF + treasury reports
- rats-web SubscriptionGuard
- Zod callable validation + auth guards (completed this session)
- dmNotification removal (completed this session)
- onGuestWrite merge (completed this session)
- All archive, type-fix, and February 2026 sprint docs
- AI features (all — post-launch month 2+)

---

### P0 — Must complete before App Store submission

**Nothing ships until these are done. None require engineering code.**

| Item                                                                                          | Effort  | Type                       |
| --------------------------------------------------------------------------------------------- | ------- | -------------------------- |
| P0-A: Rotate 3 leaked service account keys; purge from git history with BFG                   | 2-4 hrs | Human — GCP Console + git  |
| P0-B: Delete 4 E2E prod accounts from Firebase Auth + Firestore test houses                   | 1 hr    | Human — Firebase Console   |
| P0-C: Privacy policy + Terms of Service hosted at stable HTTPS URL                            | 4-6 hrs | Human — legal template     |
| P0-D: HIPAA surface decision (legal consult: does sober living management trigger BAA?)       | 2-4 hrs | Human — legal consultation |
| P0-E: Stripe subscription products created (House $49/mo, Oxford $79/mo recurring)            | 2 hrs   | Human — Stripe Dashboard   |
| P0-F: IAP vs. direct billing architecture decision (Apple requires IAP if in-app purchase)    | 2 hrs   | Architecture decision      |
| P0-G: App Store Connect: metadata, screenshots, age rating, IDFA disclosure, App Review notes | 6-8 hrs | Human — App Store Connect  |
| P0-H: Play Store: Data Safety form, feature graphic, permissions declaration, API 34 target   | 2-3 hrs | Human — Play Console       |

---

### P0-Eng — Competitive priority engineering (90-day window)

This is the first engineering work after the App Store human actions. **Start immediately after launch; don't wait for the post-launch cleanup sprint.**

| Item                                  | Effort     | Why now                                                                        |
| ------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| **Resident application workflow MVP** | L (1 week) | Sobriety Hub 6–12 months away from shipping theirs; first-mover data compounds |

See implementation plan below for breakdown.

---

### P1 — First post-launch sprint (alongside application workflow)

High-retention, operators need these within first weeks.

| Item                                     | Effort         |
| ---------------------------------------- | -------------- |
| P1-1: Guest discharge / offboarding flow | M (2-3 days)   |
| P1-2: Payment failure recovery UI        | S-M (1-2 days) |
| P1-3: Per-resident balance aging view    | S (1 day)      |
| P1-4: CSV export (payment history + EES) | M (2 days)     |
| P1-5: Bulk guest import via CSV          | M (3 days)     |

---

### P2 — Next 60 days

| Item                                                                       | Effort                   |
| -------------------------------------------------------------------------- | ------------------------ |
| Staff notes + shift logs                                                   | L (1 week)               |
| Document management (basic: upload, view, expiration)                      | L (1 week)               |
| Admin reporting dashboard (occupancy, compliance trend, discharge summary) | L (1 week)               |
| Offline payment pending state indicator                                    | S (1 day)                |
| Chore rotation + optional photo evidence                                   | L (1 week)               |
| Multi-house bundle discount (3+ = 10%, 5+ = 20%)                           | S (2 hrs — pricing only) |

---

### P3 — Backlog / strategic

| Item                                                      | Notes                                       |
| --------------------------------------------------------- | ------------------------------------------- |
| ACH payments                                              | High operator value; Stripe ACH integration |
| Automated payment reminders (scheduled Cloud Function)    | Month-2 post-launch                         |
| Oxford House Inc. enterprise conversation                 | Start at Month 6; 12-18 months to close     |
| 2FA (Firebase MFA enrollment)                             | Security; not launch-critical               |
| Announcements system                                      | Post-launch                                 |
| Automated consequence workflows                           | Post-launch                                 |
| Outcomes analytics dashboard                              | Post-launch; pairs with HUD reporting       |
| Oxford chapter rollups + inter-house directory            | Enables Oxford national deal                |
| Treatment center referral portal                          | Phase 2 (Year 2)                            |
| AI features (all) — post-launch month 2+:                 |                                             |
| → Meeting Attendance Verifier (Claude vision)             | Lowest risk; highest admin value            |
| → Smart Chore Rotation Generator                          |                                             |
| → Payment Dispute Summarizer                              |                                             |
| → Resident Risk Scoring (requires HIPAA review + consent) |                                             |
| → AI House Manager Assistant                              |                                             |
| Alumni network / aftercare system                         | Phase 3 (Year 3+)                           |

---

## Section 4: Implementation Plan (P0-Eng + P1)

### P0-Eng: Resident Application Workflow MVP

**Status:** MISSING | **Tier:** P0-Eng (competitive priority)
**Source:** `docs/business/competitive-landscape-2026-05-20.md`, Section 8
**Effort:** L (~1 week)
**Competitive window:** ~6 months before Sobriety Hub ships equivalent

`★ Insight ─────────────────────────────────────`
The resident application flow is architecturally two-sided: residents write to `applications/{appId}` and operators read/act on it. This is distinct from the existing intake form (which requires an admin to create the guest). The application flow creates a pre-admission record that converts to a full guest record on approval.
`─────────────────────────────────────────────────`

**New entities / files needed:**

- `src/entities/Application.ts` — `status: 'pending' | 'reviewing' | 'approved' | 'rejected'`
- `src/services/applications.ts` — CRUD for `houses/{houseId}/applications/{appId}`
- `src/state/queries/applicationQueries.ts` — React Query hooks
- `src/screens/Application/ApplyScreen.tsx` — resident-facing: fills questionnaire, submits
- `src/screens/Application/ApplicationStatusScreen.tsx` — resident-facing: tracks status
- `src/screens/Applications/ApplicationListScreen.tsx` — operator-facing: reviews pending apps
- `src/screens/Applications/ApplicationDetailScreen.tsx` — operator-facing: approve/reject with note
- `firebase/firestore.rules` — applications subcollection: resident can write own; operator can read all + update status

**What's needed:**

- [ ] `Application` entity: `id`, `houseId`, `applicantName`, `applicantEmail`, `applicantPhone`, `sobrietyDate`, `programType` (AA/NA/other), `currentSituation`, `references`, `status`, `operatorNote`, `createdAt`, `reviewedAt`
- [ ] `src/services/applications.ts`: `submitApplication()`, `getMyApplications()`, `listHouseApplications(houseId)`, `updateApplicationStatus(id, status, note)`
- [ ] `applicationQueries.ts`: React Query hooks wrapping the service (same pattern as `paymentQueries.ts`)
- [ ] `ApplyScreen.tsx`: multi-step form (contact info → sobriety info → references → submit). Guest-facing, no auth required to view the house directory; auth required to submit.
- [ ] `ApplicationStatusScreen.tsx`: shows application status badge, operator note on decision, "Apply to another house" CTA
- [ ] `ApplicationListScreen.tsx`: operator sees pending/reviewing/decided queue; sorted by newest; badge count on nav
- [ ] `ApplicationDetailScreen.tsx`: full application view, "Approve" and "Reject" buttons, optional note field. Approve → navigates to existing ResidentIntake flow pre-filled with applicant data
- [ ] Firestore rule: `match /houses/{houseId}/applications/{appId}` — `allow write: if request.auth != null && request.auth.uid == resource.data.applicantUid`; `allow read, update: if isHouseAdmin(houseId)`
- [ ] Cloud Function `notifyOperatorOnApplication` (Firestore trigger): fires on `applications/{appId}` create; sends push + notification doc to all house admins
- [ ] Navigation: add "Applications" tab or menu item in operator navigator; "Apply" button on `HouseSearch` result cards

**Acceptance criteria:**

- [ ] Resident finds a house in the directory, submits application in <5 minutes
- [ ] Operator receives push notification on new application
- [ ] Operator can approve → applicant converts to ResidentIntake flow with data pre-filled
- [ ] Operator can reject with optional note → applicant sees decision in status screen
- [ ] Firestore rules: applicant can only write own application; cannot read other applications

---

### P0-A/B: Security manual actions

**Tier:** P0 | **Effort:** S — human time only

- [ ] **Stripe Dashboard → Developers → API keys → Roll live key** — live key appeared in terminal output during 2026-05-20 migration run; rotate immediately
- [ ] GCP Console → IAM → Service Accounts: rotate keys for `rats-fe9c3`, `rats-dev`, `phoenix-cleanhouse`
- [ ] Purge from git history:
  ```bash
  brew install bfg
  bfg --delete-files 'service-account*.json' --no-blob-protection
  git reflog expire --expire=now --all
  git gc --prune=now --aggressive
  git push --force-with-lease
  ```
- [ ] Firebase Console → Authentication: delete `test-guest-a@rats-e2e.com`, `test-guest-b@rats-e2e.com`, `test-admin-a@rats-e2e.com`, `test-admin-b@rats-e2e.com`
- [ ] Firestore: delete `e2e-test-house-001`, `e2e-test-house-002`
- [ ] Verify `src/config/firebase-emulator.ts` is used in all Detox runs
- [ ] Add CI check: fail if any `@rats-e2e.com` emails found in Firebase Auth export

**Acceptance criteria:**

- [ ] `git log --all --full-history -- "**service-account*"` returns no results
- [ ] Zero `@rats-e2e.com` accounts in Firebase Auth prod tenant

---

### P0-C/D/E: Legal + Stripe + IAP

**Tier:** P0 | **Effort:** S-M — human time, legal consultation

- [ ] Draft and host privacy policy at stable HTTPS URL (covers Firebase, Stripe, Sentry, CCPA/GDPR rights)
- [ ] Draft terms of service (admin/guest roles, payment responsibility, acceptable use)
- [ ] Attorney consultation: does sober living management trigger HIPAA BAA?
- [ ] Create Stripe Price objects: House ($49/mo recurring), Oxford ($79/mo recurring)
- [ ] Confirm existing legacy plan IDs (`plan_HFkfwM5lQx6oud` / `plan_HFkh7QvRnNjMy8`) are still active; replace if not
- [ ] Confirm IAP vs. direct billing (Apple enforce-only pattern still accepted by App Review guidelines?)

---

### P0-F/G: App Store Assets and Metadata

**Tier:** P0 | **Effort:** S-M — 8-12 hours human time total

**Apple:**

- [ ] App Store Connect: enter privacy policy URL, app description (4000 chars), keywords
- [ ] Submit age rating questionnaire (likely 17+ for medical/health context)
- [ ] IDFA disclosure: Firebase Analytics uses IDFA
- [ ] App Review notes: test account credentials + house setup for reviewers
- [ ] Screenshots: 6.7" (iPhone 15 Pro Max) required; 5.5" required
- [ ] Entitlements audit: `codesign -d --entitlements - Payload/rats.app`

**Google Play:**

- [ ] Data Safety form: Firebase Auth, Firestore, Sentry, Stripe
- [ ] Target API 34 (Android 14)
- [ ] Feature graphic: 1024×500 banner
- [ ] Permissions declaration for POST_NOTIFICATIONS + CAMERA

---

### P1-1: Guest discharge / offboarding flow

**Status:** MISSING | **Tier:** P1 | **Effort:** M (2-3 days)
**Source:** `2026-05-19-release-readiness-audit.md` Section 2.2

**What's needed:**

- [ ] `Guest` entity: add `status: 'active' | 'discharged' | 'archived'`, `dischargeReason?: string`, `dischargedAt?: string`
- [ ] `dischargeGuest(guestId, reason, notes)` in `src/services/guest.tsx`: sets status + timestamp, triggers CF to revoke Firebase Auth custom claims
- [ ] `GuestDischargeScreen` in `src/screens/GuestUpdate/`: reason selector (graduated, removed, voluntary), notes field, final balance display, confirm button
- [ ] Cloud Function: remove `houseId` claim from guest's Firebase Auth token on discharge
- [ ] Firestore rule: discharged guests cannot write to house subcollections
- [ ] Unit test: `dischargeGuest` writes correct fields

**Acceptance criteria:**

- [ ] Admin completes discharge in 3 taps with reason + optional notes
- [ ] Discharged guest sees `GraceExpiredScreen` with "Contact your house manager" on next open
- [ ] Discharge creates an immutable audit record in guest document

---

### P1-2: Payment failure recovery UI

**Status:** MISSING | **Tier:** P1 | **Effort:** S-M (1-2 days)

Stripe already delivers `payment_intent.payment_failed` webhooks. This is a UI gap only.

**What's needed:**

- [ ] Firestore query: `payments` where `status == 'failed'` scoped to house — add to `src/state/queries/paymentQueries.ts`
- [ ] Failed payment banner in `PaymentHistory.tsx` (admin view): guest name, amount, failure reason
- [ ] "Retry" button: calls Stripe `confirm` via Cloud Function
- [ ] "Mark resolved" button: for cash/check fallback, writes `status: 'resolved_offline'`
- [ ] Push notification to guest on resolution

**Acceptance criteria:**

- [ ] Admin sees failed payments highlighted on payment dashboard
- [ ] Can retry or manually resolve with one tap
- [ ] Guest notified of resolution

---

### P1-3: Per-resident balance aging view

**Status:** PARTIAL | **Tier:** P1 | **Effort:** S (1 day)

**What's needed:**

- [ ] Add "Residents" tab to `src/screens/BalanceDashboard/`: lists each guest's `rentOwed` + days overdue
- [ ] Sort by oldest overdue first; group into 30/60/90+ day buckets
- [ ] Tap-to-navigate to resident's `PaymentHistory.tsx`

**Acceptance criteria:**

- [ ] Admin sees per-resident aging breakdown, not just house totals
- [ ] Oldest overdue residents appear first

---

### P1-4: CSV export (payment history + EES)

**Status:** PARTIAL | **Tier:** P1 | **Effort:** M (2 days)

PDF export exists. CSV is needed for accounting and state compliance reporting.

**What's needed:**

- [ ] `exportPaymentHistoryCSV(houseId, dateRange)` in `src/services/reportExport.ts`: guestName, date, amount, status, method columns
- [ ] `exportEESRecordsCSV(houseId, dateRange)`: per-resident EES contribution amounts per billing period
- [ ] Share via React Native `Share` API (same pattern as `receiptService.ts`)
- [ ] "Export CSV" button in `PaymentHistory.tsx` admin header with date-range picker

**Acceptance criteria:**

- [ ] Admin taps "Export" → native share sheet offers CSV file
- [ ] CSV opens in Numbers/Excel with correct headers
- [ ] EES CSV shows per-resident amounts per billing period

---

### P1-5: Bulk guest import via CSV

**Status:** MISSING | **Tier:** P1 | **Effort:** M (3 days)

**What's needed:**

- [ ] `src/screens/CreateGuest/BulkImportScreen.tsx`: file picker, column mapping (firstName, lastName, email, phone, moveInDate, roomNumber)
- [ ] CSV parser → Guest array with validation (duplicate email detection, required fields)
- [ ] Preview screen: parsed guests with error rows highlighted in red
- [ ] `bulkCreateGuests(houseId, guests[])` in `src/services/guest.tsx`: Firestore batch write (max 500 per batch)
- [ ] Navigation: "Import CSV" button in `GuestList` screen header

**Acceptance criteria:**

- [ ] Admin uploads CSV → previews parsed data → confirms import
- [ ] Firestore batch creates all guests atomically
- [ ] Error rows show specific reason — not generic failure

---

## Section 5: Confidence Notes

| Item                             | Confidence | Recommendation                                                                                                                                                                        |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paywall end-to-end in prod       | Medium     | Gate is wired in `navigators.tsx` but needs emulator E2E to confirm `canceled` status redirects correctly                                                                             |
| Oxford features fully functional | Medium     | Code committed; `useOxfordGate` emulator test noted as needed                                                                                                                         |
| iOS PDF export                   | Low        | `isPDFExportAvailable()` returns `false` on iOS — PDF is Android/web only; don't promise iOS PDF in App Store listing                                                                 |
| FCM token refresh                | Low        | Noted in audit as "untested" — verify before TestFlight                                                                                                                               |
| Deep-link invite URL             | Low        | Audit notes "deep-link invite URL not tested" — test before App Store submission                                                                                                      |
| Ghost Stripe HTTP exports        | Medium     | `handleStripeConnectWebhook`, `stripeConnectReturn`, `stripeConnectReauth` referenced in `index.ts`; verify `./http/stripeConnect.ts` exports all three or remove the dead references |
| E2E prod accounts deleted        | High       | Still present per audit — delete immediately as P0-B action                                                                                                                           |

---

## Functions Repo: All Plans Executed

As of this session, all three outstanding regroup-functions plans are **DONE**:

| Plan                                                         | Status             | Key commits                     |
| ------------------------------------------------------------ | ------------------ | ------------------------------- |
| `2026-05-19-consolidate-guest-write-triggers.md`             | ✅ DONE + deployed | `547f36c`, deployed             |
| `2026-05-19-callable-validation-and-dead-trigger-cleanup.md` | ✅ DONE            | `cca6f2d`, `a687e05`, `d6dc24d` |
| `2026-04-14-consolidate-scheduled-weekly-transfers.md`       | ✅ DONE            | Merged to master                |

No outstanding superpowers plans remain in the functions repo. Next functions work:

1. Verify ghost HTTP exports (`handleStripeConnectWebhook` etc.) — 30-min check
2. Add CI for regroup-functions (GitHub Actions) — currently manual deploy only (P2)
3. `notifyOperatorOnApplication` trigger for the resident application workflow (P0-Eng above)

---

## One-Line Summary

Complete the security/legal/App Store manual actions (P0 — no code), then immediately start the resident application workflow (P0-Eng — 1 week, competitive moat), then the post-launch sprint (P1: guest discharge, payment failure UI, CSV export, bulk import). The Oxford House enterprise conversation should be initiated at Month 6 regardless of what else is happening.
