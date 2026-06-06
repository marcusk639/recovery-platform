> ⚠️ **Legacy document.** Carried over from the standalone `regroup-web` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `web` documentation.

# Claude Code Automations — Regroup Web

This document describes every Claude Code automation configured for this project: what each one does, why it exists, and how to use or extend it.

---

## Overview

| Type       | Name                        | Trigger                                                         |
| ---------- | --------------------------- | --------------------------------------------------------------- |
| MCP Server | context7                    | Automatic (on `use context7` in prompts)                        |
| Skill      | `firebase-deploy`           | User types `/firebase-deploy`                                   |
| Skill      | `new-firestore-service`     | User types `/new-firestore-service EntityName collectionName`   |
| Hook       | Block `environment.prod.ts` | Automatic (PreToolUse on Edit/Write)                            |
| Hook       | TSLint on edit              | Automatic (PostToolUse on Edit/Write)                           |
| Subagent   | `security-reviewer`         | Claude invokes it, or user asks Claude to run a security review |

All config lives under `.claude/` and is checked into git so every developer gets the same automations automatically.

---

## MCP Server: context7

**File**: `.mcp.json`

### What it does

context7 is an MCP (Model Context Protocol) server that fetches live, version-accurate documentation for libraries directly into Claude's context. Instead of Claude answering Angular, Firebase, or RxJS questions from training data (which may reflect a different version), it retrieves the current official docs on demand.

### Why this project needs it

This codebase uses several libraries with version-sensitive APIs:

- **Angular 9** — uses a different module/bootstrap API than Angular 14+; Claude's training data often defaults to newer patterns
- **AngularFire 6** — the v7 API (modular) is completely different from v6; without docs, Claude frequently suggests v7 imports
- **Angular Universal 9** — SSR setup changed significantly in later versions
- **ngx-stripe 9** — the Stripe Elements API changed between major versions

### How to use it

In any Claude conversation, include `use context7` in your prompt or ask about a library by name:

```
How do I set up AngularFireAuth in Angular 9? use context7
```

```
What's the correct way to call AngularFireFunctions.httpsCallable in AngularFire 6? use context7
```

Claude will resolve the library, fetch the relevant docs section, and answer based on the actual current documentation rather than training data.

### Configuration

