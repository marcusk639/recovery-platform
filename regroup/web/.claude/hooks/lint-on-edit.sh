#!/bin/bash
# PostToolUse hook: runs TSLint on any TypeScript file Claude edits
FILE=$(python3 -c "
import sys, json, os
d = json.loads(os.environ.get('CLAUDE_TOOL_INPUT', '{}'))
print(d.get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *.ts ]] && [[ -f "$FILE" ]]; then
  cd "${CLAUDE_PROJECT_DIR:-.}"
  echo "--- TSLint: $FILE ---"
  npx tslint --project tsconfig.json "$FILE" 2>&1 | head -40
fi

# Always exit 0 — linting is informational, not blocking
exit 0
