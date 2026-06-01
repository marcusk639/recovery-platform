# Root-Level Claude Code Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up 9 root-level Claude Code automations (2 MCP configs, 2 hooks + Prettier setup, 2 subagents, 2 skills, plus the required directory scaffold) that address the 0/5 agent-config and 0/5 git-hook gaps from the readiness audit.

**Architecture:** All changes live in `.claude/` (root-level settings, agents, skills) and `.mcp.json` files at the repo root and in `regroup/mobile/`. No application logic changes — these are harness configuration files. The only dependency that touches `node_modules` is adding Prettier to `recovery-api/`. Order matters: directory scaffold first (Task 3), then settings.json (Task 4), then Prettier install + hook update (Task 5). Tasks 1-2 (MCP), 6-9 (agents, skills) are independent and can be done in any order relative to each other.

**Tech Stack:** Claude Code `settings.json` (JSON), Claude Code agent/skill Markdown (YAML frontmatter), `.mcp.json` (JSON), Prettier 3.x, npm, jq (JSON validation)

**Scope note:** Prettier is added only to `recovery-api/`. Adding it to `regroup/functions/` is explicitly deferred — that package uses legacy TSLint, and a Prettier migration there warrants its own plan.

---

## File Map

| File                                         | Action     | Purpose                                              |
| -------------------------------------------- | ---------- | ---------------------------------------------------- |
| `.mcp.json`                                  | Create     | Root Firebase + context7 MCP for cross-product work  |
| `regroup/mobile/.mcp.json`                   | Update     | Fix stale DETOX_PROJECT_PATH; add context7           |
| `.claude/agents/`                            | Create dir | Root-level agent home (currently missing)            |
| `.claude/skills/new-referral-flow/`          | Create dir | Skill directory scaffold                             |
| `.claude/skills/monorepo-run-check/`         | Create dir | Skill directory scaffold                             |
| `.claude/settings.json`                      | Create     | tsc + Prettier PostToolUse hooks                     |
| `recovery-api/package.json`                  | Modify     | Add `prettier` devDependency                         |
| `recovery-api/.prettierrc`                   | Create     | Prettier config for recovery-api                     |
| `.claude/agents/cross-product-integrity.md`  | Create     | Subagent: detects cross-Firestore anti-patterns      |
| `.claude/agents/monorepo-health.md`          | Create     | Subagent: ranks packages by debt                     |
| `.claude/skills/new-referral-flow/SKILL.md`  | Create     | Skill: correct referral pattern through recovery-api |
| `.claude/skills/monorepo-run-check/SKILL.md` | Create     | Skill: port pre-flight before emulator start         |

**Do not touch:** `.claude/settings.local.json` (permissions-only, must stay separate)

---

## Task 1: Create root `.mcp.json`

**Files:**

- Create: `.mcp.json`

- [ ] **Step 1: Confirm no root `.mcp.json` exists**

```bash
ls /Users/marcus/dev/recovery-platform/.mcp.json 2>/dev/null && echo "EXISTS — read it before proceeding" || echo "DOES NOT EXIST — safe to create"
```

Expected output: `DOES NOT EXIST — safe to create`

If it exists, read its contents and merge rather than overwrite.

- [ ] **Step 2: Verify firebase-tools path**

```bash
node /usr/local/lib/node_modules/firebase-tools/lib/bin/firebase.js --version 2>/dev/null || which firebase
```

Expected: prints a version like `14.x.x`. If firebase-tools is not at `/usr/local/lib/node_modules/`, note the actual path from `which firebase` and adjust the `args` in Step 3.

- [ ] **Step 3: Create `.mcp.json`**

```json
{
  "mcpServers": {
    "firebase": {
      "command": "node",
      "args": [
        "/usr/local/lib/node_modules/firebase-tools/lib/bin/firebase.js",
        "mcp",
        "--dir",
        "/Users/marcus/dev/recovery-platform/recovery-api"
      ]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

Save to: `/Users/marcus/dev/recovery-platform/.mcp.json`

- [ ] **Step 4: Validate JSON**

```bash
jq . /Users/marcus/dev/recovery-platform/.mcp.json
```

Expected: Clean JSON output — two `mcpServers` keys, no parse errors.

- [ ] **Step 5: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.mcp.json
git commit -m "chore: add root .mcp.json with Firebase and context7 MCP servers"
```

---

## Task 2: Fix and extend `regroup/mobile/.mcp.json`

**Files:**

