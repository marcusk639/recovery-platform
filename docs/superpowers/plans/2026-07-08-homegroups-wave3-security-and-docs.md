# Homegroups Wave 3: Storage Rules Auth Bypass, Webhook Fail-Open, Dev Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two production security gaps in `homegroups` (storage rules world-readable group resources, Stripe webhook fail-open on missing secret) and fix three developer-experience gaps (hardcoded legacy repo paths, missing Stripe env var docs, stale pricing doc cross-references) discovered during the Wave 3 investigation pass.

**Architecture:** Two independent P0 security fixes (storage rules + webhook handler), each with new/extended test coverage wired into the existing CI rules-testing job. Three independent P1 doc/config fixes with no runtime behavior change. Tasks 1–4 (P0) and 5–7 (P1) have no cross-dependencies and can be done in any order, but P0 should land first.

**Tech Stack:** Firebase Storage Security Rules (v2), `@firebase/rules-unit-testing`, Firebase Cloud Functions v2 (TypeScript), Jest, GitHub Actions.

## Global Constraints

- All work happens in `homegroups/` (or repo root for `.github/workflows/ci.yml`). Do not touch `regroup/`, `detox-recovery/`, or `recovery-api/`.
- Follow the existing claims-based pattern in `storage.rules` (no `firestore.get()` cross-service reads) — mirror `isGroupAdmin(groupId)` exactly for the new `isGroupMember(groupId)` helper.
- `homegroups/functions` uses `firebase-functions` v2 style handlers, Jest with `ts-jest`, and `npm test` from the `functions/` directory.
- Do not commit real secrets. `.env.example` (Task 6) must contain only placeholder values.
- Node 22, TypeScript 4.5.4 (functions).
- Every P0 task ends with `npm test` (and, where applicable, `npm run test:rules` / a new `test:rules:storage`) passing before commit.

---

## Task 1: Fix storage rules world-readable group resources (P0 — security)

**Files:**

- Modify: `homegroups/storage.rules`
- Create: `homegroups/functions/src/tests/security-rules-storage.test.ts`
- Modify: `homegroups/functions/package.json` (add `test:rules:storage` script)
- Modify: `homegroups/functions/jest.config.js` (exclude new test file unless the storage emulator is running)

**Interfaces:**

- Produces: `isGroupMember(groupId)` function in `storage.rules`, used by the `read` rule under `match /groups/{groupId}/resources/{fileName}`.
- Consumes: `request.auth.token.memberGroups` — a custom JWT claim array of group IDs, already set for every group member (not just admins) by `homegroups/functions/src/triggers/firestore/onMemberWrite.ts` (`rebuildUserClaims`, see `claims.memberGroups.push(groupId)`), and consumed identically today by `firestore.rules`'s `isGroupMemberClaims(groupId)`.

Currently `storage.rules` line 33 is `allow read: if isSignedIn();` — any authenticated user, member or not, can read any group's uploaded resources. Fix mirrors the existing `isGroupAdmin(groupId)` helper (claims-only, no Firestore fallback — storage rules in this codebase never call `firestore.get()`).

- [ ] **Step 1: Write the failing test file**

Create `homegroups/functions/src/tests/security-rules-storage.test.ts`:

