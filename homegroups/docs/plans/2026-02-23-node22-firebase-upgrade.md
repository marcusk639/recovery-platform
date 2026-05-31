# Node 22 + Firebase Functions Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Cloud Functions runtime to Node 22, update firebase-functions to v7, and clear stored Firebase runtime config to silence the deprecation warnings.

**Architecture:** Three independent changes — engine bump in package.json, npm package upgrade with build verification, and deletion of leftover Firebase Runtime Config values that were already migrated to `.env`. No functional code changes expected.

**Tech Stack:** Node 22, firebase-functions v7.0.5, Firebase CLI

---

## Context

Current state:
- `functions/package.json` `engines.node` = `"20"` → needs `"22"`
- `firebase-functions` = `^6.3.2` → latest is `7.0.5`
- `functions.config()` is **not used in any source file** — the migration to `process.env` already happened
- Firebase Runtime Config **still stores 3 old values** (confirmed via `firebase functions:config:get`):
  - `stripe.test_secret_key`
  - `stripe.test_publishable_key`
  - `stripe.test_price_id_member`
- All 3 are already present in `functions/.env` under the correct env var names

Import paths in production code that touch firebase-functions:
- `"firebase-functions"` — `import * as functions` (used for `functions.logger`)
- `"firebase-functions/logger"` — direct logger import
- `"firebase-functions/v1"` — legacy v1 namespace
- `"firebase-functions/v1/https"` — `HttpsError` class
- `"firebase-functions/v2"` — 2nd gen namespace
- `"firebase-functions/v2/firestore"` — Firestore triggers
- `"firebase-functions/v2/https"` — 2nd gen HTTPS callables
- `"firebase-functions/v2/scheduler"` — scheduled functions

---

### Task 1: Bump Node engine to 22

**Files:**
- Modify: `functions/package.json`

**Step 1: Update the engines field**

In `functions/package.json`, change:
```json
"engines": {
  "node": "20"
}
```
to:
```json
"engines": {
  "node": "22"
}
```

**Step 2: Verify the change**

Run:
```bash
grep -A2 '"engines"' functions/package.json
```
Expected output:
```
"engines": {
  "node": "22"
```

**Step 3: Commit**

```bash
git add functions/package.json
git commit -m "chore: upgrade cloud functions runtime to node 22"
```

---

### Task 2: Upgrade firebase-functions to v7

**Files:**
- Modify: `functions/package.json` (via npm)
- Modify: `functions/package-lock.json` (via npm)

**Step 1: Install the latest version**

```bash
cd functions && npm install --save firebase-functions@latest
```

Expected: installs 7.0.5 (or newer). The `firebase-functions` entry in `package.json` should update to `"^7.0.5"` or similar.

**Step 2: Check for TypeScript compilation errors**

```bash
npm run build
```

Expected: clean build with no errors. If there are errors from breaking changes in v7 (e.g., removed v1 subpaths), they'll appear here. The most likely issue is if `firebase-functions/v1/https` was removed — if so, see the fix below.

**If build fails with "Cannot find module 'firebase-functions/v1/https'":**

The `HttpsError` class moved to `firebase-functions/v2/https` in v7. Find all files using the v1 path:

```bash
grep -rn "firebase-functions/v1/https" functions/src/ --include="*.ts" | grep -v "__tests__"
```

For each file, change:
```typescript
import { HttpsError } from "firebase-functions/v1/https";
```
to:
```typescript
import { HttpsError } from "firebase-functions/v2/https";
```

Then re-run `npm run build` to confirm it passes.

**If build fails with other errors:** Read the error carefully, fix the import path, and re-run.

**Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass. If tests fail because mocks reference `"firebase-functions/v1/https"` that no longer exists, update the mocks in `src/__tests__/` to match the new import paths.

**Step 4: Commit**

```bash
cd functions && git add package.json package-lock.json src/
git commit -m "chore: upgrade firebase-functions to v7"
```

---

### Task 3: Clear stored Firebase Runtime Config

**Context:** The project previously used `firebase functions:config:set` to store Stripe test credentials. These values are already in `functions/.env`. The stored config is what triggers the deprecation warning on every `firebase deploy`.

**Step 1: Confirm current stored config**

```bash
firebase functions:config:get
```

Expected output includes:
```json
{
  "stripe": {
    "test_secret_key": "sk_test_...",
    "test_publishable_key": "pk_test_...",
    "test_price_id_member": "price_..."
  }
}
```

**Step 2: Unset the stored config**

```bash
firebase functions:config:unset stripe
```

Expected: `✔  Config unset.`

**Step 3: Verify it's gone**

```bash
firebase functions:config:get
```

Expected: `{}` or empty object (and no deprecation warning).

**Step 4: Commit**

Nothing to commit for this step — it's a remote Firebase change. Document it in a commit message though:

```bash
git commit --allow-empty -m "chore: remove legacy firebase runtime config (migrated to .env)"
```

---

### Task 4: Verify build and redeploy

**Step 1: Final clean build**

```bash
cd functions && npm run build
```

Expected: clean build, no errors, no warnings about `functions.config()`.

**Step 2: Deploy changed functions**

Since Node engine version changed, ALL functions need redeployment (runtime change requires new revisions). Run:

```bash
nvm use 22 && bash scripts/deploy-functions.sh --all --size 2 --delay 30
```

Note: Make sure you're using Node 22 locally for the deploy. If `nvm use 22` fails, install it first:
```bash
nvm install 22 && nvm use 22
```

**Step 3: Verify no deprecation warnings appear in deploy output**

The deploy should complete without:
- `⚠ Runtime Node.js 20 will be deprecated...`
- `⚠ DEPRECATION NOTICE: functions.config() API is deprecated`
- `⚠ package.json indicates an outdated version of firebase-functions`

---

## Review Prompt

Before marking complete, verify:
- [ ] `functions/package.json` shows `"node": "22"` and `firebase-functions` is v7
- [ ] `npm run build` passes with no errors
- [ ] `npm test` passes
- [ ] `firebase functions:config:get` returns `{}`
- [ ] Deploy completes without the three deprecation warnings
