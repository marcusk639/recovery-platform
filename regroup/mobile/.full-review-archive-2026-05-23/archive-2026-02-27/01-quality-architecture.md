# Phase 1: Code Quality & Architecture Review

## Code Quality Findings (from Phase 1A)

**Total: 26 findings — 4 Critical, 9 High, 8 Medium, 5 Low**

### Critical

**C-1: README.md has 9 broken links** (`docs/README.md`)
The primary navigation document links to 9 files that do not exist or were moved to archive/ without updating links. Includes `MIGRATION_STATUS.md` referenced 6 times as "Single Source of Truth" — file does not exist anywhere. 3 of 4 links in the "understand the technical architecture" onboarding path are dead.
_Fix: Rewrite README to reference only existing files; route to ACTIVE_PLAN.md as primary entry point._

**C-2: GAP_ANALYSIS_PRODUCTION_READINESS.md is actively misleading** (`docs/GAP_ANALYSIS_PRODUCTION_READINESS.md`)
Dated Dec 2025; claims "Near zero test coverage / 5%" when current state is 354 test files / 92%; claims Oxford House is "Not started" when all 5 screens exist; claims hardcoded Stripe key when Secret Manager is in use. Still listed as a "Top Priority Document" in README.
_Fix: Archive immediately with supersession banner pointing to ACTIVE_PLAN.md._

**C-3: IMPLEMENTATION_PLAN.md describes contradicted, superseded strategy** (`docs/IMPLEMENTATION_PLAN.md`)
Advises "KEEP the embedded Week model" (reversed in current approach); describes Redux migration as "ongoing ~8 weeks" (done); describes Oxford features as unbuilt (all 5 screens exist); includes "2 full-stack developers + 1 designer + 1 QA" resource requirements for a solo-dev project. README still lists this as a "Top Priority Document for Implementation Strategy."
_Fix: Archive with redirect banner to ACTIVE_PLAN.md._

**C-4: FEATURE_PRIORITY_ROADMAP.md uses Q1-Q4 2025 throughout** (`docs/FEATURE_PRIORITY_ROADMAP.md`)
All quarterly targets (50 Oxford houses by Q1 2025, $9K MRR, etc.) are 12+ months past. Projections never hit. Strategic analysis sections remain valuable but temporal structure is completely obsolete.
_Fix: Archive timeline sections; retain strategic analysis with cross-reference to GTM plan._

---

### High

**H-1: Three documents contain conflicting revenue projections**
FEATURE_PRIORITY_ROADMAP: $85K MRR / 750 customers (12-month). GTM Action Plan: $37K MRR / 108 operators (12-month). ACTIVE_PLAN: "$10K+/month" / 100+ houses. Incompatible pictures of business trajectory.

**H-2: Pricing documented in 3 places with different numbers**
PRICING_STRATEGY_OPTIONS.md: $49-129 range. GTM plan: $25/house + $2/resident. FEATURE_PRIORITY_ROADMAP: $49-99. No single authoritative "this is what we charge" document.

**H-3: ACTIVE_PLAN Sprint 5-9 and GTM Action Plan Week 1-12 overlap but diverge**
Both claim to describe "what to build next" but have different task lists. GTM plan includes tasks missing from ACTIVE_PLAN (email sequences, analytics events, Stripe Smart Retries, annual billing). No explicit subordination between them.

**H-4: ACTIVITY_SYSTEM_MIGRATION.md status unknown** (`docs/ACTIVITY_SYSTEM_MIGRATION.md`)
Describes a 4-phase migration to Activity-based architecture. ACTIVE_PLAN Sprint 9 references `migrate-full.ts` but it's unclear if the migration has been partially executed, or replaced by the WeekSummary approach.

**H-5: CLOUD_FUNCTIONS_REVIEW.md is a raw AI tool-call transcript** (`docs/CLOUD_FUNCTIONS_REVIEW.md`)
Begins with "I'll analyze..." and "[15 tools called]". References only the Activity System Migration (pre-v2 SDK migration). Appears unfinished and unprofessional.

**H-6: CORE_REQUIREMENTS.md is research output, not a requirements document**
54 lines with inline citation numbers. No requirement IDs, no priority levels, no implementation status, no acceptance criteria. Referenced by 3 other docs as authoritative. Cannot be used to determine what is built vs. not built.

**H-7: Two Sprint 5 documents neither reference each other nor the ACTIVE_PLAN Sprint 5**
`sprint-5-oxford-acquisition.md` (implementation) and `sprint-5-oxford-acquisition-design.md` (design) share content but are disconnected. Meanwhile ACTIVE_PLAN Sprint 5 is "Payment System Ship-Ready" — a completely different topic.

**H-8: docs/e2e/ has 15 files with no index or clear canonical status doc**
Multiple competing "status" files (`E2E_FINAL_STATUS.md`, `E2E_TESTING_STATUS.md`, `E2E_CRITICAL_PATHS_STATUS.md`, `E2E_SOLUTION_COMPLETE.md`). Testing guide references Xcode 14+ (project runs Xcode 26.2). No README.

