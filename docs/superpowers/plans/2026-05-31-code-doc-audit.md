# code-doc-audit Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code skill that treats code as ground truth, walks the codebase to build behavioral profiles, cross-references docs against those profiles, and writes dated artifact reports to `code-review-artifacts/` before touching any doc file.

**Architecture:** Five sequential phases (Code Survey → Behavioral Scan → Doc Cross-Reference → Discrepancy Classification → Output). Always writes the artifact first. Three output modes via flags: `--report-only` (default), `--auto-update` (safe rewrites for 🔴 Wrong findings only), `--interactive` (prompt per finding). Stale (🟡) findings are never auto-applied in any mode.

**Tech Stack:** Claude Code skill (Markdown + YAML frontmatter). Files: SKILL.md, OUTPUT_TEMPLATE.md, EXAMPLES.md, skill-rules.json patch.

**Spec:** `docs/superpowers/specs/2026-05-31-code-doc-audit-design.md`
**Companion skill:** `~/.claude/skills/doc-code-audit/` (inverse direction)

---

### Task 1: Create skill directory and OUTPUT_TEMPLATE.md

Write the artifact format reference file first — this is the contract that SKILL.md Phase 5 must produce. Writing the template before the skill prevents vague hand-waving about output format.

**Files:**

- Create: `~/.claude/skills/code-doc-audit/` (directory)
- Create: `~/.claude/skills/code-doc-audit/OUTPUT_TEMPLATE.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p ~/.claude/skills/code-doc-audit
```

Expected: directory created, no output.

- [ ] **Step 2: Write OUTPUT_TEMPLATE.md**

Create `~/.claude/skills/code-doc-audit/OUTPUT_TEMPLATE.md` with this content:

```markdown
# Output Template

Use this exact structure for Phase 5 output.
Omit sections that have no findings (except Summary — always include it).

---

# Code → Doc Audit Report

**Date:** YYYY-MM-DD
**Project:** [repo or package name — use directory basename if unsure]
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

**`[HTTP_METHOD /path OR functionName()]`**
Doc claims: [what the doc says — quote or paraphrase]
Code truth: [what the code actually does — specific about the delta]
Doc file: `path/to/doc.md:LINE`
Code file: `path/to/implementation.ts:LINE`
Recommendation: [one sentence describing the exact edit needed]
Action taken: Updated | Flagged for review | Skipped

[Repeat block for each 🔴 finding]

### 🟡 Stale Documentation

**`[symbol or path that no longer exists]`**
Doc describes: [what the doc claims]
Code truth: No matching implementation found
Doc file: `path/to/doc.md:LINE`
Recommendation: Remove or archive this section — no replacement found
Action taken: Flagged in artifact only (manual action required)

[Repeat block for each 🟡 finding]

### 📄 Undocumented Code

**`[HTTP_METHOD /path OR functionName()]`**
Code: [one sentence describing what it does, derived from implementation]
Doc file: None found
Recommendation: Add documentation covering this [endpoint | function | type]
Action taken: Stub added | Flagged for review | Skipped

[Repeat block for each 📄 finding]

### ✅ Accurate (logged for completeness)

- `[symbol]` — `doc.md:LINE` matches `implementation.ts:LINE`

---

## Actions Taken

[Only present in --auto-update or --interactive modes]

- [x] Updated `docs/API.md:42` — added `referralType` parameter
- [ ] `GET /api/users/search` — stale, awaiting manual decision (see 🟡 above)
```

- [ ] **Step 3: Verify the file exists**

```bash
wc -l ~/.claude/skills/code-doc-audit/OUTPUT_TEMPLATE.md
head -5 ~/.claude/skills/code-doc-audit/OUTPUT_TEMPLATE.md
```

Expected: ~70 lines, first line is `# Output Template`.

- [ ] **Step 4: Commit**

```bash
git -C ~/.claude add skills/code-doc-audit/OUTPUT_TEMPLATE.md
git -C ~/.claude commit -m "feat(skill): add code-doc-audit output template"
```

---

### Task 2: Write SKILL.md — frontmatter, Phase 1, Phase 2

Write the first half of SKILL.md: frontmatter, parameter table, Phase 1 (Code Survey), Phase 2 (Behavioral Scan).

**Files:**

- Create: `~/.claude/skills/code-doc-audit/SKILL.md`

- [ ] **Step 1: Create SKILL.md with frontmatter through Phase 2**

Create `~/.claude/skills/code-doc-audit/SKILL.md`:

````markdown
---
name: code-doc-audit
description: >
  Walk the codebase as the source of truth and check whether documentation
  accurately reflects what is implemented. Finds wrong descriptions, stale docs
  referencing deleted code, and undocumented features. Writes a dated artifact
  report to code-review-artifacts/ before touching any doc file.
  Use --auto-update to apply safe rewrites for wrong descriptions, or
  --interactive to approve each change. Stale findings are always flagged only —
  never auto-removed.
  Trigger keywords: docs out of sync, docs don't match code, are my docs accurate,
  check if docs reflect the code, stale documentation, docs freshness check,
  after refactor what docs need updating, find wrong docs, sync docs to code,
  pre-release doc check, code changed but docs didn't, docs vs implementation,
  documentation drift, update docs after refactor.
user-invocable: true
allowed-tools: Bash, Read, Edit, Write
model: sonnet
---

# code-doc-audit

Walk the codebase as ground truth. Cross-reference docs against behavioral
profiles extracted from the implementation. Write a dated artifact report
to `code-review-artifacts/` before touching any doc file.

**Companion skill:** `doc-code-audit` asks "does code fulfill what docs promise?"
This skill asks "do docs accurately describe what code does?"

## Parameters

| Flag                         | Effect                                             |
| ---------------------------- | -------------------------------------------------- |
| (default)                    | `--report-only` — artifact only, no doc changes    |
| `--auto-update`              | Artifact + safe rewrites for 🔴 Wrong findings     |
| `--interactive`              | Artifact + prompt per 🔴 and 📄 finding            |
| `--focus api\|behavior\|all` | Scope Phase 1 (default: all)                       |
| `path/to/subdir`             | Scope code scan to a specific package or directory |

Detect the mode from the user's invocation args before starting Phase 1.

---

## Phase 1 — Code Survey (~3k tokens)

Extract the API surface. Structural inventory only — no deep reading yet.
Run all commands in parallel. Scope to the path arg if provided.

```bash
# Routes and endpoints
grep -rn "router\.\(get\|post\|put\|patch\|delete\)\|app\.\(get\|post\|put\|patch\|delete\)\|@Get\|@Post\|@Put\|@Patch\|@Delete\|@Controller\|new Hono" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.go" \
  . 2>/dev/null | grep -v node_modules | grep -v "\.test\." | head -60

# Exported functions and classes
grep -rn "^export \(function\|class\|const\|async function\)" \
  --include="*.ts" --include="*.js" \
  . 2>/dev/null | grep -v node_modules | grep -v "\.test\." | head -60

# Schema and type definitions
find . -name "schema.prisma" -o -name "*.schema.ts" -o -name "*.types.ts" \
  -o -name "*.model.ts" 2>/dev/null | grep -v node_modules | head -20

# Docs to cross-reference in Phase 3
find . \( -name "*.md" -o -name "openapi*.json" -o -name "swagger*.json" \) \
  2>/dev/null | grep -v node_modules | grep -v ".git" | sort
```

<thinking>
Build an inventory from Phase 1:
  Code Item → file:line → type (route | exported-fn | exported-class | type | schema)

Filter by --focus flag:
api: keep routes only
behavior: keep exported-fn and exported-class only
all (default): keep everything

Prioritize: routes first (most likely documented), then exported functions,
then types/schemas. Do not proceed to Phase 2 without listing the inventory.
</thinking>

---

## Phase 2 — Behavioral Scan (~5k tokens)

For each item in the Phase 1 inventory, read only the implementing symbol —
not the whole file. Extract the behavioral profile:

- Parameters (names, types, required/optional, validation constraints)
- Return value (type, shape, HTTP status codes for routes)
- Errors thrown or returned
- Side effects (database writes, external calls, events emitted)

Use Serena's `find_symbol` with `include_body=true` per symbol where available.
Fall back to reading 20–40 lines around the symbol if Serena is unavailable.

<thinking>
After Phase 2, you should have a profile for each inventoried item, e.g.:

POST /api/referrals
params: { userId: string, targetApp: string, referralType: string (required) }
returns: 201 { id, createdAt } | 400 { error }
side effects: writes to Firestore referrals collection

Read only the symbols in scope. Do not read entire source files.
Proceed to Phase 3 once all inventoried items have profiles.
</thinking>
````

- [ ] **Step 2: Check line count**

```bash
wc -l ~/.claude/skills/code-doc-audit/SKILL.md
```

Expected: ~100 lines.