- Modify: `regroup/mobile/.mcp.json`

The file currently exists with a stale `DETOX_PROJECT_PATH` pointing to `/Users/marcusklein/dev/rats` (old machine path). This fix is required for Detox MCP to work. context7 is also absent.

Current content (confirmed):

```json
{
  "mcpServers": {
    "detox": {
      "command": "npx",
      "args": ["detox-mcp"],
      "env": {
        "DETOX_PROJECT_PATH": "/Users/marcusklein/dev/rats"
      }
    }
  }
}
```

- [ ] **Step 1: Overwrite with corrected content**

```json
{
  "mcpServers": {
    "detox": {
      "command": "npx",
      "args": ["detox-mcp"],
      "env": {
        "DETOX_PROJECT_PATH": "/Users/marcus/dev/recovery-platform/regroup/mobile"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

Save to: `/Users/marcus/dev/recovery-platform/regroup/mobile/.mcp.json`

- [ ] **Step 2: Validate JSON**

```bash
jq . /Users/marcus/dev/recovery-platform/regroup/mobile/.mcp.json
```

Expected: Two `mcpServers` entries with corrected path, no errors.

- [ ] **Step 3: Confirm old path is gone**

```bash
grep "marcusklein" /Users/marcus/dev/recovery-platform/regroup/mobile/.mcp.json
```

Expected: No output (stale path fully replaced).

- [ ] **Step 4: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/regroup/mobile/.mcp.json
git commit -m "fix(regroup/mobile): correct stale DETOX_PROJECT_PATH and add context7 MCP"
```

---

## Task 3: Create root `.claude/` directory scaffold

**Files:**

- Create dirs: `.claude/agents/`, `.claude/skills/new-referral-flow/`, `.claude/skills/monorepo-run-check/`

The root `.claude/` currently contains only `settings.local.json`. No `agents/` or `skills/` subdirectories exist.

- [ ] **Step 1: Confirm current state**

```bash
ls /Users/marcus/dev/recovery-platform/.claude/
```

Expected: `settings.local.json` only — no subdirectories.

- [ ] **Step 2: Create directories**

```bash
mkdir -p /Users/marcus/dev/recovery-platform/.claude/agents
mkdir -p /Users/marcus/dev/recovery-platform/.claude/skills/new-referral-flow
mkdir -p /Users/marcus/dev/recovery-platform/.claude/skills/monorepo-run-check
```

- [ ] **Step 3: Verify**

```bash
ls /Users/marcus/dev/recovery-platform/.claude/
```

Expected: `agents/  settings.local.json  skills/`

No commit needed — empty directories don't track in git. They'll be committed with their first file in subsequent tasks.

---

## Task 4: Create root `.claude/settings.json` with tsc hook

**Files:**

- Create: `.claude/settings.json`

Adds the PostToolUse type-check hook for `recovery-api`. Must NOT overwrite `settings.local.json`.

- [ ] **Step 1: Confirm `settings.local.json` has no hooks**

```bash
jq 'keys' /Users/marcus/dev/recovery-platform/.claude/settings.local.json
```

Expected: `["permissions"]` — no `hooks` key. If hooks exist there, merge carefully rather than creating a conflicting `settings.json`.

- [ ] **Step 2: Confirm `typecheck` script exists in recovery-api**

```bash
jq '.scripts.typecheck' /Users/marcus/dev/recovery-platform/recovery-api/package.json
```

Expected: `"tsc --noEmit"`

- [ ] **Step 3: Run tsc baseline to confirm it passes cleanly**

```bash
cd /Users/marcus/dev/recovery-platform/recovery-api && npm run typecheck 2>&1 | tail -10
```

Expected: Exits with code 0, no error lines. Note any existing errors — the hook will surface them on every future edit to `src/`.

- [ ] **Step 4: Create `.claude/settings.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r '.tool_input.file_path // empty'); if echo \"$FILE\" | grep -q '/recovery-api/src/'; then echo \"[tsc] Type-checking recovery-api...\"; cd /Users/marcus/dev/recovery-platform/recovery-api && npm run typecheck 2>&1 | tail -30; fi",
            "timeout": 45000
          }
        ]
      }
    ]
  }
}
```

Save to: `/Users/marcus/dev/recovery-platform/.claude/settings.json`

- [ ] **Step 5: Validate JSON**

```bash
jq . /Users/marcus/dev/recovery-platform/.claude/settings.json
```

Expected: Clean output with one `PostToolUse` entry.

