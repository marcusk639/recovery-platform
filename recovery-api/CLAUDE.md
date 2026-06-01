# recovery-api/CLAUDE.md

This is the **recovery-api** service within the `recovery-platform` monorepo (`recovery-platform/recovery-api/`). It is a shared Firebase Functions v2 service used by all recovery ecosystem products.

---

## Commands

```bash
npm run build        # Compile TypeScript to lib/ (CommonJS)
npm run build:watch  # Watch mode
npm run serve        # Start Firebase emulator (functions only)
npm run typecheck    # TypeScript type check without emitting
npm test             # Run Jest 29 tests
npm run test:watch   # Jest in watch mode
npm run test:coverage # Jest with coverage
```

## Architecture

Firebase Functions v2 targeting the `recovery-platform` Firebase project.
All callable functions use `requireServiceAuth` for Phase 1 service-key auth.

```
src/
├── index.ts           Re-exports all functions — no serve(), no listen()
├── config.ts          defineSecret(RECOVERY_PLATFORM_API_KEY), setGlobalOptions
├── lib/firebase.ts    Firebase Admin SDK singleton
├── middleware/auth.ts requireServiceAuth — X-Service-Key (Phase 1) + request.auth (Phase 2)
├── entities/          User.ts, Referral.ts — shared TypeScript interfaces
├── callable/          getUserProfile, updateUserProfile, createReferral, getReferrals, getReferral
│                      identity (Phase 2 scaffold — all code commented out, not deployed)
├── http/              health — GET /health liveness probe returning {ok: true, ts: <iso>}
└── triggers/          onUserWrite (Phase 2 scaffold — inactive)
```

## Auth Model

`requireServiceAuth` supports two caller types:

1. **Service-to-service (Phase 1)** — pass `X-Service-Key: <RECOVERY_PLATFORM_API_KEY>`,
   `X-App-Id: homegroups|sober-living`, `X-User-Uid: <uid>`, `X-User-Email: <email>`
2. **Firebase custom token (Phase 2)** — `request.auth` with `appId` custom claim

## Key Conventions

- Build output: `lib/` (CommonJS — required by Firebase Functions)
- No `.js` extensions needed in imports (CommonJS module resolution)
- Test files alongside source as `*.test.ts`
- Firestore doc ID format: `{appId}:{uid}` — prevents cross-app UID collisions
