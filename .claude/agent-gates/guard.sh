#!/usr/bin/env bash
# agent-gates/guard.sh — Stage 1 tamper gate for unattended implementer runs.
#
# Reads a Claude Code hook payload on stdin.
#   exit 0 = allow
#   exit 2 = BLOCK (reason on stderr)
#
# On PreToolUse, exit 2 blocks the tool call outright. On FileChanged the file is
# already written, so exit 2 is a DETECTOR: it surfaces the violation to the
# model and the run log rather than preventing it. Both layers are deliberate —
# a hook matching only edit tools can be sidestepped by a shell heredoc.
#
# Wired through a dedicated settings file passed to `claude -p --settings`, so
# these rules bind agent runs only, never the human's interactive sessions.
#
# Design note: this is a mechanical control, not an instruction. Prose
# instructions demonstrably do not hold (AI Incident Database 1152: an agent
# destroyed a production database "despite receiving repeated instructions not
# to make changes").
set -uo pipefail

PAYLOAD="$(cat)"
jqr() { printf '%s' "$PAYLOAD" | jq -r "$1" 2>/dev/null; }

TOOL="$(jqr '.tool_name // empty')"
EVENT="$(jqr '.hook_event_name // empty')"

block() { printf 'BLOCKED by agent-gates: %s\n' "$1" >&2; exit 2; }

# Paths that constitute the test oracle.
TEST_PATH_RE='(\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|/__tests__/|/src/tests/|/\.maestro/|/maestro/|/e2e/)'
# Looser form, safe to embed inside a larger command regex (no anchors).
TEST_FRAG_RE='((test|spec)\.(ts|tsx|js|jsx)|__tests__|/maestro/|\.maestro)'
# Content patterns that hollow out a suite.
HOLLOW_RE='expect\([[:space:]]*(true|1)[[:space:]]*\)[[:space:]]*\.[[:space:]]*(toBe|toEqual|toBeTruthy)\('
SKIP_RE='(describe|it|test)[[:space:]]*\.[[:space:]]*(skip|only|todo)\b|\bxdescribe\b|\bxit\b'

FILE="$(jqr '.tool_input.file_path // .tool_input.path // .file_path // .path // empty')"

# ---------- 1. the implementer may not touch test files ----------
if [ -n "$FILE" ] && printf '%s' "$FILE" | grep -qE "$TEST_PATH_RE"; then
  case "$TOOL" in
    Edit | Write | MultiEdit | NotebookEdit)
      block "implementer may not modify test files ($FILE). The committed failing tests are the oracle. If a test is wrong, call escalate instead of changing it."
      ;;
  esac
fi

# ---------- 2. hollow assertions and disabled tests, caught at write time ----------
CONTENT="$(jqr '[.tool_input.content, .tool_input.new_string, (.tool_input.edits[]?.new_string)] | map(select(. != null)) | join("\n")')"
if [ -n "$CONTENT" ]; then
  printf '%s' "$CONTENT" | grep -qE "$HOLLOW_RE" &&
    block "assert-true hollow assertion detected. A test that cannot fail is not a test."
  printf '%s' "$CONTENT" | grep -qE "$SKIP_RE" &&
    block "test skip/only/todo marker detected. Do not disable or narrow the suite; call escalate if a test blocks you."
fi

# ---------- 2b. FileChanged: same checks against what actually landed on disk ----------
# Catches writes that bypassed the edit tools (heredoc, sed, script output).
if [ "$EVENT" = "FileChanged" ] && [ -n "$FILE" ] && [ -f "$FILE" ]; then
  if printf '%s' "$FILE" | grep -qE "$TEST_PATH_RE"; then
    grep -qE "$HOLLOW_RE" "$FILE" 2>/dev/null &&
      block "DETECTED after write: assert-true hollow assertion now present in $FILE. Revert it."
    grep -qE "$SKIP_RE" "$FILE" 2>/dev/null &&
      block "DETECTED after write: skip/only/todo marker now present in $FILE. Revert it."
  fi
fi

# ---------- 3. dangerous commands ----------
CMD="$(jqr '.tool_input.command // empty')"
if [ -n "$CMD" ]; then
  printf '%s' "$CMD" | grep -qE 'jest\b[^;&|]*(-u([[:space:]]|$)|--updateSnapshot|--ci=false)' &&
    block "snapshot re-blessing (jest -u / --updateSnapshot) is not allowed in an agent run."
  printf '%s' "$CMD" | grep -qE 'firebase[[:space:]]+deploy' &&
    block "firebase deploy is human-gated."
  printf '%s' "$CMD" | grep -qE 'eas[[:space:]]+submit|--auto-submit' &&
    block "eas submit is human-gated."
  printf '%s' "$CMD" | grep -qE 'git[[:space:]]+push[^;&|]*(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))' &&
    block "force-push is human-gated."
  printf '%s' "$CMD" | grep -qE '(\brm\b|git[[:space:]]+rm|git[[:space:]]+checkout|git[[:space:]]+restore)[^;&|]*'"$TEST_FRAG_RE" &&
    block "deleting or reverting test files is not allowed."
  printf '%s' "$CMD" | grep -qE 'stryker[^;&|]*--(mutate|ignore)' &&
    block "narrowing the mutation scope from inside a run is not allowed; the glob lives in stryker.config.json."
  # Shell write vectors into protected paths. Closes the heredoc bypass found in
  # Stage 1 testing: an agent told not to use Edit/Write overwrote a test file with
  # `cat > file <<EOF` and succeeded, because this section only covered rm/git.
  if printf '%s' "$CMD" | grep -qE "$TEST_FRAG_RE"; then
    printf '%s' "$CMD" | grep -qE '(>>?[[:space:]]*[^|&;]*'"$TEST_FRAG_RE"'|\btee\b|\bsed\b[^|&;]*-i|\bperl\b[^|&;]*-i|\btruncate\b|\bdd\b|\bcp\b|\bmv\b)' &&
      block "shell write into a test file detected. Test files are the oracle and are off limits to the implementer, by any tool. Call escalate instead."
  fi

fi

exit 0