- [ ] **Step 3: Commit checkpoint**

```bash
git -C ~/.claude add skills/code-doc-audit/SKILL.md
git -C ~/.claude commit -m "feat(skill): add code-doc-audit Phases 1-2 (survey + behavioral scan)"
```

---

### Task 3: Append Phases 3–5, modes, and guardrails to SKILL.md

**Files:**

- Modify: `~/.claude/skills/code-doc-audit/SKILL.md` (append)

- [ ] **Step 1: Append remaining phases to SKILL.md**

Open `~/.claude/skills/code-doc-audit/SKILL.md` and append:

````markdown
---

## Phase 3 — Doc Cross-Reference (~4k tokens)

For each item with a behavioral profile, search docs for any mention.

```bash
# Run per item — replace SYMBOL_OR_PATH with the actual name or route
grep -rn "SYMBOL_OR_PATH" \
  --include="*.md" --include="*.yaml" --include="*.json" \
  . 2>/dev/null | grep -v node_modules | grep -v ".git"
```

For each match, read 10–20 lines of surrounding context to capture the
full description. Compare against the Phase 2 behavioral profile.

<thinking>
For each code item:
  - Does any doc mention it by name or path?
  - If yes: does the doc's description match the behavioral profile?
      Wrong: doc describes it differently (params, return, path, behavior)
      Stale: doc references this item but it no longer exists in code
      Accurate: doc and code agree on all material points
  - If no: Undocumented

What counts as "materially wrong": wrong param name or type, missing required
param, wrong return shape, wrong HTTP status, wrong endpoint path.
Minor wording differences that don't affect correctness are NOT flagged.

Build the full findings list before writing any artifact.
</thinking>

---

## Phase 4 — Discrepancy Classification

Assign every inventoried item one label:

| Label               | Criterion                                                  |
| ------------------- | ---------------------------------------------------------- |
| 🔴 **Wrong**        | Doc describes the item but gets something materially wrong |
| 🟡 **Stale**        | Doc references an item that no longer exists in code       |
| 📄 **Undocumented** | No doc mentions this item                                  |
| ✅ **Accurate**     | Doc and code agree on all material points                  |

---

## Phase 5 — Output

### 5.1 Write the artifact

```bash
mkdir -p code-review-artifacts
```

Write the dated artifact to:
`code-review-artifacts/YYYY-MM-DD-<project-basename>-code-doc-audit.md`

Use [OUTPUT_TEMPLATE.md](OUTPUT_TEMPLATE.md) for the exact structure.
**The artifact MUST be written before any doc file is opened for editing.**

### 5.2 Apply output mode

**`--report-only` (default)**
Stop after writing the artifact. Set every `Action taken` to
"Flagged, no changes made." Do not open any doc file.

**`--auto-update`**
After writing the artifact, apply 🔴 Wrong findings only:

- Correct parameter names, types, return descriptions, endpoint paths in docs
- Do NOT add new sections for 📄 Undocumented items
- Do NOT modify 🟡 Stale sections — set Action taken to
  "Flagged in artifact only (manual action required)"

**`--interactive`**
After writing the artifact, walk each 🔴 and 📄 finding:

```
[N/TOTAL] 🔴 [symbol] — [discrepancy summary] in [doc:line]
Proposed change: [specific edit]
Apply? [Y]es / [N]o / [S]kip all remaining
```

🟡 Stale findings: show a summary line only, never prompt:
"Flagged in artifact only (manual action required)."

---

## Constraints

- Write the artifact BEFORE opening any doc file — always, in every mode.
- 🟡 Stale findings are NEVER auto-applied. Artifact only, every mode.
- Never delete doc content. Rewrites and additions only.
- Read only target symbols in Phase 2 — not entire files.
- Keep the artifact factual: "code says X, doc says Y."
- Token target: <25k tokens for a typical single-package scan.

## Reference Files

- [OUTPUT_TEMPLATE.md](OUTPUT_TEMPLATE.md) — exact artifact document structure
- [EXAMPLES.md](EXAMPLES.md) — worked examples for route change, stale doc, undocumented fn
````

- [ ] **Step 2: Verify line count stays under 500**

```bash
wc -l ~/.claude/skills/code-doc-audit/SKILL.md
```

Expected: ~220 lines.

- [ ] **Step 3: Commit**

```bash
git -C ~/.claude add skills/code-doc-audit/SKILL.md
git -C ~/.claude commit -m "feat(skill): complete code-doc-audit Phases 3-5 and guardrails"
```

