# homegroups/CLAUDE.md

This is the **Homegroups** product directory within the `recovery-platform` monorepo (`recovery-platform/homegroups/`).

---

**Homegroups** is a React Native mobile app (iOS + Android) for 12-step recovery homegroups. Core concerns: anonymity, group autonomy, and simplicity.

Stack: React Native (TypeScript) · Firebase (Auth, Firestore, Functions, FCM, Storage, Hosting) · Redux Toolkit · Stripe

## Firebase Projects

| Alias   | Project ID               |
| ------- | ------------------------ |
| default | `recovery-connect-cad4b` |

> The project ID `recovery-connect-cad4b`, the iOS bundle `org.recoveryconnect`, and the deep-link scheme `recoveryconnect://` are legacy identifiers retained for store/Firebase continuity. The canonical product name is now **Homegroups**; don't rename these without a coordinated native + backend migration.

---

## Subproject Memory

Per-area commands, architecture, and domain rules live in subdirectory CLAUDE.md files, lazy-loaded by Claude Code when working in those directories:

- [`mobile/CLAUDE.md`](mobile/CLAUDE.md) — React Native app commands, Redux/models architecture, navigation, mobile domain rules (DirectMessage, QR check-in).
- [`functions/CLAUDE.md`](functions/CLAUDE.md) — Cloud Functions commands, callable/trigger architecture, JWT claims, HTTP functions, backend Stripe details, facility callables.
- [`web/CLAUDE.md`](web/CLAUDE.md) — React web app commands, `WEB_ORIGIN` constant, facility dashboard web entry.

## Commands

### Firebase Emulators (root)

```bash
firebase emulators:start          # Starts Firestore :8080, Functions :5001, Auth :9099, Hosting :5000
# Emulator UI at http://localhost:4000
```

---

## Architecture

### Repository Layout

```
mobile/src/
  models/        # Firestore data-access layer (16 models: GroupModel, UserModel, etc.)
  store/slices/  # Redux Toolkit slices (26 total)
  screens/       # UI screens organized by domain
  navigation/    # React Navigation navigators
  types/         # TypeScript types (schema.ts = Firestore doc shapes)

functions/src/
  callable/      # Client-invoked Cloud Functions (90 total)
  triggers/
    auth/        # Auth event triggers (onUserCreated)
    firestore/   # Firestore document write triggers (17 active + 2 commented out: onGroupAdminUpdate, onGroupCreateFetchMeetings)
    pubsub/      # Pub/Sub scheduled functions (14 cron jobs)
    scheduled/   # Legacy scheduled functions (scheduledAnnouncementPublisher)
  http/          # HTTP-only functions (not callable): stripeWebhook + stripeConnectWebhook (same file), getMeetingAttendance
  utils/         # Shared: firebase.ts, stripe.ts, stripeUtils.ts, location.ts
  index.ts       # All function exports (entry point)

web/src/
  pages/         # React web app pages (20 total)
  components/    # Shared UI components
  lib/           # deepLinks.js, WEB_ORIGIN constant

firestore.rules  # Firestore security rules (CRITICAL — test before deploying)
```

### Subproject architecture

