# Web App (Angular)

This directory contains the Angular web app for Regroup. Loaded by Claude Code automatically when working inside `web/`. See `../CLAUDE.md` for project-wide rules.

## Project Overview

**Regroup** (package name: `sapp`) is an Angular web app for sober living / recovery house management. It includes a marketing site with 6 theme variants, user accounts, Stripe billing, and SSR via Angular Universal.

Stack: Angular 9 · Firebase (Hosting, Cloud Functions, Auth, Firestore) · Stripe (ngx-stripe) · Angular Universal (SSR)

---

## Commands

### Development

```bash
npm start                         # Dev server on 0.0.0.0 (requires --openssl-legacy-provider)
npm run dev:ssr                   # Dev server with SSR
npx tsc --noEmit -p tsconfig.spec.json  # What CI runs: typecheck the specs
npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/e2e-env.spec.ts
# Karma runs headless. CI only typechecks specs: the full suite is not green yet.
npm run lint                      # TSLint
npm run e2e                       # Protractor E2E tests
```

### Build & Deploy

```bash
npm run build:ssr                 # Production build + SSR server bundle
npm run build                     # Full build: Angular prod + copy hosting + SSR + functions
npm run deploy                    # firebase deploy --only hosting,functions:web:ssr (see the
                                  # firebase-tools note in Gotchas)
npm run serve:ssr                 # run dist/sapp/server/main.js
npm run test:scripts              # node --test on the four scripts/*.test.js files listed in
                                  # package.json (copy, bundle check, staging config generator,
                                  # deploy-config invariants); CI runs it in regroup/web — typecheck
npm run test:ssr                  # render smoke test of functions/dist (after build:ssr,
                                  # functions npm ci, build:copy-to-functions); not in CI
npm run build:deploy              # Build + deploy in one command
```

`.firebaserc` defaults to `phoenix-cleanhouse`, so `npm run deploy` and `npm run build:deploy` deploy to **production**. Staging deploys always name `--project regroup-e2e`.

### Staging (`regroup-e2e`)

Deployed at <https://regroup-e2e.web.app>. Both halves (browser and SSR server) are built against staging. The bundle also carries production's whole environment object, including its `pk_live_` publishable key, unused: `e2e-staging-guard.ts` imports `environment.prod.ts` to refuse those values in the staging config.

Inputs, outside the repo in `~/.config/regroup-e2e/` (directory mode 700, files 600, never committed):

- `firebase-web-config.json`: the `regroup-e2e` web app's Firebase config (`firebase apps:sdkconfig WEB --project regroup-e2e`).
- `stripe-e2e-publishable-key.txt`: the e2e Stripe sandbox's `pk_test_` key, the bare value on one line. Without it the generator writes a placeholder: pages render, checkout doesn't work, and the staging deploy check refuses the build.

Committed: `functions/.env.regroup-e2e` (`SSR_MIN_INSTANCES=0`), so staging keeps no standing instance and the deploy doesn't need `--force`, and `functions/.env.phoenix-cleanhouse` (`SSR_MIN_INSTANCES=1`). Every deploy project needs its file: a non-interactive deploy refuses a param with no value, whatever its default. These files do not contain secrets and can be committed to git and github. They hold non-secret params only; secrets go in Secret Manager (`defineSecret`), never in these files.

```bash
npm run gen:e2e-staging           # writes src/environments/e2e-staging.generated.ts (gitignored),
                                  # applying e2e-staging-guard.ts's rules first: regroup-e2e
                                  # project, authDomain and bucket, no production value, pk_test_
npm run build:ssr:e2e-staging     # e2e-staging browser + server builds, then
                                  # scripts/verify-ssr-target.js on dist/sapp/*
(cd functions && npm ci && npx tsc)  # the smoke test resolves the bundle's externals from here
npm run build:copy-to-functions && npm run test:ssr   # local render smoke (/, /pricing, /signup, /login)
firebase deploy --project regroup-e2e --only hosting,functions:web:ssr --non-interactive
```

`dist/` and `functions/dist/` hold whichever build ran last, so rebuild with `npm run build` before any production deploy. The `predeploy` hooks in `firebase.json` refuse a bundle built for another project; they don't check that the build is fresh. Every hosting or functions deploy runs `verify-ssr-target.js --expect "$GCLOUD_PROJECT"` on everything that ships (`dist/sapp/browser`, `functions/dist/sapp/browser`, `functions/dist/sapp/server`), and requires the function's SSR template to be the hosted `index.html`. What each root needs:

- `regroup-e2e`: the staging id and web API key, and no placeholder Stripe key.
- `phoenix-cleanhouse`: the production id and the `pk_live_` key from `environment.prod.ts` (so a dev-mode `ng build` is refused), and nothing containing `regroup-e2e`.
- any other project: its id, and nothing containing `regroup-e2e`.

The staging builds use the production build settings (optimized, hashed, no source maps) and production mode; only the environment file differs. `scripts/deploy-config.test.js` holds that parity, the predeploy wiring, and a param value per project.

### Cloud Functions (`cd functions`)

```bash
npm run build                     # Compile TS (also copies Angular dist into functions/dist)
npm run serve                     # Build + start Firebase emulator
npm run deploy                    # Deploy functions only
```

---

## Architecture

### Repository Layout

```
src/app/
  components/    # UI components (accounts, billing, blogs, pricing, etc.)
  entities/      # Data models (House, Room, Guest, User, Meeting, Phase, etc.)
  guards/        # Route guards (AuthGuard)
  services/      # Angular services (app, auth, contact, functions, house, subscriptions)
  themes/        # 6 landing page theme variants (theme-one through theme-six)
  util/          # Shared utilities

functions/
  src/index.ts   # One Cloud Function: `ssr` (Angular Universal SSR). Deployed under
                 # the `web` codebase, NOT `default` — see firebase.json.

e2e/             # Protractor E2E tests
```

### Rendering & Deployment

The app runs in two modes:

- **Browser**: `dist/sapp/browser/` — Hosting serves the JS/CSS/asset files directly.
  `index.html` is deliberately in `firebase.json`'s `ignore` list so it is NOT uploaded:
  Hosting matches static files before rewrites, so an uploaded `index.html` would make
  `/` serve the un-rendered CSR shell while every other route rendered server-side.
- **SSR**: `dist/sapp/server/main.js` — executed by the `ssr` Cloud Function. Hosting
  rewrites `**` to it, so every route with no matching static file is server-rendered.

`server.ts` is the Express entry point for SSR; it uses `domino` to shim `window`/`document` globals in the Node environment. `src/app/app.server.module.ts` bootstraps the server-side module.

### Cloud Functions

This package's `functions/src/index.ts` defines exactly one function:

- **`ssr`**: HTTP function serving the Angular Universal SSR app. v2, `us-central1`,
  512MiB, `minInstances` from the `SSR_MIN_INSTANCES` param, set per project in
  `functions/.env.<projectId>` (1 for `phoenix-cleanhouse`, 0 for `regroup-e2e`). The min instance replaces cold-start warming — the
  former `warmWebsite` cron in this package only pinged a dev URL, and the
  `warmWebsite` that is actually deployed (from `../functions`) makes no HTTP
  request at all, so neither ever warmed this function.

**Deployed under the `web` codebase.** `../functions` owns the `default` codebase.
Firebase deletes any function missing from the codebase being deployed, so if both
packages shared `default`, deploying either would delete the other's functions —
a web deploy would have removed all ~51 backend functions. Keep them separate.

Do not confuse the `ssr` function with `universal` in `../functions`: that one is a
health-check catch-all (`/health`, `/healthz`) with no SSR logic, despite the name.

All **callable** functions consumed by `CloudFunctionService` (`src/app/services/functions/cloud-function.service.ts`) are implemented in the sibling `../functions/` directory within the monorepo (deployed to the same `phoenix-cleanhouse` Firebase project). Modifications to callable logic belong in `../functions/` (see `../functions/CLAUDE.md`), not here.

`CloudFunctionService` wraps nine callables, but only three are reachable from the UI: `createOperatorSubscription` (`BillingInfoComponent.buy()`), `getTierCatalog` (`TierCatalogService`), and `createBillingPortalSession` (`MyAccountComponent.openBillingPortal`). The other six (`updatePaymentInfo`, `cancelUserSubscription`, `reactivateOperatorSubscription`, `getPaymentMethod`, `verifyUserEmail`, `sendConfirmationEmail`) have no caller; billing self-service is delegated to the Stripe portal, so confirm that before wiring one up. The former standalone `regroup-functions` repo has been merged into the monorepo and archived at `regroup/_legacy/regroup-functions` — do not edit the archived copy.

