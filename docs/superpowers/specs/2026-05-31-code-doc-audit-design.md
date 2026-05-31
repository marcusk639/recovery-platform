# code-doc-audit Skill — Design Spec

**Date:** 2026-05-31
**Status:** Approved for implementation
**Companion skill:** `doc-code-audit` (inverse direction)

---

## Problem

Documentation drifts from the code that implements it. After refactors, endpoint
changes, parameter additions, or feature removals, docs silently become wrong.
`doc-code-audit` catches unimplemented requirements (docs → code). This skill
catches the opposite: inaccurate or missing documentation (code → docs).

---

## Core Concept

Code is the source of truth. The skill walks the codebase to build a behavioral
profile of what actually exists, then cross-references docs against that profile
to find discrepancies. All findings are written to a dated artifact document
before any doc file is touched.

---

## Skill Identity

**Name:** `code-doc-audit`

**Trigger phrases:**

- "are my docs accurate / up to date / still correct?"
- "check if docs reflect the code", "docs out of sync", "docs don't match the code"
- "after this refactor, what docs need updating?"
- "find stale documentation", "what docs are wrong"
- "sync docs to code", "code changed but docs didn't"
- "pre-release doc check", "docs freshness check"

**Parameters:**

| Flag                         | Effect                                               |
| ---------------------------- | ---------------------------------------------------- |
| (default)                    | `--report-only` — artifact only, no doc changes      |
| `--auto-update`              | Artifact + apply safe rewrites for 🔴 Wrong findings |
| `--interactive`              | Artifact + prompt per 🔴 and 📄 finding              |
| `--focus api\|behavior\|all` | Scope Phase 1 (default: all)                         |
| `path/to/subdir`             | Scope code scan to a specific package or directory   |

---

## Architecture

Five sequential phases.

### Phase 1 — Code Survey

Extract the API surface: routes/endpoints, exported functions, exported types and
schemas, public class interfaces. Structural inventory only — no deep reading yet.

```bash
# Routes and endpoints
grep -r "router\.\|app\.get\|app\.post\|@Get\|@Post\|@Controller" \
  --include="*.ts" --include="*.py" --include="*.go" -l | grep -v node_modules

# Exported symbols
grep -r "^export " --include="*.ts" -l | grep -v node_modules | grep -v "*.test.ts"

# Schema definitions
find . -name "schema.prisma" -o -name "*.schema.ts" -o -name "*.types.ts" \
  | grep -v node_modules
```

Build an inventory: `Code Item → file + line → type (route | function | type | schema)`

### Phase 2 — Behavioral Scan

For each item from Phase 1, read the implementation to extract the behavioral
profile — what it actually does:

- Parameters accepted (names, types, required/optional, constraints)
- Return value (type, shape, status codes for routes)
- Errors thrown or returned
- Side effects (writes, notifications, external calls)

Read only the symbols in scope — do not read entire files.

### Phase 3 — Doc Cross-Reference

For each code item with a behavioral profile, find every doc that mentions it
by name or path. Compare the doc's description against the Phase 2 profile.

```bash
grep -r "SYMBOL_NAME\|/endpoint/path" --include="*.md" --include="*.yaml" \
  -l | grep -v node_modules
```

### Phase 4 — Discrepancy Classification

| Label               | Meaning                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| 🔴 **Wrong**        | Doc describes the code incorrectly (wrong params, wrong return, wrong path) |
| 🟡 **Stale**        | Doc references code that no longer exists or was substantially restructured |
| 📄 **Undocumented** | Code exists with no doc coverage                                            |
| ✅ **Accurate**     | Code and doc agree — logged, not surfaced as a problem                      |

### Phase 5 — Output

Write dated artifact to `code-review-artifacts/YYYY-MM-DD-<project>-code-doc-audit.md`
**before** any doc file is opened for editing. Then apply the selected output mode.

---

## Artifact Format

```markdown
# Code → Doc Audit Report

**Date:** YYYY-MM-DD
**Project:** [project name]
**Mode:** report-only | auto-update | interactive
**Code files scanned:** N
**Doc files cross-referenced:** N

---

## Summary

| Category                             | Count |
| ------------------------------------ | ----- |
| 🔴 Wrong descriptions                | N     |
| 🟡 Stale (code removed/restructured) | N     |
| 📄 Undocumented code                 | N     |
| ✅ Accurate                          | N     |

---

## Findings

### 🔴 Wrong Descriptions

**`POST /api/referrals`**
Doc claims: `body: { userId, targetApp }` → Returns 201 with referral ID
Code truth: `body: { userId, targetApp, referralType }` (referralType required)
Doc file: `docs/API.md:42`
Code file: `src/routes/referrals.ts:18`
Recommendation: Add `referralType: string (required)` to request body description
Action taken: [Updated | Flagged for review | Skipped]

### 🟡 Stale Documentation

**`GET /api/users/search`**
Doc describes: search endpoint with `?q=` query param
Code truth: Endpoint no longer exists
Doc file: `docs/API.md:78`
Recommendation: Remove or archive this section — no replacement found
Action taken: Flagged in artifact only (manual action required)

### 📄 Undocumented Code

**`PUT /api/users/me/preferences`**
Code: Updates user notification preferences
Doc file: None found
Recommendation: Add documentation covering this endpoint
Action taken: [Stub added | Flagged for review | Skipped]
```

The `Action taken` line is always present. If the skill errors mid-update,
the artifact still records what was found and what was attempted.

---

## Output Modes

### `--report-only` (default)

Artifact written. No doc files touched. Every `Action taken` reads
"Flagged, no changes made." Safe to run on any codebase at any time.

### `--auto-update`

Artifact written first. Then targeted rewrites applied to doc files for
🔴 Wrong findings only: corrects parameter names/types, return values,
endpoint paths, changed signatures.

**Never auto-applied:**

- 🟡 Stale — deletion requires human decision
- 📄 Undocumented — adding new doc sections requires human decision

### `--interactive`

Artifact written first. Walks each 🔴 and 📄 finding one at a time:

```
[1/4] 🔴 POST /api/referrals — missing referralType parameter in docs/API.md:42
Proposed change: Add `referralType: string (required)` to request body table
Apply? [Y]es / [N]o / [S]kip all remaining
```

🟡 Stale findings shown in summary at end — never prompted, artifact only.

---

## Key Invariants

1. **Artifact before edits** — written before any doc file is touched, in every mode.
2. **Stale findings never auto-applied** — 🟡 always requires human decision.
3. **Never delete doc content** — rewrites and additions only.
4. **Code is ground truth** — when code and docs conflict, the code wins.

---

## Relationship to `doc-code-audit`

| Skill            | Starting point | Question answered                                     |
| ---------------- | -------------- | ----------------------------------------------------- |
| `doc-code-audit` | Docs           | "Does the code do what the docs promise?"             |
| `code-doc-audit` | Code           | "Do the docs accurately describe what the code does?" |

Recommended sequence: `doc-code-audit` first (unimplemented requirements),
then `code-doc-audit` (inaccurate descriptions). `codebase-review` can invoke both.

---

## Output Location

```
code-review-artifacts/
  YYYY-MM-DD-<project-name>-code-doc-audit.md
```

Directory created if absent. Files never overwritten — each run produces a new
dated file, building a historical audit trail.

---

## Guardrails

- Read all targeted code symbols before cross-referencing docs.
- Never delete doc content. Rewrites and additions only.
- Never auto-apply stale findings. Always flag to artifact.
- Keep the artifact factual: "code says X, doc says Y" — not interpretations.
- For undocumented code, flag it; do not infer intent from variable names alone.
