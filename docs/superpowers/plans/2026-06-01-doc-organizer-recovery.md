# doc-organizer-recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `doc-organizer-recovery` Claude Code skill — five markdown files plus a trigger config entry — so that `/doc-organizer-recovery` and `/doc-organizer-recovery --check` can be invoked to analyze, reorganize, and health-check all `/docs` across the recovery-platform monorepo.

**Architecture:** The skill is pure markdown (no compilation). `SKILL.md` is the orchestration entry point (<500 lines); four reference files hold detailed instructions that agents read on demand. A `skill-rules.json` entry enables keyword-based auto-suggestion. A root `docs/` skeleton is seeded so the skill has a destination to write to on first run.

**Tech Stack:** Markdown, YAML frontmatter, JSON (skill-rules.json), bash (verification commands)

**Spec:** `docs/superpowers/specs/2026-06-01-doc-organizer-recovery-design.md`

---

## File Map

| Action | Path                                                      |
| ------ | --------------------------------------------------------- |
| Create | `.claude/skills/doc-organizer-recovery/SKILL.md`          |
| Create | `.claude/skills/doc-organizer-recovery/PHASE-GUIDE.md`    |
| Create | `.claude/skills/doc-organizer-recovery/CATEGORIES.md`     |
| Create | `.claude/skills/doc-organizer-recovery/HEALTH-CHECK.md`   |
| Create | `.claude/skills/doc-organizer-recovery/INDEX-TEMPLATE.md` |
| Create | `.claude/skills/skill-rules.json`                         |
| Create | `docs/INDEX.md` (placeholder)                             |
| Create | `docs/ecosystem/` (stub dir + .gitkeep)                   |
| Create | `docs/strategy/` (stub dir + .gitkeep)                    |
| Create | `docs/_archive/` (stub dir + .gitkeep)                    |

---

## Task 1: Create SKILL.md

**Files:**