### Data Layer

All Firestore services extend `BaseFirestoreService<T>` (`src/app/services/base-service.ts`), which wraps a named Firestore collection with typed CRUD operations (`get`, `getByAttribute`, `create`, `update`, `delete`, `add`).

### Authentication & Authorization

`AuthService` extends `BaseFirestoreService<User>` and manages Firebase Auth state. The `User` entity uses boolean flags (`isAdmin`, `isGuest`, `isSuperAdmin`) and relational IDs (`adminId`, `guestId`, `houseId`) to encode role membership. `AuthGuard` protects the `/my-account` route.

Auto-login calls `doAutoLogin()` which sets Firebase persistence then resolves `onAuthStateChanged` to rehydrate the user from Firestore.

### Domain Model

- **Operators** (admins) manage Houses, Rooms, and Residents
- **Residents** (guests) live in houses and participate in chores, meetings, phases
- **Subscription** billing (Stripe) is per-operator; `OperatorSubscription` tracks Stripe customer/subscription IDs on the `User` entity
- Schema validation uses `yup` on entities (see `src/app/entities/`)

### Key Services

| Service                | Collection      | Purpose                               |
| ---------------------- | --------------- | ------------------------------------- |
| `AuthService`          | `users`         | Auth state, login/signup, user CRUD   |
| `HouseService`         | `houses`        | House lookup by ID                    |
| `SubscriptionService`  | `subscriptions` | Email capture, pricing config         |
| `CloudFunctionService` | —               | Wraps all callable Firebase Functions |
| `ModalService`         | —               | App-level modal state                 |
| `LocalStorageService`  | —               | Browser localStorage wrapper          |

### Routing & Themes

Flat route structure in `app-routing.module.ts`. Default route (`/`) renders `ThemeTwoComponent`. Six landing page variants (`theme-one` through `theme-six`) are accessible at `/theme-{name}`. Auth-protected route: `my-account` (uses `AuthGuard`).

---

## Gotchas

- **Local firebase-tools is 8.2.0**: `npm run deploy` and the other npm scripts use `node_modules/.bin/firebase` (`firebase-tools ^8.0.0`), which predates functions codebases and params. The staging deploys above used the global CLI (15.x). Unverified whether 8.2.0 can deploy this package at all: use the global `firebase` for deploys until it is upgraded or checked.
- **`--openssl-legacy-provider` required**: Every build/serve command sets `NODE_OPTIONS=--openssl-legacy-provider` because the Angular 9 toolchain uses a legacy OpenSSL hash function. Running `ng serve` directly without this flag will fail.
- **Functions build copies Angular dist**: `functions/package.json` build is `tsc && cd .. && npm run build:copy-to-functions` (`scripts/copy-ssr-to-functions.js`), which copies the Angular build output into the functions package. The Angular app must be built before the functions.
- **Firebase API key in source**: `src/environments/environment.ts` contains the Firebase config with API key inline. This is expected — Firebase API keys are meant to be public (security enforced via Firestore rules and Auth). Do not move them to `.env`.
- **Protractor for E2E**: This project uses Protractor (Angular 9 era), not Playwright or Cypress.
- **TSLint, not ESLint**: Linting uses TSLint (`tslint.json`), which is deprecated but matches the Angular 9 toolchain.
- **No `firestore.rules` in `web/`**: the shared Regroup rules live in `../mobile/firebase/firestore.rules` (a `security-reviewer` "no rules" flag scoped to `web/` is a false positive). Any new client-side write to a new collection needs a rule there.
- **SSR safety**: Any code path that touches `window`, `document`, jQuery, or `Stripe` must be guarded with `isPlatformBrowser(this.platformId)`. The `ssr` Cloud Function executes components in Node — unguarded browser-only code throws there. Existing guards live in `AuthGuard`, `MyAccountComponent.openBillingPortal`, header components.

---

## Claude Code Automations

Hooks in `.claude/settings.json`: `block-prod-env.sh` blocks edits to `environment.prod.ts`; `lint-on-edit.sh` runs TSLint on edited `.ts` files (non-blocking). Agent: `.claude/agents/security/security-reviewer.md`.
