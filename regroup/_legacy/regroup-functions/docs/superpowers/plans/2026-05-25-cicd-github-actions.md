> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# CI/CD — GitHub Actions for regroup-functions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions workflows that run the TypeScript build + Jest tests on every PR and deploy to Firebase on merge to `main`.

**Architecture:** Two workflows: `ci.yml` (PR check — build + test, no deploy) and `deploy.yml` (main branch push — build + deploy via Firebase CLI). Secrets stored as GitHub repository secrets. No Firebase emulator in CI — unit tests already use Jest mocks.

**Tech Stack:** GitHub Actions, Firebase CLI (`firebase-tools`), `npm ci`, `npx jest`, Node 20

---

## File Structure

- **Create:** `.github/workflows/ci.yml`
- **Create:** `.github/workflows/deploy.yml`
- **No source code changes** — CI wraps existing `npm run build` and `npm test` commands

---

## Task 1: Create CI workflow (build + test on PR)

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Verify existing test and build commands**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && cat package.json | grep -E '"build"|"test"|"lint"'`
  Expected: Something like:

  ```
  "build": "tsc",
  "test": "jest"
  ```

  Note the exact command names — use them verbatim in the workflow.

- [ ] **Step 2: Write the failing check (manual verification)**

  There is no test for CI config itself. Instead: create the file and verify it passes `act` locally (or just push and verify GitHub runs it).

  Verification command (if `act` is installed):

  ```bash
  cd /Users/marcuspersonal/dev/regroup-functions && act pull_request --job build-test --dry-run
  ```

- [ ] **Step 3: Create .github/workflows/ci.yml**

  Create `/Users/marcuspersonal/dev/regroup-functions/.github/workflows/ci.yml`:

  ```yaml
  name: CI

  on:
    pull_request:
      branches: [main, master]
      paths:
        - "functions/**"
        - ".github/workflows/ci.yml"

  jobs:
    build-test:
      name: Build & Test
      runs-on: ubuntu-latest

      defaults:
        run:
          working-directory: functions

      steps:
        - uses: actions/checkout@v4

        - name: Set up Node.js
          uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: "npm"
            cache-dependency-path: functions/package-lock.json

        - name: Install dependencies
          run: npm ci

        - name: TypeScript build check
          run: npm run build

        - name: Run unit tests
          run: npm test -- --coverage --coverageReporters=text-summary
          env:
            STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY_TEST }}
            SENDGRID_API_KEY: ${{ secrets.SENDGRID_API_KEY_TEST }}
  ```

- [ ] **Step 4: Commit**

  ```bash
  mkdir -p /Users/marcuspersonal/dev/regroup-functions/.github/workflows
  git add .github/workflows/ci.yml
  git commit -m "ci: add GitHub Actions PR build and test workflow"
  ```

---

## Task 2: Create deploy workflow (build + deploy on main push)

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Get Firebase project ID**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions && cat .firebaserc | grep -A5 projects`
  Expected: Something like:

  ```json
  "projects": {
    "default": "phoenix-cleanhouse"
  }
  ```

  Note the project ID — use it in the workflow.

- [ ] **Step 2: Create service account for CI deploy**

  In Google Cloud Console → IAM → Service Accounts:
  1. Create new service account: `github-actions-deploy`
  2. Roles: Firebase Admin SDK Administrator Service Agent + Cloud Functions Developer
  3. Create JSON key → download → encode as base64:
     ```bash
     base64 -i service-account.json | tr -d '\n'
     ```
  4. Add to GitHub repo secrets as `FIREBASE_SERVICE_ACCOUNT`

  Alternative: Use `firebase login:ci` to generate a CI token:

  ```bash
  firebase login:ci
  ```

  Add output token to GitHub repo secrets as `FIREBASE_TOKEN`.

- [ ] **Step 3: Create .github/workflows/deploy.yml**

  Create `/Users/marcuspersonal/dev/regroup-functions/.github/workflows/deploy.yml`:

  ```yaml
  name: Deploy

  on:
    push:
      branches: [main]
      paths:
        - "functions/**"
        - ".github/workflows/deploy.yml"
        - "firebase.json"
        - "firestore.rules"
        - "firestore.indexes.json"

  jobs:
    deploy:
      name: Deploy to Firebase
      runs-on: ubuntu-latest

      steps:
        - uses: actions/checkout@v4

        - name: Set up Node.js
          uses: actions/setup-node@v4
          with:
            node-version: "20"
            cache: "npm"
            cache-dependency-path: functions/package-lock.json

        - name: Install dependencies
          run: npm ci
          working-directory: functions

        - name: Build
          run: npm run build
          working-directory: functions

        - name: Run tests (gate deployment)
          run: npm test
          working-directory: functions
          env:
            STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY_TEST }}
            SENDGRID_API_KEY: ${{ secrets.SENDGRID_API_KEY_TEST }}

        - name: Install Firebase CLI
          run: npm install -g firebase-tools

        - name: Deploy Functions + Firestore Rules
          run: firebase deploy --only functions,firestore:rules,firestore:indexes
          env:
            FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
  ```

- [ ] **Step 4: Add GitHub secrets**

  In the `regroup-functions` GitHub repo → Settings → Secrets:
  - `FIREBASE_TOKEN` — output of `firebase login:ci`
  - `STRIPE_SECRET_KEY_TEST` — Stripe test key (NOT live key) for test env
  - `SENDGRID_API_KEY_TEST` — SendGrid test key or a dummy string (`SG.test`)

  Note: Live keys must NEVER go into GitHub secrets for test runs. The deploy workflow runs tests with test keys, then deploys the build that passed.

- [ ] **Step 5: Verify workflow triggers**

  Create a test PR, verify CI workflow runs. Check Actions tab in GitHub.
  Then merge to main, verify deploy workflow runs and Firebase console shows the deployment.

- [ ] **Step 6: Commit**

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "ci: add GitHub Actions deploy workflow for main branch"
  ```

---

## Task 3: Add .gitignore entries for GitHub Actions artifacts

- [ ] **Step 1: Ensure build artifacts are gitignored**

  The root `.gitignore` already ignores `**/*.js` and `**/*.js.map`. Verify:

  ```bash
  grep -n "\.js$\|\.js\.map" /Users/marcuspersonal/dev/regroup-functions/.gitignore
  ```

  Expected: Found. If not, add:

  ```
  **/*.js
  **/*.js.map
  ```

- [ ] **Step 2: Commit if needed**

  Only commit if changes were made:

  ```bash
  git add .gitignore
  git commit -m "chore: ensure build artifacts are gitignored"
  ```

---

## Self-Review

**Spec coverage:**

- P1.8 (CI/CD for regroup-functions): Covered ✅

**Security note:** The deploy workflow uses `FIREBASE_TOKEN` (from `firebase login:ci`), not a service account key. This token is scoped to the Firebase project and does not have GCP admin access. Never commit the token to the repo.

**Caching:** `actions/setup-node` with `cache: "npm"` caches `~/.npm` on cache hit. This makes subsequent runs ~2-3x faster.

**Path filters:** Both workflows only trigger when `functions/**` files change, so doc-only commits do not waste CI minutes.