- Create: `.claude/skills/doc-organizer-recovery/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

```bash
mkdir -p .claude/skills/doc-organizer-recovery
```

Create `.claude/skills/doc-organizer-recovery/SKILL.md` with this exact content:

````markdown
---
name: doc-organizer-recovery
description: >
  Analyze, reorganize, and maintain all /docs directories across the recovery-platform
  monorepo. Builds an inventory manifest, proposes a reorganization plan for approval,
  then executes moves — organizing docs by category (product, technical, monetization,
  roadmap, operations) with per-product _archive/ for outdated content and a root
  docs/INDEX.md as the agent entry point. Run with --check for recurring health checks
  that detect stale docs, category drift, and missing required files without touching
  anything. Invokes recovery-app-go-to-market for monetization analysis.
  Triggers: doc-organizer-recovery, organize docs, doc health check, reorganize docs,
  docs audit, doc drift, stale docs, docs structure, recovery platform docs
user-invocable: true
---

# doc-organizer-recovery

Analyze, reorganize, and maintain all `/docs` directories across the recovery-platform
monorepo. Primary consumer of the organized output is AI agents.

## Invocation

```
/doc-organizer-recovery           # Full reorganization mode (Phase 1 → 2 → 3)
/doc-organizer-recovery --check   # Health check mode only (read-only, no moves)
```

## Scope

- **In scope:** `docs/`, `homegroups/docs/`, `regroup/mobile/docs/`,
  `regroup/functions/docs/`, `regroup/web/docs/`, `detox-recovery/docs/`,
  `recovery-api/docs/`
- **Out of scope:** CLAUDE.md files (path corrections only), source code, non-docs dirs
- **regroup unification:** All three regroup `/docs` dirs merge into `regroup/docs/`

## Target Structure

Root `docs/` = ecosystem source of truth. Per-product `docs/` = app-specific content.

Category subdirs per product: `product/`, `technical/`, `monetization/`,
`operations/`, `plans/`, `_archive/`

Full structure: `docs/superpowers/specs/2026-06-01-doc-organizer-recovery-design.md`

---

## Phase 1 — Inventory

**Run time:** ~30 seconds. Always runs first in both full and `--check` modes.

1. Run: `find . -path "*/docs/*.md" -not -path "*node_modules*" -not -path "*/.claude/*"`
2. For each doc, determine:
   - `product`: which product owns it (ecosystem / homegroups / regroup / detox-recovery / recovery-api)
   - `inferredCategory`: product | technical | monetization | operations | roadmap | plans | archive | unknown
   - `scope`: ecosystem | product-specific
   - `lastModified`: file mtime via `stat`
   - `stalenessSignals`: array — see CATEGORIES.md
   - `targetPath`: proposed destination per target structure
3. Save to `.claude/doc-inventory.json`
4. Commit: `git add .claude/doc-inventory.json && git commit -m "chore: update doc inventory YYYY-MM-DD"`

**Ecosystem-scope signals** — flag `scope: ecosystem` when ANY true:

- Filename/path contains: `ecosystem`, `recovery-platform`, `recovery-ecosystem`
- Content references 2+ distinct products by name
- Doc covers cross-product integration or platform-wide strategy/market analysis

See `CATEGORIES.md` for classification rules and filename heuristics.

---

## Phase 2 — Analysis + Proposal

**Spawn six agents in parallel** from the manifest. Each reads assigned docs and
writes `proposedCategory`, `proposedPath`, and `archiveReason` (if applicable):

| Agent                | Reads                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| Ecosystem agent      | All `scope: ecosystem` docs                                                    |
| homegroups agent     | `homegroups/docs/` docs                                                        |
| regroup agent        | All three regroup `/docs` dirs                                                 |
| detox-recovery agent | `detox-recovery/docs/` docs                                                    |
| recovery-api agent   | `recovery-api/docs/` docs                                                      |
| Monetization agent   | All `inferredCategory: monetization` docs → invoke `recovery-app-go-to-market` |

See `PHASE-GUIDE.md` for exact agent prompts, special rules per product, and merge
instructions.

After agents complete, merge all proposals into:
`docs/superpowers/specs/YYYY-MM-DD-doc-reorganization-proposal.md`

**Proposal contains:**

1. Move table: `| Current Path | Proposed Path | Reason |`
2. Archive list: `| Path | Archive Reason |`
3. Stub files to create (gaps in required structure per CATEGORIES.md)
4. Draft `docs/INDEX.md` (from INDEX-TEMPLATE.md with real paths)
5. Conflicts requiring human decision

**STOP. Present proposal to user. Wait for explicit approval before Phase 3.**

Approval = "approved", "yes", "looks good", or user edits proposal then confirms.
Corrections = return to Phase 2 for revised proposal.

---

## Phase 3 — Execute

Runs only after explicit approval.

1. `mkdir -p` all target category dirs for each product
2. `git mv` each file per approved move table (preserves git history)
3. Create `{product}/docs/_archive/README.md` with archival date and reason summary
4. Write `docs/INDEX.md` from `INDEX-TEMPLATE.md` (resolve all `{product}`, `{DATE}` placeholders)
5. Write per-product `docs/README.md` (product overview + navigation links)
6. Grep CLAUDE.md files for links to moved paths; update with `sed` (path corrections only)
7. Commit: `docs: reorganize per doc-organizer-recovery proposal YYYY-MM-DD`

---

## Health Check Mode (`--check`)

1. Re-run Phase 1 inventory
2. Diff new manifest against saved `.claude/doc-inventory.json`
3. Run all checks defined in `HEALTH-CHECK.md`
4. Write `docs/superpowers/specs/health-report-YYYY-MM-DD.md`
5. Update health table in `docs/INDEX.md` in-place
6. **No source docs are moved, renamed, archived, or modified**

---

## Constraints

- CLAUDE.md: path corrections only (find/replace broken links)
- `plans/` and `superpowers/` subdirs: kept as-is, not recategorized
- Already-archived docs: skipped unless `--force` flag passed
- No deletions: every doc has a destination (active or archive)
- Git history: always use `git mv`, never `mv`

## Skills Invoked

- `recovery-app-go-to-market` — Phase 2, monetization agent
- `docs-to-roadmap` — Phase 2, when `inferredCategory: roadmap`

## Reference Files

| File                | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `PHASE-GUIDE.md`    | Exact agent prompts and merge logic           |
| `CATEGORIES.md`     | Classification rules and required-files list  |
| `HEALTH-CHECK.md`   | Check definitions and report format           |
| `INDEX-TEMPLATE.md` | Full docs/INDEX.md template with all sections |
````

- [ ] **Step 2: Verify SKILL.md line count is under 500**

```bash
wc -l .claude/skills/doc-organizer-recovery/SKILL.md
```

Expected: number less than 500

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/doc-organizer-recovery/SKILL.md
git commit -m "feat: add doc-organizer-recovery skill SKILL.md"
```

---

## Task 2: Create PHASE-GUIDE.md

**Files:**

- Create: `.claude/skills/doc-organizer-recovery/PHASE-GUIDE.md`

- [ ] **Step 1: Create PHASE-GUIDE.md**

Create `.claude/skills/doc-organizer-recovery/PHASE-GUIDE.md` with this exact content:

````markdown
# Phase Guide

Detailed agent prompts and merge instructions for Phase 2.

## Shared Agent Preamble

Each Phase 2 agent receives this context before its domain-specific prompt:

> You are a documentation classifier for the recovery-platform monorepo. Read the
> docs assigned to you and classify each one. Your output updates a JSON manifest.
> Be precise and conservative: if a doc's category is unclear, mark it `unknown`.
>
> Do NOT move or modify any files. Output classification JSON only.
>
> Definitions: `.claude/skills/doc-organizer-recovery/CATEGORIES.md`
> Target structure: `docs/superpowers/specs/2026-06-01-doc-organizer-recovery-design.md`

Output format per doc:

```json
{
  "path": "relative/path/from/monorepo/root.md",
  "proposedCategory": "technical",
  "proposedPath": "homegroups/docs/technical/architecture.md",
  "archiveReason": null
}
```

---

## Ecosystem Agent Prompt

Read each doc flagged `scope: ecosystem` in the manifest.

For each doc:

1. Determine: `docs/ecosystem/` (platform definition, vocabulary, integration) or
   `docs/strategy/` (monetization, market analysis, roadmap)
2. Map to the most specific target filename from the spec
3. Flag archive candidates: docs that duplicate a newer doc in the same slot

Ecosystem subdirectory assignments:

- `ecosystem/vision.md` — platform mission, why recovery platform exists
- `ecosystem/product-map.md` — all products, who they serve, how they connect
- `ecosystem/integration.md` — recovery-api integration bus, referral model
- `ecosystem/vocabulary.md` — shared domain terms (meeting, member, guest, etc.)
- `strategy/monetization.md` — cross-platform revenue model
- `strategy/market-opportunity.md` — market analysis, TAM, competitive landscape
- `strategy/roadmap.md` — ecosystem-level roadmap and phasing

---

## homegroups Agent Prompt

Read all non-archived docs in `homegroups/docs/` (skip `homegroups/docs/archive/`).

Special rules:

- `01-rats-sober-living.md`, `02-recoveryconnect-homegroups.md`,
  `03-integration-treatment-centers.md` → flag as `scope: ecosystem`
- `LAUNCH_BLOCKERS.md`, `PRE_LAUNCH_CHECKLIST.md` → `operations`
- `QUICK-REFERENCE.md` → keep as `docs/README.md` (product overview nav)
- `SECURITY_AUDIT.md`, `SECURITY_RULES.md`, `SECURITY_RULES_QUICKREF.md` → `technical`
- `BUSINESS_MODEL.md`, `BILLING_AND_PAYMENTS.md`, `REVENUE_OPPORTUNITIES.md` → `monetization`
- `MARKET_INTELLIGENCE.md` → `monetization` or flag ecosystem if cross-product scope
- `ROADMAP.md`, `AUDIT_WAVE_FOLLOWUPS.md` → `roadmap`
- `ARCHITECTURE.md`, `MESSAGING_ENGINEERING.md`, `DEVELOPMENT.md` → `technical`
- `PRODUCT_REQUIREMENTS.md` → `product`
- `deep-linking.md`, `push-notifications-treasury-features.md` → `technical`
- `financial-projections-2026-04-15.md` → `monetization`

Gap detection: note any required files missing per CATEGORIES.md required list.

---

## regroup Agent Prompt

Read all non-archived docs across:

- `regroup/mobile/docs/` (skip `regroup/mobile/docs/archive/`)
- `regroup/functions/docs/`
- `regroup/web/docs/`

Target: `regroup/docs/` unified namespace. Sub-package subfolders where needed:

- `technical/mobile/`, `technical/functions/`, `technical/web/`
- `product/`, `monetization/`, `operations/`, `plans/` are shared (no sub-package dir)

Key mappings:

- `ARCHITECTURE.md` → `technical/architecture.md`
- `FIRESTORE_DATA_MODEL.md` → `technical/mobile/firestore-data-model.md`
- `PRICING_STRATEGY_OPTIONS.md`, `PRICING_STRATEGY_OPTIONS-summary.md` → `monetization/model.md` (consolidate; archive older)
- `ECOSYSTEM_ROADMAP_2026.md` → flag `scope: ecosystem`
- `STRATEGIC_PLATFORM_ASSESSMENT_2026.md` → `product/decisions.md`
- `CORE_REQUIREMENTS.md`, `FULL_PLATFORM_REQUIREMENTS.md` → `product/requirements.md` (consolidate)
- `FEATURE_PRIORITY_ROADMAP.md`, `FULL_PLATFORM_REQUIREMENTS-summary.md` → `product/roadmap.md`
- `e2e/` subdir → `technical/mobile/e2e/` (keep subdir intact)
- `type-fixes/` subdir → `_archive/type-fixes/` (batch summaries, historical)
- `patterns/` → `technical/mobile/patterns/`
- `ux-improvements/` → `technical/mobile/ux-improvements/`
- `manual-tasks/` → `operations/manual-tasks/`
- `regroup/web/docs/iterative-review-2026-05-26.md` → `technical/web/iterative-review-2026-05-26.md`
- `regroup/functions/docs/plans/` → `plans/` (keep)

---

## detox-recovery Agent Prompt

Read all non-archived docs in `detox-recovery/docs/`.

Key mappings:

- `business-case-2026-05-24.md`, `market-opportunity-analysis-2026-05-24.md` →
  flag `scope: ecosystem`
- `financial-model-master-2026-05-24.md` → `monetization/projections.md` (most current)
- `financial-model.md`, `financial-projections-2026-05-24.md` →
  archive (older versions superseded by master)
- `monetization.md` → `monetization/model.md`
- `roadmap-2026-05-24.md` → `product/roadmap.md`
- `features.md` → `product/requirements.md`
- `architecture.md` → `technical/architecture.md`
- `api.md` → `technical/api.md`
- `deployment.md` → `operations/deployment.md`
- `environment.md` → `technical/development.md`
- `pdf-delivery.md` → `technical/pdf-delivery.md`
- `delivery-gaps.md` → `product/decisions.md`
- `discovery-strategy.md` → check content: if cross-platform → ecosystem, else `product/`
- `lead-magnets/` → `operations/lead-magnets/` (keep subdir intact)
- `products/` → `product/products/` (keep subdir intact)
- `manual-tasks/` → `operations/manual-tasks/` (keep subdir intact)