- [ ] **Step 6: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.claude/settings.json
git commit -m "chore: add root .claude/settings.json with tsc PostToolUse hook for recovery-api"
```

---

## Task 5: Add Prettier to recovery-api and wire auto-format hook

**Files:**

- Modify: `recovery-api/package.json` (add prettier devDep)
- Create: `recovery-api/.prettierrc`
- Modify: `.claude/settings.json` (add second PostToolUse hook)

- [ ] **Step 1: Install Prettier in recovery-api**

```bash
cd /Users/marcus/dev/recovery-platform/recovery-api && npm install --save-dev prettier@3
```

Expected: `package.json` has `"prettier": "^3.x.x"` under `devDependencies`.

- [ ] **Step 2: Verify Prettier version**

```bash
cd /Users/marcus/dev/recovery-platform/recovery-api && npx prettier --version
```

Expected: `3.x.x`

- [ ] **Step 3: Create `recovery-api/.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Save to: `/Users/marcus/dev/recovery-platform/recovery-api/.prettierrc`

- [ ] **Step 4: Run Prettier check against existing source**

```bash
cd /Users/marcus/dev/recovery-platform/recovery-api && npx prettier --check "src/**/*.ts" 2>&1 | tail -5
```

Expected: Either `All matched files use Prettier code style!` or a diff showing what would change. Both confirm Prettier is functional.

If files need reformatting, run first:

```bash
cd /Users/marcus/dev/recovery-platform/recovery-api && npx prettier --write "src/**/*.ts"
```

- [ ] **Step 5: Update `.claude/settings.json` to add the Prettier hook**

Replace the existing `settings.json` with both hooks combined:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r '.tool_input.file_path // empty'); if echo \"$FILE\" | grep -q '/recovery-api/src/'; then echo \"[tsc] Type-checking recovery-api...\"; cd /Users/marcus/dev/recovery-platform/recovery-api && npm run typecheck 2>&1 | tail -30; fi",
            "timeout": 45000
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r '.tool_input.file_path // empty'); if echo \"$FILE\" | grep -qE '\\.(ts|js|json|md)$' && echo \"$FILE\" | grep -q '/recovery-api/'; then cd /Users/marcus/dev/recovery-platform/recovery-api && npx prettier --write \"$FILE\" 2>/dev/null && echo \"[prettier] Formatted $FILE\"; fi",
            "timeout": 15000
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Validate JSON**

```bash
jq '.hooks.PostToolUse | length' /Users/marcus/dev/recovery-platform/.claude/settings.json
```

Expected: `2`

- [ ] **Step 7: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/recovery-api/package.json \
        /Users/marcus/dev/recovery-platform/recovery-api/package-lock.json \
        /Users/marcus/dev/recovery-platform/recovery-api/.prettierrc \
        /Users/marcus/dev/recovery-platform/.claude/settings.json