```json
// .mcp.json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

The server runs via `npx` on demand — no separate install step needed. Because it's in `.mcp.json` (checked into git), every developer who opens this project in Claude Code gets context7 automatically.

---

## Skill: `firebase-deploy`

**File**: `.claude/skills/firebase-deploy/SKILL.md`
**Invocation**: user-only (Claude cannot invoke this on its own)

### What it does

Orchestrates the full multi-step Firebase deploy pipeline as a single command. The deploy sequence for this project is:

```
ng build  →  copy:hosting  →  build:ssr  →  build:functions  →  firebase deploy
```

Each step depends on the previous one. A partial run (e.g., deploying hosting before SSR is built) leaves the live site serving a stale server bundle. This skill ensures the full pipeline runs in the correct order and provides partial-deploy flags for targeted updates.

### Why this project needs it

The `npm run build` script chains four sub-commands. The functions build also physically copies `../dist` into `functions/dist/` before compiling TypeScript — if Angular's build hasn't completed first, the functions bundle will be stale. Developers frequently run just `firebase deploy` without rebuilding, which causes SSR to serve old HTML on production.

### How to use it

**Full deploy** (rebuilds everything, then deploys hosting + functions):

```
/firebase-deploy
```

Claude will ask for confirmation (production project: `phoenix-cleanhouse`), run the full build pipeline, and report the deploy URL.

**Functions only** (when you've only changed Cloud Functions):

```
/firebase-deploy --functions-only
```

Runs `npm run build:functions` then `firebase deploy --only functions`.

**Hosting only** (when you've only changed frontend code):

```
/firebase-deploy --hosting-only
```

Runs `npm run build:ssr` and `copy:hosting`, then `firebase deploy --only hosting`.

### When to use each flag

| Changed                            | Use                     |
| ---------------------------------- | ----------------------- |
| Angular components, styles, routes | `--hosting-only`        |
| Cloud Functions (`functions/src/`) | `--functions-only`      |
| Both, or SSR server (`server.ts`)  | (no flag — full deploy) |

---

## Skill: `new-firestore-service`

**File**: `.claude/skills/new-firestore-service/SKILL.md`
**Invocation**: user-only

### What it does

Generates a new Angular service that extends `BaseFirestoreService<T>`, along with a matching entity class and spec file, following the exact pattern used throughout this codebase.

### Why this project needs it

Every data service in this project follows an identical pattern:

```typescript
@Injectable({ providedIn: "root" })
export class FooService extends BaseFirestoreService<Foo> {
  constructor(protected firestore: AngularFirestore) {
    super(firestore, "foos");
  }
}
```

Without a skill, each new service requires:

1. Copying an existing service
2. Renaming types and constructor args
3. Creating the entity file extending `BaseEntity`
4. Creating a matching spec file

This skill generates all three files correctly in one step, enforcing the `BaseFirestoreService` pattern and `BaseEntity` extension.

### How to use it

```
/new-firestore-service WeeklyReport weekly-reports
```

```
/new-firestore-service Application applications
```

The first argument is the **PascalCase entity name**. The second is the **Firestore collection name** (usually plural, kebab-case).

Claude will generate:

- `src/app/entities/WeeklyReport.ts` — entity class extending `BaseEntity`
- `src/app/services/weekly-report.service.ts` — service extending `BaseFirestoreService<WeeklyReport>`
- `src/app/services/weekly-report.service.spec.ts` — minimal spec

After generation, add domain-specific methods to the service (e.g., custom queries using `getByAttribute`). The `BaseFirestoreService` base provides `get`, `getByAttribute`, `create`, `update`, `delete`, and `add` for free.

### Available base methods (inherited)

```typescript
get(id: string): Promise<T>
getByAttribute(attribute: string, operator: WhereFilterOp, value: any): Promise<T[]>
create(object: T, id?: string): Promise<void>
update(id: string, partial: Partial<T>): Promise<void>
delete(id: string): Promise<void>
add(object: T): Promise<DocumentReference>
```

---

## Hook: Block `environment.prod.ts`

**Files**: `.claude/hooks/block-prod-env.sh`, `.claude/settings.json`
**Trigger**: PreToolUse — fires before every `Edit` or `Write` tool call

### What it does

Intercepts any Claude attempt to edit `src/environments/environment.prod.ts` and exits with code 2 (blocked). Claude cannot bypass this — the hook runs before the tool executes.

### Why this project needs it

`environment.prod.ts` contains the production Firebase project ID, API key, app ID, and analytics measurement ID hardcoded in plain text. An accidental edit (wrong project ID, wrong API key) would silently break authentication, Firestore access, or analytics for all production users. The consequences may not be immediately visible — they surface as auth failures or missing data after a deploy.

Since the file never needs to change during routine development (environment-specific values belong in `.env` or Firebase config, not this file), blocking it entirely is the safest policy.

### Behavior

When Claude tries to edit `environment.prod.ts`:

```
BLOCKED: environment.prod.ts contains production Firebase credentials.
Edit it manually in your editor. Claude should not touch this file.
```

Claude will stop and explain why it cannot make the edit.

### If you need to edit it

Open `src/environments/environment.prod.ts` directly in your code editor. The hook only applies to Claude Code's tool calls — manual edits are not affected.

### Hook script

```bash
# .claude/hooks/block-prod-env.sh
FILE=$(python3 -c "
import sys, json, os
d = json.loads(os.environ.get('CLAUDE_TOOL_INPUT', '{}'))
print(d.get('file_path', ''))
" 2>/dev/null)

if [[ "$FILE" == *"environment.prod.ts"* ]]; then
  echo "BLOCKED: environment.prod.ts contains production Firebase credentials."
  exit 2
fi
```

---

## Hook: TSLint on Edit

**Files**: `.claude/hooks/lint-on-edit.sh`, `.claude/settings.json`
**Trigger**: PostToolUse — fires after every `Edit` or `Write` tool call on a `.ts` file

### What it does

Automatically runs TSLint on any TypeScript file that Claude edits, and prints the results to the conversation. This is informational — it never blocks a write.

### Why this project needs it

This project uses TSLint with Angular-specific codelyzer rules (component class suffix, directive selector naming, contextual lifecycle validation, etc.). Lint issues don't prevent the TypeScript compiler from building, so they accumulate silently. Running lint inline after each edit surfaces issues immediately, while Claude still has the edited file in context to fix them.

### Behavior

After Claude edits `src/app/services/auth/auth-service.service.ts`:

```
--- TSLint: src/app/services/auth/auth-service.service.ts ---
ERROR: src/app/services/auth/auth-service.service.ts[42, 3]: Calls to 'console.log' are not allowed.
```

If there are no issues, the hook produces no output.

### Hook script

```bash
# .claude/hooks/lint-on-edit.sh
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

exit 0  # informational only
```

---

## Subagent: `security-reviewer`

**File**: `.claude/agents/security/security-reviewer.md`
**Model**: claude-opus-4-7
**Invocation**: Claude invokes it autonomously, or you can ask Claude to run a security review

### What it does

A specialized subagent that reviews code for security issues specific to this application's domain: sensitive resident data (SSN, date of birth, sobriety date), Firebase Auth token handling, Stripe payment compliance, Firestore security rules coverage, and Cloud Function authorization patterns.

It uses Opus (the highest-reasoning model) because security analysis requires understanding subtle data-flow patterns across multiple files — not just pattern matching.

### Why this project needs it

This app stores and processes highly sensitive data:

- **SSN** (last 4 digits) and personal identifiers on `User` entities
- **Stripe payment methods** managed through Cloud Functions
- **Firebase Auth** state with a password cache in `AuthService.cachedDetails`
- **Recovery-related health data** (sobriety date, housing status, gender)

A general-purpose code reviewer will catch many bugs, but won't know to check whether `cachedDetails` is cleared post-login, or whether callable Cloud Functions re-verify `context.auth.uid` rather than trusting the client-supplied `user` object.

### How to use it

Ask Claude to run a security review after editing sensitive areas:

```
Run a security review on my recent changes to my-account.component.ts
```

```
I just added a new Cloud Function — can you do a security review of functions/src/index.ts?
```

```
Security review the AuthService
```

Claude will spawn the `security-reviewer` subagent, which reads the relevant files, applies the domain-specific checks, and returns findings categorized as CRITICAL / HIGH / MEDIUM / INFO with file:line citations.

### What it checks

| Area              | Specific Checks                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| PII leakage       | SSN, DOB, sobriety date not in `console.log` or `localStorage`                        |
| Auth cache        | `cachedDetails` (email + password) cleared after use, not persisted                   |
| Auth listeners    | `onAuthStateChanged` stored in `authSubscription` for cleanup                         |
| Firestore rules   | Every client-writable collection has corresponding security rules                     |
| Stripe compliance | Card data never read back from Stripe Elements into component state                   |
| Cloud Functions   | All callables verify `context.auth` before Firestore/Stripe access                    |
| Client trust      | Functions re-fetch user from Firestore by `context.auth.uid`, not from client payload |

### Sample output

```
CRITICAL — functions/src/index.ts:34 — createOperatorSubscription does not verify context.auth before processing Stripe subscription. An unauthenticated caller could create subscriptions for arbitrary user IDs. Add: if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');

HIGH — src/app/services/auth/auth-service.service.ts:22 — cachedDetails stores the user's plaintext password in memory. Clear this object immediately after login completes, not just when the component unmounts.

MEDIUM — src/app/components/accounts/my-account/my-account.component.ts:89 — user.ssn is included in a template binding. Verify this value is masked (last-4 display only) and not logged anywhere in the component's error handlers.

INFO — No firestore.rules file found at project root. Firestore rules should be defined and deployed alongside the app.

Summary: 1 CRITICAL, 1 HIGH, 1 MEDIUM, 1 INFO
```

---

## File Structure

```
regroup-web/
├── .mcp.json                              # context7 MCP server (project-level)
├── .claude/
│   ├── settings.json                      # Hook registrations
│   ├── hooks/
│   │   ├── block-prod-env.sh              # PreToolUse: block environment.prod.ts
│   │   └── lint-on-edit.sh               # PostToolUse: TSLint on .ts edits
│   ├── skills/
│   │   ├── firebase-deploy/SKILL.md       # /firebase-deploy skill
│   │   └── new-firestore-service/SKILL.md # /new-firestore-service skill
│   └── agents/
│       └── security/
│           └── security-reviewer.md       # Security review subagent
└── docs/
    └── claude-automations.md              # This file
```

---

## Extending These Automations

### Adding a new hook

1. Create a script in `.claude/hooks/<name>.sh`
2. Add it to `.claude/settings.json` under the appropriate event (`PreToolUse` or `PostToolUse`)
3. Use `exit 2` to block, `exit 0` to allow (with optional stdout output Claude will see)

### Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md` with YAML frontmatter
2. Set `disable-model-invocation: true` for user-only skills (deploy, send, destructive ops)
3. Set `user-invocable: false` for Claude-only skills (background knowledge, conventions)
4. Omit both for skills either party can invoke

### Adding a new subagent

1. Create `.claude/agents/<category>/<name>.md`
2. Set `model` to match the reasoning requirement (Haiku for fast/cheap, Sonnet for coding, Opus for deep analysis)
3. Be explicit in the agent prompt about what file paths and patterns to look for — vague agents produce vague results
