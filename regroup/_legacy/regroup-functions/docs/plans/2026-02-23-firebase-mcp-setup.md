> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Firebase MCP Server Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the official Firebase MCP server globally to Claude Code so Claude can assist with Cloud Functions development across all Firebase projects.

**Architecture:** Run `firebase-tools@latest mcp` via npx as a global Claude Code MCP server. Uses existing Firebase CLI authentication. No code changes — pure configuration.

**Tech Stack:** firebase-tools (npx, latest), Claude Code MCP config (`~/.claude/settings.json`)

---

### Task 1: Verify Firebase CLI authentication

**Files:**
- None (verification only)

**Step 1: Check login status**

Run:
```bash
firebase login:list
```
Expected: Shows your Google account email. If it says "No authorized accounts", proceed to Step 2. If logged in, skip to Task 2.

**Step 2: Log in if needed**

Run:
```bash
firebase login
```
Expected: Opens browser for Google OAuth. Complete sign-in. Returns "Success! Logged in as <your-email>".

---

### Task 2: Add Firebase MCP server globally

**Files:**
- Modify: `~/.claude/settings.json` (via claude mcp add command)

**Step 1: Add the MCP server**

Run:
```bash
claude mcp add firebase npx -- -y firebase-tools@latest mcp
```
Expected output:
```
Added firebase to global config
```

**Step 2: Verify it was added**

Run:
```bash
claude mcp list
```
Expected: Shows `firebase: npx -y firebase-tools@latest mcp`

**Step 3: Inspect the config**

Run:
```bash
cat ~/.claude/settings.json
```
Expected: `mcpServers.firebase` entry with `command: "npx"` and `args: ["-y", "firebase-tools@latest", "mcp"]`

---

### Task 3: Restart and verify connection

**Step 1: Restart Claude Code**

Exit the current Claude Code session and reopen it in this project directory.

**Step 2: Verify MCP server connected**

Run:
```bash
claude mcp list
```
Expected: `firebase: npx -y firebase-tools@latest mcp - ✓ Connected`

**Step 3: Smoke test — list Firebase projects**

In Claude Code, ask: *"List my Firebase projects"*

Expected: Claude uses the Firebase MCP tool and returns the list of projects (should include `phoenix-cleanhouse`).

---

### Notes

- The MCP server starts fresh on each Claude Code session via npx — no persistent process.
- `firebase-tools@latest` is fetched at startup; first run may take a few seconds while npx downloads it.
- If the MCP server shows as disconnected, check that `firebase login` is still valid (`firebase login:list`).
