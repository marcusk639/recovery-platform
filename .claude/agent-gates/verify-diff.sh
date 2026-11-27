#!/usr/bin/env bash
# agent-gates/verify-diff.sh — the gate that cannot be raced or routed around.
#
# Usage:
#   verify-diff.sh --staged          # pre-commit: inspect the staged index
#   verify-diff.sh                   # working tree vs HEAD
#   verify-diff.sh origin/main       # PR check against a base ref
#   verify-diff.sh <base> <head>     # two commits, no working tree (the PR reviewer's facts
#                                    # step: its tree is neutralized, so only objects count)
#
# Exit 0 = clean, exit 1 = violations found (printed).
#
# Merging main into a branch (--staged only): a finding on a path that main changed,
# and that is staged exactly as it is on the merged commit, is printed as a note and
# not counted, provided that commit is already on origin/main. See "merge-from-main
# exemption" below. Every other mode, and every other path, is checked in full.
#
# WHY THIS IS NOT A CLAUDE CODE HOOK:
# Stage 1 testing (2026-09-30, Claude Code 2.1.274) proved the FIRST tool call of a
# `claude -p --settings` run executes before --settings hooks become active.
# Measured: Edit-as-first-call => no hook fired; Bash-first or Read-first => all
# matchers fired. An agent whose opening move is destructive is unguarded by hooks,
# and a FileChanged hook never fired in any configuration tried. Hooks are fast
# feedback. This script is the control: it inspects the diff from outside the
# agent's process, where nothing it does can outrun it.
set -uo pipefail

MODE="${1:-HEAD}"
HEAD_REF="${2:-}"
if [ "$MODE" = "--staged" ]; then
  DIFF=(git -c core.quotePath=false diff --cached)
  LABEL="staged index"
elif [ -n "$HEAD_REF" ]; then
  DIFF=(git -c core.quotePath=false diff "$MODE" "$HEAD_REF")
  LABEL="$MODE..$HEAD_REF"
else
  DIFF=(git -c core.quotePath=false diff "$MODE")
  LABEL="working tree vs $MODE"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$REPO_ROOT" || exit 1

VIOLATIONS=0
report() { printf '  [%s] %s\n' "$1" "$2"; VIOLATIONS=$((VIOLATIONS + 1)); }

TEST_PATH_RE='(\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|/__tests__/|/src/tests/|/maestro/)'
HOLLOW_RE='expect\([[:space:]]*(true|1)[[:space:]]*\)[[:space:]]*\.[[:space:]]*(toBe|toEqual|toBeTruthy)\('
SKIP_RE='(describe|it|test)[[:space:]]*\.[[:space:]]*(skip|only|todo)\b|\bxdescribe\b|\bxit\b'

echo "agent-gates/verify-diff: checking $LABEL"

# ---------- merge-from-main exemption (--staged only) ----------
# Merging origin/main into a branch stages main's test changes, and the index is
# diffed against the branch tip, so tests a merged PR legitimately removed look
# like this commit removing them. Those changes already passed CI's test-tamper
# gate on their own PR (or carried the test-change-approved label), so a finding
# is not counted when ALL of these hold:
#   - this is --staged, a two-parent merge is in progress, and nothing is unmerged;
#   - MERGE_HEAD is already on origin/main. Merging any other branch stays fully
#     gated: its test changes have not been through CI;
#   - every path in the finding is staged exactly as on MERGE_HEAD (same blob, or
#     absent from both), AND main changed it since the merge base. A resolution that
#     edits a test, or that drops the branch's own test changes, is still checked.
# CI's base-ref mode never takes this path: it is the control, this hook is feedback.
MERGED="" MBASE=""
if [ "$MODE" = "--staged" ] &&
  MERGED="$(git rev-parse -q --verify MERGE_HEAD 2>/dev/null)" &&
  [ "$(grep -c . "$(git rev-parse --git-path MERGE_HEAD)" 2>/dev/null)" = 1 ] &&
  [ -z "$(git ls-files -u 2>/dev/null)" ] &&
  git merge-base --is-ancestor "$MERGED" refs/remotes/origin/main 2>/dev/null &&
  MBASE="$(git merge-base HEAD "$MERGED" 2>/dev/null)" && [ -n "$MBASE" ]; then
  echo "merge of ${MERGED:0:9} (on origin/main) in progress: findings on paths staged as main has them are noted, not counted"
else
  MERGED="" MBASE=""
fi
obj() { git rev-parse -q --verify "$1" 2>/dev/null; }
from_main() { # <path>: staged as on MERGE_HEAD, and main changed it
  [ -n "$MERGED" ] || return 1
  local theirs
  theirs="$(obj "$MERGED:$1")"
  [ "$(obj ":$1")" = "$theirs" ] && [ "$(obj "$MBASE:$1")" != "$theirs" ]
}
note() {
  printf '  ⚠ [%s] %s — matches origin/main'\''s merged commit %s; not counted\n' \
    "$1" "$2" "${MERGED:0:9}" >&2
}
# flag CODE MESSAGE PATH...: report, unless every PATH came from main as-is.
flag() {
  local code="$1" msg="$2" p
  shift 2
  for p in "$@"; do
    from_main "$p" || { report "$code" "$msg"; return; }
  done
  note "$code" "$msg"
}

