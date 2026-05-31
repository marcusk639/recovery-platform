# RATS — Remaining Work Assessment & Execution Plan

**Date:** February 22, 2026
**Purpose:** Cross-reference all planning documents against actual codebase state; identify what remains to maximize chances of app success.
**Method:** Every claim in the planning docs was verified against the current `master` branch source code.

---

## Part 1: Plan-vs-Reality Audit

### What the Plans Claimed (Feb 5, 2026) vs. What Actually Exists Now (Feb 22, 2026)

| Item | Plans Said (Feb 5) | Actual State (Feb 22) | Delta |
|------|-------------------|----------------------|-------|
| **TypeScript errors** | 97 (goal achieved) | ~170 real errors (excl. missing deps) | Slightly worse — new code introduced errors |
| **Test coverage** | "~5%, 2 test files" | **46 test files** across services, slices, entities, hooks, utils, screens, e2e | Massively improved (no longer a "critical gap") |
| **Hardcoded Stripe secrets** | "CRITICAL — in source code" | NOT FOUND in source. Only referenced in docs. | **RESOLVED** |
| **Legacy .old.tsx files** | "64 backup files to clean" | **0 found** | **RESOLVED** |
| **Navigation migration** | "Legacy files need cleanup" | migration-utils.ts, MigrationControlPanel.tsx, improved-app.tsx all **deleted** | **RESOLVED** |
| **Offline support** | "0% — no implementation" | `offlineQueue.ts` service + `useOfflineSync.ts` hook + tests exist | **Partially implemented** |
| **Oxford House entities** | "0% complete" | `Officer.ts`, `Election.ts` type definitions + `houseType` field on House entity | **~10% started** (types only, no UI/services) |
| **Compliance indicators** | Not mentioned | `ComplianceDot`, `ComplianceBreakdown` components + `compliance.ts` util + tests | **New feature — implemented** |
| **Issue management** | Not mentioned | `Issue.ts` entity, `issues.ts` service, `Issues.tsx` screen + filter form + tests | **New feature — implemented** |
| **Resident payment UI** | "30% — operator billing only" | `StripeSettingsScreen.tsx` for Stripe Connect setup, `StripeAccountStatus` enum. No resident-facing payment screens. | Still **no resident payment screens** |
| **Redux migration** | "100% RTK" | Confirmed — all slices are RTK | **RESOLVED** |
| **Functional components** | "100% converted" | Confirmed — no class components found | **RESOLVED** |
| **Auth tests** | None | `auth.test.ts` exists | **New** |
| **Slice tests** | None | `guestsSlice.test.ts`, `housesSlice.test.ts`, `userSlice.test.ts`, `authSlice.test.ts`, `uiSlice.test.ts` | **New** |
| **E2E tests** | "Detox configured but no tests" | 15 e2e test files including auth, stats, disputes, RBAC, activities | **Significantly expanded** |

### Documents That Are Now Obsolete or Mostly Outdated

| Document | Status | Reason |
|----------|--------|--------|
| `MIGRATION_STATUS.md` | **Outdated** | Claims "2 test files", "97 TS errors", "64 .old.tsx files" — all stale |
| `PRODUCTION_READINESS_REPORT.md` | **Partially outdated** | Testing grade should be upgraded from F to C+. Security from C to B-. Overall score ~72/100 now (was 62). |
| `CODE_REVIEW_FINDINGS.md` | **Partially outdated** | P0 items #1 (Stripe secret) and #3 (offline) are resolved. Testing is no longer "zero coverage". |
| `GOAL_ACHIEVED.md` | **Still valid** | TS migration milestone still accurate |
| `docs/plans/2026-02-22-navigation-migration-completion.md` | **Completed** | All tasks executed — legacy nav files deleted |
| `docs/plans/2026-02-21-comprehensive-test-suite.md` | **Largely executed** | Most Phase 1-3 tasks done. Integration tests and E2E infrastructure created. |
| `docs/plans/2026-02-19-full-migration-plan.md` | **Not executed** | `scripts/migrate-full.ts` has stubs but phases 2-4 not implemented. Migration not run. |
| `docs/plans/2026-02-18-v2-clean-port-implementation.md` | **Not executed** | v2 clean-architecture branch not created. Guest entity still has embedded weeks. |

### Documents That Remain Fully Relevant

| Document | Why Still Relevant |
|----------|-------------------|
| `PRODUCT_ROADMAP.md` | Revenue phases, Oxford House strategy, and growth milestones are still the north star |
| `FEATURE_PRIORITIZATION.md` | Feature rankings and revenue impact analysis haven't changed |
| `PRICING_STRATEGY.md` | Pricing tiers and revenue models still apply |

---

## Part 2: Current Production Readiness (Revised)

