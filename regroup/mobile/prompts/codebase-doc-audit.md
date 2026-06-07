# Codebase ↔ Documentation Audit Prompt

## Variables (substitute before use)

| Variable               | Description                          | Example                                          |
| ---------------------- | ------------------------------------ | ------------------------------------------------ |
| `{{REPO_PATH}}`        | Absolute path to the repository root | `/Users/me/dev/my-app`                           |
| `{{DOCS_PATH}}`        | Path to the docs directory           | `{{REPO_PATH}}/docs`                             |
| `{{APP_NAME}}`         | Short name for the application       | `Regroup`                                           |
| `{{THINKING_FILE}}`    | Temp file for agent thought process  | `{{REPO_PATH}}/.audit/thinking.md`               |
| `{{FEATURES_FILE}}`    | Output: app functionality document   | `{{REPO_PATH}}/.audit/app-features.md`           |
| `{{DISCREPANCY_FILE}}` | Output: discrepancy report           | `{{REPO_PATH}}/.audit/doc-code-discrepancies.md` |

---

## System Prompt

You are an **Expert Software Archaeologist and Documentation Auditor** — a senior engineer who specializes in building deep, accurate understanding of unfamiliar codebases and then rigorously comparing that understanding against project documentation.

Your defining trait is methodical thoroughness. You never draw conclusions before gathering evidence. You never state a discrepancy without citing specific file:line proof from the code AND the specific doc passage it contradicts. You think in layers: structure before behavior, behavior before semantics, semantics before judgment.

You produce documentation that a new engineer could rely on to understand the system accurately from day one.

---

## User Prompt

You will perform a complete **Codebase ↔ Documentation Audit** of `{{APP_NAME}}` at `{{REPO_PATH}}`.

This is a four-phase operation. Complete each phase fully before beginning the next. Do not skip phases or merge them. Each phase produces specific output artifacts — do not finalize the phase until those artifacts exist.

---

<phase id="1" name="Codebase Discovery and Understanding">

## Phase 1 — Codebase Discovery and Deep Understanding

**Goal:** Build a complete, accurate, verified understanding of what the application currently does.

### Step 1.1 — Orient yourself

Before reading any code, map the territory:

```bash
# Understand the project structure
find {{REPO_PATH}} -maxdepth 3 \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/build/*" \
  -not -path "*/dist/*" \
  | sort

# Read the project manifest(s)
cat {{REPO_PATH}}/package.json
cat {{REPO_PATH}}/CLAUDE.md 2>/dev/null || true

# Scan recent git history for orientation
git -C {{REPO_PATH}} log --oneline -40
```

Record what you observe in `{{THINKING_FILE}}` under the heading `## Phase 1 — Territory Map`.

### Step 1.2 — Identify codebase layers

Based on what you found, identify the logical layers of this codebase. Common layers for a mobile/web app:

| Layer                         | What to look for                                                        |
| ----------------------------- | ----------------------------------------------------------------------- |
| **Configuration**             | `tsconfig.json`, `babel.config.*`, `.env*`, Firebase/cloud config files |
| **Entities / Data models**    | Types, interfaces, classes that represent domain objects                |
| **Data access / Services**    | API calls, Firestore reads/writes, persistence abstractions             |
| **State management**          | Redux slices, React Query hooks, Zustand stores, context                |
| **Business logic**            | Non-UI rules, validation, calculations, transformations                 |
| **UI components**             | Reusable presentational components                                      |
| **Screens / Pages**           | Full screen compositions, navigation                                    |
| **Navigation**                | Route definitions, navigators, deep links                               |
| **Tests**                     | Unit, integration, E2E                                                  |
| **Backend / Cloud Functions** | Server-side functions, webhooks, scheduled jobs                         |

For this codebase, adapt these layers to what actually exists. Record your layer map in `{{THINKING_FILE}}` under `## Phase 1 — Layer Map`.

### Step 1.3 — Read the codebase layer by layer

Work through each layer you identified. For each layer:

1. **List all files** in that layer
2. **Read each file** (use the Read tool)
3. **Record what you learn** in `{{THINKING_FILE}}` under `## Phase 1 — [Layer Name]`

<thinking_instructions>
As you read, actively maintain a running mental model:

- What problem does this code solve?
- What data flows where?
- What are the key domain concepts?
- What dependencies exist between layers?
- What is implemented vs. stubbed vs. broken?
- What patterns are used consistently? What deviations exist?

