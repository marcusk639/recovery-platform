> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Firebase MCP Server Setup — Design

**Date:** 2026-02-23
**Status:** Approved

## Goal

Add the official Firebase MCP server globally to Claude Code so Claude can assist with Cloud Functions development across all Firebase projects.

## Approach

**Option A — Global, full access**

Use `firebase-tools@latest` built-in MCP server mode, configured globally via `claude mcp add`. No scoping restrictions — full Firebase suite access.

## Configuration

One command:
```bash
claude mcp add firebase npx -- -y firebase-tools@latest mcp
```

Produces in `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

## Authentication

Uses existing Firebase CLI login (`firebase login`). Must be authenticated before first use.

## Capabilities

- Deploy Cloud Functions
- Read function logs
- Manage env config and secrets
- Start/stop Firebase emulators
- Firestore queries, Auth management, Remote Config, Crashlytics (bonus)

## Scope

Global — applies to `regroup-functions`, `rats-v2`, `rats-web`, and any future Firebase project.

## Post-Setup

Restart Claude Code after adding the MCP server for the connection to initialize.
