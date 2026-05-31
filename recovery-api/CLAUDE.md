# recovery-api/CLAUDE.md

This is the **recovery-api** service within the `recovery-platform` monorepo (`recovery-platform/recovery-api/`). It is a shared Hono.js REST API used by all recovery ecosystem products.

---

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile to dist/ with tsup (ESM + type declarations)
npm run start        # Run compiled production server
npm run typecheck    # TypeScript type check without emitting
npm test             # Run Jest 29 tests (requires Node 18+)
npm run test:watch   # Jest in watch mode
npm run test:coverage # Jest with coverage report
```

Test files live alongside source files as `*.test.ts`. The `NODE_OPTIONS=--experimental-vm-modules` flag (set in the npm script) is required for Jest to handle ESM. Config is in `jest.config.cjs` (`.cjs` so Node treats it as CommonJS regardless of `"type": "module"`).

Local env: copy `env.example` to `.env.local` and fill in values. `service-account.json` is gitignored — download it from Firebase Console.

## Architecture

Single-process Hono API server targeting **Cloud Run**. All routes under `/api/*` are Firebase-authenticated; `/health` is public.

```
src/
├── index.ts              # App bootstrap: CORS, middleware, route mounting, error handlers
├── lib/
│   └── firebase.ts       # Firebase Admin SDK singleton → exports db (Firestore) and auth
├── middleware/
│   └── auth.ts           # requireAuth middleware (see Auth model below)
└── routes/
    ├── health.ts          # GET /health — liveness probe
    ├── referrals.ts       # POST/GET /api/referrals — cross-app client referrals
    └── users.ts           # GET/PUT /api/users/me — shared user profile
```

## Auth Model

`requireAuth` supports two caller types:

1. **End-user (Firebase JWT)** — pass `Authorization: Bearer <idToken>`. The middleware verifies with Firebase Auth and injects `uid` + `email` into the Hono context.
2. **Service-to-service** — pass `X-Service-Key: <INTERNAL_API_KEY>`. Sets `uid = "system"` and skips Firebase verification. Used by other ecosystem apps (treatment-center, phoenix-cleanhouse, homegroups) calling this API directly.

Hono context types are extended via `ContextVariableMap` in `auth.ts`, so `c.get("uid")` is typed throughout route handlers.

## Key Conventions

- **Module imports**: Always use `.js` extension on local imports (e.g., `../lib/firebase.js`). This is required by NodeNext module resolution — TypeScript resolves the `.ts` file, Node runs the compiled `.js`.
- **Request validation**: Use `@hono/zod-validator` with Zod schemas. Validated body is accessed via `c.req.valid("json")`, not `c.req.json()`.
- **Firestore access**: Import `db` from `src/lib/firebase.ts`. No ORM — use the Admin SDK directly.
- **Environment**: `PORT` defaults to 8080 (Cloud Run sets it automatically). `ALLOWED_ORIGINS` is a comma-separated list parsed at startup.
- **Firebase credentials**: Locally, set `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json`. On Cloud Run, leave unset — Application Default Credentials handle auth automatically.

## Target Apps (Referral System)

The `toApp` field in referrals is constrained to: `treatment-center`, `phoenix-cleanhouse`, `homegroups`. These are the other apps in the recovery ecosystem that share this API.

## Project-Scoped Agents

| Agent             | Path                                | Activation                                                          | Purpose                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-tdd-guide` | `.claude/agents/route-tdd-guide.md` | Triggers on Edit/Write to `src/routes/*.ts` (excluding `*.test.ts`) | Refuses route implementation edits when no corresponding `src/routes/*.test.ts` exists. Closes the 0%-business-logic-coverage gap between "Jest 29 ESM is configured" and "tests are actually written." Reference test style is `src/routes/health.test.ts` (Hono Web-Fetch pattern — `app.fetch(req)`, NOT supertest). |

If you're working on a new route handler, invoke `route-tdd-guide` first, write the failing test it scaffolds, then implement.
