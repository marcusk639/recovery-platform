#!/bin/bash
# Install the repo's versioned git hooks into the repo's hooks directory.
# Run once per clone (and after any hook script change): ./scripts/install-git-hooks.sh
# Works from the main checkout or any linked worktree. Without core.hooksPath all
# worktrees share one hooks directory, so installing from a branch's worktree
# affects every checkout; install from current main unless testing a hook change.
# Not supported: core.hooksPath pointing at scripts/git-hooks itself (cp fails).
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR=$(cd "$REPO_ROOT" && cd "$(git rev-parse --git-path hooks)" && pwd)
for hook in pre-commit commit-msg pre-push; do
  cp "$REPO_ROOT/scripts/git-hooks/$hook" "$HOOKS_DIR/$hook"
  chmod +x "$HOOKS_DIR/$hook"
  echo "installed $hook -> $HOOKS_DIR/$hook"
done