---

## recovery-api Agent Prompt

Read all docs in `recovery-api/docs/`. Minimal product.

- `docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md` →
  keep in `plans/superpowers/specs/` (already correctly placed)

Note any gaps in required files (architecture.md, development.md, etc.).

---

## Monetization Agent Prompt

First, invoke `recovery-app-go-to-market` skill with context:

> "Analyze monetization documentation across the recovery-platform monorepo.
> Docs to review: [list all paths with inferredCategory: monetization from manifest].
> Recommend: (1) which docs should consolidate to root docs/strategy/monetization.md,
> (2) which are product-specific and belong in {product}/docs/monetization/,
> (3) gaps in monetization documentation across products."

Use skill output to populate `proposedPath` and `archiveReason` for each monetization doc.

---

## Merge Step

After all agents complete:

1. Collect all per-doc JSON outputs into single array
2. Detect conflicts: same doc proposed to different paths by different agents →
   flag as `conflict` (human decision required)
3. Build proposal document at `docs/superpowers/specs/YYYY-MM-DD-doc-reorganization-proposal.md`:

```markdown
# Doc Reorganization Proposal — YYYY-MM-DD

## Move Table

| Current Path | Proposed Path | Category | Reason |
| ------------ | ------------- | -------- | ------ |
| ...          | ...           | ...      | ...    |

## Archive List

| Path | Archive Reason |
| ---- | -------------- |
| ...  | ...            |

## Stub Files to Create

Files required by target structure that have no source content yet:

- `recovery-api/docs/product/requirements.md` (stub)
- ...

## INDEX.md Draft

[full INDEX.md content from INDEX-TEMPLATE.md with real paths]

## Conflicts Requiring Human Decision

| Doc | Option A | Option B | Notes |
| --- | -------- | -------- | ----- |
| ... | ...      | ...      | ...   |
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/doc-organizer-recovery/PHASE-GUIDE.md
git commit -m "feat: add doc-organizer-recovery PHASE-GUIDE.md"
```

---

## Task 3: Create CATEGORIES.md

**Files:**

- Create: `.claude/skills/doc-organizer-recovery/CATEGORIES.md`

- [ ] **Step 1: Create CATEGORIES.md**

Create `.claude/skills/doc-organizer-recovery/CATEGORIES.md` with this exact content:

````markdown
# Category Classification Rules

Used by Phase 2 agents to assign `inferredCategory` and `proposedCategory`.

## Category Definitions

| Category       | Contains                                                               | Examples                                                                            |
| -------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `product`      | PRDs, feature requirements, decisions, user stories                    | `requirements.md`, `decisions.md`, `PRODUCT_REQUIREMENTS.md`                        |
| `technical`    | Architecture, data models, dev setup, API docs, security, code reviews | `ARCHITECTURE.md`, `FIRESTORE_DATA_MODEL.md`, `development.md`, `SECURITY_AUDIT.md` |
| `monetization` | Pricing, billing, financial models, revenue analysis                   | `financial-model.md`, `BILLING_AND_PAYMENTS.md`, `PRICING_STRATEGY_OPTIONS.md`      |
| `roadmap`      | Future plans, sprint plans, prioritization, strategic assessments      | `ROADMAP.md`, `FEATURE_PRIORITY_ROADMAP.md`, `ECOSYSTEM_ROADMAP_2026.md`            |
| `operations`   | Deployment, manual tasks, checklists, launch blockers, app store       | `deployment.md`, `LAUNCH_BLOCKERS.md`, `manual-tasks/`, `PRE_LAUNCH_CHECKLIST.md`   |
| `plans`        | Implementation plans and specs (superpowers and other)                 | `superpowers/plans/`, `superpowers/specs/`                                          |
| `archive`      | Already in an `_archive/` directory                                    | Anything under `*/_archive/*` or `*/archive/*`                                      |
| `unknown`      | Cannot be confidently classified                                       | Flag for human review                                                               |

## Scope: ecosystem vs product-specific

**Flag `scope: ecosystem`** when ANY of these are true:

- Filename or path contains: `ecosystem`, `recovery-platform`, `recovery-ecosystem`
- Content references 2+ product names in the same analysis
- Doc describes cross-product integration, shared vocabulary, or platform-wide market/strategy
- Doc is a business case or market opportunity covering the whole platform

**Flag `scope: product-specific`** when:

- Doc references only one product's features, code, or data model
- Doc is a product-specific financial projection or roadmap

## Staleness Signal Rules

| Signal                       | Condition                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| `dated-plan-90d+`            | Filename begins with `YYYY-MM-DD-` and that date is >90 days before today |
| `superseded-by:path`         | A newer doc in same category covers identical topic (agent judgment call) |
| `references-deleted-feature` | Skip on first pass — requires codebase knowledge                          |

## Filename → Category Heuristics

