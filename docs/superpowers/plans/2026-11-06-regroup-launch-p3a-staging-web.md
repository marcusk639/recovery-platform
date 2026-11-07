# Regroup Launch P3a: Staging Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the Regroup web app to the `regroup-e2e` staging project, built and rendered entirely against staging. P3's mobile round trip then has a web checkout to run against.

**Architecture:**

- The browser build already has an `e2e-staging` configuration, guarded at import time by `assertE2eStagingConfig`.
- The server-render (SSR) build has only `production`. Add an `e2e-staging` server configuration.
- Add a build script that uses `e2e-staging` for both halves, plus a bundle check that refuses any half missing the staging identifiers.
- Deploy hosting and the `web` codebase's `ssr` function to `regroup-e2e` only.

**Tech Stack:** Angular 9 SSR (`ng run sapp:server`), Node `node --test`, Firebase Hosting and Functions (codebase `web`).

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` §3.5 (staging is missing web), §4.3 (walking skeleton: "first needs an `e2e-staging` server (SSR) configuration … for both halves"), §6 (nothing touches production). Roadmap: P3, the web and server half.

## Global Constraints

- See the roadmap.
- Deploy **only** to `--project regroup-e2e`. Never to `phoenix-cleanhouse`: the production deploy freeze and P8 own production.
- `e2e-staging.generated.ts` stays gitignored, because it's generated.
- Web SSR deploys are codebase-qualified: `--only hosting,functions:web:ssr`.
- **Each half of a staging bundle must carry the staging identifiers:** the `regroup-e2e` project id and the staging web API key from `e2e-staging.generated.ts`. Production identifiers can't be used as a deny-list: `e2e-staging-guard.ts` embeds `phoenix-cleanhouse`, `155667333239` and production's API key in every staging bundle as the values it refuses.

**Already done (verified 2026-11-06):** the sandbox prices, the sandbox half of A3.

- All 12 tier prices exist in the e2e sandbox, active, with annual at ten times monthly and no trial on any Price (`~/.config/regroup-e2e/stripe-e2e-prices.json`).
- The staging functions config uses exactly those IDs, with `TIER_BILLING_ENABLED=true`.

## Review Focus

1. **A staging build that silently falls back to `environment.ts` or `environment.prod.ts`** in one of the two halves. The bundle check inspects **both** the browser and the server output, and needs the staging API key in each.
2. **Config that lives only in a lazy chunk,** not the main bundle. The check scans every `.js` file under `dist/sapp/browser` and `dist/sapp/server`.
3. **Deploying to the wrong project.** The deploy step names `--project regroup-e2e` explicitly, and the smoke test checks the served bundle for `regroup-e2e`.

---

### Task 1: The `e2e-staging` SSR configuration, build script, and bundle check

**Files:**

- Create: `regroup/web/scripts/verify-ssr-target.js`
- Test: `regroup/web/scripts/verify-ssr-target.test.js`
- Modify: `regroup/web/angular.json`: `projects.sapp.architect.server.configurations.e2e-staging`, with the same `fileReplacements` as the browser `e2e-staging`, plus `outputHashing: media`, `sourceMap: false`, `optimization: true`.
- Modify: `regroup/web/package.json`:
  - `build:ssr:e2e-staging` runs `ng build --configuration e2e-staging && ng run sapp:server:e2e-staging && node scripts/verify-ssr-target.js --expect regroup-e2e`;
  - add the new test to `test:scripts`.

**Interfaces:**

- `checkTree(rootDirs, { expect, forbid })` and `verify({ project, roots, identical })` in `scripts/verify-ssr-target.js`, which runs after the staging build and as the hosting and functions predeploy. What each project's bundle must and must not contain, and the CLI, are in the script's header and in `regroup/web/CLAUDE.md` § Staging. Only a `regroup-e2e` check reads the generated config; a `phoenix-cleanhouse` check reads `environment.prod.ts` for the `pk_live_` key.
- `gen-e2e-staging-config.js` writes that generated file from `~/.config/regroup-e2e/` (tests: `gen-e2e-staging-config.test.js`).

- [x] **Step 1:** Write failing tests with fixture trees in `os.tmpdir()`:
  - a staging tree passes, even with production identifiers present (the guard's deny-list);
  - a server half built against another environment fails, naming each missing identifier;
  - an empty or missing root fails.
- [x] **Step 2:** `cd regroup/web && node --test scripts/verify-ssr-target.test.js`. Expected: FAIL.
- [x] **Step 3:** Implement it.
- [x] **Step 4:** Same command. Expected: PASS.
- [x] **Step 5:** Add the angular server configuration and the script. Run `npm run gen:e2e-staging`, then `npm run build:ssr:e2e-staging`. Expected: both builds succeed and the check passes.
- [x] **Step 6:** Commit: `feat(regroup-web): e2e-staging SSR build with a staging-target bundle check` (102fdac7).

### Task 2: Deploy to `regroup-e2e` and smoke it

- [x] **Step 1:** `npm run build:copy-to-functions && npm run test:ssr`. Expected: the SSR render smoke passes locally against the staging server bundle.
- [x] **Step 2:** `firebase deploy --project regroup-e2e --only hosting,functions:web:ssr`. Needs `functions/.env.regroup-e2e` (`SSR_MIN_INSTANCES=0`). Without a value for the param, a `--non-interactive` deploy refuses and an interactive one prompts; with `minInstances: 1` it would also need `--force`, because that raises the minimum bill. Expected: the deploy completes, and the hosting URL is `https://regroup-e2e.web.app`.
- [x] **Step 3:** Smoke the deployed site. `/`, `/pricing` and `/signup` return 200 with content inside `<app-root>`. The served main JS bundle contains `regroup-e2e` and the staging API key, and no placeholder key (production markers are expected: see the Task 1 ruling).
- [x] **Step 4:** Record the result in spec §3.5 (staging web is deployed, with the date) and in the roadmap's P3 row.

### Task 3: Document the staging web deploy

- [x] **Step 1:** Add a "Staging (`regroup-e2e`)" section to `regroup/web/CLAUDE.md`, or the web README if CLAUDE.md has no deploy section:
  - generate the config;
  - `npm run build:ssr:e2e-staging`;
  - copy and smoke;
  - deploy with `--project regroup-e2e`;
  - never deploy a staging build to production, and the bundle check enforces the converse.
- [x] **Step 2:** Commit with the spec and roadmap updates: `docs(regroup): staging web deploy`.
