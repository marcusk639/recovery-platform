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
# npm test (ng test) cannot run: angular.json points Karma at karma.conf.js,
# which has never existed. Specs are typechecked, not executed.
npm run lint                      # TSLint
npm run e2e                       # Protractor E2E tests
```

### Build & Deploy

```bash
npm run build:ssr                 # Production build + SSR server bundle
npm run build                     # Full build: Angular prod + copy hosting + SSR + functions
npm run deploy                    # firebase deploy --only hosting,functions:web:ssr
npm run serve:ssr                 # run dist/sapp/server/main.js
npm run test:scripts              # node --test scripts/copy-ssr-to-functions.test.js
npm run test:ssr                  # render smoke test of functions/dist (after build:ssr,
                                  # functions npm ci, build:copy-to-functions); not in CI
npm run build:deploy              # Build + deploy in one command
```

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
  512MiB, `minInstances: 1`. The min instance replaces cold-start warming — the
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