| Filename pattern                                                                        | Category                                       |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `*ARCHITECTURE*`, `*architecture*`, `*FIRESTORE*`, `*DATA_MODEL*`                       | `technical`                                    |
| `*ROADMAP*`, `*roadmap*`, `*STRATEGIC*`, `*FEATURE_PRIORITY*`                           | `roadmap`                                      |
| `*PRICING*`, `*financial*`, `*monetization*`, `*BILLING*`, `*REVENUE*`, `*projections*` | `monetization`                                 |
| `*REQUIREMENTS*`, `*requirements*`, `*PRODUCT_*`, `*features*`, `*decisions*`           | `product`                                      |
| `*deployment*`, `*LAUNCH_BLOCKERS*`, `*CHECKLIST*`, `manual-tasks/*`, `*app-store*`     | `operations`                                   |
| `*SECURITY*`, `*security*`, `*deep-linking*`, `*api*`                                   | `technical`                                    |
| `superpowers/plans/*`, `superpowers/specs/*`                                            | `plans`                                        |
| `archive/*`, `_archive/*`                                                               | `archive`                                      |
| `e2e/*`, `*E2E*`                                                                        | `technical`                                    |
| `type-fixes/*`                                                                          | `archive` (batch summaries, historical record) |

## Required Files Per Product

Each product MUST have these files after reorganization (stub is acceptable):

```
{product}/docs/README.md                         # product overview + navigation
{product}/docs/product/requirements.md           # PRD / feature requirements
{product}/docs/product/roadmap.md                # product-specific roadmap
{product}/docs/technical/architecture.md         # system design, data model
{product}/docs/technical/development.md          # dev setup, local run, conventions
{product}/docs/_archive/README.md                # archive index with dates/reasons
```

Optional (create stub only if relevant content exists):

```
{product}/docs/monetization/model.md             # pricing, tiers, billing logic
{product}/docs/monetization/projections.md       # financial models and projections
{product}/docs/operations/deployment.md          # deploy process, environments
{product}/docs/technical/api.md                  # API surface documentation
{product}/docs/product/decisions.md              # key decisions and rationale
```

## Stub File Format

When creating a required file with no source content, use:

```markdown
# [Title]

> **Stub** — This file is a placeholder. Content needs to be written.
> Created by doc-organizer-recovery on YYYY-MM-DD.

## TODO

- [ ] Document [specific content needed here]
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/doc-organizer-recovery/CATEGORIES.md
git commit -m "feat: add doc-organizer-recovery CATEGORIES.md"
```

---

## Task 4: Create HEALTH-CHECK.md

**Files:**

- Create: `.claude/skills/doc-organizer-recovery/HEALTH-CHECK.md`

- [ ] **Step 1: Create HEALTH-CHECK.md**

Create `.claude/skills/doc-organizer-recovery/HEALTH-CHECK.md` with this exact content:

````markdown
# Health Check Rules

Defines checks performed by `/doc-organizer-recovery --check`.

## Checks

### 1. New Unclassified Docs

**Condition:** A `.md` file exists under a `/docs` directory that is not present
in `.claude/doc-inventory.json`.

**Detection:**

```bash
find . -path "*/docs/*.md" -not -path "*node_modules*" -not -path "*/.claude/*"
# Compare against paths in .claude/doc-inventory.json
```

**Severity:** Warning

**Report format:**

```
⚠ NEW UNCLASSIFIED: homegroups/docs/NEW-NOTES.md
  → Not in inventory. Run /doc-organizer-recovery to classify.
```

---

### 2. Stale Plans

**Condition:** A file under `*/docs/plans/` or `*/docs/superpowers/plans/` has a
`YYYY-MM-DD-` filename prefix where the date is >90 days before today, and the
file is not in `_archive/`.

**Detection:**

```bash
find . -path "*/docs/plans/*.md" -not -path "*_archive*" -not -path "*node_modules*"
# For each: extract date from filename, compare to today - 90 days
```

**Severity:** Warning

**Report format:**

```
⚠ STALE PLAN: regroup/docs/plans/2026-02-23-sprint-1-stability.md
  → Created 2026-02-23, now >90 days old. Consider archiving.
```

---

### 3. Category Drift

**Condition:** A doc's current directory path does not match its `inferredCategory`
from `.claude/doc-inventory.json`.

**Detection:** For each entry in inventory where `proposedPath != path`, check if
the file is still at `path` (i.e., reorganization ran) or if it moved to a different
unexpected location.

**Severity:** Info (human judgment required — do not auto-fix)

**Report format:**

```
ℹ DRIFT: homegroups/docs/LAUNCH_BLOCKERS.md
  → Inventory says category: operations
  → Current location: docs/ root (not in operations/ subdir)
  → Consider moving to homegroups/docs/operations/launch-blockers.md
```

---

### 4. Missing Required Docs

**Condition:** A file from CATEGORIES.md's required list does not exist for a product.

**Required list:** README.md, product/requirements.md, product/roadmap.md,
technical/architecture.md, technical/development.md, \_archive/README.md

**Detection:**

