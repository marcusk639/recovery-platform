#!/bin/bash
# PostToolUse hook: runs TSLint on any TypeScript file Claude edits
# Claude Code passes the tool call as JSON on stdin; no env var carries it.
FILE=$(python3 -c "
import sys, json
print(json.load(sys.stdin).get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *.ts ]] && [[ -f "$FILE" ]]; then
  cd "${CLAUDE_PROJECT_DIR:-.}"
  echo "--- TSLint: $FILE ---"
  npx tslint --project tsconfig.json "$FILE" 2>&1 | head -40
fi

# Always exit 0 — linting is informational, not blocking
exit 0