```typescript
/**
 * Storage Security Rules Tests
 *
 * Run with: npm run test:rules:storage
 * Requires Firebase Storage Emulator running (started automatically by the script).
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

let testEnv: RulesTestEnvironment;

function getAuthenticatedContext(
  uid: string,
  claims: Record<string, any> = {},
) {
  return testEnv.authenticatedContext(uid, claims);
}

function getUnauthenticatedContext() {
  return testEnv.unauthenticatedContext();
}

beforeAll(async () => {
  const rulesPath = path.join(__dirname, "../../../storage.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "recovery-connect-test",
    storage: {
      rules,
      host: "localhost",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Group Resources — /groups/{groupId}/resources/{fileName}", () => {
  const groupId = "group1";
  const filePath = `groups/${groupId}/resources/handbook.pdf`;

  it("denies read for unauthenticated users", async () => {
    const storage = getUnauthenticatedContext().storage();
    await assertFails(storage.ref(filePath).getDownloadURL());
  });

  it("denies read for an authenticated user who is not a group member", async () => {
    const storage = getAuthenticatedContext("user-outsider", {
      memberGroups: ["some-other-group"],
    }).storage();
    await assertFails(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for an authenticated group member", async () => {
    const storage = getAuthenticatedContext("user-member", {
      memberGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for a group admin (also present in memberGroups)", async () => {
    const storage = getAuthenticatedContext("user-admin", {
      memberGroups: [groupId],
      adminGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("allows read for a super admin who is not a group member", async () => {
    const storage = getAuthenticatedContext("user-super", {
      superAdmin: true,
    }).storage();
    await assertSucceeds(storage.ref(filePath).getDownloadURL());
  });

  it("denies write for a group member who is not an admin", async () => {
    const storage = getAuthenticatedContext("user-member", {
      memberGroups: [groupId],
    }).storage();
    await assertFails(storage.ref(filePath).put(Buffer.from("data")));
  });

  it("allows write for a group admin under the size limit", async () => {
    const storage = getAuthenticatedContext("user-admin", {
      memberGroups: [groupId],
      adminGroups: [groupId],
    }).storage();
    await assertSucceeds(storage.ref(filePath).put(Buffer.from("small file")));
  });
});
```

Note: the `@firebase/rules-unit-testing` package's `RulesTestContext.storage()` method requires the package version already in `functions/package.json` to support the Storage emulator (the same package already used for `firestore()` in `security-rules.test.ts`). No new dependency is needed.

- [ ] **Step 2: Add the storage emulator test script**

In `homegroups/functions/package.json`, add a new script next to `"test:rules"`:

```json
    "test:rules": "firebase emulators:exec --only firestore 'npm run test'",
    "test:rules:storage": "firebase emulators:exec --only storage 'npm run test'",
```

- [ ] **Step 3: Exclude the new test file from the default `npm test` run**

In `homegroups/functions/jest.config.js`, extend the existing conditional exclusion (mirrors the pattern already used for `security-rules.test.ts` / `FIRESTORE_EMULATOR_HOST`):

```javascript
  testPathIgnorePatterns: [
    "/node_modules/",
    "/lib/",
    ...(process.env.FIRESTORE_EMULATOR_HOST ? [] : ["security-rules.test.ts"]), // requires Firestore emulator on port 8080
    ...(process.env.FIREBASE_STORAGE_EMULATOR_HOST ? [] : ["security-rules-storage.test.ts"]), // requires Storage emulator on port 9199
  ],
```

`firebase emulators:exec` sets `FIREBASE_STORAGE_EMULATOR_HOST` automatically when the `storage` emulator is included, the same way it sets `FIRESTORE_EMULATOR_HOST` for `firestore`.

- [ ] **Step 4: Run the new test and verify it fails on the read-bypass case**

Run: `cd homegroups/functions && npm run test:rules:storage`
Expected: FAIL — specifically `"denies read for an authenticated user who is not a group member"` fails because `assertFails` receives a resolved promise (the read succeeds under the current `isSignedIn()`-only rule).

- [ ] **Step 5: Fix storage.rules**

Edit `homegroups/storage.rules`, adding `isGroupMember` after the existing `isGroupAdmin` helper and using it in the `read` rule:

```
    // Check if the authenticated user is an admin of the given group
    // using custom JWT claims set by onMemberWrite trigger.
    function isGroupAdmin(groupId) {
      return isSignedIn() && (
        isSuperAdmin() ||
        (request.auth.token.adminGroups != null &&
          groupId in request.auth.token.adminGroups)
      );
    }

    // Check if the authenticated user is a member of the given group
    // using custom JWT claims set by onMemberWrite trigger.
    function isGroupMember(groupId) {
      return isSignedIn() && (
        isSuperAdmin() ||
        (request.auth.token.memberGroups != null &&
          groupId in request.auth.token.memberGroups)
      );
    }
```

And change the read rule under `match /groups/{groupId}/resources/{fileName}`:

```
      // Only group members (via custom JWT claims) can download resources.
      allow read: if isGroupMember(groupId);
```

(Replacing `allow read: if isSignedIn();` and correcting the stale comment above it that already claimed "Any authenticated group member" without enforcing it.)

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd homegroups/functions && npm run test:rules:storage`
Expected: PASS — all 7 tests green.

- [ ] **Step 7: Run the full functions test suite to confirm no regression**

Run: `cd homegroups/functions && npm test`
Expected: PASS (security-rules-storage.test.ts is skipped here since `FIREBASE_STORAGE_EMULATOR_HOST` is unset outside the emulator script).

- [ ] **Step 8: Commit**

```bash
cd homegroups/functions && git add ../storage.rules src/tests/security-rules-storage.test.ts package.json jest.config.js
git commit -m "fix(homegroups-functions): require group membership to read group resources in storage.rules"
```

---

## Task 2: Wire storage rules tests into CI (P0 — security, closes the regression gap)

**Files:**

- Modify: `.github/workflows/ci.yml` (repo root)

**Interfaces:**

- Consumes: `npm run test:rules:storage` script from Task 1, Step 2.

This mirrors the existing `homegroups-firestore-rules` job exactly, using the Storage emulator instead of Firestore.

- [ ] **Step 1: Add the new CI job**

In `.github/workflows/ci.yml`, add a new job after `homegroups-firestore-rules`:

```yaml
homegroups-storage-rules:
  name: homegroups/functions — Storage security rules
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: "npm"
        cache-dependency-path: homegroups/functions/package-lock.json
    - uses: actions/setup-java@v4
      with:
        distribution: "temurin"
        java-version: "21"
    - name: Install dependencies
      run: cd homegroups/functions && npm ci
    - name: Install firebase-tools
      run: npm install -g firebase-tools
    - name: Run Storage rules tests
      run: cd homegroups/functions && npm run test:rules:storage
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID` printed, no exception.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(homegroups): add Storage security rules test job"
```

---

## Task 3: Fix Stripe webhook fail-open on missing secret (P0 — security)

**Files:**

- Modify: `homegroups/functions/src/http/stripeWebhook.ts:68-77`
- Modify: `homegroups/functions/src/__tests__/stripeWebhook.test.ts`

**Interfaces:**

- Consumes: existing `handleWebhook(req, res, secret, isConnectWebhook)` internal function (not exported — tested via the exported `stripeWebhook` / `stripeConnectWebhook` onRequest handlers, same pattern the existing test file already uses).