**H-9: README "Last Updated: Feb 5" but contains Feb 22 content; ACTIVE_PLAN not listed in status table**

---

### Medium

- M-1: PRODUCT_STRATEGY_ASSESSMENT and ACTIVE_PLAN duplicate feature inventory with occasional contradictions
- M-2: CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md conclusion was adopted — now purely historical
- M-3: ACTIVITY_SYSTEM_TEST_PLAN.md status unclear (migration may be complete or abandoned)
- M-4: docs/type-fixes/ has 7 batch summaries with no README, no completion status
- M-5: FULL_PLATFORM_REQUIREMENTS.md has no status tracking on any of its 100+ aspirational features
- M-6: Sprint plans 1-4 show unchecked verification checklists despite ACTIVE_PLAN claiming "Sprints 1-4 executed"
- M-7: GTM Action Plan Section 10 has 5 unanswered critical questions (current subscriber count, userId mismatch, OHI relationship, firebase project env)
- M-8: ACTIVE_PLAN flags dual-repo function problem as "Key risk / must resolve before go-live" but allocates only 2 hours

---

### Low

- L-1: CORE_REQUIREMENTS.md inline citations use non-standard footnote syntax
- L-2: Sprint plans embed Claude-specific AI agent instructions in human-readable docs
- L-3: README uses emoji headers inconsistently
- L-4: E2E Testing Guide specifies Node 16+, Xcode 14+, Android SDK 30+
- L-5: ACTIVE_PLAN Kill List says "Unchanged:" with no prior reference for first-time readers

---

## Architecture Findings (from Phase 1B)

**Overall documentation architecture score: 4.7/10 (individual doc quality 7-9/10; structural integrity 2-4/10)**

### Critical

**C-A1: Authority Fragmentation** — Four documents simultaneously claim to be the authoritative source for "what to build next":

- `ACTIVE_PLAN.md` ("replaces all prior planning documents" — but without notifying the others)
- `IMPLEMENTATION_PLAN.md` (listed as active in README, no deprecation notice)
- `FEATURE_PRIORITY_ROADMAP.md` (extensive roadmap, still linked as primary)
- `2026-02-23-gtm-action-plan.md` (its own "90-day roadmap")

Any developer who opens a document other than ACTIVE_PLAN will receive materially different guidance.

**C-A2: Broken Navigation** — README.md (the designated entry point) has 7+ broken links. The "understand technical architecture" onboarding path has 3 of 4 links dead. The entire navigation structure is unreliable.

### High

- **H-A1: Temporal Confusion** — FEATURE_PRIORITY_ROADMAP projects $1M ARR by Q4 2025 with no annotation that these targets have passed
- **H-A2: Requirements Traceability Gap** — CORE_REQUIREMENTS.md has no requirement IDs, no implementation links, no test mapping
- **H-A3: Sprint Numbering Collision** — The completed Feb 23 sprints use numbers 1-5; ACTIVE_PLAN forward sprints also start at 5. Two different "Sprint 5s" with completely different work
- **H-A4: GAP_ANALYSIS Stale** — Reports 5% testing (actual: 92%), 0% Oxford (actual: 55%)

### Medium

- **M-A1: Pricing Contradictions** — Three different pricing models in three different docs
- **M-A2: e2e/ and type-fixes/ have no index** and are not referenced from main README
- **M-A3: Sprint numbering collision** (duplicate of H-A3 expanded)

### Positive Finding

Technical architectural decisions are consistent across all documents (8/10): React Native + Firebase + Stripe Connect Express stack, two-vertical product model (Traditional vs. Oxford House), mobile-first strategy coherently described everywhere. Sprint plans are exceptionally well-structured with exact file paths, TDD workflow, and verification checklists.

---

## Critical Issues for Phase 2 Context

The following Phase 1 findings should inform the Security & Performance review:

1. **CLOUD_FUNCTIONS_REVIEW.md is outdated** — Security review should not rely on it; backend has migrated to Firebase SDK v2, 49 functions, Secret Manager
2. **GAP_ANALYSIS claims hardcoded Stripe key** — Must verify whether this was actually remediated (ACTIVE_PLAN claims it was migrated to Secret Manager, but the GAP_ANALYSIS still calls it out)
3. **M-8: Dual-repo function deployment risk** — The `functions/` embedded in mobile repo vs. `regroup-functions/` external repo creates a deployment ambiguity that could result in old function code being deployed to production
4. **M-7: GTM open questions include "Is firebase project production or staging?"** — Security posture depends on knowing whether `phoenix-cleanhouse` is the production Firebase project
5. **H-2: No single authoritative pricing document** — Performance review should check whether the billing logic in code matches any of the three competing pricing docs
6. **ACTIVE_PLAN Part 1 flags `handleStripeConnectWebhook` as "exported but NOT implemented"** — this is a security/reliability concern (operators stuck in PENDING state)
