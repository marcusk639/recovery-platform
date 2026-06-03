#!/usr/bin/env bash
# PostToolUse secret scanner for Edit|Write.
# Reads the hook JSON from stdin, greps the edited file for common
# hardcoded-credential patterns, and prints a non-blocking warning.
# Publishable keys (pk_live_, AIza... is flagged conservatively) are
# intentionally included; review before committing.
set -euo pipefail

INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

[ -n "$FILE" ] || exit 0
[ -f "$FILE" ] || exit 0

# Skip the scanner's own allowlist / lockfiles to avoid noise.
case "$FILE" in
  *pnpm-lock.yaml|*package-lock.json|*.env.example|*.env.template) exit 0 ;;
esac

PATTERN='sk_live_[0-9A-Za-z]{10,}|rk_live_[0-9A-Za-z]{10,}|ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{50,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

HITS="$(grep -nIEo "$PATTERN" "$FILE" 2>/dev/null | head -5 || true)"

if [ -n "$HITS" ]; then
  echo "⚠️  [secret-scan] Possible hardcoded secret in $FILE:"
  echo "$HITS"
  echo "Move it to Firebase Secret Manager or an environment variable before committing."
fi

exit 0
