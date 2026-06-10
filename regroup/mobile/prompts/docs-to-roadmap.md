    /docs-to-roadmap

**Project:** Regroup (— sober living house management app)
Working directory: /Users/marcuspersonal/dev/Regroup

**Optimization objectives (in priority order):**

1. Usability — remove friction from the operator onboarding and guest lifecycle flows
2. User acquisition & growth — identify features that create distribution channels (invites, referrals, B2B operator pipeline)
3. Logical, dependency-aware sequencing — fix revenue leaks before adding features; validate trial→paid before spending on acquisition

---

**Phase 0 guidance — candidate source-of-truth docs (verify each exists before citing):**

High-authority candidates:

- `docs/STRATEGIC_PLATFORM_ASSESSMENT_2026.md` — most recent strategic assessment, created 2026-05-24
- `docs/FULL_PLATFORM_REQUIREMENTS.md` — comprehensive platform requirements
- `docs/CORE_REQUIREMENTS.md` — core product requirements
- `docs/FEATURE_PRIORITY_ROADMAP.md` — existing feature prioritization
- `PRODUCT_ROADMAP.md` (root) — root-level roadmap
- `FEATURE_PRIORITIZATION.md` (root) — root-level feature prioritization
- `docs/superpowers/plans/2026-04-08-sober-living-roadmap.md` — April 2026 roadmap plan
- `docs/superpowers/specs/2026-05-19-release-readiness-audit.md` — May 2026 release readiness audit

Supporting context:

- `docs/PRODUCT_STRATEGY_ASSESSMENT.md` — product strategy
- `docs/PRICING_STRATEGY_OPTIONS.md` — pricing options
- `PRICING_STRATEGY.md` (root) — pricing decisions
- `docs/Recovery Ecosystem — Product & Market Intelligence Brief.md` — market intelligence
- `.full-review/05-final-report.md` — current-state snapshot as of 2026-05-24 (quality/security findings)
- `docs/plans/2026-02-23-gtm-action-plan.md` — GTM action plan
- `.claude/architecture.md` — always-current architectural truth

Likely STALE (verify before discarding):

- `docs/plans/2026-02-23-sprint-*.md` — sprint plans from Feb 2026, likely completed
- `docs/superpowers/plans/2026-05-*.md` — May 2026 feature plans; verify against git log

Likely ARCHIVE (do not pull requirements from):

- `docs/archive/` — all files
- `docs/type-fixes/` — TypeScript fix logs
- `docs/e2e/` — E2E test status logs

---

**Critical context for roadmap prioritization:**

This is a B2C + B2B sober living management app. Two user types with different needs:

- **Operators** (house managers): subscription payers, need operational efficiency
- **Guests** (residents): primary users of day-to-day features, drive operator retention

The app currently has a paywall and Stripe subscription in place. Before prioritizing new features, verify:

1. Is the trial→paid conversion flow complete and working?
2. Are there revenue leaks (features accessible without active subscription)?
3. Is operator onboarding frictionless enough to acquire operators without support?

Cross-reference every candidate roadmap item against `git log --oneline -50` — many items in older docs have shipped since they were written.

---

**Deliverable:** A growth-optimized roadmap (P0/P1/P2/P3) with:

- Source-of-truth verdict for each doc reviewed
- Implementation status matrix (MISSING/PARTIAL only — prune DONE/STALE)
- Growth axis scores (Usability / Acquisition / Revenue: H/M/L) for each item
- Concrete P0/P1 implementation plan with effort estimates
- Explicit list of what was excluded and why (DONE, STALE, OUT_OF_SCOPE)
