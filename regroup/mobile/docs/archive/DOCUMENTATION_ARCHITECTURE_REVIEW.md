---
archived: true
archived_date: 2026-05-24
reason: 'Meta-doc from the Feb 2026 docs reorganization pass. No longer actionable.'
---

# Documentation Architecture Review

**Date:** February 27, 2026
**Reviewer:** Architecture Reviewer
**Scope:** All active documentation in `docs/`, `docs/plans/`, `docs/e2e/`, `docs/type-fixes/`
**Verdict:** The documentation corpus contains strong individual content but suffers from temporal drift, authority fragmentation, and broken navigation. The system needs consolidation, not more documents.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Finding 1: Authority Fragmentation](#2-finding-1-authority-fragmentation--who-is-the-source-of-truth)
3. [Finding 2: Broken Navigation Layer](#3-finding-2-broken-navigation-layer)
4. [Finding 3: Temporal Confusion](#4-finding-3-temporal-confusion--date-drift)
5. [Finding 4: Sprint Plans Are Well-Structured but Orphaned from ACTIVE_PLAN](#5-finding-4-sprint-plans-are-well-structured-but-orphaned-from-active_plan)
6. [Finding 5: Requirements Traceability Gap](#6-finding-5-requirements-traceability-gap)
7. [Finding 6: Pricing and Revenue Contradictions](#7-finding-6-pricing-and-revenue-contradictions)
8. [Finding 7: e2e and type-fixes Directories Lack Index](#8-finding-7-e2e-and-type-fixes-directories-lack-index)
9. [Finding 8: IMPLEMENTATION_PLAN.md is Superseded but Not Marked](#9-finding-8-implementation_planmd-is-superseded-but-not-marked)
10. [Finding 9: GAP_ANALYSIS Is Stale and Contradicts ACTIVE_PLAN](#10-finding-9-gap_analysis-is-stale-and-contradicts-active_plan)
11. [Finding 10: Architectural Consistency Is Mostly Sound](#11-finding-10-architectural-consistency-is-mostly-sound)
12. [Recommendations Summary](#12-recommendations-summary)

---

## 1. Executive Summary

The RATS documentation consists of approximately 40 active files across 4 directories. The documents fall into 5 categories: strategic vision (requirements, pricing, product strategy), planning (sprints, roadmaps, GTM), technical analysis (gap analysis, cloud functions review, codebase assessment), execution records (e2e test status, type-fix batches), and the single-source-of-truth plan (`ACTIVE_PLAN.md`).

**Strengths:**

- `ACTIVE_PLAN.md` (Feb 27, 2026) is an excellent, current single-source-of-truth document with production readiness scores, ecosystem state, detailed gap analysis, and a concrete execution plan
- The sprint plans (sprint-1 through sprint-5) are highly actionable, TDD-focused, with exact file paths, code diffs, and verification steps
- The GTM action plan is thorough and well-grounded in codebase reality
- Business strategy documents (pricing, feature priority, product assessment) are analytically strong

**Critical Problems:**

- `docs/README.md` points to 7 files that do not exist, rendering the primary navigation document unreliable
- At least 4 documents claim to be authoritative for overlapping domains, creating contradictions
- Date references span from "Q1 2025" to "February 2026" with no reconciliation, making it unclear which projections and timelines are current
- `GAP_ANALYSIS_PRODUCTION_READINESS.md` reports 5% test coverage and 0% Oxford support; `ACTIVE_PLAN.md` reports 92% testing score and 55% Oxford support -- neither supersession notice nor cross-reference exists
- `IMPLEMENTATION_PLAN.md` describes a 12-week parallel-track plan that has been entirely superseded by the sprint-based system, but carries no deprecation marker

---

## 2. Finding 1: Authority Fragmentation -- Who Is the Source of Truth?

**Severity:** Critical
**Architectural Impact:** A developer or AI agent cannot determine which document to trust for a given decision without reading all of them.

### Problem

Multiple documents claim authority over the same domains:

| Domain                    | Competing Documents                                                                            | Conflict                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **What to build next**    | `ACTIVE_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `FEATURE_PRIORITY_ROADMAP.md`                      | ACTIVE_PLAN says Sprints 5-9; IMPLEMENTATION_PLAN says 12-week parallel tracks; FEATURE_PRIORITY_ROADMAP says Phase 1-3 by quarter |
| **Pricing**               | `PRICING_STRATEGY_OPTIONS.md`, GTM action plan Section 3, `ACTIVE_PLAN.md` Kill List           | PRICING_STRATEGY recommends $69-129; GTM recommends $25/house + $2/resident; both are labeled "recommended"                        |
| **Production readiness**  | `GAP_ANALYSIS_PRODUCTION_READINESS.md`, `ACTIVE_PLAN.md` Part 2                                | Gap analysis says 5% test coverage, 30% payment; ACTIVE_PLAN says 92% testing, 75% payment                                         |
| **Oxford feature status** | `GAP_ANALYSIS_PRODUCTION_READINESS.md`, `ACTIVE_PLAN.md` Part 3, `FEATURE_PRIORITY_ROADMAP.md` | Gap analysis says 0% Oxford; ACTIVE_PLAN says 55%; Feature Roadmap says "Q1 2025" launch target                                    |

`ACTIVE_PLAN.md` explicitly states: "This document replaces all prior planning documents." However, this statement appears only inside ACTIVE_PLAN itself. The replaced documents carry no deprecation notice. A reader who opens `IMPLEMENTATION_PLAN.md` directly (or an AI agent pointed to it) will follow instructions that are no longer current.

### Recommendation

Add a YAML frontmatter or prominent banner to every superseded document:

```markdown
> **SUPERSEDED** -- This document was replaced by [ACTIVE_PLAN.md](./plans/ACTIVE_PLAN.md) on February 27, 2026.
> Retained for historical context only.
```

Apply this to:

- `IMPLEMENTATION_PLAN.md`
- `FEATURE_PRIORITY_ROADMAP.md` (planning sections)
- `GAP_ANALYSIS_PRODUCTION_READINESS.md`

---

## 3. Finding 2: Broken Navigation Layer

**Severity:** Critical
**Architectural Impact:** `docs/README.md` is the designated entry point. If it cannot be trusted, the entire documentation hierarchy breaks down.

### Problem

`docs/README.md` references 7 files that do not exist at the specified paths:

| Reference in README             | Target Path                       | Exists? |
| ------------------------------- | --------------------------------- | ------- |
| `MIGRATION_STATUS.md`           | `../MIGRATION_STATUS.md`          | No      |
| `TEST_ID_COVERAGE.md`           | `../TEST_ID_COVERAGE.md`          | No      |
| `CURRENT_APP_STATE.md`          | `./CURRENT_APP_STATE.md`          | No      |
| `NEW_ARCHITECTURE_STRATEGY.md`  | `./NEW_ARCHITECTURE_STRATEGY.md`  | No      |
| `UI_ARCHITECTURE_ANALYSIS.md`   | `./UI_ARCHITECTURE_ANALYSIS.md`   | No      |
| `FIRESTORE_INDEX_ANALYSIS.md`   | `./FIRESTORE_INDEX_ANALYSIS.md`   | No      |
| `ONBOARDING_UX_OPTIMIZATION.md` | `./ONBOARDING_UX_OPTIMIZATION.md` | No      |

Three root-level files referenced exist but are not in `docs/`:

- `/PRODUCT_ROADMAP.md` -- exists at root
- `/FEATURE_PRIORITIZATION.md` -- exists at root
- `/PRICING_STRATEGY.md` -- exists at root

Additionally, `docs/README.md` says "Last Updated: February 5, 2026" but its "Quick Links" section says "Start Here (as of Feb 22, 2026)." The status table says `IMPLEMENTATION_PLAN.md` "Needs Update" (dated Nov 28, 2025) but does not acknowledge that it has been entirely replaced.

### Impact

The "Documentation Map by Purpose" section -- the primary onboarding guide -- sends readers to 4 non-existent files. The "I want to understand the technical architecture" pathway is completely broken (3 of 4 links dead). The "I want to understand the migration progress" pathway is fully broken (both links dead).

### Recommendation

1. Audit every link in `docs/README.md` against the actual filesystem
2. Remove references to deleted files or move them to an "Archived/Removed" section
3. Update the "Quick Links" to point to `ACTIVE_PLAN.md` as the sole starting point
4. Add the `docs/plans/` directory and its sprint plan files to the index
5. Add `docs/e2e/` and `docs/type-fixes/` to the index

---

## 4. Finding 3: Temporal Confusion -- Date Drift

**Severity:** High
**Architectural Impact:** Readers cannot assess whether projections and targets are current or historical without cross-referencing multiple documents.

### Problem

The documentation corpus contains date references that span over a year with no reconciliation:

| Document                               | Date Reference                             | Context                                                                             |
| -------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `FEATURE_PRIORITY_ROADMAP.md`          | "Q1 2025," "Q2 2025," "Q3 2025," "Q4 2025" | Quarterly milestones: "50 Oxford Houses onboarded in Q1 2025," "$1M ARR by Q4 2025" |
| `FEATURE_PRIORITY_ROADMAP.md` header   | "Last Updated: November 29, 2025"          | Document date                                                                       |
| `PRICING_STRATEGY_OPTIONS.md` header   | "Date: November 29, 2025"                  | Document date                                                                       |
| `IMPLEMENTATION_PLAN.md`               | "~8 weeks" / "~12 weeks"                   | No start date anchored                                                              |
| `GAP_ANALYSIS_PRODUCTION_READINESS.md` | "December 25, 2025"                        | Analysis date                                                                       |
| `ACTIVE_PLAN.md`                       | "February 27, 2026"                        | Current plan                                                                        |
| `GTM action plan`                      | "February 23, 2026"                        | Go-to-market plan                                                                   |
| `Sprint plans`                         | "February 23, 2026"                        | All 5 sprint plans                                                                  |

The `FEATURE_PRIORITY_ROADMAP.md` projects "50 Oxford Houses onboarded by Q1 2025" and "$1M ARR by Q4 2025." It is now February 2026. These targets were not met (ACTIVE_PLAN reports ~5-10 active houses and ~$100-150/mo revenue). The document is still listed as a primary strategic reference with no annotation about missed targets or revised timelines.

`ACTIVE_PLAN.md` provides updated 3/6/12-month targets (May, August, February 2027). These are the only current targets, but they are not cross-referenced from the older strategy documents.

### Recommendation

1. Add a "Date Context" section to `docs/README.md` that states: "All strategic projections before February 2026 are historical. Current targets are in `ACTIVE_PLAN.md`."
2. Add revision history or "As of" annotations to `FEATURE_PRIORITY_ROADMAP.md`, `PRICING_STRATEGY_OPTIONS.md`, and `GAP_ANALYSIS_PRODUCTION_READINESS.md`
3. Consider archiving documents older than 6 months that have been fully superseded

---

## 5. Finding 4: Sprint Plans Are Well-Structured but Orphaned from ACTIVE_PLAN

**Severity:** Medium
**Architectural Impact:** The sprint plans are the most executable documents in the corpus, but their relationship to the new sprint numbering in ACTIVE_PLAN is confusing.

### Problem

The sprint files in `docs/plans/` are:

- `2026-02-23-sprint-1-stability.md` (6 tasks: loading states, error callbacks, Promise.allSettled, etc.)
- `2026-02-23-sprint-2-code-quality.md` (12 tasks: console.log removal, error surfacing, null-safety)
- `2026-02-23-sprint-3-revenue.md` (3 tasks: Oxford paywall, payment presets, rent reminders)
- `2026-02-23-sprint-4-architecture.md` (screen splitting, lodash migration, Firestore indexes)
- `2026-02-23-sprint-5-oxford-acquisition.md` (6 tasks: payment reconciliation, setOxfordEnabled, calculateEES)
- `2026-02-23-sprint-5-oxford-acquisition-design.md` (design companion to sprint 5)

Meanwhile, `ACTIVE_PLAN.md` defines sprints 5-9 as the forward plan:

- Sprint 5: Payment System Ship-Ready (Days 1-5)
- Sprint 6: Manager Dashboard (Days 6-12)
- Sprint 7: Resident Payment (Days 13-20)
- Sprint 8: Oxford House Pilot-Ready (Days 21-35)
- Sprint 9: Quality and Launch Prep (Days 36-45)

**The sprint numbering collides.** `ACTIVE_PLAN.md` Sprint 5 is "Payment System Ship-Ready" (task 5.1-5.8), while `docs/plans/2026-02-23-sprint-5-oxford-acquisition.md` is a completely different sprint 5 about Oxford customer acquisition. `ACTIVE_PLAN.md` states "Sprints 1-4 executed" implying the plan files are completed work, but the files themselves carry no completion status.

### Strengths

The sprint plan files are architecturally excellent:

- Each task has exact file paths, line numbers, before/after code
- TDD pattern: write failing test, verify failure, implement fix, verify pass
- Verification checklists at the end
- Commit message guidance

### Recommendation

1. Add a status banner to each completed sprint file: "STATUS: Completed. Executed during [date range]."
2. In `ACTIVE_PLAN.md`, add an explicit cross-reference: "Previous sprints 1-5 are documented in `docs/plans/2026-02-23-sprint-*`"
3. Either renumber the ACTIVE_PLAN sprints to start at 6 (continuing from the existing series) or rename the ACTIVE_PLAN sprints to a different scheme (e.g., "Phase 2, Sprint 1")

---

## 6. Finding 5: Requirements Traceability Gap

**Severity:** High
**Architectural Impact:** There is no mechanism to trace a requirement from `CORE_REQUIREMENTS.md` through to its implementation status or test coverage.

### Problem

`CORE_REQUIREMENTS.md` defines 4 requirement categories with sub-items:

1. Resident and house management (profiles, property/bed management, rules/phases)
2. Accountability tooling (chores, meeting/curfew tracking, UA/BA logging)
3. Money and admin (rent/payment tracking, reporting, document management)
4. Communication (staff notes, announcements)

None of these requirements have IDs, priority labels, or links to implementing code, test files, or status in `ACTIVE_PLAN.md`. The document is a research summary with 20 external citations but no internal traceability.

`FULL_PLATFORM_REQUIREMENTS.md` is a 73KB document with detailed specifications for every feature across both verticals, but it also lacks requirement IDs or traceability links. There is no mapping from any requirement in either document to:

- A specific screen or service that implements it
- A test file that validates it
- A line in `ACTIVE_PLAN.md` that tracks its completion

`ACTIVE_PLAN.md` uses its own gap categories (Resident Payment System, Operator Payment Dashboard, Oxford House Support) that partially overlap with the requirements documents but use different terminology and structure.

### Recommendation

1. Add requirement IDs to `CORE_REQUIREMENTS.md` (e.g., CR-1.1, CR-1.2, CR-2.1)
2. In `ACTIVE_PLAN.md`, add a requirements cross-reference column to sprint tasks (e.g., task 5.3 implements CR-3.1)
3. Alternatively, declare `CORE_REQUIREMENTS.md` as a historical research input and `ACTIVE_PLAN.md` Parts 3-4 as the current requirements baseline

---

## 7. Finding 6: Pricing and Revenue Contradictions

**Severity:** Medium
**Architectural Impact:** Three documents recommend different pricing; a new team member cannot determine which is the approved strategy.

### Problem

| Source                                   | Traditional Pricing             | Oxford Pricing             | Transaction Fee               |
| ---------------------------------------- | ------------------------------- | -------------------------- | ----------------------------- |
| `PRICING_STRATEGY_OPTIONS.md` (Nov 2025) | $69-129/mo tiered               | $49-89/mo tiered           | Not specified                 |
| `GTM action plan` Section 3 (Feb 2026)   | $25/house + $2/resident         | $69/mo                     | 3.0% standard, 2.5% annual    |
| `ACTIVE_PLAN.md` Kill List / Metrics     | References "processing revenue" | $49/mo (in Oxford section) | 2% platform fee (in Sprint 5) |
| `FEATURE_PRIORITY_ROADMAP.md` (Nov 2025) | $49-99/mo                       | $39-69/mo                  | 2.9% + $0.30                  |

The GTM action plan explicitly states "Raise prices on new signups. Current pricing is leaving significant revenue on the table" and recommends $25/house + $2/resident, which is a different model from the tiered approach in PRICING_STRATEGY_OPTIONS. Neither document references or supersedes the other.

### Recommendation

1. Designate one pricing document as canonical (likely the GTM action plan, as it is the newest and most specific)
2. Add a deprecation notice to `PRICING_STRATEGY_OPTIONS.md` pointing to the GTM plan
3. In `ACTIVE_PLAN.md`, add an explicit "Approved Pricing" section or reference

---

## 8. Finding 7: e2e and type-fixes Directories Lack Index

**Severity:** Low
**Architectural Impact:** These are execution artifacts, not strategic documents, but they are invisible in the documentation hierarchy.

### Problem

`docs/e2e/` contains 15 files (216KB total) documenting E2E testing efforts: plans, status reports, blocker analyses, and solution summaries. `docs/type-fixes/` contains 7 files documenting TypeScript batch fix sessions (batches 12-18).

Neither directory has a README or index file. Neither directory is referenced from `docs/README.md` or `ACTIVE_PLAN.md`. A developer looking for E2E testing guidance would not discover these files through the documented navigation paths.

### Recommendation

1. Add a brief `README.md` to each subdirectory (or a single index entry in `docs/README.md`)
2. Reference `docs/e2e/E2E_TESTING_GUIDE.md` from the main README under "Testing"
3. Consider archiving completed batch summaries into `docs/archive/`

---

## 9. Finding 8: IMPLEMENTATION_PLAN.md is Superseded but Not Marked

**Severity:** High
**Architectural Impact:** This document describes a 12-week dual-track development plan (Redux migration + Oxford House features) that no longer reflects the actual execution strategy.

### Problem

`IMPLEMENTATION_PLAN.md` describes:

- Track 1: Redux Toolkit Migration (8 weeks, module-by-module)
- Track 2: Oxford House Features (12 weeks, 6 feature areas)

Key decisions in this document:

- "KEEP the embedded Week model" -- directly contradicted by `ACTIVITY_SYSTEM_MIGRATION.md` and the WeekSummary system now in use
- "Don't normalize the Guest/Week data model" -- the system has since been normalized
- Week-by-week development schedule -- not followed; replaced by sprint-based execution

`ACTIVE_PLAN.md` states "This document replaces all prior planning documents" but `IMPLEMENTATION_PLAN.md` is still listed in `docs/README.md` as the active implementation strategy under "Active Plans."

`docs/README.md` line 55: `IMPLEMENTATION_PLAN.md - Parallel development tracks (Redux + Oxford House)` -- listed under "Active Plans" with no deprecation indicator.

### Recommendation

1. Add a supersession banner to `IMPLEMENTATION_PLAN.md`
2. Move it from "Active Plans" to "Historical / Reference" in `docs/README.md`
3. Update the `docs/README.md` "Active Plans" section to reference the sprint plan files and `ACTIVE_PLAN.md`

---

## 10. Finding 9: GAP_ANALYSIS Is Stale and Contradicts ACTIVE_PLAN

**Severity:** High
**Architectural Impact:** The gap analysis reports a fundamentally different state of the product than what the active plan describes.

### Problem

`GAP_ANALYSIS_PRODUCTION_READINESS.md` (December 25, 2025) reports:

- Testing: 5% (2 test files)
- Payment System: 30%
- Oxford House Support: 0%
- Overall Readiness: 70-75%

`ACTIVE_PLAN.md` (February 27, 2026) reports:

- Testing: 92% (354 test files)
- Payment System: 75%
- Oxford House Support: 55%
- Overall Readiness: 85/100

These represent genuine progress over 2 months, not contradictions per se. However, the gap analysis is still listed as a primary reference document in `docs/README.md` (marked "Needs Update" in the status table, which is an understatement -- it is fundamentally outdated). A reader following the "I want to understand what needs to be done" pathway is directed to the gap analysis first, which would give them a severely incorrect picture.

The gap analysis also documents issues that have been resolved:

- "Hardcoded Secrets" in `stripe.ts` -- resolved per GTM action plan (secrets moved to Firebase config / Secret Manager)
- "Near zero test coverage" -- resolved per ACTIVE_PLAN (354 tests across both repos)
- "No resident-facing payment capability" -- resolved per ACTIVE_PLAN (6 payment screens built)

### Recommendation

1. Add a banner to the gap analysis: "Baseline snapshot from December 2025. Current state is in ACTIVE_PLAN.md Part 2."
2. Alternatively, archive it and rely on `ACTIVE_PLAN.md` Part 2 (Production Readiness Score) as the current gap tracker
3. Update `docs/README.md` to direct the "what needs to be done" pathway to `ACTIVE_PLAN.md` first

---

## 11. Finding 10: Architectural Consistency Is Mostly Sound

**Severity:** Low (positive finding)
**Architectural Impact:** Technical decisions across documents are broadly consistent.

### Strengths

Across all documents, the following architectural decisions are consistently described:

- React Native 0.72 with Redux Toolkit + React Query hybrid state management
- Firebase backend (Firestore, Cloud Functions, Auth)
- Stripe Connect Express for payment processing
- Two-vertical product model (Traditional + Oxford House)
- Mobile-first strategy (web app modernization explicitly killed)
- Solo developer + AI-assisted development model

The sprint plans are technically consistent with each other and with ACTIVE_PLAN:

- Sprint 1 fixes stability issues, Sprint 2 removes console.log pollution, Sprint 3 adds revenue features, Sprint 4 improves architecture, Sprint 5 enables Oxford acquisition
- Each sprint builds on the previous one without contradictions

### Minor Inconsistency

`IMPLEMENTATION_PLAN.md` says "KEEP the embedded Week model -- analysis shows it's actually optimal for your UI patterns." This was later reversed. `ACTIVITY_SYSTEM_MIGRATION.md` and `CLOUD_FUNCTIONS_REVIEW.md` both describe the migration away from the Week model. `ACTIVE_PLAN.md` references "WeekSummary collection" as the current architecture. The reversal is architecturally sound but the decision trail is not documented in a single place (no Architecture Decision Record).

### Recommendation

Consider establishing an `ADR/` (Architecture Decision Records) directory for significant decisions like:

- ADR-001: Migrate from embedded Week model to WeekSummary subcollection
- ADR-002: Keep single app for both verticals (vs. dual app)
- ADR-003: Use Stripe Connect Express (not Standard or Custom)
- ADR-004: Kill web app modernization, go mobile-first

---

## 12. Recommendations Summary

### Priority 1: Fix Broken Navigation (1-2 hours)

| Action                                          | File                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| Audit and fix all broken links                  | `/Users/marcusklein/dev/rats-v2/docs/README.md` |
| Add `docs/plans/` sprint files to the index     | `/Users/marcusklein/dev/rats-v2/docs/README.md` |
| Add `docs/e2e/` and `docs/type-fixes/` to index | `/Users/marcusklein/dev/rats-v2/docs/README.md` |
| Update "Last Updated" date and status table     | `/Users/marcusklein/dev/rats-v2/docs/README.md` |

### Priority 2: Mark Superseded Documents (30 minutes)

| Document                                                                   | Action                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `/Users/marcusklein/dev/rats-v2/docs/IMPLEMENTATION_PLAN.md`               | Add supersession banner, move to Historical in README              |
| `/Users/marcusklein/dev/rats-v2/docs/GAP_ANALYSIS_PRODUCTION_READINESS.md` | Add "baseline snapshot" banner with pointer to ACTIVE_PLAN         |
| `/Users/marcusklein/dev/rats-v2/docs/FEATURE_PRIORITY_ROADMAP.md`          | Add "date context" banner noting Q1-Q4 2025 targets are historical |
| `/Users/marcusklein/dev/rats-v2/docs/PRICING_STRATEGY_OPTIONS.md`          | Add pointer to GTM action plan Section 3 as current pricing        |

### Priority 3: Resolve Sprint Numbering (15 minutes)

| Action                                                            | File                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Add "STATUS: Completed" banner to sprint-1 through sprint-5 files | `/Users/marcusklein/dev/rats-v2/docs/plans/2026-02-23-sprint-*.md` |
| Add cross-reference between old and new sprint numbering          | `/Users/marcusklein/dev/rats-v2/docs/plans/ACTIVE_PLAN.md`         |

### Priority 4: Establish Authority Hierarchy (30 minutes)

Document the following hierarchy in `docs/README.md`:

```
AUTHORITY HIERARCHY (most authoritative first):
1. docs/plans/ACTIVE_PLAN.md -- What to build, production readiness, execution plan
2. docs/plans/2026-02-23-gtm-action-plan.md -- Go-to-market, pricing, acquisition
3. docs/CORE_REQUIREMENTS.md -- Industry requirements (reference input, not execution plan)
4. docs/FULL_PLATFORM_REQUIREMENTS.md -- Dream-state requirements (long-term vision)
5. Everything else -- Historical context and reference
```

### Priority 5: Consider (Not Urgent)

- Create an `ADR/` directory for Architecture Decision Records
- Add requirement IDs to `CORE_REQUIREMENTS.md` for traceability
- Archive `docs/e2e/` session summaries and `docs/type-fixes/` batch summaries that are no longer actionable

---

## Scoring Summary

| Dimension                 | Score | Assessment                                                                                           |
| ------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| Documentation Structure   | 4/10  | README is the entry point but 7 of its links are broken; 2 subdirectories have no index              |
| Separation of Concerns    | 7/10  | Categories are logical (strategy, planning, technical, execution) but boundaries bleed               |
| Information Architecture  | 3/10  | No working cross-reference system; authority fragmentation across 4+ documents per domain            |
| Plan Coherence            | 7/10  | Sprint plans are individually excellent; numbering collision with ACTIVE_PLAN; no completion markers |
| Requirements Traceability | 2/10  | No requirement IDs, no implementation links, no test mapping                                         |
| Documentation Versioning  | 2/10  | No supersession markers; dates span 15 months with no reconciliation; "Needs Update" understatement  |
| Architectural Consistency | 8/10  | Technical decisions are broadly consistent; one major reversal (Week model) not recorded as ADR      |

**Overall Documentation Architecture Score: 4.7/10**

The content quality of individual documents is high (7-9/10). The structural integrity connecting those documents is low (2-4/10). The highest-leverage improvement is fixing `docs/README.md` and adding supersession banners -- 2-3 hours of work that would raise the overall score to approximately 7/10.
