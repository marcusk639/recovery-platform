#!/bin/bash
# Fast repo-state validation, run by the Claude Code SessionStart hook.
# Advisory only — always exits 0. Keep this under ~1 second.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WARN=0

# Git hooks installed and current? Resolve the hooks dir through git: in a linked
# worktree `.git` is a file, and all worktrees share the main checkout's hooks.
#
# Compare against origin/main, not this checkout: the hooks are shared, so a
# worktree on an older branch would otherwise call current hooks "stale", and
# reinstalling from it would downgrade every checkout. Falls back to the working
# tree when origin/main lacks the file (fresh clone without a fetch).
HOOKS_DIR=$(cd "$REPO_ROOT" && cd "$(git rev-parse --git-path hooks)" && pwd)
for hook in pre-commit commit-msg pre-push; do
  EXPECTED=$(git -C "$REPO_ROOT" show "origin/main:scripts/git-hooks/$hook" 2>/dev/null) ||
    EXPECTED=$(cat "$REPO_ROOT/scripts/git-hooks/$hook")
  if [ ! -f "$HOOKS_DIR/$hook" ]; then
    echo "[session-check] ⚠ git $hook hook not installed — run ./scripts/install-git-hooks.sh"
    WARN=1
  elif [ "$EXPECTED" != "$(cat "$HOOKS_DIR/$hook")" ]; then
    echo "[session-check] ⚠ installed git $hook hook differs from origin/main — run ./scripts/install-git-hooks.sh from a checkout of current main"
    WARN=1
  fi
done

# Rule frontmatter valid? Claude Code reads only `paths:` from a rule and ignores
# every other key. A rule whose frontmatter has keys but no `paths:` (e.g. the
# `globs:` some generators emit) was meant to be scoped but loads every session.
BAD_RULES=$(find "$REPO_ROOT/.claude/rules" "$REPO_ROOT"/*/.claude/rules "$REPO_ROOT"/*/*/.claude/rules \
    -name '*.md' 2>/dev/null \
  | while IFS= read -r rule; do
      awk '{ sub(/\r$/, "") }
           NR==1 { if ($0 != "---") exit; fm=1; next }
           fm && $0 == "---" { exit }
           fm && /^paths:/ { paths=1 }
           fm && /^[A-Za-z_-]+:/ { keys=1 }
           END { exit !(keys && !paths) }' "$rule" && echo "${rule#"$REPO_ROOT"/}"
    done)
if [ -n "$BAD_RULES" ]; then
  echo "[session-check] ⚠ rule frontmatter lacks paths: (other keys are ignored, so it loads every session):" $BAD_RULES
  WARN=1
fi

# Dependencies installed?
MISSING=""
for pkg in recovery-api detox-recovery homegroups/functions homegroups/mobile regroup/functions regroup/mobile regroup/web; do
  [ -d "$REPO_ROOT/$pkg/node_modules" ] || MISSING="$MISSING $pkg"
done
if [ -n "$MISSING" ]; then
  echo "[session-check] ⚠ node_modules missing in:$MISSING — run npm ci there before tests/hooks will work"
  WARN=1
fi

[ "$WARN" -eq 0 ] && echo "[session-check] repo state OK (hooks installed, deps present)"
exit 0
