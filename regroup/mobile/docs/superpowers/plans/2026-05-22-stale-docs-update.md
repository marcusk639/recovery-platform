# Stale Documentation Update Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct four stale documentation files that contain outdated scores, false-alarm issues, and in-progress migration guides — making the docs reflect the app's current 85%+ production-readiness state.

**Architecture:** Pure documentation edits — no code changes, no tests. Each task edits one file independently.

**Tech Stack:** Markdown. Verified against codebase: `createRentPaymentIntent` exists at `src/services/payments.ts:65` (calls the canonical `createPaymentIntent` Cloud Function in `regroup-functions`).

---

## Codebase Anchor Points

| Doc              | Path                                        | Problem                                                                          |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Active plan      | `docs/plans/ACTIVE_PLAN.md`                 | False alarm on `createRentPaymentIntent` (line 38); score timeline ends Feb 2026 |
| Gap analysis     | `docs/GAP_ANALYSIS_PRODUCTION_READINESS.md` | Dec 2025 doc shows 70-75% — now 85%+; no historical notice                       |
| Navigation guide | `src/navigation/MIGRATION_GUIDE.md`         | Still describes in-progress Phase 2 migration — migration is complete            |
| Migration plan   | `src/navigation/migration-plan.md`          | All phases checked off but no completion notice at top                           |

## File Structure

**Modify only:**

- `docs/plans/ACTIVE_PLAN.md`
- `docs/GAP_ANALYSIS_PRODUCTION_READINESS.md`
- `src/navigation/MIGRATION_GUIDE.md`
- `src/navigation/migration-plan.md`

---

## Task 1: Fix `ACTIVE_PLAN.md` — False Alarm + Score Timeline

**File:** `docs/plans/ACTIVE_PLAN.md`

- [ ] **Step 1.1: Fix the `createRentPaymentIntent` row in the alignment table**

The table at lines 34–53 contains this false-alarm row:

```
| `createRentPaymentIntent`          | No                        | Unknown                | **May not exist anywhere** — called by `src/services/payment.ts:45` |
```

Replace it with:

```markdown
| `createRentPaymentIntent` | No | Yes (aliased) | Resolved — `createRentPaymentIntent` at `src/services/payments.ts:65` wraps the canonical `createPaymentIntent` CF |
```

- [ ] **Step 1.2: Fix the Sprint 5 task entry for `createRentPaymentIntent`**

In Part 4, Sprint 5 table, replace:

```
| 5.1 | Resolve `createRentPaymentIntent` vs `createPaymentIntent` naming                    | Bug fix      | 1 hr   |
```

With:

```markdown
| 5.1 | ~~Resolve `createRentPaymentIntent` vs `createPaymentIntent` naming~~ — **DONE:** `createRentPaymentIntent` in `payments.ts` correctly wraps the canonical CF | Bug fix | — |
```

- [ ] **Step 1.3: Fix the Part 3A UX gaps table entry for `createRentPaymentIntent`**

In the "UX gaps that hurt revenue" table, replace:

```
| **`createRentPaymentIntent` may not exist**  | Payment flow in `payment.ts` may fail at runtime        | Payments broken for the ResidentPayment screen path                                                  | Verify function name matches deployed function, or alias it                                                                          |
```

With:

```markdown
| ~~**`createRentPaymentIntent` may not exist**~~ | **Resolved** — `createRentPaymentIntent` at `src/services/payments.ts:65` wraps the canonical `createPaymentIntent` Cloud Function | — | — |
```

- [ ] **Step 1.4: Add a May 2026 entry to the Score Timeline**

In the Score Timeline table, add a row after the Feb 27 entry:

```markdown
| May 2026 | **~90/100** | +5: App Store prep shipped (Fastlane, metadata, E2E screenshots), StalePendingBanner, PaymentHistory stale clock, dead code removed, E2E sync fixed |
```

- [ ] **Step 1.5: Update the date header**

Change:

```
**Date:** February 27, 2026 (v2 — revised with backend repo context)
**Previous revision:** February 27, 2026 (v1 — mobile-only view)
```

To:

```markdown
**Date:** May 22, 2026 (v3 — false alarm resolved, score updated)
**Previous revision:** February 27, 2026 (v2 — backend repo context)
```

- [ ] **Step 1.6: Commit**

```bash
git add docs/plans/ACTIVE_PLAN.md
git commit -m "docs: fix createRentPaymentIntent false alarm and update score timeline in ACTIVE_PLAN"
```

---

## Task 2: Annotate `GAP_ANALYSIS_PRODUCTION_READINESS.md` as Historical

**File:** `docs/GAP_ANALYSIS_PRODUCTION_READINESS.md`

- [ ] **Step 2.1: Add a historical notice banner at the top of the file**

Insert this block immediately after the `# RATS App Gap Analysis: Production Readiness` heading (before `**Date:** December 25, 2025`):

```markdown
> **⚠️ Historical Document — December 2025 Snapshot**
> This document was written on December 25, 2025 and reflects the app at ~70-75% production readiness.
> As of May 2026 the app is at **~90%**. For the current state, see [`docs/plans/ACTIVE_PLAN.md`](../plans/ACTIVE_PLAN.md).
> This file is preserved as a historical record of the gap analysis that drove Sprints 1–4.
```

- [ ] **Step 2.2: Commit**

```bash
git add docs/GAP_ANALYSIS_PRODUCTION_READINESS.md
git commit -m "docs: add historical notice to GAP_ANALYSIS — superseded by ACTIVE_PLAN"
```

---

## Task 3: Mark `MIGRATION_GUIDE.md` as Complete

**File:** `src/navigation/MIGRATION_GUIDE.md`

- [ ] **Step 3.1: Replace the stale "Phase 2" status with a completion notice**

The file currently says:

```
## Migration Status

The migration is currently in **Phase 2: Backward Compatibility**. The old navigation service is still the default, but the improved service is available for testing.
```

Replace that section with:

```markdown
## Migration Status

> **✅ Migration Complete (May 2026)**
> All 5 phases shipped. `ImprovedNavigationService` is the only navigation service.
> Compatibility shims, feature flags, and `MigrationControlPanel` have been removed.
> The remaining sections below are preserved as a historical record of the migration approach.
```

- [ ] **Step 3.2: Commit**

```bash
git add src/navigation/MIGRATION_GUIDE.md
git commit -m "docs: mark navigation MIGRATION_GUIDE as complete"
```

---

## Task 4: Add Completion Notice to `migration-plan.md`

**File:** `src/navigation/migration-plan.md`

- [ ] **Step 4.1: Add a completion banner at the top**

Insert after the `# Navigation Migration Plan` heading:

```markdown
> **✅ Migration Complete (May 2026)** — All 5 phases shipped. See commit history for details.
```

- [ ] **Step 4.2: Commit**

```bash
git add src/navigation/migration-plan.md
git commit -m "docs: mark navigation migration-plan as complete"
```

---

## Self-Review Checklist

- [x] False alarm fixed — `createRentPaymentIntent` concern resolved in all 3 places it appears in ACTIVE_PLAN.md
- [x] Score timeline updated — May 2026 entry added
- [x] GAP_ANALYSIS has clear "historical document" banner pointing to ACTIVE_PLAN
- [x] Navigation guide no longer claims migration is in-progress
- [x] Migration plan has clear completion notice
- [x] No placeholders — all replacement text is complete
- [x] No code changes — docs only
