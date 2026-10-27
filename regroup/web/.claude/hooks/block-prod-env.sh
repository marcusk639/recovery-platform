#!/bin/bash
# PreToolUse hook: blocks Claude from editing environment.prod.ts
# Claude Code passes the tool call as JSON on stdin; no env var carries it.
FILE=$(python3 -c "
import sys, json
print(json.load(sys.stdin).get('tool_input', {}).get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *"environment.prod.ts"* ]]; then
  echo "BLOCKED: environment.prod.ts contains production Firebase credentials." >&2
  echo "Edit it manually in your editor. Claude should not touch this file." >&2
  exit 2
fi
