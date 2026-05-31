# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Regroup** (package name: `sapp`) is an Angular web app for sober living / recovery house management. It includes a marketing site with 6 theme variants, user accounts, Stripe billing, and SSR via Angular Universal.

Stack: Angular 9 · Firebase (Hosting, Cloud Functions, Auth, Firestore) · Stripe (ngx-stripe) · Angular Universal (SSR)

---

## Commands

### Development

```bash
npm start                         # Dev server on 0.0.0.0 (requires --openssl-legacy-provider)
npm run dev:ssr                   # Dev server with SSR
npm test                          # Karma unit tests
npm run lint                      # TSLint
npm run e2e                       # Protractor E2E tests
```

### Build & Deploy

```bash
npm run build:ssr                 # Production build + SSR server bundle
npm run build                     # Full build: Angular prod + copy hosting + SSR + functions
npm run deploy                    # firebase deploy (hosting + functions)
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
  src/index.ts   # Two Cloud Functions: `universal` (SSR) and `warmWebsite` (keep-alive cron)

e2e/             # Protractor E2E tests
```

### Rendering & Deployment

The app runs in two modes:

- **Browser**: `dist/sapp/browser/` — served by Firebase Hosting for static routes
- **SSR**: `dist/sapp/server/main.js` — executed by the `universal` Firebase Cloud Function for dynamic rendering

`server.ts` is the Express entry point for SSR; it uses `domino` to shim `window`/`document` globals in the Node environment. `src/app/app.server.module.ts` bootstraps the server-side module.

### Cloud Functions

This repo's `functions/src/index.ts` defines exactly two functions:

- **`universal`**: HTTP function serving the Angular Universal SSR app
- **`warmWebsite`**: Pub/Sub cron (every minute) that pings the web server to prevent cold starts

All **callable** functions consumed by `CloudFunctionService` (`src/app/services/functions/cloud-function.service.ts`) are implemented in a **separate repo: `regroup-functions`** (deployed to the same `phoenix-cleanhouse` Firebase project). Callables wrapped in this repo's service: `sendConfirmationEmail`, `verifyUserEmail`, `createOperatorSubscription`, `getPaymentMethod`, `updatePaymentInfo`, `cancelUserSubscription`, `reactivateOperatorSubscription`, `createBillingPortalSession`. Modifications to callable logic belong in `regroup-functions`, not here.

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
- **Functions build copies Angular dist**: `functions/package.json` build script runs `rm -r ./dist && cp -r ../dist .` — it copies the root Angular build output into `functions/dist/` so the SSR function can serve it. The Angular app must be built before the functions.
- **Firebase API key in source**: `src/environments/environment.ts` contains the Firebase config with API key inline. This is expected — Firebase API keys are meant to be public (security enforced via Firestore rules and Auth). Do not move them to `.env`.
- **Protractor for E2E**: This project uses Protractor (Angular 9 era), not Playwright or Cypress.
- **TSLint, not ESLint**: Linting uses TSLint (`tslint.json`), which is deprecated but matches the Angular 9 toolchain.
- **No `firestore.rules` in this repo**: Firestore security rules are not checked into this repo. The `security-reviewer` agent flags this as CRITICAL. Treat any new client-side write to a new collection as needing a rule (managed elsewhere).
- **SSR safety**: Any code path that touches `window`, `document`, jQuery, or `Stripe` must be guarded with `isPlatformBrowser(this.platformId)`. The `universal` Cloud Function executes components in Node — unguarded browser-only code throws there. Existing guards live in `AuthGuard`, `MyAccountComponent.openBillingPortal`, header components.

---

## Claude Code Automations (this repo)

- **Hooks** (`.claude/settings.json`):
  - `PreToolUse` Edit|Write → `.claude/hooks/block-prod-env.sh` blocks edits to `environment.prod.ts`.
  - `PostToolUse` Edit|Write → `.claude/hooks/lint-on-edit.sh` runs TSLint on edited `.ts` files (informational, non-blocking).
- **Agent**: `.claude/agents/security/security-reviewer.md` — invoke after editing auth flows, `my-account` component, or any callable that handles PII/Stripe data.
- **Skills**:
  - `firebase-deploy` — `npm run build` then `firebase deploy`; supports `--functions-only` / `--hosting-only`.
  - `new-firestore-service` — scaffolds a service extending `BaseFirestoreService<T>` + spec + entity.
- **MCP** (`.mcp.json`): `context7` for live library docs.
