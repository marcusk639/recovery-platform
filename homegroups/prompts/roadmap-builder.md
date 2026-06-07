You are tasked with building an optimal, growth-optimized roadmap for the
Homegroups platform and its surrounding ecosystem.
Before writing a single roadmap item, you must do the work of determining
which docs are the actual source of truth.

---

## Step 0 — Skill + Skill Evaluation

Invoke the `docs-to-roadmap` skill via the Skill tool. Read it fully, then
critically evaluate:
- Which parts of the skill apply cleanly to this project?
- Which instructions reference files that don't exist here? (The skill
  mentions `docs/FEATURE_PRIORITY_ROADMAP.md` and `docs/CORE_REQUIREMENTS.md`
  — verify these exist before relying on them.)
- Is the skill missing any analysis the task requires (multi-product
  ecosystem, growth/acquisition lens)?

Decide: use the skill as-is, adapt it, or supplement it with additional
phases. Justify your choice in one short paragraph at the top of your output.

---

## Step 1 — Source of Truth Determination (BEFORE doc analysis)

The docs/ directory contains ~80 files spanning multiple years. Do NOT
treat them as equally authoritative. First, produce a ranked authority table:

For each doc, determine:
1. **Recency** — filename date or git last-modified (`git log --follow
   --format="%ad" --date=short -- <file> | head -1`)
2. **Scope** — Does it cover this product's ideal end state, or is it
   operational/engineering detail?
3. **Supersession** — Is it explicitly replaced by a newer doc?
4. **Authority verdict**: SOURCE_OF_TRUTH | SUPPORTING | STALE | ARCHIVE

Key files to evaluate first (known high-authority candidates):
- `docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md`
- `docs/REVENUE_OPPORTUNITIES.md`
- `docs/ROADMAP.md`
- `docs/02-recoveryconnect-homegroups.md`
- `docs/03-integration-treatment-centers.md`
- `docs/BUSINESS_MODEL.md`
- `docs/MARKET_INTELLIGENCE.md`
- `docs/financial-projections-2026-04-15.md`
- `docs/PRODUCT_REQUIREMENTS.md`

Files that are almost certainly ARCHIVE (verify before using):
- `docs/archive/**`
- `docs/plans/**` (most describe already-completed work)
- `docs/archive/specifications/spec.md`, `mvp-reqs.md`

Only carry SOURCE_OF_TRUTH and SUPPORTING docs into Step 2.

---

## Step 2 — Implementation Status Audit (follow docs-to-roadmap skill Phase 2)

For every requirement in the SOURCE_OF_TRUTH docs, determine status:
DONE | PARTIAL | MISSING | STALE | BLOCKED | OUT_OF_SCOPE

Cross-reference signals (in order):
1. `REVENUE_OPPORTUNITIES.md` ✅ markers — items marked done there ARE done
2. `git log --oneline -50` — recent commits reveal shipped work
3. Codebase search for feature keywords

Pay special attention to the open items in `REVENUE_OPPORTUNITIES.md`:
items 4, 8, 9, 10, 11, 12, 13, 14, 15 are explicitly not done as of May 2026.

This is a multi-product ecosystem. Audit across:
- Product 1: Homegroups (this repo)
- Product 2: Regroup sober living (rats-v2) — reference from ecosystem plan
- Product 3: Aftercare Management System — not built yet

---

## Step 3 — Roadmap Synthesis (follow docs-to-roadmap skill Phase 4, extended)

After filtering DONE + STALE items, build the roadmap. Use the standard
P0/P1/P2/P3 tiers from the skill, but apply a GROWTH lens to every
prioritization decision:

**Growth lens — evaluate each item on three axes:**

1. **Usability** — Does this remove friction from a critical user journey?
   (Trial → subscription, claim flow, treasury handoff)

2. **User Acquisition** — Does this create a distribution channel?
   (QR check-in → member invites, public group page → SEO, treatment center
   tier → B2B referral pipeline, directory listing → organic discovery)

3. **Revenue / Expansion** — Does this directly drive MRR?
   (Subscription gates, trial conversion, B2B tier pricing, donation fees)

Items that score high on 2+ axes should be promoted. Items that score 0
on all three axes belong in P3 regardless of engineering effort.

**Sequencing rules:**
1. Fix revenue leaks before adding features
2. Validate trial-to-paid conversion before spending on acquisition
3. Build the integration bridge (meeting attendance API) before pitching
   the treatment center tier — the integration IS the sales story
4. Ecosystem sequencing from the 12-month plan: Homegroups launch →
   rats-v2 sprint 1-2 → Oxford pilot → Aftercare → Enterprise

Do NOT include items already completed. Do NOT include V4 governance/analytics
features (elections, bylaws, group health dashboards) — per the ROADMAP.md
"What NOT to build during launch" directive.

---

## Output Format

### 0. Skill Evaluation (1 paragraph)

### 1. Doc Authority Table
All docs reviewed, authority verdict, one-line rationale.

### 2. Implementation Status Matrix
All open requirements (MISSING/PARTIAL/BLOCKED only) from SOURCE_OF_TRUTH docs,
with status badge and which doc surfaces it.

### 3. Growth-Optimized Roadmap (P0 → P3)
For each item: growth axis scores (Usability/Acquisition/Revenue: H/M/L),
tier justification, effort, dependencies.

### 4. Implementation Plan (P0 + P1 only)
Concrete tasks per the docs-to-roadmap skill format.

### 5. Cross-Product Sequencing
How Homegroups work gates or enables rats-v2 and Aftercare milestones.

### 6. Confidence Notes
Where status is uncertain; what to manually verify.

---
One change I'd make to the skill itself: update the "Context for Regroup" section at the bottom to replace the nonexistent file references with the actual authoritative paths listed in Step 1 above. That section currently misleads any agent following it.

Alternative if you don't want to use the skill: the prompt above is self-contained enough to work without it — the skill mostly formalizes phases 2-4, which are all covered explicitly here. The main value the skill adds is the anti-patterns table, which is worth keeping.