# ---------- 1. deleted test files ----------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  printf '%s' "$f" | grep -qE "$TEST_PATH_RE" && flag "TEST-DELETED" "$f" "$f"
done < <("${DIFF[@]}" --diff-filter=D --name-only 2>/dev/null)

# ---------- 1b. test files renamed to a path no runner picks up ----------
# With rename detection on (git's default), `git mv foo.test.ts foo.ts.bak` shows
# as R, not D, so check 1 never sees it. The destination must still be runnable:
# TEST_PATH_RE alone would accept `__tests__/foo.ts.bak`, which jest ignores.
# Renames that keep the test runnable are fine; check 3 still counts their cases.
RUNNABLE_RE='(\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|/maestro/.*\.ya?ml$)'
while IFS=$'\t' read -r _ old new; do
  [ -z "$old" ] && continue
  printf '%s' "$old" | grep -qE "$TEST_PATH_RE" || continue
  printf '%s' "$new" | grep -qE "$RUNNABLE_RE" && continue
  flag "TEST-RENAMED-AWAY" "$old -> $new" "$old" "$new"
done < <("${DIFF[@]}" -M --diff-filter=R --name-status 2>/dev/null)

# ---------- 2. skip/only/todo or hollow assertions ADDED to test files ----------
while IFS= read -r f; do
  [ -z "$f" ] && continue
  printf '%s' "$f" | grep -qE "$TEST_PATH_RE" || continue
  ADDED="$("${DIFF[@]}" -U0 -- "$f" 2>/dev/null | grep '^+' | grep -v '^+++')"
  [ -z "$ADDED" ] && continue
  printf '%s' "$ADDED" | grep -qE "$SKIP_RE" &&
    flag "TEST-DISABLED" "$f introduces a skip/only/todo marker" "$f"
  printf '%s' "$ADDED" | grep -qE "$HOLLOW_RE" &&
    flag "HOLLOW-ASSERT" "$f introduces an assert-true assertion" "$f"
done < <("${DIFF[@]}" --diff-filter=ACMR --name-only 2>/dev/null)

# ---------- 3. net loss of test cases ----------
# Includes renames: diffing old and new paths together keeps the rename pair, so
# `git mv a.test.ts b.test.ts` plus deleted cases is counted, not waved through.
while IFS=$'\t' read -r status a b; do
  [ -z "$a" ] && continue
  if [ "${status#R}" != "$status" ]; then f="$b"; PATHS=("$a" "$b"); else f="$a"; PATHS=("$a"); fi
  printf '%s' "$f" | grep -qE "$TEST_PATH_RE" || continue
  D="$("${DIFF[@]}" -M -U0 -- "${PATHS[@]}" 2>/dev/null)"
  ADD=$(printf '%s' "$D" | grep '^+' | grep -v '^+++' | grep -cE '^\+[[:space:]]*(it|test)[[:space:]]*\(')
  DEL=$(printf '%s' "$D" | grep '^-' | grep -v '^---' | grep -cE '^-[[:space:]]*(it|test)[[:space:]]*\(')
  if [ "$DEL" -gt "$ADD" ]; then
    flag "TEST-COUNT-DROP" "$f removes $((DEL - ADD)) more test case(s) than it adds" "${PATHS[@]}"
  fi
done < <("${DIFF[@]}" -M --diff-filter=MR --name-status 2>/dev/null)

# ---------- 4. snapshot churn ----------
SNAP=0
while IFS= read -r f; do
  printf '%s' "$f" | grep -q '\.snap$' || continue
  if from_main "$f"; then note "SNAPSHOT-CHURN" "$f"; else SNAP=$((SNAP + 1)); fi
done < <("${DIFF[@]}" --name-only 2>/dev/null)
[ "$SNAP" -gt 0 ] && report "SNAPSHOT-CHURN" "$SNAP snapshot file(s) changed — confirm reviewed, not blessed"

# ---------- 5. NEW untracked test files (git diff cannot see these) ----------
# Closes the hole found in Stage 1: an agent-written test file that is never
# staged is invisible to every git diff, so it must be scanned directly.
# Two commits compare objects only: the working tree is not the change under review.
if [ "$MODE" != "--staged" ] && [ -z "$HEAD_REF" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    printf '%s' "$f" | grep -qE "$TEST_PATH_RE" || continue
    [ -f "$f" ] || continue
    grep -qE "$SKIP_RE" "$f" 2>/dev/null &&
      report "TEST-DISABLED" "untracked $f contains a skip/only/todo marker"
    grep -qE "$HOLLOW_RE" "$f" 2>/dev/null &&
      report "HOLLOW-ASSERT" "untracked $f contains an assert-true assertion"
  done < <(git ls-files --others --exclude-standard 2>/dev/null)
fi

echo
if [ "$VIOLATIONS" -eq 0 ]; then
  echo "agent-gates/verify-diff: PASS"
  exit 0
fi
echo "agent-gates/verify-diff: FAIL — $VIOLATIONS violation(s)"
echo "If a test genuinely must change, a human makes that change and says why in the commit message."
exit 1