Currently, when `webhookSecret`/`connectWebhookSecret` is `undefined` (misconfiguration), `handleWebhook` returns HTTP 200 with `processed: false`. Stripe treats 200 as success and will not retry — silently dropping every webhook event until someone notices the "CRITICAL" log line. Returning 500 makes Stripe retry (per Stripe's own webhook reliability guidance: retry on 5xx) and makes the failure visible in Cloud Functions error-rate alerting instead of only in logs.

- [ ] **Step 1: Write the failing test**

Add to `homegroups/functions/src/__tests__/stripeWebhook.test.ts`, inside (or as a sibling of) the existing `describe("stripeWebhook — intergroup handler wiring (C8)", ...)` block — add a new top-level `describe`:

```typescript
describe("stripeWebhook — fails closed when secret is missing", () => {
  let handleWebhookViaRequest: Function;

  beforeAll(async () => {
    jest.resetModules();
    const mod = await import("../http/stripeWebhook");
    handleWebhookViaRequest = mod.stripeWebhook as unknown as Function;
  });

  it("returns 500, not 200, when the webhook secret is not configured", async () => {
    // Re-mock ../utils/stripe with an undefined webhookSecret for this test only.
    jest.resetModules();
    jest.doMock("../utils/stripe", () => ({
      stripe: { webhooks: { constructEvent: mockConstructEvent } },
      webhookSecret: undefined,
      connectWebhookSecret: "whsec_connect_test",
      NonRetriableError: class NonRetriableError extends Error {},
    }));
    const mod = await import("../http/stripeWebhook");
    const stripeWebhookHandler = mod.stripeWebhook as unknown as Function;

    const req = makeReq(makeEvent("checkout.session.completed", {}));
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ processed: false });

    jest.dontMock("../utils/stripe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd homegroups/functions && npx jest stripeWebhook.test.ts -t "fails closed"`
Expected: FAIL — `expect(res.statusCode).toBe(500)` receives `200`.

- [ ] **Step 3: Fix the handler**

In `homegroups/functions/src/http/stripeWebhook.ts`, change lines 68–77:

```typescript
if (!secret) {
  functions.logger.error(
    `CRITICAL: Stripe ${webhookType} webhook secret not configured.`,
  );
  res.status(500).send({
    received: false,
    error: `${webhookType} webhook secret not configured`,
    processed: false,
  });
  return;
}
```

(Only the status code and `received` field change — `received: false` since the event was never actually accepted, `processed: false` retained.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd homegroups/functions && npx jest stripeWebhook.test.ts -t "fails closed"`
Expected: PASS

- [ ] **Step 5: Run the full stripeWebhook suite and full functions suite**

Run: `cd homegroups/functions && npx jest stripeWebhook.test.ts && npm test`
Expected: PASS, no regressions in the existing "intergroup handler wiring" tests.

- [ ] **Step 6: Commit**

```bash
cd homegroups/functions && git add src/http/stripeWebhook.ts src/__tests__/stripeWebhook.test.ts
git commit -m "fix(homegroups-functions): fail closed (500) instead of 200 when a Stripe webhook secret is missing"
```

---

## Task 4: Fix hardcoded legacy repo paths in dev tooling config (P1 — dev experience)

**Files:**

- Modify: `homegroups/.mcp.json`
- Modify: `homegroups/.claude/settings.json`

**Interfaces:** None — config-only, no code interfaces.

Both files hardcode `/Users/marcusklein/dev/RecoveryConnect/...` (the pre-monorepo repo name/location). The repo now lives at `/Users/marcusklein/dev/recovery-platform/homegroups/...`. Fix by making paths relative to the file's own location using `${CLAUDE_PROJECT_DIR}` (the standard Claude Code env var for the project root) for `.claude/settings.json`, and relative paths for `.mcp.json` where the tooling supports it; where it doesn't (the `firebase` MCP server's absolute `--dir` arg and node binary path), leave a comment noting it must point at the current machine's `homegroups` checkout.

- [ ] **Step 1: Fix `.mcp.json`**

Edit `homegroups/.mcp.json`:

```json
{
  "mcpServers": {
    "detox": {
      "command": "npx",
      "args": ["detox-mcp"],
      "env": {
        "DETOX_PROJECT_PATH": "${CLAUDE_PROJECT_DIR}/mobile"
      }
    },
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools", "mcp", "--dir", "${CLAUDE_PROJECT_DIR}"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@3.0.0"]
    }
  }
}
```

(Replacing the hardcoded absolute node binary + global `firebase-tools` install path with `npx -y firebase-tools`, which resolves per-machine instead of assuming a specific nvm version path.)

- [ ] **Step 2: Fix `.claude/settings.json`**

Edit `homegroups/.claude/settings.json`, replacing every `/Users/marcusklein/dev/RecoveryConnect/mobile` with `${CLAUDE_PROJECT_DIR}/mobile` and every `/Users/marcusklein/dev/RecoveryConnect/functions` with `${CLAUDE_PROJECT_DIR}/functions`:

```json
            "command": "FILE=$(echo \"$TOOL_INPUT\" | grep -oE '\"file_path\":\\s*\"[^\"]+\"' | grep -oE '/[^\"]+'); if echo \"$FILE\" | grep -qE '\\.(ts|tsx|js|jsx|json|css|scss|md)$'; then if echo \"$FILE\" | grep -q '/mobile/'; then cd \"${CLAUDE_PROJECT_DIR}/mobile\" && npx prettier --write \"$FILE\" 2>/dev/null; elif echo \"$FILE\" | grep -q '/functions/'; then cd \"${CLAUDE_PROJECT_DIR}/functions\" && npx prettier --write \"$FILE\" 2>/dev/null; fi; fi",