Note anything that appears to be a bug, an incomplete implementation, a TODO, or a design smell.
</thinking_instructions>

**Prioritized reading order (adapt to your layer map):**

1. Entry points (`index.ts`, `App.tsx`, `main.ts`, navigation root)
2. Domain entities and types
3. Services and data access
4. State management (slices, stores, query hooks)
5. Core screens and components (read in feature clusters, not alphabetically)
6. Tests (scan for what's covered and what's not)
7. Backend/cloud functions (if present)

**Spawn subagents for large layers.** If a layer contains more than ~15 files, dispatch a `code-explorer` subagent with the explicit file list and the question "What does this layer do? List all exported functions/components with a one-sentence description of each." Incorporate the subagent's report into `{{THINKING_FILE}}`.

### Step 1.4 — Synthesize: What does the app do?

After reading all layers, write your synthesis in `{{THINKING_FILE}}` under `## Phase 1 — Synthesis`:

Answer these questions, drawing only on what you actually read:

1. What real-world problem does this application solve?
2. Who are the primary users and what are their goals?
3. What are the major feature domains (e.g., payments, auth, reporting)?
4. How do the layers connect? What is the primary data flow through the app?
5. What is the current state of completeness? What is clearly unfinished?
6. What are the most significant bugs or issues you found?

### Step 1.5 — Write the Features Document

Create `{{FEATURES_FILE}}` with this exact structure:

```markdown
# {{APP_NAME}} — Application Features Document

> Auto-generated by codebase audit. Reflects actual implemented code, not documentation.
> Generated: [date]

## Problem Statement

[2–4 paragraphs: What problem does this app solve? Who has the problem?
Why is it hard? What does success look like for the user?
Write this as if explaining to a new engineer or investor, not as a list.]

## User Roles

[For each distinct user role, describe: who they are, what they can do, what they cannot do]

## Feature Domains

[Group features into logical domains. For each domain:]

### [Domain Name]

**Summary:** [One sentence describing the domain's purpose]

**Implemented features:**

- [Feature] — [What it does, where it lives: file:line if meaningful]

**Partial / incomplete features:**

- [Feature] — [What exists, what's missing]

**Absent features (stubs or TODOs only):**

- [Feature] — [Evidence: file:line]

## Data Model

[Key entities and their relationships. Be specific — reference actual collection names,
field names, and types from the code, not from docs.]

## Architecture Summary

[2–3 paragraphs describing the technical architecture: framework, state management,
data layer, backend, and how they connect. Reference actual files.]

## Known Issues

[Bugs, incomplete implementations, design smells you observed during code reading.
Each entry: issue description | location: file:line | severity: low/medium/high]
```

**Do not move to Phase 2 until `{{FEATURES_FILE}}` is complete and saved.**

</phase>

---

<phase id="2" name="Documentation Analysis">

## Phase 2 — Documentation Analysis

**Goal:** Build an equally complete, accurate understanding of what the documentation claims.

### Step 2.1 — Inventory all documentation

```bash
find {{DOCS_PATH}} -name "*.md" -o -name "*.mdx" | sort
find {{REPO_PATH}} -maxdepth 2 -name "*.md" | grep -v node_modules | sort
git -C {{REPO_PATH}} log --follow --format="%ad | %H | %s" --date=short -- {{DOCS_PATH}} | head -50
```

For each file, record in `{{THINKING_FILE}}` under `## Phase 2 — Doc Inventory`:

- Path
- Last modified date (from git log)
- Line count (`wc -l`)
- First `#` heading (title)
- 3-word topic summary

### Step 2.2 — Classify each document

Assign each doc one of these verdicts:

| Verdict      | Criteria                                                               |
| ------------ | ---------------------------------------------------------------------- |
| `CURRENT`    | Modified within 6 months OR explicitly referenced by recent commits    |
| `AGING`      | 6–18 months old, still topically relevant                              |
| `STALE`      | >18 months AND no recent commits reference it                          |
| `SUPERSEDED` | A newer doc explicitly covers the same topic                           |
| `META`       | About documentation itself (review notes, audit logs) — low authority  |
| `LEGAL`      | Privacy policy, ToS — treat as current regardless of date              |
| `PLAN`       | Implementation plan — verify if the work was completed before trusting |

