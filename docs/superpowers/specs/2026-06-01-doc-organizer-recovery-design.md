# Design Spec: `doc-organizer-recovery` Skill

**Date:** 2026-06-01
**Status:** Approved — ready for implementation planning
**Skill name:** `doc-organizer-recovery`
**Invocation:** `/doc-organizer-recovery` or `/doc-organizer-recovery --check`

---

## Purpose

A Claude Code skill that deeply analyzes, reorganizes, and maintains all `/docs`
directories across the recovery-platform monorepo. Its primary consumer is AI agents
— the organized output lets any agent orient quickly on any task: feature implementation,
bug fixes, monetization strategy, roadmap planning, or deployment operations.

**Scope:** `/docs` directories only. CLAUDE.md files receive minor reference updates
(path corrections) only — no content changes.

---

## Target Documentation Structure

### Root `/docs/` — Ecosystem Source of Truth

```
docs/
├── INDEX.md                        # Agent entry point (see section below)
├── ecosystem/
│   ├── vision.md                   # Platform mission, recovery ecosystem goals
│   ├── product-map.md              # All products, who they serve, how they connect
│   ├── integration.md              # recovery-api integration bus, referral model
│   └── vocabulary.md               # Shared domain terms across products
├── strategy/
│   ├── monetization.md             # Cross-platform revenue model & priorities
│   ├── market-opportunity.md       # Market analysis, TAM, competitive landscape
│   └── roadmap.md                  # Ecosystem-level roadmap and phasing
└── _archive/                       # Superseded ecosystem-level docs
```

### Per-Product `/docs/` — App-Specific

Each product (`homegroups`, `regroup`, `detox-recovery`, `recovery-api`) gets:

```
{product}/docs/
├── README.md                       # Product overview + quick navigation
├── product/
│   ├── requirements.md             # PRD / feature requirements
│   ├── roadmap.md                  # Product-specific roadmap
│   └── decisions.md                # Key product decisions and rationale
├── technical/
│   ├── architecture.md             # System design, data model, infrastructure
│   ├── development.md              # Dev setup, local run, conventions
│   └── api.md                      # API surface (where applicable)
├── monetization/
│   ├── model.md                    # Pricing, tiers, billing logic
│   └── projections.md              # Financial models and projections
├── operations/
│   ├── deployment.md               # Deploy process, environments
│   └── manual-tasks/               # Dated manual task checklists (kept as-is)
├── plans/
│   └── superpowers/                # Superpowers-generated plans and specs
└── _archive/
    └── README.md                   # Why things were archived, when
```

### `regroup/docs/` — Unified Namespace

`regroup` has a single `/docs` at `regroup/docs/` that absorbs `regroup/mobile/docs/`,
`regroup/functions/docs/`, and `regroup/web/docs/`. Sub-package-specific docs go into
sub-package subfolders within the relevant category:

```
regroup/docs/
├── README.md
├── product/
├── technical/
│   ├── mobile/
│   ├── functions/
│   └── web/
├── monetization/
├── operations/
├── plans/
└── _archive/
```

---

## Skill Mechanics

### Invocation

```
/doc-organizer-recovery           # Full reorganization mode
/doc-organizer-recovery --check   # Health check mode (read-only)
```

### Phase 1 — Inventory

Crawls all `/docs` directories and builds `.claude/doc-inventory.json`.

**Per-document fields:**

| Field              | Description                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `path`             | Relative path from monorepo root                                                               |
| `product`          | `ecosystem \| homegroups \| regroup \| detox-recovery \| recovery-api`                         |
| `inferredCategory` | `product \| technical \| monetization \| operations \| roadmap \| plans \| archive \| unknown` |
| `scope`            | `ecosystem \| product-specific`                                                                |
| `lastModified`     | File mtime                                                                                     |
| `stalenessSignals` | Array: `dated-plan-90d+`, `superseded-by:path`, `references-deleted-feature`                   |
| `targetPath`       | Proposed destination path                                                                      |

The manifest is committed to `.claude/doc-inventory.json` and serves as the health
check baseline.

**Ecosystem-scope signals:** A doc is flagged `scope: ecosystem` when its filename or
content references multiple products, contains "recovery platform" / "ecosystem" framing,
or lives in a path like `recovery-ecosystem-*`.

### Phase 2 — Analysis + Proposal (parallel agents)

Agents run in parallel from the manifest:

| Agent                | Input                                     | Output                                                               |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Ecosystem agent      | All `scope: ecosystem` docs               | Assignments to `docs/ecosystem/` or `docs/strategy/`                 |
| homegroups agent     | `homegroups/docs/` docs                   | Category assignments, archive candidates, gaps                       |
| regroup agent        | All three regroup `/docs` dirs            | Unified layout, `mobile/`/`functions/`/`web/` subfolder assignments  |
| detox-recovery agent | `detox-recovery/docs/` docs               | Category assignments, archive candidates                             |
| recovery-api agent   | `recovery-api/docs/` docs                 | Confirms currency                                                    |
| Monetization agent   | All `inferredCategory: monetization` docs | Invokes `recovery-app-go-to-market`; produces consolidated structure |

Each agent writes `proposedCategory`, `proposedPath`, and `archiveReason` back into
the manifest. The orchestrator merges into a single proposal document:

**Proposal output:** `docs/superpowers/specs/YYYY-MM-DD-doc-reorganization-proposal.md`

Proposal contains:

1. Full move table: `current path → proposed path`
2. Archive list with reason per doc
3. New stub files to create (gaps in required structure)
4. Root `docs/INDEX.md` draft
5. Conflicts and ambiguities requiring human decision

