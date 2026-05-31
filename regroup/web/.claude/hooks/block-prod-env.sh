#!/bin/bash
# PreToolUse hook: blocks Claude from editing environment.prod.ts
FILE=$(python3 -c "
import sys, json, os
d = json.loads(os.environ.get('CLAUDE_TOOL_INPUT', '{}'))
print(d.get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *"environment.prod.ts"* ]]; then
  echo "BLOCKED: environment.prod.ts contains production Firebase credentials."
  echo "Edit it manually in your editor. Claude should not touch this file."
  exit 2
fi