```bash
# For each product in [homegroups, regroup, detox-recovery, recovery-api]:
test -f "{product}/docs/README.md" || echo "MISSING: {product}/docs/README.md"
# ...repeat for all required files
```

**Severity:** Warning

**Report format:**

```
⚠ MISSING: recovery-api/docs/product/requirements.md
  → Required file does not exist. Run /doc-organizer-recovery to create stub.
```

---

### 5. CLAUDE.md Drift

**Condition:** A CLAUDE.md file contains a markdown link or path reference pointing
to a `.md` file that no longer exists on disk.

**Detection:**

```bash
# For each CLAUDE.md in monorepo:
grep -n '](.*\.md)' {product}/CLAUDE.md
# Extract path from each match, verify file exists
```

**Severity:** Error (broken references confuse agents)

**Report format:**

```
✗ BROKEN REF: homegroups/CLAUDE.md line 42
  → References: homegroups/docs/OLD-PATH.md (file not found)
  → Nearest match: homegroups/docs/technical/architecture.md
```

---

## Health Report Output

Write to: `docs/superpowers/specs/health-report-YYYY-MM-DD.md`

```markdown
# Doc Health Report — YYYY-MM-DD

## Summary

- ✗ Errors: N
- ⚠ Warnings: N
- ℹ Info: N

## Errors

[BROKEN REF items]

## Warnings

[NEW UNCLASSIFIED, STALE PLAN, MISSING items]

## Info

[DRIFT items]

## Passed Checks

- ✓ [check name] — [brief confirmation]
```

---

## Update docs/INDEX.md Health Table

After writing the report, update the `## Health Check Status` section in
`docs/INDEX.md`. Find the existing table rows and replace with current counts:

```markdown
| Unclassified docs | ✓ 0 | — |
| Stale plans (90d+) | ⚠ 3 | See [health-report-2026-06-01.md](superpowers/specs/health-report-2026-06-01.md) |
| Missing required docs | ✓ 0 | — |
| CLAUDE.md ref drift | ✓ 0 | — |
```

Update the `> Last reorganized:` header line to reflect the current health check date.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/doc-organizer-recovery/HEALTH-CHECK.md
git commit -m "feat: add doc-organizer-recovery HEALTH-CHECK.md"
```

---

## Task 5: Create INDEX-TEMPLATE.md

**Files:**

- Create: `.claude/skills/doc-organizer-recovery/INDEX-TEMPLATE.md`

- [ ] **Step 1: Create INDEX-TEMPLATE.md**

Create `.claude/skills/doc-organizer-recovery/INDEX-TEMPLATE.md` with this exact content:

````markdown
# INDEX-TEMPLATE.md

Template used by `/doc-organizer-recovery` to generate `docs/INDEX.md`.

Placeholders resolved at generation time:

- `{DATE}` → today's date (YYYY-MM-DD)
- `{HEALTH_DATE}` → date of last --check run (or "never")
- `{STATUS}` → "✓ current" or "⚠ stale — run /doc-organizer-recovery --check"
- `{HC_*}` → health check counts from last --check run

---

```markdown
# Recovery Platform — Documentation Index

> Last reorganized: {DATE} | Health check: {HEALTH_DATE} | Status: {STATUS}

This index is optimized for AI agents. Find the section matching your task and
follow links in priority order.

---

## I'm implementing a feature or fixing a bug

Start here for any feature work or bug fix.

| What you need to know             | Read                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which product this touches        | [docs/ecosystem/product-map.md](ecosystem/product-map.md)                                                                                                                                                                                                                           |
| Product requirements & priorities | [homegroups/docs/product/requirements.md](../homegroups/docs/product/requirements.md) · [regroup/docs/product/requirements.md](../regroup/docs/product/requirements.md) · [detox-recovery/docs/product/requirements.md](../detox-recovery/docs/product/requirements.md)             |
| Current roadmap                   | [homegroups/docs/product/roadmap.md](../homegroups/docs/product/roadmap.md) · [regroup/docs/product/roadmap.md](../regroup/docs/product/roadmap.md) · [detox-recovery/docs/product/roadmap.md](../detox-recovery/docs/product/roadmap.md)                                           |
| Technical architecture            | [homegroups/docs/technical/architecture.md](../homegroups/docs/technical/architecture.md) · [regroup/docs/technical/architecture.md](../regroup/docs/technical/architecture.md) · [detox-recovery/docs/technical/architecture.md](../detox-recovery/docs/technical/architecture.md) |
| Dev setup & conventions           | [homegroups/docs/technical/development.md](../homegroups/docs/technical/development.md) · [regroup/docs/technical/development.md](../regroup/docs/technical/development.md) · [detox-recovery/docs/technical/development.md](../detox-recovery/docs/technical/development.md)       |
| Active implementation plans       | [homegroups/docs/plans/](../homegroups/docs/plans/) · [regroup/docs/plans/](../regroup/docs/plans/) · [detox-recovery/docs/plans/](../detox-recovery/docs/plans/)                                                                                                                   |
| Key past decisions                | [homegroups/docs/product/decisions.md](../homegroups/docs/product/decisions.md) · [regroup/docs/product/decisions.md](../regroup/docs/product/decisions.md)                                                                                                                         |

