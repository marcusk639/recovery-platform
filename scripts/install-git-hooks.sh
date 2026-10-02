#!/bin/bash
# Install the repo's versioned git hooks into .git/hooks/.
# Run once per clone (and after any hook script change): ./scripts/install-git-hooks.sh
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
for hook in pre-commit commit-msg pre-push; do
  cp "$REPO_ROOT/scripts/git-hooks/$hook" "$REPO_ROOT/.git/hooks/$hook"
  chmod +x "$REPO_ROOT/.git/hooks/$hook"
  echo "installed $hook"
done