git commit -m "chore(recovery-api): add Prettier; wire PostToolUse auto-format hook at repo root"
```

---

## Task 6: Create `cross-product-integrity` subagent

**Files:**

- Create: `.claude/agents/cross-product-integrity.md`

- [ ] **Step 1: Confirm agents directory exists**

```bash
ls -d /Users/marcus/dev/recovery-platform/.claude/agents/
```

Expected: Directory listed. If missing, re-run Task 3 Step 2.

- [ ] **Step 2: Create the agent file**

````markdown
---
name: cross-product-integrity
description: Reviews code for anti-patterns that violate cross-product isolation. Detects direct Firestore cross-queries between products, referrals that bypass recovery-api, incorrect toApp enum values, auth tokens used across Firebase projects, and hardcoded service account credentials. Invoke after writing any code that touches Firestore, Firebase Admin, or recovery-api integration points.
tools: Read, Glob, Grep
model: haiku
---

You are a cross-product integrity reviewer for the recovery-platform monorepo.

## Context

This monorepo has 4 Firebase projects that MUST remain isolated:

- `recovery-connect-cad4b` — homegroups product
- `phoenix-cleanhouse` — regroup product
- `nextstep-recovery` — detox-recovery product
- recovery-api — Hono.js on Cloud Run; the ONLY authorized cross-product bridge

## Your Job

Detect exactly these 4 anti-patterns in the code you are reviewing:

### 1. Direct cross-Firestore query

Code in one product directly querying another product's Firestore. Cross-queries are forbidden.

**Bad example (homegroups code reaching into regroup):**

```typescript
const regroupApp = admin.initializeApp(
  { projectId: "phoenix-cleanhouse" },
  "regroup-secondary",
);
await regroupApp.firestore().collection("guests").add(memberData);
```

**Correct pattern:** Call `POST /api/referrals` on recovery-api instead.

### 2. Missing recovery-api mediation

Cross-product data flows not going through recovery-api's `/api/referrals` endpoint.

Valid `toApp` values: `treatment-center`, `phoenix-cleanhouse`, `homegroups`

Flag any code that sends user data to another product without calling recovery-api.

### 3. Auth token misuse

Using a Firebase ID token from one product to authenticate against another product's Firestore or Functions. Firebase Auth tokens are project-scoped and will fail silently cross-project.

### 4. Hardcoded service account credentials

Any `"type": "service_account"` JSON blob, private key strings, or `client_email` fields in source files (not `.env`).

## Output Format

For each finding, report:

1. **File:** `path/to/file.ts:lineStart-lineEnd`
2. **Anti-pattern:** which of the 4 patterns above
3. **Evidence:** the specific lines
4. **Fix:** the correct approach in one sentence

If no violations found, respond exactly: `No cross-product integrity violations found.`
````

Save to: `/Users/marcus/dev/recovery-platform/.claude/agents/cross-product-integrity.md`

- [ ] **Step 3: Verify frontmatter**

```bash
head -8 /Users/marcus/dev/recovery-platform/.claude/agents/cross-product-integrity.md
```

Expected: YAML frontmatter with `name`, `description`, `tools: Read, Glob, Grep`, `model: haiku`.

- [ ] **Step 4: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.claude/agents/cross-product-integrity.md
git commit -m "chore: add cross-product-integrity subagent to root .claude/agents/"
```

---

## Task 7: Create `monorepo-health` subagent

**Files:**

- Create: `.claude/agents/monorepo-health.md`

- [ ] **Step 1: Create the agent file**

```markdown
---
name: monorepo-health
description: Reports the current health of the recovery-platform monorepo. Reads readiness-report.md and CODEBASE-REVIEW.md, ranks sub-packages by technical debt, and recommends the top 3 improvements by risk/effort ratio. Use when you want a quick triage of where to focus next without re-running the full readiness audit.
tools: Read, Bash, Glob
model: haiku
---

You are a monorepo health reporter for the recovery-platform monorepo.

## Your Job

Read these two files:

1. `/Users/marcus/dev/recovery-platform/readiness-report.md`
2. `/Users/marcus/dev/recovery-platform/CODEBASE-REVIEW.md`

Then produce the following report. Be concise — under 300 words total.

## Report Format

### Staleness Check

Extract the `generated:` date from `readiness-report.md` frontmatter. Compare to today.

- If ≤ 30 days: `Report is current (generated: YYYY-MM-DD)`
- If > 30 days: `⚠️ Report is stale — re-run /harness-engineering:readiness to refresh`

### Package Health Ranking (worst → best)

Rank the 7 sub-packages from the readiness report using their pillar scores.

| Rank      | Package | Worst pillar | Notes |
| --------- | ------- | ------------ | ----- |
| 1 (worst) | ...     | ...          | ...   |
| ...       |         |              |       |
| 7 (best)  | ...     | ...          | ...   |

### Top 3 Improvements (risk/effort ratio)

Pick the 3 improvements with the best risk/effort ratio from the failing items.

Format:

1. **[Improvement]** — Risk: HIGH/MED/LOW · Effort: HIGH/MED/LOW · Target: [package]
2. ...
3. ...

No prose. No padding. Table and list only.
```

Save to: `/Users/marcus/dev/recovery-platform/.claude/agents/monorepo-health.md`

- [ ] **Step 2: Verify frontmatter**

```bash
head -8 /Users/marcus/dev/recovery-platform/.claude/agents/monorepo-health.md
```

Expected: YAML frontmatter with `name: monorepo-health` and `tools: Read, Bash, Glob`.