```

and

```json
            "command": "FILE=$(echo \"$TOOL_INPUT\" | grep -oE '\"file_path\":\\s*\"[^\"]+\"' | grep -oE '/[^\"]+'); if echo \"$FILE\" | grep -q 'functions/src/'; then cd \"${CLAUDE_PROJECT_DIR}/functions\" && npx tsc --noEmit 2>&1 | head -20; fi",
```

`${CLAUDE_PROJECT_DIR}` here refers to `homegroups/` since that's where this `.claude/settings.json` lives (Claude Code sets the project dir to the directory containing the active `.claude/` folder).

- [ ] **Step 3: Verify JSON is valid**

Run: `cd homegroups && python3 -c "import json; json.load(open('.mcp.json')); json.load(open('.claude/settings.json')); print('VALID')"`
Expected: `VALID`

- [ ] **Step 4: Commit**

```bash
cd homegroups && git add .mcp.json .claude/settings.json
git commit -m "fix(homegroups): replace hardcoded legacy RecoveryConnect paths with \${CLAUDE_PROJECT_DIR}"
```

---

## Task 5: Document Stripe env vars and fix the phantom `.env.example` reference (P1 — dev experience)

**Files:**

- Create: `homegroups/functions/.env.example`
- Modify: `homegroups/docs/technical/development.md`

**Interfaces:** None — docs/template only.

`development.md`'s Project Structure diagram references `functions/.env.example` as if it exists; it doesn't. The Backend Setup section jumps from `firebase init` to `npm install` with no mention of the 12 Stripe env vars + `RATS_API_KEY` that `functions/src/utils/stripe.ts` requires at runtime. Fix both: create the actual template file, and add a setup step that points to it.

- [ ] **Step 1: Create `homegroups/functions/.env.example`**

```
# Stripe — Platform account (subscriptions, checkout)
# Use STRIPE_TEST_* for local/emulator development; the non-TEST_ vars are used
# automatically when STRIPE_TEST_SECRET_KEY is unset (see functions/src/utils/stripe.ts).
STRIPE_TEST_SECRET_KEY=sk_test_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxx

# Stripe price/product IDs — member subscriptions
STRIPE_TEST_PRICE_ID_MEMBER=price_xxx
STRIPE_PRICE_ID_MEMBER=price_xxx

# Stripe price/product IDs — group subscriptions
STRIPE_TEST_PRICE_ID_GROUP=price_xxx
STRIPE_PRODUCT_ID_GROUP=prod_xxx

# Stripe price/product IDs — intergroup subscriptions (tiers A/B)
STRIPE_TEST_PRICE_ID_INTERGROUP_A=price_xxx
STRIPE_TEST_PRICE_ID_INTERGROUP_B=price_xxx
STRIPE_PRODUCT_ID_INTERGROUP_A=prod_xxx
STRIPE_PRODUCT_ID_INTERGROUP_B=prod_xxx

# Third-party services
RATS_API_KEY=xxx
```

- [ ] **Step 2: Un-ignore `.env.example` in `.gitignore`**

`homegroups/functions/.gitignore` lines 15–16 are:

```
.env
.env.*
```

`.env.*` matches `.env.example`, which would otherwise silently prevent Task 5 Step 1's file from being committed. Add a negation line immediately after line 16:

```
.env
.env.*
!.env.example
```

- [ ] **Step 3: Add an env vars setup step to development.md**

In `homegroups/docs/technical/development.md`, insert a new step between "### 1. Firebase Authentication" and "### 2. Setup Cloud Functions" (i.e., right before the existing `### 2. Setup Cloud Functions` heading found via `grep -n "### 2. Setup Cloud Functions" homegroups/docs/technical/development.md`):

````markdown
### 2. Configure Environment Variables

Cloud Functions needs Stripe API keys and a few other secrets at runtime. Copy the template and fill in real values (get them from the shared Stripe dashboard or 1Password — never commit real keys):

