# MCP Server Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Firebase, Stripe, GitHub, and Sentry MCP servers to `~/.claude/.mcp.json` so Claude has direct query access to all primary external services used by the RATS codebase.

**Architecture:** Four servers added globally so they're available across all projects. Firebase and Stripe are highest priority (Sprint 5 work). GitHub and Sentry support Sprint 9 CI and monitoring work. No project-level files are modified.

**Tech Stack:** firebase-tools (Firebase MCP), @stripe/mcp (Stripe), @modelcontextprotocol/server-github (GitHub), mcp.sentry.io hosted SSE (Sentry)

---

### Task 1: Add Firebase MCP server

**Files:**

- Modify: `~/.claude/.mcp.json`

**Step 1: Add the firebase server block**

Open `~/.claude/.mcp.json` and add `"firebase"` inside `"mcpServers"`:

```json
"firebase": {
  "command": "npx",
  "args": ["-y", "firebase-tools@latest", "experimental:mcp"],
  "env": {
    "FIREBASE_TOKEN": "${FIREBASE_TOKEN}"
  }
}
```

The full file after this change:

```json
{
  "mcpServers": {
    "neon": {
      "type": "http",
      "url": "https://mcp.neon.tech/mcp"
    },
    "atlassian": {
      "type": "sse",
      "url": "https://mcp.atlassian.com/v1/sse"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "docker": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--mount",
        "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock",
        "mcp/docker"
      ]
    },
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "claude-code",
        "--project-from-cwd"
      ]
    },
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "experimental:mcp"],
      "env": {
        "FIREBASE_TOKEN": "${FIREBASE_TOKEN}"
      }
    }
  }
}
```

**Step 2: Ensure FIREBASE_TOKEN is set in your shell**

```bash
# If you don't have a CI token yet:
npx firebase-tools login:ci
# Copy the printed token, then add to ~/.zshrc:
export FIREBASE_TOKEN="your-token-here"
source ~/.zshrc
```

---

### Task 2: Add Stripe MCP server

**Files:**

- Modify: `~/.claude/.mcp.json`

**Step 1: Add the stripe server block**

Add `"stripe"` inside `"mcpServers"` (after `"firebase"`):

```json
"stripe": {
  "command": "npx",
  "args": ["-y", "@stripe/mcp", "--tools=all"],
  "env": {
    "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"
  }
}
```

**Step 2: Ensure STRIPE_SECRET_KEY is set**

Use the **test** key for development (starts with `sk_test_`). Find it at:
Stripe Dashboard → Developers → API keys

```bash
# Add to ~/.zshrc:
export STRIPE_SECRET_KEY="sk_test_your_key_here"
source ~/.zshrc
```

> **Note:** Never use the live key (`sk_live_`) in dev. The test key gives full read/write access to test mode data.

---

### Task 3: Add GitHub MCP server

**Files:**

- Modify: `~/.claude/.mcp.json`

**Step 1: Add the github server block**

Add `"github"` inside `"mcpServers"`:

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
  }
}
```

**Step 2: Create a GitHub PAT**

Go to: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)

Required scopes:

- `repo` (full repo access)
- `workflow` (manage GitHub Actions)
- `read:org` (if repos are under an org)

```bash
# Add to ~/.zshrc:
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"
source ~/.zshrc
```

---

### Task 4: Add Sentry MCP server

**Files:**

- Modify: `~/.claude/.mcp.json`

**Step 1: Add the sentry server block**

Sentry uses a hosted SSE server — no local process needed:

```json
"sentry": {
  "type": "sse",
  "url": "https://mcp.sentry.io/mcp"
}
```

**Step 2: Authenticate**

Sentry's MCP uses OAuth — Claude Code will open a browser to authenticate on first use. No token needed in config.

If you prefer token-based auth instead:

1. Go to Sentry → Settings → Auth Tokens → Create New Token
2. Scopes needed: `project:read`, `event:read`, `org:read`
3. Update the config to use headers:

```json
"sentry": {
  "type": "sse",
  "url": "https://mcp.sentry.io/mcp",
  "headers": {
    "Authorization": "Bearer ${SENTRY_AUTH_TOKEN}"
  }
}
```

```bash
# If using token auth, add to ~/.zshrc:
export SENTRY_AUTH_TOKEN="your-token-here"
source ~/.zshrc
```

---

### Task 5: Verify all servers connect

**Step 1: Restart Claude Code**

All MCP config changes require a restart to take effect.

**Step 2: Check server status**

In Claude Code, run:

```
/mcp
```

Expected output: All four new servers listed alongside the existing ones (neon, atlassian, context7, docker, serena). Each should show a status indicator.

**Step 3: Smoke test each server**

Try a quick query per server to confirm tools are available:

- **Firebase:** Ask Claude "list my Firebase projects" — should call a firebase MCP tool
- **Stripe:** Ask Claude "list recent Stripe payment intents in test mode" — should return data
- **GitHub:** Ask Claude "list open PRs in the rats-v2 repo" — should return PR list
- **Sentry:** Ask Claude "show recent errors in my Sentry project" — triggers OAuth or uses token

**Step 4: Troubleshoot if a server fails**

Common issues:

- Missing env var → server process exits immediately → check `~/.zshrc` exports and re-source
- npx download fails → run the npx command manually in terminal to see the error
- Sentry OAuth fails → try token-based auth instead (see Task 4 Step 2)

---

### Final state of `~/.claude/.mcp.json`

```json
{
  "mcpServers": {
    "neon": {
      "type": "http",
      "url": "https://mcp.neon.tech/mcp"
    },
    "atlassian": {
      "type": "sse",
      "url": "https://mcp.atlassian.com/v1/sse"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "docker": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "--mount",
        "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock",
        "mcp/docker"
      ]
    },
    "serena": {
      "command": "uvx",
      "args": [
        "--from",
        "git+https://github.com/oraios/serena",
        "serena",
        "start-mcp-server",
        "--context",
        "claude-code",
        "--project-from-cwd"
      ]
    },
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "experimental:mcp"],
      "env": {
        "FIREBASE_TOKEN": "${FIREBASE_TOKEN}"
      }
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp", "--tools=all"],
      "env": {
        "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "sentry": {
      "type": "sse",
      "url": "https://mcp.sentry.io/mcp"
    }
  }
}
```