- [ ] **Step 3: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.claude/agents/monorepo-health.md
git commit -m "chore: add monorepo-health subagent to root .claude/agents/"
```

---

## Task 8: Create `new-referral-flow` skill

**Files:**

- Create: `.claude/skills/new-referral-flow/SKILL.md`

- [ ] **Step 1: Confirm skill directory exists**

```bash
ls -d /Users/marcus/dev/recovery-platform/.claude/skills/new-referral-flow/
```

Expected: Directory present (created in Task 3).

- [ ] **Step 2: Create `SKILL.md`**

````markdown
---
name: new-referral-flow
description: Scaffold a cross-product referral through recovery-api. Use when one product needs to refer a user to another product (homegroups → regroup, detox → homegroups, etc.). Provides the correct POST /api/referrals payload schema, authentication pattern, and the forbidden anti-patterns to avoid.
---

## Cross-Product Referral Pattern

All cross-product user flows MUST go through `POST /api/referrals` on recovery-api.
Direct Firestore cross-queries are forbidden — see CLAUDE.md §Cross-Cutting Rules.

## Valid toApp Values

| toApp                | Product                      | Firebase Project         |
| -------------------- | ---------------------------- | ------------------------ |
| `treatment-center`   | detox-recovery (NextStep)    | `nextstep-recovery`      |
| `phoenix-cleanhouse` | regroup (RATS)               | `phoenix-cleanhouse`     |
| `homegroups`         | homegroups (RecoveryConnect) | `recovery-connect-cad4b` |

## Authentication

Client-side callers pass a Firebase ID token. The token must be from the **calling
product's** Firebase project — not a service account key.

```typescript
const token = await firebase
  .auth()
  .currentUser?.getIdToken(/* forceRefresh */ false);
```

Cloud Functions / Cloud Run service callers use the `X-Service-Key` header instead
(see service-to-service section below).

## Payload Schema (Zod-validated in recovery-api)

```typescript
{
  toApp: 'treatment-center' | 'phoenix-cleanhouse' | 'homegroups',
  referredUserId: string,   // UID in the calling product's Firebase project
  referredBy: string,       // UID of the user initiating the referral
  notes?: string            // optional clinical or contextual context
}
```

## Full Example — Client-Side (homegroups → regroup)

```typescript
// homegroups/mobile/src/services/referrals.ts

const RECOVERY_API_URL = process.env.RECOVERY_API_URL;

export async function referMemberToSoberLiving(
  memberUid: string,
  currentUserUid: string,
  notes: string,
): Promise<{ id: string }> {
  const token = await firebase.auth().currentUser?.getIdToken();
  if (!token) throw new Error("User not authenticated");

  const res = await fetch(`${RECOVERY_API_URL}/api/referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      toApp: "phoenix-cleanhouse",
      referredUserId: memberUid,
      referredBy: currentUserUid,
      notes,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Referral failed: ${res.status}`);
  }

  return res.json() as Promise<{ id: string }>;
}
```

## Full Example — Service-to-Service (Cloud Function → recovery-api)

```typescript
// regroup/functions/src/services/referrals.ts

