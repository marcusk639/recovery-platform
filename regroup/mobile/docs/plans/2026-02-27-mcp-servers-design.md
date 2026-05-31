# MCP Server Suite — Design

**Date:** 2026-02-27
**Status:** Approved
**Target:** `~/.claude/.mcp.json` (global, all projects)

## Context

The RATS codebase uses Firebase, Stripe, GitHub, and Sentry as its primary external services. Adding MCP servers for each gives Claude direct query access without leaving the editor — directly relevant to Sprint 5 (Firestore security rules, Stripe config) through Sprint 9 (CI setup, Sentry monitoring).

## Servers

### Firebase (`firebase-tools experimental:mcp`)

- **Transport:** stdio
- **Capabilities:** Query Firestore collections, test security rules, inspect Auth users, manage Cloud Functions
- **Sprint relevance:** Sprint 5 — Firestore rules for payments + Oxford subcollections
- **Env:** `FIREBASE_TOKEN` (from `firebase login:ci`)

### Stripe (`@stripe/mcp`)

- **Transport:** stdio
- **Capabilities:** Inspect payment intents, list customers, view webhook events, check disputes
- **Sprint relevance:** Sprint 5-7 — Stripe config, payment intent naming, webhook verification
- **Env:** `STRIPE_SECRET_KEY` (use test key for development)

### GitHub (`@modelcontextprotocol/server-github`)

- **Transport:** stdio
- **Capabilities:** Manage PRs, view CI run status, create/close issues, review code
- **Sprint relevance:** Sprint 9 — add CI for regroup-functions, PR reviews
- **Env:** `GITHUB_PERSONAL_ACCESS_TOKEN` (repo + workflow scopes)

### Sentry (hosted SSE)

- **Transport:** SSE
- **URL:** `https://sentry.io/api/0/mcp/`
- **Capabilities:** Query production errors, view issues, check release health
- **Sprint relevance:** Sprint 9 — verify Sentry captures errors in production builds
- **Env:** `SENTRY_AUTH_TOKEN` (Sentry settings → Auth Tokens)

## Context7 Deduplication

`context7` already lives only in global `~/.claude/.mcp.json`. No change needed. Convention: if a project-level `.mcp.json` adds it, remove the global copy at that time.

## What Changes

| File                          | Change                                           |
| ----------------------------- | ------------------------------------------------ |
| `~/.claude/.mcp.json`         | Add 4 servers (firebase, stripe, github, sentry) |
| `rats-v2/.mcp.json`           | No change                                        |
| `regroup-functions/.mcp.json` | Not created (functions repo uses global)         |

## Required Env Vars

```
FIREBASE_TOKEN                  # firebase login:ci
STRIPE_SECRET_KEY               # Stripe dashboard → API keys (test key for dev)
GITHUB_PERSONAL_ACCESS_TOKEN    # GitHub → Developer settings → PAT (repo + workflow)
SENTRY_AUTH_TOKEN               # Sentry → Settings → Auth Tokens
```

These are set in the shell environment (`~/.zshrc` or similar), not committed to any repo.