### Updated Score: 72/100 (was 62/100)

| Component | Old Score | New Score | Change | Evidence |
|-----------|-----------|-----------|--------|----------|
| Mobile App | 75% | 80% | +5% | Compliance UI, issue tracking, offline queue added |
| Backend | 70% | 72% | +2% | Stripe Connect settings, but no resident payment endpoints |
| Testing | 5% | 40% | +35% | 46 test files across all layers |
| Security | 60% | 75% | +15% | Hardcoded secrets removed, Stripe env vars in place |
| Architecture | 85% | 90% | +5% | Navigation migration complete, no legacy code |
| Documentation | 85% | 85% | 0% | Many docs now stale (net neutral) |
| DevOps | 50% | 50% | 0% | No CI/CD improvements observed |

### Remaining Critical Gaps (P0)

1. **Resident payment system** — No screens, no services, no Cloud Function endpoints for collecting rent from residents
2. **Data model migration** — Guest entity still embeds Week objects. Migration script exists but is stubbed.
3. **Legal docs** — No Terms of Service, Privacy Policy, or Data Processing Agreement
4. **CI/CD** — No automated testing in PR workflow

### High-Priority Gaps (P1)

5. **Oxford House features** — Only type definitions exist (Officer, Election). No UI, services, voting, EES, or business meeting functionality.
6. **Enhanced reporting / PDF export** — No PDF generation capability
7. **2FA** — Still not implemented
8. **Error monitoring** — Sentry/Crashlytics unverified
9. **Rate limiting** — Still client-side only

---

## Part 3: Recommended Execution Plan

### Guiding Principle

The revenue projections in the planning docs are aggressive but directionally correct: **resident payments** and **Oxford House** are the two biggest opportunities. However, the plans spread effort across too many workstreams. This revised plan sequences work by **what unblocks revenue first** and **what prevents losing existing customers**.

---

### Phase A: Stabilize & Ship (Weeks 1-3)
**Goal:** Make the current app reliable enough that existing 5 houses don't churn, and new houses can be onboarded confidently.

#### A1. Fix the remaining ~170 TypeScript errors
- Many are in test files and scripts (not blocking runtime)
- Prioritize errors in `src/` core code
- Effort: 1-2 days

#### A2. Get tests passing in CI
- Install dependencies and verify the 46 existing test files pass
- Fix the Jest ESM config issue documented in `2026-02-21-test-suite-design.md`
- Set up a basic GitHub Actions workflow to run `npx jest` on PRs
- Effort: 1-2 days

#### A3. Execute the data model migration (Guest embedded weeks)
- The `scripts/migrate-full.ts` skeleton exists. Implement the remaining phase stubs.
- Run dry-run against production Firestore, then execute.
- This unblocks the ability to scale beyond 10 residents/house (1MB doc limit risk)
- Effort: 3-5 days

#### A4. Legal documentation
- Draft Terms of Service and Privacy Policy (can use templates for now)
- Required before any paid user acquisition
- Effort: 1-2 days

**Phase A Exit Criteria:**
- All core TS errors resolved
- Tests run green in CI
- Guest documents no longer embed Week objects
- ToS and Privacy Policy published

---

### Phase B: Resident Payment System (Weeks 4-7)
**Goal:** Enable houses to collect rent through the app — the #1 revenue driver.

The Stripe Connect infrastructure is partially in place (`StripeSettingsScreen.tsx`, `StripeAccountStatus`). What's missing:

#### B1. Backend — Resident payment Cloud Functions
- Payment intent creation for residents
- Payment method storage (cards/ACH)
- Recurring payment scheduling
- Invoice generation
- Webhook handlers for payment events
- Effort: 2 weeks

#### B2. Mobile — Resident payment screens
- Payment method management screen
- Make payment screen (one-time or auto-pay)
- Payment history screen
- Digital receipt view
- Payment reminder notifications
- Effort: 2 weeks

#### B3. Manager — Payment dashboard
- View all resident payments
- Mark manual payments (cash/check)
- Export payment data
- Overdue notifications
- Effort: 1 week

#### B4. Testing payment flows end-to-end
- Unit tests for payment services
- Stripe test-mode integration testing
- E2E test for payment happy path
- Effort: 3-5 days

**Phase B Exit Criteria:**
- 1 house successfully collects rent through the app
- Payment history visible to residents and managers
- $0 in failed/lost payments during beta
- All payment-related tests passing

---

### Phase C: Quality & Retention (Weeks 8-10)
**Goal:** Harden the app before scaling to more houses.

#### C1. Enhanced reporting with PDF export
- PDF generation for weekly/monthly compliance reports
- CSV export for accounting
- Scheduled email delivery of reports
- This is the **#2 operator need** and drives tier upsells
- Effort: 1-2 weeks