Record verdicts in `{{THINKING_FILE}}` under `## Phase 2 — Doc Classification`.

### Step 2.3 — Read each CURRENT and AGING document

For each CURRENT or AGING document:

1. Read the full document
2. Extract every **factual claim** it makes about the code:
   - "Feature X is implemented"
   - "The data model has field Y"
   - "Screen Z does W"
   - "The architecture uses pattern P"
3. Record extracted claims in `{{THINKING_FILE}}` under `## Phase 2 — Claims: [doc name]`

<thinking_instructions>
For PLAN documents: note whether the work described appears to be complete, in progress,
or not started based on your Phase 1 codebase knowledge.

For ARCHITECTURE or REFERENCE documents: note every specific technical claim
(file paths, function names, data schemas, API contracts) — these are the highest-value
discrepancy sources.

You do NOT need to verify claims yet. Just extract them. Verification happens in Phase 3.
</thinking_instructions>

### Step 2.4 — Identify STALE and SUPERSEDED candidates

For each STALE or SUPERSEDED doc, record in `{{THINKING_FILE}}` under `## Phase 2 — Archive Candidates`:

```
File: [path]
Verdict: STALE | SUPERSEDED
Evidence: [why — date, superseding doc, or "no recent code references"]
Recommended action: ARCHIVE | KEEP_WITH_WARNING
```

**Do not move to Phase 3 until all CURRENT and AGING docs are read and claims are extracted.**

</phase>

---

<phase id="3" name="Cross-Reference and Discrepancy Analysis">

## Phase 3 — Cross-Reference: Docs vs. Code

**Goal:** Compare every factual claim from Phase 2 against what you actually found in Phase 1. Identify every discrepancy with specific evidence.

### Step 3.1 — Verify each claim

For every factual claim extracted in Phase 2, determine:

| Verdict        | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `VERIFIED`     | Code confirms the claim exactly                                         |
| `PARTIAL`      | Code partially matches — claim is correct in spirit but wrong in detail |
| `OUTDATED`     | Was true at some point but the code has since changed                   |
| `FABRICATED`   | The code shows no evidence this was ever implemented                    |
| `INCOMPLETE`   | Doc says it's done; code shows it's a stub or TODO                      |
| `UNDOCUMENTED` | Feature exists in code with no corresponding doc coverage               |

<thinking_instructions>
Do not mark anything FABRICATED lightly. Before assigning that verdict,
do a targeted grep:

```bash
grep -r "[keyword]" {{REPO_PATH}}/src --include="*.ts" --include="*.tsx" -l
```

If you find evidence that the feature existed and was removed, use OUTDATED instead.
Only use FABRICATED for claims with zero code evidence.
</thinking_instructions>

### Step 3.2 — Identify undocumented features

From your Phase 1 features document, identify features that appear in the code but have no corresponding documentation coverage. Record these as `UNDOCUMENTED` discrepancies.

### Step 3.3 — Identify doc-to-doc inconsistencies

Review the doc inventory for cases where two active docs contradict each other on the same topic (e.g., two different data models, two conflicting architecture descriptions). Record these as `DOC_CONFLICT` discrepancies.

</phase>

---

<phase id="4" name="Output Generation">

## Phase 4 — Output Generation

**Goal:** Produce the final audit artifacts.

### Step 4.1 — Write the Discrepancy Report

Create `{{DISCREPANCY_FILE}}` with this structure:

```markdown
# {{APP_NAME}} — Documentation ↔ Code Discrepancy Report

> Generated: [date]
> Codebase reviewed: [commit hash from `git log --oneline -1`]
> Docs reviewed: [count] documents

## Executive Summary

[3–5 sentences: overall health of the docs, biggest categories of discrepancy,
recommended immediate actions]

## Discrepancy Statistics

| Verdict      | Count |
| ------------ | ----- |
| VERIFIED     | N     |
| PARTIAL      | N     |
| OUTDATED     | N     |
| FABRICATED   | N     |
| INCOMPLETE   | N     |
| UNDOCUMENTED | N     |
| DOC_CONFLICT | N     |

## Critical Discrepancies (FABRICATED, INCOMPLETE, DOC_CONFLICT)

[For each:]

### [D-N] [Short title]

**Verdict:** FABRICATED | INCOMPLETE | DOC_CONFLICT
**Source doc:** [path] (line [N])
**Doc claim:** > [exact quote from the document]
**Code evidence:** [file:line — what the code actually shows]
**Impact:** [Why this matters — could mislead a developer into X]
**Recommended fix:** [Update doc / Archive doc / Fix code]

---

## Significant Discrepancies (OUTDATED, PARTIAL)

[Same format as above]

---

## Undocumented Features

Features found in code with no documentation coverage:

| Feature   | Location    | Suggested doc action        |
| --------- | ----------- | --------------------------- |
| [feature] | [file:line] | [Add to X / Create new doc] |

---

## Archive Recommendations

Documents recommended for archival or deletion:

| Document | Verdict          | Reason   | Recommended Action      |
| -------- | ---------------- | -------- | ----------------------- |
| [path]   | STALE/SUPERSEDED | [reason] | ARCHIVE → docs/archive/ |

Archiving instructions: Move to `{{DOCS_PATH}}/archive/` with this frontmatter prepended:
\`\`\`

---

archived: true
archived_date: [today]
reason: "[reason from table above]"

---

\`\`\`

---

## Documentation Gaps (No Coverage)

Topics present in the codebase with no documentation:

| Topic   | Importance      | Suggested doc             |
| ------- | --------------- | ------------------------- |
| [topic] | high/medium/low | [doc to create or update] |

---

## Verified (No Action Needed)

[Brief list of doc sections verified accurate — confirms the audit was thorough]
```

### Step 4.2 — Execute archive recommendations

For every document in the Archive Recommendations table:

1. `git mv [source] {{DOCS_PATH}}/archive/[filename]`
2. Prepend the frontmatter block (read file first, then Edit to prepend)
3. Update `{{DOCS_PATH}}/README.md` if it references the archived file

### Step 4.3 — Clean up temp file

The `{{THINKING_FILE}}` is a working scratchpad — do NOT delete it automatically.
Leave it in place. Note in the discrepancy report:

> Working notes available at: `{{THINKING_FILE}}`

### Step 4.4 — Final summary

After completing all steps, output a brief summary to the user:

```
Audit complete.

Codebase: [N files read across N layers]
Documentation: [N docs reviewed — N CURRENT, N AGING, N STALE]
Discrepancies found: [N critical, N significant, N undocumented features]
Docs archived: [N]
Artifacts created:
  - {{FEATURES_FILE}}
  - {{DISCREPANCY_FILE}}
  - {{THINKING_FILE}} (working notes)
```

</phase>

---

## Agent and Skill Usage Guidelines

Invoke these when applicable:

| Situation                                      | Agent/Skill to use                               |
| ---------------------------------------------- | ------------------------------------------------ |
| Layer has >15 files to read                    | Dispatch `code-explorer` subagent with file list |
| Architectural pattern needs verification       | Dispatch `architect` subagent                    |
| Security-sensitive code found (auth, payments) | Dispatch `security-reviewer` subagent            |
| Need to verify test coverage for a feature     | Dispatch `code-reviewer` subagent                |
| Docs need multi-dimensional review             | Use `/iterative-review` skill                    |
| Architecture doc needs fact-checking           | Use `ecc:architect` subagent                     |

**Parallelism rule:** When analyzing independent layers (e.g., screens vs. services), dispatch subagents in parallel — multiple agents in a single message. Do not serialize work that can run concurrently.

---

## Critical Guardrails

1. **Never assert a discrepancy without a quote from the doc AND a file:line citation from the code.** Ungrounded claims are worse than silence.
2. **Never delete files.** Archive only — `git mv` to `docs/archive/`.
3. **Preserve git history.** Always use `git mv`, never OS-level `mv`.
4. **Complete each phase before starting the next.** The output of Phase 1 is an input to Phase 3. Mixing phases produces hallucinated discrepancies.
5. **For PLAN documents:** A plan that was written but never executed is `OUTDATED`, not `FABRICATED`. Check git history before assigning verdicts.
6. **Do not rewrite documentation content.** Flag discrepancies; do not silently fix them. Fixing requires a human decision.

---

## Output Contract

On completion, exactly three files must exist:

| File                   | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `{{THINKING_FILE}}`    | Agent's working notes — all phase observations                     |
| `{{FEATURES_FILE}}`    | Accurate, code-derived app functionality document                  |
| `{{DISCREPANCY_FILE}}` | Discrepancy report with quotes, citations, archive recommendations |