```bash
cd functions
cp .env.example .env
# Edit .env and fill in STRIPE_TEST_* keys for local/emulator work
```
````

`functions/.env` is gitignored. In production these same variable names are bound via Firebase Secret Manager (`defineSecret()` in `functions/src/utils/stripe.ts`), not `.env` — the file is for local/emulator development only.

````

Then renumber the existing `### 2. Setup Cloud Functions` to `### 3. Setup Cloud Functions` and `### 3. Start Firebase Emulator Suite` to `### 4. Start Firebase Emulator Suite` (grep for both headings first to confirm current numbering before editing, since intervening edits in this same file from Task 1/prior work may have shifted line numbers).

- [ ] **Step 4: Commit**

```bash
cd homegroups && git add functions/.env.example functions/.gitignore docs/technical/development.md
git commit -m "docs(homegroups): add functions/.env.example and document Stripe env var setup"
````

---

## Task 6: Correct stale pricing doc cross-references and add Storage emulator port convention (P1 — docs)

**Files:**

- Modify: `homegroups/docs/product/requirements.md`
- Modify: `homegroups/CLAUDE.md`
- Modify: `/Users/marcusklein/dev/recovery-platform/CLAUDE.md` (root — emulator port table)

**Interfaces:** None — docs only.

`requirements.md` and `homegroups/CLAUDE.md` both state group pricing as "$12/year" without noting that `monetization.md` (row D-1) has already resolved the launch price to $24/year, with $12 retained only as historical/migration context, and that activation is in-progress (requires updating the Stripe product's default price). This isn't wrong for the currently-shipped price, but it's misleading to a reader who doesn't also read `monetization.md`. Fix: add a one-line pointer, don't change the shipped price number itself (that's a business/Stripe-config decision, out of scope here).

- [ ] **Step 1: Update `requirements.md`**

Run: `grep -n "12/year" homegroups/docs/product/requirements.md` to find the exact line (expected near line 74), then edit that line to append a footnote-style pointer:

```
[existing "$12/year per group" sentence] (see `docs/go-to-market/monetization.md` D-1 for the approved $24/year launch price — activation in progress).
```

- [ ] **Step 2: Update `homegroups/CLAUDE.md`**

Run: `grep -n "12/year" homegroups/CLAUDE.md` (expected near line 85), then edit similarly:

```
Group admin subscriptions are **$12/year flat rate** (shipped default; `docs/go-to-market/monetization.md` D-1 resolves the launch price to $24/year — activation in progress, see that doc for status).
```

- [ ] **Step 3: Add Storage to the emulator port convention table**

In the root `/Users/marcusklein/dev/recovery-platform/CLAUDE.md`, find the "Firebase emulator port conventions" list under "Cross-Cutting Rules" and add a line:

```
- Storage: `9199`
```

immediately after the existing `- Auth: \`9099\`` line.

- [ ] **Step 4: Commit**

```bash
git add homegroups/docs/product/requirements.md homegroups/CLAUDE.md CLAUDE.md
git commit -m "docs(homegroups): cross-reference D-1 pricing resolution, document Storage emulator port"
```

---

## Task 7: Final verification sweep

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full homegroups functions suite**

Run: `cd homegroups/functions && npm test`
Expected: PASS, same test count as before Wave 3 plus the new `stripeWebhook.test.ts` case (storage rules test file still skipped here — expected).

- [ ] **Step 2: Run Firestore rules tests (regression check — Task 1 touched a sibling rules file, not this one, but confirm no accidental cross-file edit)**

Run: `cd homegroups/functions && npm run test:rules`
Expected: PASS

- [ ] **Step 3: Run the new Storage rules tests**

Run: `cd homegroups/functions && npm run test:rules:storage`
Expected: PASS

- [ ] **Step 4: Typecheck**

Run: `cd homegroups/functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Confirm CI workflow YAML is still valid after Task 2's edit**

Run: `cd /Users/marcusklein/dev/recovery-platform && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo VALID`
Expected: `VALID`

No commit for this task — it's a verification gate before merge/PR.