#### C2. Error monitoring & alerting
- Verify Sentry integration actually captures errors
- Set up Firebase Performance Monitoring
- Create a simple alerting channel (email or Slack)
- Effort: 3-5 days

#### C3. 2FA for admin accounts
- SMS-based or authenticator app 2FA
- Required for enterprise tier positioning
- Effort: 1 week

#### C4. Documentation cleanup
- Update or archive the 8+ outdated planning docs
- Create user-facing help content (Getting Started guide)
- Effort: 2-3 days

**Phase C Exit Criteria:**
- Operators can generate and export PDF compliance reports
- Error monitoring live with alerts
- 2FA available for admin accounts
- All stale documentation archived or updated

---

### Phase D: Oxford House MVP (Weeks 11-18)
**Goal:** Launch the minimum feature set to pilot with 5-10 Oxford Houses.

The type definitions (`Officer.ts`, `Election.ts`) are already in place. Build:

#### D1. House model selector & Oxford onboarding
- Toggle between Traditional and Oxford house types during setup
- Oxford-specific onboarding flow
- Effort: 1 week

#### D2. Officer role system
- Create/elect officers (President, Treasurer, Secretary, Comptroller)
- Term tracking with rotation reminders
- Officer-specific permissions
- Effort: 2 weeks

#### D3. Equal Expense Share (EES) tracking
- Financial transparency dashboard
- Auto-recalculation when residents move in/out
- Treasurer collection workflow
- Effort: 2 weeks

#### D4. Business meeting management
- Recurring weekly scheduler
- Attendance tracking
- Meeting minutes repository
- Agenda builder
- Effort: 1-2 weeks

#### D5. Democratic voting system
- New member votes (80% threshold)
- Expulsion votes
- Rule change votes
- Anonymous option
- Effort: 1-2 weeks

**Phase D Exit Criteria:**
- 5+ Oxford Houses actively using the app
- Officer elections and EES tracking working
- Business meeting functionality used weekly
- 80%+ satisfaction in pilot feedback

---

### Phase E: Scale (Months 5-12)
**Goal:** Grow to 50+ houses, reach $50K+ ARR

- Oxford House regional outreach
- Content marketing (blog, case studies)
- Referral program
- Photo verification feature
- Advanced analytics dashboard
- Annual billing option

---

## Part 4: What to Kill / Deprioritize

The planning docs propose building many things. Some should be explicitly deprioritized:

| Feature | Recommendation | Reason |
|---------|---------------|--------|
| **Web app modernization (Angular 9 → Next.js)** | KILL for now | Mobile-first product. Web can be a simple marketing page. Don't rewrite. |
| **Alumni network** | DEFER to Year 2+ | Requires critical mass of users that doesn't exist yet |
| **Third-party integrations (QuickBooks, etc.)** | DEFER to Year 2+ | Manual export/import works for current scale |
| **Marketing/lead management tools** | DEFER | Focus on product, not CRM features |
| **v2 clean-port architecture** | ABSORB into incremental work | A full clean-port rewrite is risky. Do the data model migration (Phase A3) incrementally instead. |
| **Document management** | DEFER to post-Phase C | Nice-to-have but not a revenue driver |
| **HIPAA compliance** | DEFER | Not required at current scale. Can address when enterprise customers demand it. |

---

## Part 5: Success Metrics

### 3-Month Checkpoint (May 2026)
- [ ] Resident payment system live in 3+ houses
- [ ] $500+/month in payment processing revenue
- [ ] 15+ total houses on platform
- [ ] 80%+ test pass rate in CI
- [ ] Zero hardcoded secrets (verified by automated scan)

### 6-Month Checkpoint (August 2026)
- [ ] Oxford House pilot with 5+ houses
- [ ] $2,000+/month total revenue
- [ ] 30+ total houses
- [ ] PDF reports available
- [ ] 2FA available for admins

### 12-Month Checkpoint (February 2027)
- [ ] 100+ houses
- [ ] $10,000+/month total revenue
- [ ] Oxford House features mature
- [ ] 3+ regional markets

---

## Part 6: Immediate Next Actions (This Week)

1. **Fix TypeScript errors** in core `src/` files (not scripts/tests)
2. **Install dependencies and verify all 46 test files pass**
3. **Set up basic GitHub Actions CI** to run tests on PRs
4. **Begin implementing `migrate-full.ts` phase stubs** (Phases 2-4)
5. **Draft a minimal Terms of Service** using a standard SaaS template

---

**This plan replaces the outdated portions of PRODUCT_ROADMAP.md, PRODUCTION_READINESS_REPORT.md, and MIGRATION_STATUS.md. The feature prioritization rankings in FEATURE_PRIORITIZATION.md remain valid.**
