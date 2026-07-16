#!/bin/bash
# Fast repo-state validation, run by the Claude Code SessionStart hook.
# Advisory only — always exits 0. Keep this under ~1 second.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WARN=0

# Git hooks installed and current?
for hook in pre-commit pre-push; do
  if [ ! -f "$REPO_ROOT/.git/hooks/$hook" ]; then
    echo "[session-check] ⚠ git $hook hook not installed — run ./scripts/install-git-hooks.sh"
    WARN=1
  elif ! cmp -s "$REPO_ROOT/scripts/git-hooks/$hook" "$REPO_ROOT/.git/hooks/$hook"; then
    echo "[session-check] ⚠ git $hook hook is stale — re-run ./scripts/install-git-hooks.sh"
    WARN=1
  fi
done

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
