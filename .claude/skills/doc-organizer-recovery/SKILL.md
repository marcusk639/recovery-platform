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

1. Run: `find . -name "*.md" -path "*/docs/*" -not -path "*node_modules*" -not -path "*/.claude/*"`
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

Show the user the path to the proposal file and ask: "Review the proposal at [path] and reply with 'approved' to proceed, or describe changes needed."
Approval = "approved", "yes", "looks good", or user edits proposal file then confirms.
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
