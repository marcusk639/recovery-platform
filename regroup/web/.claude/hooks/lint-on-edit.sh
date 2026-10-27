#!/bin/bash
# PostToolUse hook: runs TSLint on any TypeScript file Claude edits
# Claude Code passes the tool call as JSON on stdin; no env var carries it.
FILE=$(python3 -c "
import sys, json
print(json.load(sys.stdin).get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *.ts ]] && [[ -f "$FILE" ]]; then
  cd "${CLAUDE_PROJECT_DIR:-.}"
  OUT=$(npx tslint --project tsconfig.json "$FILE" 2>&1 | head -40)
  # Plain stdout from a PostToolUse hook is not shown to Claude; only
  # hookSpecificOutput.additionalContext is.
  if [[ -n "$OUT" ]]; then
    printf '%s' "--- TSLint: $FILE ---"$'\n'"$OUT" | python3 -c "
import sys, json
print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': sys.stdin.read()}}))
"
  fi
fi

# Always exit 0 — linting is informational, not blocking
exit 0