---

## I'm working on monetization or pricing

| What you need to know           | Read                                                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-platform revenue strategy | [docs/strategy/monetization.md](strategy/monetization.md)                                                                                                                                             |
| Market opportunity & TAM        | [docs/strategy/market-opportunity.md](strategy/market-opportunity.md)                                                                                                                                 |
| homegroups billing & pricing    | [homegroups/docs/monetization/model.md](../homegroups/docs/monetization/model.md)                                                                                                                     |
| regroup pricing model           | [regroup/docs/monetization/model.md](../regroup/docs/monetization/model.md)                                                                                                                           |
| detox-recovery monetization     | [detox-recovery/docs/monetization/model.md](../detox-recovery/docs/monetization/model.md)                                                                                                             |
| Financial projections           | [homegroups/docs/monetization/projections.md](../homegroups/docs/monetization/projections.md) · [detox-recovery/docs/monetization/projections.md](../detox-recovery/docs/monetization/projections.md) |

---

## I'm planning the roadmap or next priorities

| What you need to know   | Read                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ecosystem-level roadmap | [docs/strategy/roadmap.md](strategy/roadmap.md)                                                                                                             |
| homegroups roadmap      | [homegroups/docs/product/roadmap.md](../homegroups/docs/product/roadmap.md)                                                                                 |
| regroup (Regroup) roadmap  | [regroup/docs/product/roadmap.md](../regroup/docs/product/roadmap.md)                                                                                       |
| detox-recovery roadmap  | [detox-recovery/docs/product/roadmap.md](../detox-recovery/docs/product/roadmap.md)                                                                         |
| Key product decisions   | [homegroups/docs/product/decisions.md](../homegroups/docs/product/decisions.md) · [regroup/docs/product/decisions.md](../regroup/docs/product/decisions.md) |

---

## I need to understand the ecosystem / cross-product context

| What you need to know                       | Read                                                      |
| ------------------------------------------- | --------------------------------------------------------- |
| Platform vision & mission                   | [docs/ecosystem/vision.md](ecosystem/vision.md)           |
| All products, who they serve, connections   | [docs/ecosystem/product-map.md](ecosystem/product-map.md) |
| Cross-product integration (referrals, API)  | [docs/ecosystem/integration.md](ecosystem/integration.md) |
| Shared vocabulary (meeting, member, guest…) | [docs/ecosystem/vocabulary.md](ecosystem/vocabulary.md)   |

---

## I'm deploying or running a manual operation

| What you need to know     | Read                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| homegroups deployment     | [homegroups/docs/operations/deployment.md](../homegroups/docs/operations/deployment.md)                                                                                                                                                                                       |
| regroup deployment        | [regroup/docs/operations/deployment.md](../regroup/docs/operations/deployment.md)                                                                                                                                                                                             |
| detox-recovery deployment | [detox-recovery/docs/operations/deployment.md](../detox-recovery/docs/operations/deployment.md)                                                                                                                                                                               |
| Manual task checklists    | [homegroups/docs/operations/manual-tasks/](../homegroups/docs/operations/manual-tasks/) · [regroup/docs/operations/manual-tasks/](../regroup/docs/operations/manual-tasks/) · [detox-recovery/docs/operations/manual-tasks/](../detox-recovery/docs/operations/manual-tasks/) |

---

## Product Quick Links

| Product                            | Docs root                                                         | Serves                                      |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Homegroups (homegroups)       | [homegroups/docs/README.md](../homegroups/docs/README.md)         | 12-step group admins and members            |
| Regroup                     | [regroup/docs/README.md](../regroup/docs/README.md)               | Sober living house operators and residents  |
| NextStep Recovery (detox-recovery) | [detox-recovery/docs/README.md](../detox-recovery/docs/README.md) | Individuals/families seeking detox guidance |
| recovery-api                       | [recovery-api/docs/README.md](../recovery-api/docs/README.md)     | Cross-app integration layer                 |

---

## Health Check Status

_Updated by `/doc-organizer-recovery --check`_

| Check                 | Status            | Details                  |
| --------------------- | ----------------- | ------------------------ |
| Unclassified docs     | {HC_UNCLASSIFIED} | {HC_UNCLASSIFIED_DETAIL} |
| Stale plans (90d+)    | {HC_STALE}        | {HC_STALE_DETAIL}        |
| Missing required docs | {HC_MISSING}      | {HC_MISSING_DETAIL}      |
| CLAUDE.md ref drift   | {HC_DRIFT}        | {HC_DRIFT_DETAIL}        |
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/doc-organizer-recovery/INDEX-TEMPLATE.md
git commit -m "feat: add doc-organizer-recovery INDEX-TEMPLATE.md"
```

---

## Task 6: Create skill-rules.json

**Files:**

- Create: `.claude/skills/skill-rules.json`

- [ ] **Step 1: Create skill-rules.json**

Create `.claude/skills/skill-rules.json` with this exact content:

```json
{
  "doc-organizer-recovery": {
    "type": "domain",
    "enforcement": "suggest",
    "priority": "high",
    "promptTriggers": {
      "keywords": [
        "doc-organizer-recovery",
        "organize docs",
        "reorganize docs",
        "doc health check",
        "docs audit",
        "doc drift",
        "stale docs",
        "docs structure",
        "recovery platform docs",
        "docs index",
        "documentation structure"
      ],
      "intentPatterns": [
        "(organize|reorganize|restructure|audit|clean\\s*up).*docs",
        "docs.*(organize|structure|health|stale|drift|audit)",
        "(check|scan|review).*documentation"
      ]
    }
  }
}
```

- [ ] **Step 2: Validate JSON is well-formed**

```bash
jq . .claude/skills/skill-rules.json
```

Expected: the JSON is pretty-printed with no errors. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/skill-rules.json
git commit -m "feat: add skill-rules.json with doc-organizer-recovery trigger config"
```

