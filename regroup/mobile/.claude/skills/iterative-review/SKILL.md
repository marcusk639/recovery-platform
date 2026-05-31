---
name: iterative-review
description: Performs iterative cycles of parallel code reviews and targeted fixes until reviewers reach high confidence or a maximum iteration count is hit. Use when you want a self-correcting review loop: dispatch reviewers, fix findings, re-review, repeat. Trigger keywords: iterative review, review until confident, review loop, review and fix, repeated review cycles, keep reviewing until clean, high confidence review, review iterations, self-correcting review.
---

# Iterative Review

## Purpose

Run parallel review agents in a loop. Each cycle: reviewers find issues → fix them → reviewers re-check. Stop when reviewers return clean (no findings above threshold) or when the iteration cap is reached.

This is the same discipline used for security hooks and CLAUDE.md accuracy: dispatch, fix, re-dispatch, stop when confident.

## Arguments

`$ARGUMENTS` specifies what to review. Examples:

- `the hooks I just modified` — review specific files by description
- `apps/server/src/router/routers/brand.ts` — review a specific file
- `all changes on this branch` — review the full diff
- `3` — just a number sets the max iterations (default: 3)
- `apps/server/src/router/routers/brand.ts max:5` — file + custom cap

## Workflow

### Step 0: Parse arguments

Extract from `$ARGUMENTS`:

- **Target**: what to review (files, description, or "changes on this branch")
- **Max iterations**: look for `max:N` or a bare number; default = **3**

If target is vague, run `git diff --name-only` to surface recently changed files as the default scope.

### Step 1: Select review agents

Choose agents based on what the target contains. Run them **in parallel**:

| Target contains          | Agent to use                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| Hook scripts (`.sh`)     | `code-reviewer` — focus on regex, logic, exit codes                   |
| Server / Cloud Functions | `code-reviewer` + `security-reviewer` — auth guards, input validation |
| React / React Native     | `code-reviewer` — hooks patterns, memo, navigation, accessibility     |
| CLAUDE.md / docs         | `code-reviewer` — factual accuracy vs. codebase                       |
| Auth / security code     | `security-reviewer` — auth patterns, secrets, OWASP                   |
| Anything else            | `code-reviewer` — general code quality                                |

Use 2–3 agents in parallel maximum. More agents = more findings but longer cycles.

### Step 2: Dispatch reviewers (parallel)

Give each agent:

1. The exact files to review (absolute paths)
2. Context about what changed and why
3. Any fixes already applied from prior iterations
4. Instructions to rate findings `[CRITICAL]`, `[HIGH]`, `[MEDIUM]`, `[LOW]` with confidence 0–100
5. "Only report genuine issues — do not flag intentional design choices"

### Step 3: Evaluate findings

Collect all agent reports. Apply the **stop threshold**:

| Condition                                               | Action                  |
| ------------------------------------------------------- | ----------------------- |
| No findings rated CRITICAL or HIGH with confidence ≥ 85 | **STOP — confident** ✅ |
| Only MEDIUM/LOW findings remain                         | **STOP — confident** ✅ |
| CRITICAL/HIGH findings exist                            | Fix them, continue loop |
| Iteration cap reached                                   | **STOP — capped** ⚠️    |

### Step 4: Fix findings

Fix all CRITICAL and HIGH findings (confidence ≥ 85) before the next cycle. For each fix:

- Apply the minimal change that resolves the issue
- Note what was changed — agents in the next cycle need this context

### Step 5: Re-dispatch (next iteration)

Increment the iteration counter. Tell reviewers:

- What was fixed since last cycle
- To re-verify the specific fixes (don't re-review unchanged code exhaustively)

Return to Step 2.

### Step 6: Report final status

```
Iterative Review Complete
─────────────────────────
Iterations: N / max
Outcome: [Confident clean | Capped with N findings remaining]

Per-cycle summary:
  Cycle 1: N findings → fixed M
  Cycle 2: N findings → fixed M
  Cycle 3: 0 findings → stopped

Remaining findings (if capped):
  [list any unfixed MEDIUM/LOW items]
```

## Confidence Threshold

**Default: 85** — findings below this confidence are treated as LOW regardless of severity label.

Reviewers can over-flag. A CRITICAL finding at confidence 60 is less actionable than a HIGH at confidence 92. The threshold prevents churning on uncertain findings.

## Iteration Cap

**Default: 3.** Rationale:

- Cycle 1 finds the most issues
- Cycle 2 catches issues introduced by fixes
- Cycle 3 confirms clean state
- Beyond 3 usually means the scope is too large or the fixes are introducing new issues

If still dirty after 3 cycles, stop and report what remains. Don't loop indefinitely.

## Example Session

```
User: /iterative-review the hooks I modified max:4

→ Cycle 1 (parallel: quality-reviewer × 2)
  Findings: 3 CRITICAL, 2 HIGH, 1 MEDIUM
  Fixed: 3 CRITICAL, 2 HIGH

→ Cycle 2 (re-review fixes + check for regressions)
  Findings: 1 HIGH (new issue introduced by fix), 1 MEDIUM
  Fixed: 1 HIGH

→ Cycle 3 (verify)
  Findings: 0 CRITICAL/HIGH above threshold
  → STOP — confident ✅

Final: 3 cycles, all critical/high resolved.
```

## Tips

- **Narrow scope = fewer cycles.** Reviewing 3 files converges faster than reviewing 30.
- **Re-read before fixing.** After a PostToolUse formatter hook runs, files change. Re-read before the next cycle's edit.
- **Distinguish reviewers.** If one reviewer keeps flagging the same false positive, tell the next cycle explicitly why that pattern is intentional.
- **Don't fix MEDIUM/LOW mid-loop.** They don't block stopping and fixing them can introduce new HIGH issues. Address them after the loop.

## Related

- `/review-locally` — single-pass PR review (no fix loop)
- `/capture-learnings` — save insights from what the review loop discovered
- `/dispatching-agents` — skill for parallel agent dispatch patterns