---

### Task 4: Write EXAMPLES.md

Three worked examples covering 🔴 Wrong, 🟡 Stale, and 📄 Undocumented.

**Files:**

- Create: `~/.claude/skills/code-doc-audit/EXAMPLES.md`

- [ ] **Step 1: Write EXAMPLES.md**

Create `~/.claude/skills/code-doc-audit/EXAMPLES.md`:

````markdown
# Worked Examples

## Example A — Wrong Description (TypeScript route)

**Phase 1 finds:** `POST /api/referrals` in `src/routes/referrals.ts:18`

**Phase 2 behavioral profile:**

- params: `{ userId: string, targetApp: string, referralType: 'detox'|'sober-living'|'homegroup' }` — referralType required
- returns: `201 { id, createdAt }` | `400 { error: string }`
- side effects: writes to Firestore `referrals` collection

**Phase 3 finds** `docs/API.md:42`:

> `POST /api/referrals` — body: `{ userId, targetApp }` → 201 with referral ID

**Classification:** 🔴 Wrong — `referralType` required by code, absent from docs

**Artifact entry:**

```
**`POST /api/referrals`**
Doc claims: body: { userId, targetApp } → 201 with referral ID
Code truth: body: { userId, targetApp, referralType: 'detox'|'sober-living'|'homegroup' } — referralType is required
Doc file: docs/API.md:42
Code file: src/routes/referrals.ts:18
Recommendation: Add referralType as required enum field to the request body docs
Action taken: Updated docs/API.md:42
```

---

## Example B — Stale Documentation

**Phase 3:** Cross-referencing `docs/API.md` turns up `GET /api/users/search`

**Phase 2:** No route matching `/users/search` exists anywhere in source files

**Classification:** 🟡 Stale — documented endpoint was deleted

**Artifact entry (all modes identical):**

```
**`GET /api/users/search`**
Doc describes: search endpoint accepting ?q= query parameter, returns user array
Code truth: No matching route found in codebase
Doc file: docs/API.md:78
Recommendation: Remove or archive this section — endpoint was deleted
Action taken: Flagged in artifact only (manual action required)
```

---

## Example C — Undocumented Function (--interactive)

**Phase 1 finds:** `export async function updateUserPreferences` in
`src/services/users.ts:94`

**Phase 2 behavioral profile:**

- params: `(userId: string, preferences: Partial<UserPreferences>)`
- returns: `Promise<UserPreferences>`
- side effects: writes to Firestore `users/{userId}/preferences`

**Phase 3:** No doc mentions `updateUserPreferences` or "preferences"

**Classification:** 📄 Undocumented

**Interactive prompt:**

```
[3/5] 📄 updateUserPreferences() — no documentation found
Code: Updates Firestore user preferences document for the given userId
Proposed action: Add stub entry to docs/SERVICES.md
Apply? [Y]es / [N]o / [S]kip all remaining
```

**If Y, appends to `docs/SERVICES.md`:**

```markdown
### `updateUserPreferences(userId, preferences)`

Updates stored preferences for a user.

**Parameters:** `userId: string`, `preferences: Partial<UserPreferences>`
**Returns:** `Promise<UserPreferences>`
**Side effects:** Writes to Firestore `users/{userId}/preferences`
```
````

- [ ] **Step 2: Verify file**

```bash
wc -l ~/.claude/skills/code-doc-audit/EXAMPLES.md
```

Expected: ~80 lines.

- [ ] **Step 3: Commit**

```bash
git -C ~/.claude add skills/code-doc-audit/EXAMPLES.md
git -C ~/.claude commit -m "feat(skill): add code-doc-audit worked examples"
```

---

### Task 5: Register in skill-rules.json

**Files:**

- Modify: `~/.claude/skills/skill-rules.json`

- [ ] **Step 1: Verify JSON is valid before editing**

```bash
python3 -m json.tool ~/.claude/skills/skill-rules.json > /dev/null && echo "valid"
```

Expected: `valid`

- [ ] **Step 2: Add entry before the closing `"notes"` key**

Find the last skill entry's closing `}` before `"notes"` and insert after it:

```json
,
"code-doc-audit": {
  "type": "domain",
  "enforcement": "suggest",
  "priority": "medium",
  "description": "Code-first documentation audit — check if docs accurately reflect the codebase",
  "promptTriggers": {
    "keywords": [
      "docs out of sync",
      "docs don't match code",
      "are my docs accurate",
      "docs accurate",
      "check if docs reflect",
      "stale documentation",
      "stale docs",
      "docs freshness",
      "after refactor",
      "what docs need updating",
      "find wrong docs",
      "sync docs to code",
      "pre-release doc check",
      "code changed but docs",
      "docs vs implementation",
      "documentation drift"
    ],
    "intentPatterns": [
      "(check|verify|audit|review).*docs.*(accurate|correct|current|up.to.date)",
      "(find|surface|detect).*(stale|wrong|outdated).*(doc|documentation)",
      "(are|is).*(doc|documentation).*(accurate|correct|up.to.date|current)",
      "(sync|update|fix).*(doc|documentation).*(code|implementation|codebase)"
    ]
  }
}
```

- [ ] **Step 3: Validate JSON after edit**

```bash
python3 -m json.tool ~/.claude/skills/skill-rules.json > /dev/null && echo "valid"
```

Expected: `valid`. If not, fix the comma placement and re-validate.

- [ ] **Step 4: Commit**

```bash
git -C ~/.claude add skills/skill-rules.json
git -C ~/.claude commit -m "feat(skill): register code-doc-audit triggers in skill-rules.json"
```

---

### Task 6: Smoke test on recovery-api

Verify the skill produces a correctly-formatted artifact on a real package
without modifying any doc files.

**Files:**

- Verify: `recovery-platform/code-review-artifacts/` (created by the skill)

- [ ] **Step 1: Reload skills**

```
/reload-skills
```

Expected: output includes `code-doc-audit` in the available skills list.

- [ ] **Step 2: Run the skill in default mode**

```
/code-doc-audit recovery-api
```

Expected sequence:

1. Phase 1 scans Hono routes in `recovery-api/src/routes/`
2. Phase 2 reads each route handler
3. Phase 3 searches `recovery-api/` docs for route mentions
4. Phase 5 writes `code-review-artifacts/YYYY-MM-DD-recovery-api-code-doc-audit.md`

- [ ] **Step 3: Verify artifact structure**

```bash
ls ~/dev/recovery-platform/code-review-artifacts/
head -20 ~/dev/recovery-platform/code-review-artifacts/*code-doc-audit.md
```

Expected: file exists; first 20 lines contain `# Code → Doc Audit Report`,
`**Date:**`, `**Mode:** report-only`, and `## Summary` with a counts table.

- [ ] **Step 4: Verify no doc files were modified**

```bash
git -C ~/dev/recovery-platform diff --name-only
```

Expected: only `code-review-artifacts/` is new — no changes in `docs/` or source files.

- [ ] **Step 5: Commit smoke-test artifact**

```bash
cd ~/dev/recovery-platform
git add code-review-artifacts/
git commit -m "test: initial code-doc-audit smoke test artifact for recovery-api"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement                                                    | Task                    |
| ------------------------------------------------------------------- | ----------------------- |
| 5 phases (Survey → Behavioral Scan → Cross-Ref → Classify → Output) | Tasks 2–3               |
| Phase 1: routes, exports, schemas                                   | Task 2                  |
| Phase 2: params, returns, errors, side effects                      | Task 2                  |
| Phase 3: doc cross-reference per item                               | Task 3                  |
| Phase 4: 🔴🟡📄✅ classification                                    | Task 3                  |
| Artifact written before any doc edit                                | Task 3 (Phase 5.1)      |
| `--report-only` default                                             | Task 3                  |
| `--auto-update`: 🔴 only, never 🟡                                  | Task 3                  |
| `--interactive`: 🔴 and 📄, 🟡 summary only                         | Task 3                  |
| `--focus` and `path/to/subdir` flags                                | Task 2 (thinking block) |
| `code-review-artifacts/` output location                            | Tasks 1 + 3             |
| Stale never auto-applied in any mode                                | Task 3 (constraints)    |
| Never delete doc content                                            | Task 3 (constraints)    |
| skill-rules.json registration                                       | Task 5                  |
| Worked examples                                                     | Task 4                  |
| Smoke test                                                          | Task 6                  |

All requirements covered. No gaps.

**Placeholder scan:** No TBD or TODO. All bash commands are exact with expected output. All code blocks contain real content.

**Type consistency:** `behavioral profile` used consistently in Tasks 2, 3, 4. Artifact filename pattern `YYYY-MM-DD-<project-basename>-code-doc-audit.md` defined in Task 1 template and referenced in Tasks 3 and 6.