---

## Task 7: Seed root docs/ skeleton

**Files:**

- Create: `docs/INDEX.md` (placeholder)
- Create: `docs/ecosystem/.gitkeep`
- Create: `docs/strategy/.gitkeep`
- Create: `docs/_archive/.gitkeep`

- [ ] **Step 1: Create skeleton directories and placeholder INDEX.md**

```bash
mkdir -p docs/ecosystem docs/strategy docs/_archive
touch docs/ecosystem/.gitkeep docs/strategy/.gitkeep docs/_archive/.gitkeep
```

Create `docs/INDEX.md` with this exact content:

```markdown
# Recovery Platform — Documentation Index

> **Status: not yet reorganized** — Run `/doc-organizer-recovery` to populate this index.

This file will be generated by the `doc-organizer-recovery` skill. Once run, it
becomes the primary agent entry point for all documentation in the monorepo.

## Quick Start (before reorganization)

| Product                            | Docs                                            |
| ---------------------------------- | ----------------------------------------------- |
| Homegroups (homegroups)       | [homegroups/docs/](../homegroups/docs/)         |
| Regroup                     | [regroup/mobile/docs/](../regroup/mobile/docs/) |
| NextStep Recovery (detox-recovery) | [detox-recovery/docs/](../detox-recovery/docs/) |
| recovery-api                       | [recovery-api/docs/](../recovery-api/docs/)     |

## Run the organizer
```

/doc-organizer-recovery

```

This will analyze all /docs directories, propose a reorganization plan, and — after
your approval — move files into the structured layout and replace this placeholder
with the full agent-oriented index.
```

- [ ] **Step 2: Verify directory structure**

```bash
find docs/ -type f | sort
```

Expected output:

```
docs/INDEX.md
docs/_archive/.gitkeep
docs/ecosystem/.gitkeep
docs/strategy/.gitkeep
docs/superpowers/specs/2026-06-01-doc-organizer-recovery-design.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/INDEX.md docs/ecosystem/.gitkeep docs/strategy/.gitkeep docs/_archive/.gitkeep
git commit -m "feat: seed root docs/ skeleton for doc-organizer-recovery"
```

---

## Task 8: Verify skill is complete and well-formed

- [ ] **Step 1: Verify all skill files exist**

```bash
ls -la .claude/skills/doc-organizer-recovery/
```

Expected output (5 files):

```
SKILL.md
PHASE-GUIDE.md
CATEGORIES.md
HEALTH-CHECK.md
INDEX-TEMPLATE.md
```

- [ ] **Step 2: Verify SKILL.md is under 500 lines**

```bash
wc -l .claude/skills/doc-organizer-recovery/SKILL.md
```

Expected: less than 500

- [ ] **Step 3: Verify SKILL.md frontmatter is valid YAML**

```bash
head -20 .claude/skills/doc-organizer-recovery/SKILL.md
```

Expected: opens with `---`, has `name:`, `description:`, `user-invocable: true`, closes with `---`

- [ ] **Step 4: Verify skill-rules.json is valid JSON**

```bash
jq '.["doc-organizer-recovery"] | keys' .claude/skills/skill-rules.json
```

Expected:

```json
["enforcement", "priority", "promptTriggers", "type"]
```

- [ ] **Step 5: Verify root docs/ has INDEX.md**

```bash
test -f docs/INDEX.md && echo "EXISTS" || echo "MISSING"
```

Expected: `EXISTS`

- [ ] **Step 6: Verify no reference file exceeds 500 lines**

```bash
wc -l .claude/skills/doc-organizer-recovery/*.md
```

Expected: all files under 500 lines

- [ ] **Step 7: Final commit — tag completion**

```bash
git add -A
git status
# Verify only expected files are staged (nothing surprising)
git commit -m "feat: complete doc-organizer-recovery skill implementation"
```

---

## Post-Implementation: First Run

After the skill is implemented, the next step is to actually run it:

```
/doc-organizer-recovery
```

This will:

1. Build `.claude/doc-inventory.json` (Phase 1)
2. Generate `docs/superpowers/specs/YYYY-MM-DD-doc-reorganization-proposal.md` (Phase 2)
3. Wait for your approval before moving any files (Phase 3)

The proposal document is the deliverable of the first run — review it carefully before
approving Phase 3.
