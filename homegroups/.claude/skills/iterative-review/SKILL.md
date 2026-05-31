---
name: iterative-review
description: Iterative code review and fix loop for recently written code. Reviews changed files for functional correctness, scores confidence, fixes issues, and repeats until reaching high confidence. Use after completing a feature, fixing bugs, or before committing.
---

# Iterative Code Review

Review recently changed code for functional correctness. Score confidence per file. Fix issues found. Re-review until all files reach high confidence. This is a rigid skill — follow the loop exactly.

## When to Use

- After completing a feature or bug fix
- Before committing changes
- When the user says "review my changes", "check my code", "iterative review"
- Proactively after writing multiple files

## Step 1: Identify Changed Files

Get the list of files modified in the current session:

```bash
git diff --name-only HEAD
git diff --name-only --cached
git ls-files --others --exclude-standard
```

If no git changes, review files edited in the current conversation.

Exclude from review: test files, config files, documentation, lock files, generated files.

## Step 2: First Pass — Read and Score Each File

For each changed file, read it completely and evaluate across these dimensions:

### Scoring Dimensions (each 0-10)

| Dimension                  | What to Check                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Functional correctness** | Does the code do what it's supposed to? Are there logic errors, off-by-one, wrong comparisons?                                      |
| **Data integrity**         | Are field names consistent between reads and writes? Are types correct? Are defaults safe?                                          |
| **Error handling**         | Are errors caught? Are they caught at the right level? Do catch blocks handle errors meaningfully (not swallow)?                    |
| **Edge cases**             | What happens with null, undefined, empty arrays, missing fields, concurrent access?                                                 |
| **Integration safety**     | Do function signatures match callers? Are return types what consumers expect? Do field names match across boundaries (API, DB, UI)? |

### Confidence Score

```
confidence = min(functional, data_integrity, error_handling, edge_cases, integration) * 10
```

The confidence is the **weakest dimension × 10** (0-100 scale). A file with perfect scores except a 3 in edge cases gets confidence = 30.

### Output Format Per File

```
## [file_path] — Confidence: [score]/100

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functional correctness | X/10 | ... |
| Data integrity | X/10 | ... |
| Error handling | X/10 | ... |
| Edge cases | X/10 | ... |
| Integration safety | X/10 | ... |

### Issues Found
1. [SEVERITY] Description — file:line
2. [SEVERITY] Description — file:line

### Verdict: PASS (≥80) | NEEDS_FIX (<80) | CRITICAL (<50)
```

Severity levels: `CRITICAL` (data loss/security), `HIGH` (functional bug), `MEDIUM` (edge case), `LOW` (style/clarity)

## Step 3: Fix Loop

For each file with verdict `NEEDS_FIX` or `CRITICAL`:

1. Fix the highest-severity issue first
2. Run related tests if they exist:
   ```bash
   # Find and run related test
   BASENAME=$(basename "$FILE" | sed 's/\.[^.]*$//')
   npx jest --passWithNoTests --testPathPattern="$BASENAME" 2>&1 | tail -10
   ```
3. Re-score ONLY the dimensions that were affected by the fix
4. Update the confidence score

### Loop Termination

- **Exit when**: ALL files have confidence ≥ 80
- **Max iterations**: 5 per file (if still <80 after 5, report remaining issues to user)
- **Early exit**: If a fix introduces a NEW issue (confidence drops), stop and report to user

## Step 4: Final Report

After all files pass or max iterations reached:

```
## Iterative Review Summary

### Files Reviewed: N
### Iterations: M total across all files

| File | Initial | Final | Iterations | Status |
|------|---------|-------|------------|--------|
| path/to/file.ts | 40/100 | 85/100 | 3 | ✅ PASS |
| path/to/other.ts | 90/100 | 90/100 | 0 | ✅ PASS |
| path/to/risky.ts | 30/100 | 65/100 | 5 | ⚠️ CAPPED |

### Fixes Applied: X
### Remaining Issues: Y (if any)

### Changes Made
- [file:line] Description of fix
- [file:line] Description of fix
```

## Rules

- **Never skip the scoring step.** Every file gets a score before any fix.
- **Never fix without re-scoring.** After every fix, re-evaluate.
- **Fix highest severity first.** CRITICAL before HIGH before MEDIUM.
- **Run tests after every fix.** If tests fail, revert and try a different approach.
- **Don't refactor.** Only fix functional correctness issues. Style, naming, and structure are out of scope unless they cause bugs.
- **Don't add features.** If you find missing functionality, report it — don't build it.
- **Confidence is the minimum dimension.** A file isn't "mostly good" — it's as weak as its weakest aspect.

## Confidence Thresholds

| Score  | Meaning                          | Action                                       |
| ------ | -------------------------------- | -------------------------------------------- |
| 90-100 | High confidence — code is solid  | No fixes needed                              |
| 80-89  | Acceptable — minor concerns only | Fix if easy, otherwise pass                  |
| 50-79  | Needs work — real issues exist   | Fix required before commit                   |
| 0-49   | Critical — likely broken         | Must fix, consider rewrite of affected logic |