Each subproject documents its own architecture in its CLAUDE.md (see [Subproject Memory](#subproject-memory) above). Cross-area summary:

- Mobile (Redux Toolkit + models layer → Firestore) calls Functions callables via `firebase.functions().httpsCallable()`.
- Functions (callables + triggers + HTTP) own all server-side mutations and Stripe state.
- Web (React) is a thin admin/landing surface plus the facility dashboard.

---

## Critical Domain Rules

### Stripe / Subscriptions

- Group admin subscriptions are **$12/year flat rate** (shipped default; `docs/go-to-market/monetization.md` D-1 resolves the launch price to $24/year — activation in progress, see that doc for status).
- Stripe product ID is exported as `productIdGroup` from `functions/src/utils/stripe.ts` (env: `STRIPE_PRODUCT_ID_GROUP`). Price ID is fetched at runtime via `getDefaultPriceForProduct()` — never hardcode it.
- Firestore `groups` document stores `stripeProductIdGroup` (product ID, e.g. `prod_xxx`) and `stripePriceIdGroup` (price ID, e.g. `price_xxx`). These are distinct fields — do not conflate them.
- `SubscriptionStatus` type uses Stripe's spelling: `'canceled'` (one L). Non-Stripe statuses (e.g. business meeting handoffs) use `'cancelled'` (two L's).
- Intergroup subscriptions use `productIdIntergroupA` (env: `STRIPE_PRODUCT_ID_INTERGROUP_A`, tier A = up to 10 groups) and `productIdIntergroupB` (env: `STRIPE_PRODUCT_ID_INTERGROUP_B`, tier B = unlimited, stored as `maxGroups: 9999`). Checkout goes through the `createIntergroup` callable. Upgrades from tier A to tier B go through the `upgradeIntergroupTier` callable.
- Treatment center onboarding also uses `createIntergroup` with `type: "treatment_center"`. The callable accepts optional `successUrl` / `cancelUrl` to redirect to the correct web page after payment. `successUrl` / `cancelUrl` are validated against a server-side allow-list (`ALLOWED_REDIRECT_ORIGINS` in `functions/src/callable/createIntergroup.ts`) — see `docs/LAUNCH_BLOCKERS.md` #5 when switching domains.
- Intergroup documents (`intergroups/{intergroupId}`) use two distinct user-ID fields: `createdBy` (the original creator's UID, immutable) and `adminUids` (array of UIDs with admin access — used by `upgradeIntergroupTier` and other admin-gated callables for permission checks). The creator is added to `adminUids` on creation; additional admins can be added later.
- Each Stripe product must have a **default price** set in the Stripe Dashboard. If no default price is configured, `getDefaultPriceForProduct()` throws `'Product X has no default price set'` and all checkouts for that product fail at runtime. Verify after creating any new Stripe product (group, intergroup tier A, intergroup tier B).

> Area-specific domain rules (JWT claims trigger, HTTP function auth, DirectMessage type, QR check-in, Facility Dashboard internals) live in the relevant subproject CLAUDE.md. Anything that appears in this Critical Domain Rules section spans multiple areas.

---

## Testing Notes

- Mobile tests use Jest with `react-native` preset. Firebase modules are mocked in `jest.setup.js`.
- Firestore security rules tests: `npm run test:rules` wraps `firebase emulators:exec --only firestore` — it starts/stops the emulator automatically (no manual emulator needed).
- E2E tests use Detox (iOS): `npm run test:e2e:build` then `npm run test:e2e:test`.
- E2E tests (Android): `npm run test:e2e:build:android` then `npm run test:e2e:test:android`.

---

## Root-Level Gotchas

- `shared-types.ts` / `shared-utils.ts` at the project root are **only** used by admin/migration scripts in `scripts/`. They are not imported by `mobile/` or `functions/`.
- `scripts/` contains one-off data migration and seeding scripts (not regular dev tooling). Run with `ts-node` from within `scripts/`.
- `web/src/lib/deepLinks.js` exports `WEB_ORIGIN` — this constant and three related files must all change together when switching to a custom domain. See `docs/LAUNCH_BLOCKERS.md` #5 for the full list.

---

## Key Docs

| File                           | Purpose                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `README.md`                    | Feature breakdown, data model, architecture overview                               |
| `docs/DEVELOPMENT.md`          | Full local setup guide                                                             |
| `docs/SECURITY_RULES.md`       | Firestore rules explanation                                                        |
| `docs/BILLING_AND_PAYMENTS.md` | Stripe payment system design                                                       |
| `firestore.rules`              | Deployed security rules — changes require `firebase deploy --only firestore:rules` |

---

## Claude Code Automations

### Hooks (`.claude/settings.json`)

- **PreToolUse**: Blocks edits to `.env` files and lock files (package-lock, pnpm-lock, yarn.lock)
- **PostToolUse**: Auto-formats `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.css`, `.scss`, `.md` with Prettier after every edit
- **PostToolUse**: Runs `tsc --noEmit` after edits to any file under `functions/src/` (errors stream to stderr, first 20 lines shown)

### MCP Servers (`.mcp.json`)

- **detox**: Detox E2E testing integration
- **firebase**: Firebase CLI tools (emulators, deploy, auth, Firestore)
- **context7**: Live documentation lookup for project dependencies

### Skills (`.claude/skills/`)

- `/deploy-functions` — Build, type-check, test, and deploy only changed Cloud Functions
- `/test-rules` — Start Firebase emulator if needed and run Firestore security rules tests
- `/run-emulators` — Start the Firebase emulator suite
- `/e2e-run` — Run Detox end-to-end tests
- `/iterative-review` — Iterative parallel code review loop tuned for RN + Firebase + Functions
- `/business-strategy` — Business strategy / planning skill

### Subagents (`.claude/agents/`)

Organized into `code-quality/` and `security/` subdirectories.

- `code-quality/cloud-function-reviewer` — Reviews Cloud Functions for idempotency, error handling, timeout/memory config, and cold-start optimization
- `code-quality/redux-slice-reviewer` — Reviews Redux Toolkit slices for selector memoization, entity adapter usage, thunk error handling, and state shape
- `security/firestore-rules-reviewer` — Reviews `firestore.rules` for permission gaps, missing auth checks, claims fallback correctness
- `security/stripe-reviewer` — Reviews Stripe code for price/product ID confusion and known regression patterns