export async function createReferral(payload: {
  toApp: "treatment-center" | "phoenix-cleanhouse" | "homegroups";
  referredUserId: string;
  referredBy: string;
  notes?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${process.env.RECOVERY_API_URL}/api/referrals`, {
    method: "POST",
    headers: {
      "X-Service-Key": process.env.RECOVERY_API_SERVICE_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `Referral failed: ${res.status}`);
  }

  return res.json() as Promise<{ id: string }>;
}
```

## Never Do This

```typescript
// FORBIDDEN: bypasses recovery-api entirely
const regroupApp = admin.initializeApp(
  { projectId: "phoenix-cleanhouse" },
  "regroup-secondary",
);
await regroupApp.firestore().collection("guests").add(memberData);
// ^ Breaks data isolation between Firebase projects
```
````

Save to: `/Users/marcus/dev/recovery-platform/.claude/skills/new-referral-flow/SKILL.md`

- [ ] **Step 3: Verify frontmatter**

```bash
head -6 /Users/marcus/dev/recovery-platform/.claude/skills/new-referral-flow/SKILL.md
```

Expected: `---`, `name: new-referral-flow`, `description:`, `---`

- [ ] **Step 4: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.claude/skills/new-referral-flow/
git commit -m "chore: add new-referral-flow skill documenting correct cross-product referral pattern"
```

---

## Task 9: Create `monorepo-run-check` skill

**Files:**

- Create: `.claude/skills/monorepo-run-check/SKILL.md`

- [ ] **Step 1: Confirm skill directory exists**

```bash
ls -d /Users/marcus/dev/recovery-platform/.claude/skills/monorepo-run-check/
```

Expected: Directory present (created in Task 3).

- [ ] **Step 2: Create `SKILL.md`**

````markdown
---
name: monorepo-run-check
description: Pre-flight check before starting any Firebase emulator in the recovery-platform monorepo. Checks which emulator ports are in use, which product owns them, and warns about conflicts. Run before starting homegroups, regroup, or detox-recovery emulators — port conflicts cause silent failures.
disable-model-invocation: true
---

Run these commands before starting any product's Firebase emulators:

## Step 1: Check active emulator ports

```bash
echo "=== Firestore :8080 ===" && \
  lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"

echo "=== Functions :5001 ===" && \
  lsof -iTCP:5001 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"

echo "=== Auth :9099 ===" && \
  lsof -iTCP:9099 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print "  PID " $2 " — " $1}' || echo "  (free)"
```

## Port Ownership Reference

| Port | Service   | Products that use it                |
| ---- | --------- | ----------------------------------- |
| 8080 | Firestore | homegroups, regroup, detox-recovery |
| 5001 | Functions | homegroups, regroup                 |
| 9099 | Auth      | homegroups, regroup, detox-recovery |

⚠️ **Run only ONE product's emulators at a time.** All products share the same default ports.

## Step 2: Kill conflicting process (if needed)

```bash
kill <PID>   # replace <PID> with the process ID from Step 1 output
```

Verify it stopped:

```bash
lsof -iTCP:8080 -sTCP:LISTEN 2>/dev/null || echo "port 8080 is free"
```

## Step 3: Start the product you need

```bash
# homegroups
cd /Users/marcus/dev/recovery-platform/homegroups && firebase emulators:start

# regroup
cd /Users/marcus/dev/recovery-platform/regroup && firebase emulators:start

# detox-recovery
cd /Users/marcus/dev/recovery-platform/detox-recovery && firebase emulators:start

# recovery-api (no Firebase emulator — runs as Hono.js HTTP server)
cd /Users/marcus/dev/recovery-platform/recovery-api && npm run dev
```
````

Save to: `/Users/marcus/dev/recovery-platform/.claude/skills/monorepo-run-check/SKILL.md`

- [ ] **Step 3: Verify `disable-model-invocation` is present**

```bash
grep "disable-model-invocation" /Users/marcus/dev/recovery-platform/.claude/skills/monorepo-run-check/SKILL.md
```

Expected: `disable-model-invocation: true`

- [ ] **Step 4: Commit**

```bash
git add /Users/marcus/dev/recovery-platform/.claude/skills/monorepo-run-check/
git commit -m "chore: add monorepo-run-check skill for emulator port pre-flight checks"
```

---

## Self-Review

### Spec Coverage

| Recommendation                               | Task   | Status                    |
| -------------------------------------------- | ------ | ------------------------- |
| Root `.mcp.json` Firebase + context7         | Task 1 | ✓                         |
| Fix stale Detox MCP path in regroup/mobile   | Task 2 | ✓ (bonus: path was stale) |
| Add context7 to regroup/mobile               | Task 2 | ✓                         |
| Directory scaffold for root `.claude/`       | Task 3 | ✓                         |
| TypeScript type-check hook for recovery-api  | Task 4 | ✓                         |
| Prettier for recovery-api + auto-format hook | Task 5 | ✓                         |
| `cross-product-integrity` subagent           | Task 6 | ✓                         |
| `monorepo-health` subagent                   | Task 7 | ✓                         |
| `new-referral-flow` skill                    | Task 8 | ✓                         |
| `monorepo-run-check` skill                   | Task 9 | ✓                         |

All 8 original recommendations covered; one bonus fix (stale Detox path) added.

### Placeholder Scan

- No TBD/TODO in any task
- All code blocks are complete and runnable
- All file paths are absolute
- All commands include expected output
- `regroup/functions/` Prettier exclusion documented in plan header (deliberate scope decision)

### Type Consistency

- Hook command strings in Tasks 4 and 5 use identical `INPUT=$(cat); FILE=...` stdin parsing pattern
- `toApp` enum values (`treatment-center`, `phoenix-cleanhouse`, `homegroups`) are identical across the subagent (Task 6) and skill (Task 8)
- `/Users/marcus/dev/recovery-platform/` absolute path used consistently throughout

### Ordering Dependencies

| Constraint                        | Why                                                             |
| --------------------------------- | --------------------------------------------------------------- |
| Task 3 before Tasks 4, 6, 7, 8, 9 | Creates `.claude/agents/` and `.claude/skills/` directories     |
| Task 4 before Task 5              | Task 5 overwrites `settings.json` — Task 4 must create it first |
| Tasks 1, 2, 6, 7, 8, 9            | Independent of each other — can run in parallel                 |