**No files are moved until Phase 3.** The proposal is the approval gate.

### Phase 3 — Execute (approval required)

Triggered only after explicit user approval of the proposal. Approval means the user
responds to the proposal document with a message such as "approved", "looks good",
"yes", or edits the proposal file directly and then confirms. A response of "make
these changes first" or annotating the proposal with corrections sends the skill back
to Phase 2 for a revised proposal. Steps:

1. Create target directory structure
2. Move files per approved move table (`git mv` to preserve history)
3. Create `_archive/` dirs with `README.md` explaining contents and archival date
4. Write root `docs/INDEX.md` from template
5. Write per-product `docs/README.md`
6. Update CLAUDE.md cross-references that point to moved paths (find/replace only)
7. Commit: `docs: reorganize per doc-organizer-recovery proposal YYYY-MM-DD`

### Health Check Mode (`--check`)

Re-runs Phase 1, diffs against saved `.claude/doc-inventory.json` baseline. Reports:

| Check                 | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| New unclassified docs | Files added to `/docs` since last run not matching structure |
| Stale plans           | Dated plans older than 90 days not yet archived              |
| Category drift        | Docs that appear to have changed scope                       |
| Missing required docs | Products missing architecture.md, requirements.md, etc.      |
| CLAUDE.md drift       | Cross-references pointing to paths that no longer exist      |

Health check output is written to `docs/superpowers/specs/health-report-YYYY-MM-DD.md`
and the health table in `docs/INDEX.md` is updated in-place. No source docs are moved,
renamed, archived, or modified — only the report and index health table are written.

---

## `docs/INDEX.md` — Agent Entry Point

The root index is written for AI agents as the primary consumer. Format:

```markdown
# Recovery Platform — Documentation Index

> Last reorganized: YYYY-MM-DD | Health check: YYYY-MM-DD | Status: ✓ current

## How to Use This Index

Read the section matching your task type, follow the links in priority order.

## I'm implementing a feature or fixing a bug

| What you need to know               | Read                                     |
| ----------------------------------- | ---------------------------------------- |
| Which product this touches          | docs/ecosystem/product-map.md            |
| Product requirements & priorities   | {product}/docs/product/requirements.md   |
| Current roadmap                     | {product}/docs/product/roadmap.md        |
| Technical architecture & data model | {product}/docs/technical/architecture.md |
| Dev setup & conventions             | {product}/docs/technical/development.md  |
| Active implementation plan          | {product}/docs/plans/                    |

## I'm working on monetization or pricing

## I'm planning the roadmap or next priorities

## I need to understand the ecosystem / cross-product context

## I'm deploying or running a manual operation

## Product Quick Links

## Health Check Status ← updated by --check runs

<!-- Full table content for all sections above is defined in
     .claude/skills/doc-organizer-recovery/INDEX-TEMPLATE.md
     and rendered at execution time. -->
```

---

## Skill File Layout

```
.claude/skills/doc-organizer-recovery/
├── SKILL.md              # Main file (< 500 lines): orchestration, invocation, phases
├── PHASE-GUIDE.md        # Detailed phase instructions and agent prompts
├── CATEGORIES.md         # Classification rules and category definitions
├── HEALTH-CHECK.md       # Staleness signal definitions and drift detection logic
└── INDEX-TEMPLATE.md     # Full docs/INDEX.md template
```

### Frontmatter

```yaml
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
```

### Trigger Configuration

```json
"doc-organizer-recovery": {
  "type": "domain",
  "enforcement": "suggest",
  "priority": "high",
  "promptTriggers": {
    "keywords": [
      "doc-organizer-recovery", "organize docs", "reorganize docs",
      "doc health check", "docs audit", "doc drift", "stale docs",
      "docs structure", "recovery platform docs", "docs index",
      "documentation structure"
    ],
    "intentPatterns": [
      "(organize|reorganize|restructure|audit|clean\\s*up).*docs",
      "docs.*(organize|structure|health|stale|drift|audit)",
      "(check|scan|review).*documentation"
    ]
  }
}
```

---

## Skills Invoked During Execution

| Skill                       | When                        | Purpose                                        |
| --------------------------- | --------------------------- | ---------------------------------------------- |
| `recovery-app-go-to-market` | Phase 2, monetization agent | Analyze monetization docs across all products  |
| `docs-to-roadmap`           | Phase 2, per-product agents | Validate roadmap docs reflect current codebase |

---

## Constraints

- **CLAUDE.md files:** Path corrections only. No content edits.
- **`plans/` and `superpowers/` dirs:** Kept as-is within each product's `/docs`. Not recategorized.
- **Already-archived docs:** Docs already in `_archive/` are not re-analyzed unless `--force` flag provided.
- **`regroup` unification:** `regroup/mobile/docs/`, `regroup/functions/docs/`, and `regroup/web/docs/` all move to `regroup/docs/` with sub-package subfolders where needed.
- **No deletions:** Every file move has a destination. Nothing is deleted — only archived.
- **Git history:** All moves use `git mv` to preserve blame and log history.

---

## Success Criteria

1. Root `docs/INDEX.md` exists and lets an agent find any topic in ≤ 2 hops
2. Every product has the required category subdirs with at least a stub doc
3. All dated plans older than 90 days are in `_archive/`
4. No doc lives outside the defined structure (zero `unknown` category in manifest)
5. `--check` runs clean (zero warnings) within 1 week of a full reorganization
6. CLAUDE.md cross-references are not broken after execution
