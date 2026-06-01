# Health Check Rules

Defines checks performed by `/doc-organizer-recovery --check`.

## Checks

### 1. New Unclassified Docs

**Condition:** A `.md` file exists under a `/docs` directory that is not present
in `.claude/doc-inventory.json`.

**Detection:**

```bash
find . -name "*.md" -path "*/docs/*" -not -path "*node_modules*" -not -path "*/.claude/*"
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
find . -name "*.md" -path "*/docs/plans/*" -not -path "*_archive*" -not -path "*node_modules*"
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
