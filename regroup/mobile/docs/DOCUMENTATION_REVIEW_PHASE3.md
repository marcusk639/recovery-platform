# RATS Documentation Review — Phase 3: Completeness and Accuracy

**Date:** February 27, 2026
**Reviewer scope:** Inline doc quality, API documentation, architecture documentation, README/onboarding, accuracy against code, changelog/migration guides, and completely missing documentation
**Predecessor:** `docs/DOCUMENTATION_ARCHITECTURE_REVIEW.md` (Phase 1/2 findings — structural issues, broken links, authority fragmentation, stale dates)

This review extends the earlier structural findings into deeper content analysis. Phase 1/2 established that the documentation corpus has a broken navigation layer, 4-way authority fragmentation, and stale dates. This review evaluates whether the _content that does exist_ is accurate, complete, and self-contained for the relevant audience.

---

## Table of Contents

1. [Inline Documentation Quality](#1-inline-documentation-quality)
2. [API Documentation: Cloud Functions](#2-api-documentation-cloud-functions)
3. [API Documentation: Firestore Data Model](#3-api-documentation-firestore-data-model)
4. [Architecture Documentation](#4-architecture-documentation)
5. [README and Onboarding Completeness](#5-readme-and-onboarding-completeness)
6. [Accuracy Verification: ACTIVE_PLAN vs. Code](#6-accuracy-verification-active_plan-vs-code)
7. [Changelog and Migration Guides](#7-changelog-and-migration-guides)
8. [Completely Absent Documentation](#8-completely-absent-documentation)
9. [Summary and Priority Matrix](#9-summary-and-priority-matrix)

---

## 1. Inline Documentation Quality

### 1.1 Sprint Plans — Self-Contained and Actionable

**Severity:** Low (positive finding)

The five sprint plan files (`2026-02-23-sprint-1-stability.md` through `sprint-5-oxford-acquisition.md`) are the best-written documents in the corpus. Each contains exact file paths with line numbers, before/after code diffs, TDD workflow (write failing test, verify failure, implement, verify pass), commit message guidance, and a verification checklist at the bottom. A developer with no prior context could follow Sprint 1 Task 1 and produce the correct output without asking a single clarifying question.

**The one structural flaw:** The verification checklists at the end of each sprint file contain only unchecked `bash` commands. There is no completion timestamp, no "PASS/FAIL" record, and no signoff. ACTIVE_PLAN asserts "Sprints 1-4 executed" but the sprint files themselves carry no evidence of this. A developer reading sprint-1-stability.md today sees a plan, not a record of what was done.

**Recommendation:** Add a one-line status banner at the top of each sprint file: `> STATUS: Completed February 2026.` and at the bottom of the verification section, fill in the expected grep results as the actual outputs observed. This takes 10 minutes per file.

---

### 1.2 CLOUD_FUNCTIONS_REVIEW.md — Raw AI Session Transcript Masquerading as Documentation

**Severity:** Critical

The file at `/Users/marcusklein/dev/rats-v2/docs/CLOUD_FUNCTIONS_REVIEW.md` opens with:

```
I'll analyze the cloud functions in the regroup-functions directory to identify what needs to be updated for the activity-based system.

[15 tools called]

Now I have a complete picture of the cloud functions. Let me provide a comprehensive analysis...
```

This is a verbatim AI agent response. It was never edited into a proper document. Consequences:

- The title claims "Cloud Functions Analysis" but the content is actually "Required changes for activity-based system migration" — a task now completed or superseded
- The code blocks inside are _proposed future changes_, not documentation of the current state
- A developer reading this document believes the Guest entity still has `currentWeek`, `previousWeek`, `nextWeek` fields — it does not, those were removed per `022ba16` commit ("remove legacy Week/Day data layer")
- None of the 49 deployed Cloud Functions are listed, described, or documented here
- The document contains no "Last Updated" date, no author, no status

**Recommendation:** Archive this file to `docs/archive/` immediately. It is not a reference document; it is a historical planning artifact. The information gap it was intended to address (Cloud Functions documentation) remains entirely unfilled.

---

### 1.3 ACTIVITY_SYSTEM_MIGRATION.md — Plan Frozen at November 2025 Status

**Severity:** High

`ACTIVITY_SYSTEM_MIGRATION.md` is dated November 27, 2025 with status "Final Recommendation." It describes a 4-phase migration plan (6-8 weeks) for moving from embedded Week/Day objects to an Activity-based system. As of February 2026, this migration is complete — `022ba16` removed the legacy Week/Day data layer, `scripts/migrate-full.ts` exists, and `WeekSummary` entities are in active use.

The document status field still reads "Final Recommendation" — the language of a proposal, not a completed migration. It does not contain:

- A "Migration Complete" status header
- A record of when each phase was executed
- Any reference to `scripts/migrate-full.ts` as the execution mechanism
- A statement that `migrate-full.ts` dry-run and execute modes have been run (or not yet run — ACTIVE_PLAN Sprint 9.1 still lists this as a future task: "Execute `migrate-full.ts` data migration (dry-run → execute)")

**Critical ambiguity:** Is this migration complete in production? The code has been refactored, the new entities exist, but Sprint 9.1 in ACTIVE_PLAN still lists "Execute `migrate-full.ts`" as an unchecked future task. A developer inheriting this codebase cannot determine whether:

1. The Week/Day code was removed and the migration script has been run against production data
2. The Week/Day code was removed but `migrate-full.ts` has never been run — meaning legacy data is still in the old schema in Firestore

This is a data integrity ambiguity with production consequences.

**Recommendation:** Add a status update to `ACTIVITY_SYSTEM_MIGRATION.md`:

- Phase 1-3: Completed February 2026 (code-level migration)
- Phase 4 (data migration via `migrate-full.ts`): NOT YET EXECUTED — see ACTIVE_PLAN Sprint 9.1

---

### 1.4 ACTIVITY_SYSTEM_TEST_PLAN.md — Implementation Gap

**Severity:** Medium

`ACTIVITY_SYSTEM_TEST_PLAN.md` (February 15, 2026, Status: "Implementation Phase") defines a 95%+ confidence testing strategy for the new Activity system before migration, with unit/integration/E2E layers and specific coverage targets. The document is a plan, not a record. There is no section confirming which test suites were actually written, what coverage was achieved, or whether the migration proceeded with or without meeting the test criteria.

**Recommendation:** Add a "Test Execution Results" section documenting actual coverage metrics and which test suites from the plan were implemented.

---

## 2. API Documentation: Cloud Functions

### 2.1 Zero Function-Level API Documentation

**Severity:** Critical

The project has 49 deployed Cloud Functions across the `regroup-functions` repository. The mobile app calls these functions. The web app calls some of them. None of these functions are documented at the API contract level anywhere in the documentation corpus.

Specifically absent for every function:

- Function name and trigger type (callable, HTTPS, Firestore trigger, scheduled, RTDB)
- Input parameters and types
- Output schema
- Authorization requirements (who can call this — any authenticated user? admin role only? specific house role?)
- Error codes returned
- Rate limiting or quota behavior
- Side effects (what other collections/documents are written)

ACTIVE_PLAN Part 1 provides a partial inventory table showing which functions exist in which repo, but this is only a name-level list, not API documentation.

**The security implications are significant.** ACTIVE_PLAN explicitly calls out that `listPayments` and `savePaymentMethod` have no authorization checks. Without function-level documentation, auditing authorization gaps requires reading the implementation code of each function. This was identified as a P0 security issue — and there is no documented contract to fix it against.

**Recommendation:** Create `/docs/CLOUD_FUNCTIONS_API.md` with a table per function containing: name, trigger type, input schema, output schema, authorization required, and side effects. Even a minimally-filled version for the 15 callable functions would be dramatically better than the current state.

---

### 2.2 Dual-Repo Function Deployment is Undocumented

**Severity:** Critical

ACTIVE_PLAN Part 1 identifies a critical problem: Stripe payment functions exist in both `regroup-functions` (the external backend repo) and in `functions/` (embedded in the mobile repo). ACTIVE_PLAN states: "The canonical deployment source needs clarification."

The git status at the time of this review shows the embedded `functions/` directory has been locally deleted (unstaged). This means one of two things: the embedded functions are being removed as part of resolving the dual-repo conflict, or the deletion is accidental. Neither scenario is documented anywhere. There is no document explaining:

- Why the embedded `functions/` directory existed at all
- What the decision was to resolve the duplication
- Which repo is now canonical for payment function deployment
- Whether the deletion of the embedded functions was intentional

**Recommendation:** Document the resolution in ACTIVE_PLAN Sprint 5.5 (the task that was supposed to resolve this) or in a new `docs/DEPLOYMENT.md`. At minimum, a git commit message or comment in the code explaining why the directory was removed.

---

## 3. API Documentation: Firestore Data Model

### 3.1 No Authoritative Firestore Schema Document

**Severity:** Critical

There is no document in the corpus that describes the Firestore data model: what collections exist, what fields each document contains, what the relationship between collections is, and what collection groups are used in queries.

The closest thing is `ACTIVITY_SYSTEM_MIGRATION.md` which describes the _new_ schema as part of a migration design. But this document is a planning artifact, not a schema reference. It describes the proposed structure, not the final deployed structure.

The `WeekSummary.ts` entity file contains inline JSDoc comments (e.g., `// Format: {guestId}_{startDate}`) which are the only documentation of ID conventions in the codebase.

Collections that exist in production but are not documented anywhere:

- `houses` — field list unknown without reading `House.tsx`
- `guests` — field list unknown without reading `Guest.tsx`
- `activities` — documented in entity file only
- `week-summaries` — documented in entity file only
- `payments` — referenced in `payment.ts` service but no schema
- `oxford/` subcollections (officers, meetings, votes, ees) — no documentation
- `na-meetings` — 300K+ record collection, undocumented schema
- `house-activities` — referenced in migration doc, unclear if this collection still exists

**Recommendation:** Create `/docs/FIRESTORE_SCHEMA.md` documenting at minimum the 10 primary collections with their field names, types, and relationships. This is the single most valuable missing technical document for a developer inheriting this codebase.

---

### 3.2 Firebase Security Rules Not Documented

**Severity:** High

The `firebase/firestore.rules` file contains the actual security rules in production. The file was briefly inspected and shows a reasonable role-based structure using custom claims. However:

- There is no documentation explaining what each rule block covers
- There is no document explaining the custom claims structure (what fields are set on the auth token, what values they hold, how they are set by Cloud Functions)
- ACTIVE_PLAN identifies security gaps (Oxford subcollections, payments have no authorization) but there is no document tracking which rules exist, which are missing, and what the intended coverage should be
- The Realtime Database rules (`database.rules.json`) contain `".read": true, ".write": true` — world-readable and writable — which is either a dev-only file or a critical security vulnerability. There is no documentation clarifying which.

**Recommendation:** Add a `docs/SECURITY_RULES.md` that: (1) lists each collection and its current security rules, (2) identifies known gaps (per ACTIVE_PLAN's P0 items), (3) explains the custom claims structure, and (4) confirms the Realtime Database rules status.

---

## 4. Architecture Documentation

### 4.1 Three-Client, Two-Repo System Not Diagrammed Anywhere

**Severity:** High

The RATS platform consists of:

- `rats-v2` (React Native mobile app) — this repo
- `regroup-functions` (Firebase Cloud Functions) — separate repo, separate deployment
- `rats-web` (Angular SSR web portal) — third separate repo
- Firebase project `phoenix-cleanhouse` — shared backend
- Stripe — external payment processor with webhook integration

None of these components and their relationships are visualized or described in a single architectural overview document. A new developer must piece this together from scattered references in ACTIVE_PLAN, the GTM action plan, and the PRODUCT_STRATEGY_ASSESSMENT.

The closest thing to a system diagram is in `ACTIVITY_SYSTEM_MIGRATION.md` — a Firestore-specific architecture diagram drawn in ASCII. There is no high-level system diagram.

**Recommendation:** Create `/docs/ARCHITECTURE.md` with:

- A system component diagram showing the three repos, Firebase project, and Stripe
- Data flow description: what the mobile app calls, what goes to the web portal, what triggers Cloud Functions
- The deployment model: how each component is deployed and by whom

---

### 4.2 No Architecture Decision Records

**Severity:** Medium

The existing `DOCUMENTATION_ARCHITECTURE_REVIEW.md` (Phase 1/2) identified this. Significant architectural decisions have been made with no ADR trail:

| Decision Made                                                     | Where Recorded                                                                   | Status |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Migrate from embedded Week model to WeekSummary                   | Only described in migration plan (which was a proposal, not a decision record)   | No ADR |
| Keep single app for both verticals                                | Mentioned in `SINGLE_VS_DUAL_APP_ANALYSIS.md` (archived)                         | No ADR |
| Use Stripe Connect Express (not Standard or Custom)               | Not documented anywhere                                                          | No ADR |
| Kill web app modernization                                        | Mentioned in ACTIVE_PLAN Kill List as a one-liner                                | No ADR |
| Use Realtime Database for messages, Firestore for everything else | Noted as a "mixed database usage" problem in GAP_ANALYSIS, no decision rationale | No ADR |
| Keep embedded functions/ separate from regroup-functions          | Never documented; directory now being deleted without explanation                | No ADR |

**Recommendation:** Establish an `/docs/adr/` directory. The first three ADRs should document the Week model migration, the single-app decision, and the dual-repo situation resolution. Each ADR takes 15-30 minutes to write.

---

### 4.3 IMPLEMENTATION_PLAN.md Contradicts Current Architecture

**Severity:** High

`IMPLEMENTATION_PLAN.md` contains a prominent "Key Decision" at the top:

> "KEEP the embedded Week model — analysis shows it's actually optimal for your UI patterns (always loads complete weeks, no concurrent update issues, no 1MB limit hit)."

And later:

> "Don't normalize the Guest/Week data model (current structure is optimal)"

The system has since been normalized. The Guest entity no longer has `currentWeek`, `previousWeek`, or `nextWeek`. The embedded `functions/` changes referenced in `CLOUD_FUNCTIONS_REVIEW.md` were specifically designed to remove the Week dependency. `WeekSummary` is now the operative entity.

This document is still listed under "Active Plans" in `docs/README.md` line 55. A developer or AI agent reading it will implement the wrong architecture. This finding was noted in Phase 1/2 as requiring a supersession banner — it bears repeating here because the architectural contradiction is not subtle: it directly recommends the opposite of what was built.

**Recommendation (immediate):** Add to the top of `IMPLEMENTATION_PLAN.md`:

```
> SUPERSEDED — February 2026. This document describes an architecture that was not followed.
> The Guest/Week model WAS normalized to WeekSummary subcollections.
> See docs/plans/ACTIVE_PLAN.md for current state.
```

---

## 5. README and Onboarding Completeness

### 5.1 No Root-Level README

**Severity:** Critical

There is no `README.md` at the project root (`/Users/marcusklein/dev/rats-v2/README.md`). A developer cloning this repository from GitHub sees no entry point, no setup instructions, no technology overview, and no pointer to the `docs/` directory.

Every major React Native project should have a root README with at minimum:

- What the project is (2-3 sentences)
- Prerequisites (Node version, React Native CLI, Xcode, Android Studio versions)
- Setup steps (install deps, configure Firebase, run iOS/Android)
- How to run tests
- Where to find documentation

**Recommendation:** Create a root `README.md`. This is the most impactful 30-minute documentation task in the entire corpus.

---

### 5.2 No Development Environment Setup Guide

**Severity:** Critical

There is no `ENVIRONMENTS.md`, `SETUP.md`, or equivalent document describing how to set up a development environment. Based on the codebase, the following setup is required but not documented:

1. Node.js version (implied by package.json but not stated)
2. React Native 0.72 environment setup (Xcode version, iOS simulator, Android SDK)
3. Firebase project configuration — which project to use, how to get `google-services.json` and `GoogleService-Info.plist`
4. Environment variables via `react-native-config` (what variables are required, what their format is)
5. `pod install` from `ios/` directory (critical — the project uses a custom Podfile post_install hook to fix Xcode 26 compatibility; this is documented in `MEMORY.md` but nowhere in the project documentation)
6. Node modules symlink awareness (`node_modules` is a symlink to `../rats/node_modules` — this is architecturally unusual and will break standard setup instructions)
7. Stripe test keys — how to configure them for local development
8. Firebase emulator setup — whether it is supported or required
9. How to run the Cloud Functions locally (separate repo `regroup-functions`)

The Xcode 26 / iOS build fix documented in `MEMORY.md` is critical tribal knowledge. If a developer sets up a new Mac with current Xcode and tries to build, it will fail without applying the Podfile fix. This information lives only in the Claude memory file — it is not in any project document.

**Recommendation:** Create `/docs/SETUP.md` with prerequisites, step-by-step setup, and known environment issues (especially the Podfile Xcode 26 fix and the node_modules symlink situation).

---

### 5.3 No Cloud Functions Deployment Guide

**Severity:** High

There is no `DEPLOYMENT.md` or equivalent document describing how to deploy the Cloud Functions. This matters because:

- There are two repos that may deploy Cloud Functions (the dual-repo ambiguity in ACTIVE_PLAN)
- Cloud Functions are on Firebase v2 SDK (migrated from v1), which uses a different deployment syntax
- Secrets are managed via Secret Manager (migrated from `functions.config()`) — the procedure for adding new secrets is not documented
- ACTIVE_PLAN Sprint 9.3 lists "Add CI for regroup-functions" as a future task, implying manual deployment is currently required — the manual procedure is nowhere documented

**Recommendation:** Create `/docs/DEPLOYMENT.md` covering: how to deploy regroup-functions, how to add or rotate secrets in Secret Manager, the CI/CD gap and current manual workaround, and which Firebase project (`phoenix-cleanhouse`) is production.

---

### 5.4 No Secrets Management Guide

**Severity:** High

The project uses multiple secrets:

- Firebase project credentials
- Stripe publishable and secret keys (test and live)
- Stripe webhook secret
- SendGrid API key (referenced in GTM plan)
- Google Maps API key (referenced in codebase)

ACTIVE_PLAN mentions that secrets were moved from hardcoded values to Firebase Secret Manager (resolved from the earlier `GAP_ANALYSIS` finding). There is no document describing:

- What secrets exist
- Which are stored where (Secret Manager vs. environment variables vs. `react-native-config`)
- How to rotate them
- How to configure them for a new developer's local environment
- Which secrets are required at build time vs. runtime

**Recommendation:** Create `/docs/SECRETS.md` (or a section in `SETUP.md`) listing each secret, where it is stored, and how to obtain a development-safe value.

---

## 6. Accuracy Verification: ACTIVE_PLAN vs. Code

### 6.1 "Sprints 1-4 Executed" — Verified Against Code

**Severity:** Low (finding supports the claim, with caveats)

The git log from February 22-28, 2026 shows 125 commits including commits clearly aligned with sprint tasks:

- `fix(notifications): remove production console statements` — Sprint 2 tasks
- `fix(house): replace console statements with logException` — Sprint 2 tasks
- `fix(deep-links): remove production console statements` — Sprint 2 tasks
- `refactor: replace wildcard lodash imports with named imports across 33 files` — Sprint 4
- `refactor(MeetingSearch): extract MeetingSearchBar and MeetingResultsList` — Sprint 4
- `fix(useWeekSummary): guard Timestamp.toDate()` — Sprint 2

The sprint plans appear to have been executed. However, Sprint 5 of the plans (`2026-02-23-sprint-5-oxford-acquisition.md`) had as Task 1 "delete `src/services/payment.ts`." Both `payment.ts` and `payments.ts` still exist in `src/services/`. Either Task 1 was not completed, or it was consciously deferred. There is no record of this in the sprint plan or in ACTIVE_PLAN.

**Recommendation:** Add completion notes to Sprint 5 indicating which tasks were done and which were deferred.

---

### 6.2 ACTIVE_PLAN Claims Oxford Screens Are Built — Partially Verified

**Severity:** Medium

ACTIVE_PLAN Part 3C states: "Route registered, unknown if implemented" for OfficerManagement, BusinessMeetings, EESTracker, and OxfordVoting. The GTM action plan Section 4 (February 23, 2026) is more optimistic, stating these screens are "ready now":

> - Officer Management — roles, terms, active status
> - Business Meetings — agenda, quorum, attendance, minutes (needs date picker fix)
> - Voting — motions, elections, real-time tally
> - EES Tracker — equal expense tracking, paid/unpaid status, period grouping

The actual screen files exist at `/Users/marcusklein/dev/rats-v2/src/screens/Oxford/` (`BusinessMeetings.tsx`, `EESTracker.tsx`, `OfficerManagement.tsx`, `OxfordDashboard.tsx`, `Voting.tsx`). ACTIVE_PLAN and the GTM plan contradict each other on whether these screens are "usable" or only "registered." There is no E2E test or integration test verifying these screens are functional. The GTM plan's Section 10 explicitly asks: "Has the Oxford end-to-end purchase flow been manually tested?" — it is an open question, not a confirmed fact.

**Recommendation:** ACTIVE_PLAN should distinguish between "file exists" and "feature is functional." For each Oxford screen, the status should explicitly note whether it has been manually tested end-to-end.

---

### 6.3 Embedded functions/ Directory Locally Deleted but Documented as Existing

**Severity:** High

ACTIVE_PLAN Part 1 documents the "Embedded functions/" as an active component:

> "7 Stripe-specific Cloud Functions (createPaymentIntent, listPayments, savePaymentMethod, connectStripeAccount, disconnectStripeAccount, getStripeAccountStatus, stripeWebhook) — Comprehensive tests (90% line/function coverage target)"

The git working tree shows this entire directory has been deleted (unstaged changes). The directory is gone locally but the deletion is not committed, not documented, and not referenced in any planning document. ACTIVE_PLAN's dual-repo confusion section (Part 1, "Key risk") acknowledges the ambiguity but does not record a resolution decision.

This is the most significant active documentation-vs-reality discrepancy in the corpus: ACTIVE_PLAN describes a component that no longer exists on disk.

**Recommendation:** Either commit the deletion with an explanatory commit message, or restore the files. Either way, update ACTIVE_PLAN to reflect the current state of the deployment architecture.

---

### 6.4 GAP_ANALYSIS_PRODUCTION_READINESS.md — Actively Misleading on Every Metric

**Severity:** Critical (confirmed from Phase 1/2, reinforced here)

This document (December 25, 2025) reports metrics that are factually wrong as of February 2026:

| Metric                  | GAP_ANALYSIS Reports        | ACTIVE_PLAN Reports (Feb 2026) | Actual Code Evidence                                                                                  |
| ----------------------- | --------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Test coverage           | 5% (2 test files)           | 92% (354 test files)           | Batch summaries 12-18 confirm 946 TypeScript errors fixed, 232 test files visible in mobile app alone |
| Payment system          | 30% (operator billing only) | 75%                            | 6 payment screens exist in `/src/screens/RentPayment/`                                                |
| Oxford House support    | 0% (not started)            | 55%                            | Oxford screens exist in `/src/screens/Oxford/`                                                        |
| Hardcoded Stripe secret | Still present               | Resolved                       | Archive REMAINING_WORK_PLAN confirms resolved                                                         |

The document is listed as a primary reference in `docs/README.md` ("I want to understand what needs to be done — Start with GAP_ANALYSIS"). Following this guide will produce a 2-month-stale, fundamentally incorrect understanding of the product.

This is not a "needs update" situation — it is a document that is wrong on every primary metric it reports.

**Recommendation:** Archive immediately. Add banner if kept: "STALE — December 2025 baseline. Every metric in this document has changed materially. See ACTIVE_PLAN.md Part 2."

---

## 7. Changelog and Migration Guides

### 7.1 WeekSummary Migration — Partially Documented, Execution Status Unclear

**Severity:** High

The migration from the embedded Week/Day model to WeekSummary is the largest architectural change in the project's recent history. It affects:

- The `Guest` entity (fields removed)
- The `Week` entity (deprecated)
- Cloud Functions (`transferStats`, `determineDisputeResult`, `calculateWeeklyHealth`)
- All UI components that previously read `guest.currentWeek`
- The scheduled weekly transfer function

Documentation that exists:

- `ACTIVITY_SYSTEM_MIGRATION.md` — the design proposal (November 2025)
- `CLOUD_FUNCTIONS_REVIEW.md` — proposed Cloud Function changes (AI planning artifact)
- `WeekSummary.ts` — the new entity (inline JSDoc only)
- `scripts/migrate-full.ts` — the data migration script (self-documented with usage comments)

What is missing for a developer inheriting this codebase:

1. Confirmation that the code-level migration is complete
2. Confirmation of whether `migrate-full.ts` has been run against production data
3. What the legacy `weeks` collection in Firestore now contains (is it still there? to be deleted?)
4. How `compliance.ts` and `util/guest.tsx` were updated (the files changed but no migration guide documents this)
5. What backward compatibility was maintained (the `migratedFromLegacy: boolean` field in `WeekSummary` suggests there was a migration boundary)

**Recommendation:** Write a 1-page `docs/MIGRATION_WEEKMODEL.md` documenting: what changed, when it was completed, what the `migrate-full.ts` script does, its current execution status, and what collections need cleanup.

---

### 7.2 No Breaking Change Documentation

**Severity:** Medium

There is no changelog or breaking-changes document. The type-fix batch summaries (Batches 12-18) document TypeScript fixes methodically, but they are not a changelog — they are internal tooling records. No document exists that:

- Lists breaking changes by version or date
- Documents renamed/removed entity fields
- Documents renamed Cloud Function names (the `createRentPaymentIntent` vs. `createPaymentIntent` naming issue that Sprint 5.1 was supposed to resolve)
- Documents deprecated services or patterns

**Recommendation:** Create `/docs/CHANGELOG.md` as a running record of breaking changes. The first entries should document the Week model removal and the dual payment service consolidation.

---

### 7.3 PRICING_STRATEGY_OPTIONS.md — Three Incompatible Recommendations

**Severity:** Medium (confirmed from Phase 1/2)

Three documents recommend different pricing with no reconciliation:

| Document                      | Date         | Traditional                 | Oxford           | Transaction Fee          |
| ----------------------------- | ------------ | --------------------------- | ---------------- | ------------------------ |
| `PRICING_STRATEGY_OPTIONS.md` | Nov 2025     | $69-129/mo tiered           | $49-89/mo tiered | Not specified            |
| `PRICING_STRATEGY.md` (root)  | Feb 5, 2026  | $69/mo Starter, $129/mo Pro | $49/mo Standard  | Not specified            |
| `GTM action plan` Section 3   | Feb 23, 2026 | $25/house + $2/resident     | $69/mo           | 3% standard, 2.5% annual |
| `FEATURE_PRIORITY_ROADMAP.md` | Nov 2025     | $49-99/mo                   | $39-69/mo        | 2.9% + $0.30             |

The GTM plan is the most recent and most specific. However, ACTIVE_PLAN Sprint 5.6 says "Set real Stripe publishable key" without specifying which pricing model's keys to configure. No document clearly states "this is the approved pricing, effective immediately."

**Recommendation:** Designate the GTM action plan Section 3 as canonical pricing. Add a single-line note to `ACTIVE_PLAN.md` under a new "Approved Pricing" heading pointing to GTM Section 3. Add supersession notices to the older pricing documents.

---

## 8. Completely Absent Documentation

The following categories of documentation are entirely absent from the corpus:

### 8.1 No Root README

**Severity:** Critical

As established in Section 5.1. A GitHub visitor sees nothing.

---

### 8.2 No Firestore Schema Reference

**Severity:** Critical

As established in Section 3.1. Collections, field names, types, and relationships must be reverse-engineered from entity TypeScript files.

---

### 8.3 No ENVIRONMENTS.md

**Severity:** Critical

As established in Section 5.2. There is no document confirming which Firebase project is production (`phoenix-cleanhouse` per MEMORY.md) vs. development, how to configure local development, or how to target different environments.

---

### 8.4 No DEPLOYMENT.md

**Severity:** High

As established in Section 5.3. How to deploy the 49 Cloud Functions, how to rotate secrets, and whether deployment requires manual steps or CI are all undocumented.

---

### 8.5 No Privacy or Data Classification Document

**Severity:** High

RATS collects health-adjacent data: sobriety dates, drug of choice, medication schedules, mental health observations, incident logs, and compliance history. This is sensitive personal information. No document exists that:

- Classifies the data collected (PII, health-adjacent, etc.)
- Describes what data retention policy applies
- Describes what data is or is not shared with third parties (Stripe receives payment data; SendGrid receives email addresses)
- Addresses HIPAA applicability (ACTIVE_PLAN Kill List defers HIPAA compliance — but the deferral decision is a one-liner with no rationale for why it is safe to defer)

**Recommendation:** Create `/docs/DATA_PRIVACY.md` documenting data collected, classification, retention, third-party sharing, and the HIPAA deferral rationale.

---

### 8.6 No Cloud Functions API Reference

**Severity:** Critical

As established in Section 2.1. 49 deployed functions with no contract documentation.

---

### 8.7 No Onboarding Guide for New Developers

**Severity:** Critical

There is no combined document that takes a developer from "I just cloned the repo" to "I can run the app and tests." The information required is scattered across: `MEMORY.md` (Claude-specific memory file, not a dev doc), `package.json` (scripts only), `docs/archive/functions-session.md` (AI session log), and various planning documents. The Xcode 26 Podfile fix — which will silently cause build failures on modern Macs — exists only in the Claude session memory file.

---

### 8.8 No Architecture Decision Records

**Severity:** Medium

As established in Section 4.2. Four major decisions with no ADR trail.

---

### 8.9 No Security Runbook

**Severity:** Medium

There is no document describing what to do if a secret is exposed, how to revoke and rotate credentials, or what the incident response procedure is for a security issue. Given that the codebase previously had a hardcoded live Stripe secret key in source (documented in `GAP_ANALYSIS_PRODUCTION_READINESS.md` Section 5.1) that was later removed, the risk is not theoretical.

---

### 8.10 No CONTRIBUTING.md

**Severity:** Low

There are no documented contribution guidelines. For a solo developer this matters less, but the project uses AI agents heavily (Claude Code) — having documented coding conventions, branching strategy, and commit format helps AI agents produce consistent output.

---

## 9. Summary and Priority Matrix

| #   | Finding                                                                        | Severity | Document(s) Affected                                          | Effort                             |
| --- | ------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------- | ---------------------------------- |
| 1   | No root README                                                                 | Critical | Create `/README.md`                                           | 30 min                             |
| 2   | GAP_ANALYSIS actively misleading on every metric                               | Critical | `GAP_ANALYSIS_PRODUCTION_READINESS.md`                        | 5 min (banner) or archive          |
| 3   | CLOUD_FUNCTIONS_REVIEW.md is raw AI transcript, not a doc                      | Critical | Archive, create `CLOUD_FUNCTIONS_API.md`                      | 30 min to archive; days to replace |
| 4   | No Cloud Functions API documentation (49 functions, 0 documented)              | Critical | Create `docs/CLOUD_FUNCTIONS_API.md`                          | 1-2 days                           |
| 5   | No Firestore schema reference                                                  | Critical | Create `docs/FIRESTORE_SCHEMA.md`                             | 4-8 hrs                            |
| 6   | No development environment setup guide                                         | Critical | Create `docs/SETUP.md`                                        | 2-4 hrs                            |
| 7   | functions/ directory deleted locally but documented as active in ACTIVE_PLAN   | High     | Update `ACTIVE_PLAN.md` Part 1                                | 30 min                             |
| 8   | IMPLEMENTATION_PLAN.md recommends opposite of current architecture             | High     | Add supersession banner                                       | 5 min                              |
| 9   | WeekSummary migration execution status unclear (has migrate-full.ts been run?) | High     | Update `ACTIVITY_SYSTEM_MIGRATION.md`, update ACTIVE_PLAN 9.1 | 30 min                             |
| 10  | No DEPLOYMENT.md for Cloud Functions                                           | High     | Create `docs/DEPLOYMENT.md`                                   | 2-4 hrs                            |
| 11  | No SECRETS.md / secrets management guide                                       | High     | Create `docs/SECRETS.md`                                      | 1-2 hrs                            |
| 12  | Firebase security rules not documented                                         | High     | Create `docs/SECURITY_RULES.md`                               | 2-4 hrs                            |
| 13  | No Privacy / data classification document                                      | High     | Create `docs/DATA_PRIVACY.md`                                 | 2-4 hrs                            |
| 14  | Three-client, two-repo system not diagrammed                                   | High     | Create `docs/ARCHITECTURE.md`                                 | 2-4 hrs                            |
| 15  | Oxford screen implementation status ambiguous in ACTIVE_PLAN vs. GTM plan      | Medium   | Update ACTIVE_PLAN Part 3C with actual test status            | 30 min                             |
| 16  | Sprint 5 Task 1 (delete payment.ts) not completed but not noted                | Medium   | Update sprint-5 completion status                             | 15 min                             |
| 17  | ACTIVITY_SYSTEM_MIGRATION.md status frozen at "Final Recommendation"           | Medium   | Update status field                                           | 15 min                             |
| 18  | No Architecture Decision Records                                               | Medium   | Create `docs/adr/` with 3-4 initial ADRs                      | 2-4 hrs                            |
| 19  | Three incompatible pricing recommendations with no canonical designation       | Medium   | Update ACTIVE_PLAN, add supersession notices                  | 30 min                             |
| 20  | Sprint plan verification checklists have no completion evidence                | Low      | Add status banners to sprint-1 through sprint-5               | 10 min/file                        |
| 21  | FEATURE_PRIORITY_ROADMAP.md projects Q1-Q4 2025 targets with no annotation     | Low      | Add date-context banner                                       | 5 min                              |
| 22  | e2e/ and type-fixes/ directories have no index                                 | Low      | Add README.md to each                                         | 15 min/dir                         |

### Immediate Actions (< 1 hour total)

1. Archive `GAP_ANALYSIS_PRODUCTION_READINESS.md` or add the banner specified in this report
2. Archive `CLOUD_FUNCTIONS_REVIEW.md`
3. Add supersession banner to `IMPLEMENTATION_PLAN.md`
4. Update `ACTIVE_PLAN.md` Part 1 to reflect that the embedded `functions/` directory has been removed
5. Add "STATUS: Completed" banners to sprint-1 through sprint-5 files

### This Week (< 1 day total)

6. Create root `README.md` (minimum viable — what it is, how to set up, where to find docs)
7. Create `docs/SETUP.md` with prerequisites and the critical Xcode 26 / Podfile fix
8. Clarify WeekSummary migration production execution status and document it in one place
9. Designate canonical pricing document

### This Month

10. Create `docs/FIRESTORE_SCHEMA.md`
11. Create `docs/CLOUD_FUNCTIONS_API.md` (at least the 15 callable functions)
12. Create `docs/ARCHITECTURE.md` with system diagram
13. Create `docs/DEPLOYMENT.md`
14. Create `docs/DATA_PRIVACY.md`
15. Establish `docs/adr/` with the first 3 ADRs

---

**The documentation corpus has strong analytical content and excellent sprint-level execution plans, but is missing all of the reference documentation that a new developer or inheritor would need to understand, set up, or safely modify the system. The highest-leverage action is creating a root README that points to ACTIVE_PLAN and SETUP.md — two documents that currently do not exist.**

---
*Last reviewed: 2026-05-24 | Audience: developer | Type: concept*
