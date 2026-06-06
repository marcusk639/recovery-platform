#!/usr/bin/env bash
# Stop hook — multi-agent-swarm coordination signal.
# When the session ends, reads this worktree's swarm state file and, if the
# agent is enabled, signals the coordinator tmux session that the task is done.
# Quick-exits silently when the repo is not running as a swarm agent.
set -euo pipefail

STATE_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/multi-agent-swarm.local.md"

# Not a swarm agent — nothing to coordinate.
[ -f "$STATE_FILE" ] || exit 0

# Extract YAML frontmatter (content between the first two --- markers).
FRONTMATTER="$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")"

field() {
  printf '%s\n' "$FRONTMATTER" \
    | grep "^$1:" \
    | sed "s/^$1: *//" \
    | sed 's/^"\(.*\)"$/\1/'
}

ENABLED="$(field enabled)"
AGENT="$(field agent_name)"
COORDINATOR="$(field coordinator_session)"
TASK="$(field task_number)"
PR="$(field pr_number)"

# Disabled agent stays silent — toggle without deleting the file.
[ "$ENABLED" = "true" ] || exit 0

# Identity is required to address the coordinator.
[ -n "$AGENT" ] && [ -n "$COORDINATOR" ] || {
  echo "⚠️  [swarm] state file present but agent_name/coordinator_session missing — not signaling."
  exit 0
}

MSG="[swarm] Agent ${AGENT} finished"
[ -n "$TASK" ] && MSG="$MSG (task ${TASK})"
[ -n "$PR" ] && MSG="$MSG — PR #${PR}"

# Transport: type the message into the coordinator's tmux session.
# No-op (with a notice) when tmux or the target session is unavailable.
if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$COORDINATOR" 2>/dev/null; then
  tmux send-keys -t "$COORDINATOR" "$MSG" Enter
  echo "✅ [swarm] signaled coordinator '$COORDINATOR': $MSG"
else
  echo "ℹ️  [swarm] coordinator session '$COORDINATOR' not reachable — would have sent: $MSG"
fi

exit 0
