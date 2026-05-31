# Recovery Platform — Cloud Functions Design

**Date:** 2026-05-31  
**Repo:** `recovery-shared-api`  
**Status:** Approved, pending implementation

---

## Overview

`recovery-shared-api` is being migrated from a Hono/Cloud Run server to Firebase Cloud Functions v2, deployed to a dedicated Firebase project (`recovery-platform`). It will serve as the shared identity layer and shared feature platform for two apps:

- **RecoveryConnect** (`homegroups`) — AA/NA meeting management
- **regroup-rn7** (`sober-living`) — sober living house management

These apps currently have overlapping but independent user accounts. The platform is designed to support cross-app identity linking in the future without requiring a data migration.

---

## Architecture

### Firebase Project: `recovery-platform`

A new dedicated Firebase project — neither app owns it. Both call into it.

```
recovery-platform/
  Cloud Functions v2       ← callable + HTTP + triggers
  Firebase Auth            ← future shared identity provider
  Firestore                ← canonical shared data store
```

### Repository Structure

Replaces the current Hono/ESM layout. Follows the `firebase-functions` v2 pattern already established in `RecoveryConnect/functions` and `regroup-functions`.

```
src/
├── index.ts              # Pure re-export file — no serve(), no listen()
├── config.ts             # defineSecret(), setGlobalOptions(), env validation
├── lib/
│   └── firebase.ts       # Firebase Admin SDK singleton
├── callable/             # Firebase callable functions (SDK-invoked, auth context injected)
│   ├── users.ts          # getUserProfile, updateUserProfile
│   ├── referrals.ts      # createReferral, getReferrals, getReferral
│   └── identity.ts       # findLinkedAccounts — Phase 2, scaffold now
├── http/                 # HTTP functions (REST, webhooks, liveness)
│   └── health.ts         # GET /health — liveness probe
├── triggers/             # Firestore / Auth event triggers
│   └── onUserWrite.ts    # Account link detection on user upsert — Phase 2
└── entities/             # Shared TypeScript types
    ├── User.ts
    └── Referral.ts
```

**Dependencies removed:** `hono`, `@hono/node-server`, `@hono/zod-validator`, `tsup`, `tsx`  
**Dependencies added:** `firebase-functions` v2  
**Build:** `tsc` → `lib/` (CommonJS, matching existing Firebase Functions projects)  
**Tests:** Jest 29 stays; `jest.config.cjs` pattern stays; test files remain alongside source as `*.test.ts`

---

## Auth Design

### Phase 1 (now) — Service-Key + App-Asserted Identity

Both apps call the shared platform as a trusted service caller. Each request carries:

```
X-Service-Key: <RECOVERY_PLATFORM_API_KEY>   // verifies caller is a trusted app
X-App-Id: homegroups | sober-living          // declares which app is calling
X-User-Uid: <uid>                            // uid from that app's Firebase Auth
X-User-Email: <email>                        // for future cross-app identity matching
```

The shared platform trusts the app-level service key rather than re-verifying the user's Firebase token cross-project. The calling app's backend already verifies the user's token — this is a gateway trust pattern. `requireServiceAuth` middleware replaces the current `requireAuth` middleware and extracts `appId`, `uid`, and `email` into the function context.

Firebase callable functions accept plain HTTPS POST requests with `{"data": {...}}` envelope format, so the same functions in `src/callable/` serve both phases — `requireServiceAuth` checks for `X-Service-Key` in Phase 1 and falls back to `request.auth` in Phase 2. No separate HTTP function layer is needed for service-to-service calls.

### Phase 2 (future) — Custom Token Exchange

When account linking ships as a user-facing feature:

1. The calling app's backend mints a **custom Firebase token** for `recovery-platform` using the shared project's service account. The token encodes `appId`, original `uid`, and `email` as custom claims.
2. The RN client exchanges its current app token for a platform token (one extra SDK call on first cross-app action).
3. Callable functions verify natively via the Firebase SDK — no custom middleware needed for new callables.
4. The `X-Service-Key` path remains for server-to-server calls that are not user-initiated.

**No user accounts need to migrate.** Users keep their existing credentials in their home app.

---

## Firestore Data Model

### `users` collection

Document ID: `{appId}:{uid}` — unambiguous, no cross-app UID collisions.

```typescript
users/{appId}:{uid}
{
  uid: string                                          // uid from calling app's Firebase Auth
  appId: "homegroups" | "sober-living"
  email: string                                        // INDEXED — cross-app linking key
  displayName?: string
  sobrietyDate?: string                                // ISO date string "YYYY-MM-DD"
  homeApp: string
  linkedProfileId?: string                             // future: accountLinks doc reference
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

`email` must be indexed from day one. A query by email across all user docs reveals whether the same person has an account in another app.

### `referrals` collection

```typescript
referrals/{referralId}
{
  fromApp: "homegroups" | "sober-living"
  toApp: "treatment-center" | "phoenix-cleanhouse" | "homegroups" | "sober-living"
  referredBy: string          // uid
  referredByApp: string       // appId — uid alone is ambiguous across projects
  clientName: string
  clientEmail: string
  condition?: string
  notes?: string
  status: "pending" | "accepted" | "declined"
  createdAt: Timestamp
  updatedAt?: Timestamp
}
```

`toApp` now includes `"sober-living"` — regroup is a valid referral target, not just a caller.

### `accountLinks` collection (Phase 2, scaffolded now)

Document ID: SHA-256 hash of the normalized email — keeps PII out of document paths (which appear in logs and audit trails).

```typescript
accountLinks/{sha256(lowercase(email))}
{
  emailHash: string
  accounts: Array<{
    appId: string
    uid: string
    linkedAt: Timestamp
  }>
  createdAt: Timestamp
}
```

This collection stays empty in Phase 1 but must be present in Firestore security rules and composite index definitions from the start.

---

## Integration: Required Changes in Other Repos

### `~/dev/regroup-functions`

Nothing in regroup communicates with the shared platform until these changes are in place.

#### 1. Add secret: `RECOVERY_PLATFORM_API_KEY`

In `src/config.ts`, alongside the existing `RATS_API_KEY`:

```typescript
export const RECOVERY_PLATFORM_API_KEY = defineSecret(
  "RECOVERY_PLATFORM_API_KEY",
);
```

Add to `setGlobalOptions({ secrets: [..., RECOVERY_PLATFORM_API_KEY] })` in `src/index.ts`.

Set the secret value before deploying:

```bash
firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
```

#### 2. Add utility: `src/util/sharedPlatform.ts`

A typed HTTP client for calling recovery-platform HTTP functions. Follows the same pattern already used in `src/callable/homegroups.ts` (the RecoveryConnect `getMeetingAttendance` bridge).

- Wraps `fetch` with headers: `X-Service-Key`, `X-App-Id: sober-living`, `X-User-Uid`, `X-User-Email`
- Base URL read from `RECOVERY_PLATFORM_URL` env var — set to the Firebase emulator URL locally, production Cloud Functions URL in prod
- Throws `HttpsError` with appropriate codes on failure (mirror the error handling in `homegroups.ts`)

#### 3. Add callable: `src/callable/sharedProfile.ts`

Thin wrappers that proxy `getUserProfile` and `updateUserProfile` to the shared platform. regroup-rn7 calls these via the existing regroup Firebase SDK — no second Firebase app initialization needed in the RN client.

Export from `src/index.ts`:

```typescript
export * from "./callable/sharedProfile";
```

#### 4. Add callable: `src/callable/referrals.ts`

Wrappers for `createReferral`, `getReferrals`, `getReferral`. regroup currently has no referral layer — this is net-new functionality.

Export from `src/index.ts`:

```typescript
export * from "./callable/referrals";
```

#### 5. Add trigger: `src/triggers/firestore/onUserCreate.ts`

When a new regroup user is created (Auth `onCreate` or first Firestore write), fire-and-forget a POST to the shared platform to upsert the user profile. This seeds `users/sober-living:{uid}` in the shared Firestore so email-based identity matching works from the moment the user exists.

Export from `src/index.ts`:

```typescript
export * from "./triggers/firestore/onUserCreate";
```

---

### `~/dev/regroup-rn7`

regroup-rn7 routes all shared-platform calls through `regroup-functions` rather than calling `recovery-platform` directly. This keeps the RN app pointed at a single Firebase project, avoiding the complexity of a named secondary `FirebaseApp` instance and split auth state.

#### 1. Add service: `src/services/sharedProfile.ts`

Calls the new regroup-functions callable wrappers (`getUserProfile`, `updateUserProfile`). Any screen that currently reads or writes shared profile fields directly to local Firestore must migrate to this service.

**Files to audit and update:**

- `src/services/users.tsx` — remove direct Firestore writes for `sobrietyDate`, `displayName`, `homeApp`; delegate to `sharedProfile.ts`
- Run the following to find all direct writes to the local users collection:
  ```bash
  grep -rn "userCollection" src/
  ```
  Each result that touches shared profile fields needs to route through `sharedProfile.ts` instead.

#### 2. Add service: `src/services/referrals.ts` (net-new)

Calls the regroup-functions `createReferral` / `getReferrals` / `getReferral` callables. No existing file to migrate — this is entirely new UI surface. Corresponding screens and navigation are out of scope for this spec and will be designed separately.

#### 3. Environment config

Add `RECOVERY_PLATFORM_PROJECT_ID` to the app's environment configuration (`.env`, `app.json` extras, or Firebase Remote Config). Not consumed in Phase 1 but required for Phase 2 when the RN client needs to initialize a callable connection to `recovery-platform` directly.

---

## Migration Map: `recovery-shared-api`

| Current (Hono/Cloud Run)                 | Target (Firebase Functions v2)                  |
| ---------------------------------------- | ----------------------------------------------- |
| `src/index.ts` — `serve(app)`            | `src/index.ts` — re-exports only                |
| `src/middleware/auth.ts` — `requireAuth` | `src/middleware/auth.ts` — `requireServiceAuth` |
| `src/routes/health.ts`                   | `src/http/health.ts`                            |
| `src/routes/users.ts`                    | `src/callable/users.ts`                         |
| `src/routes/referrals.ts`                | `src/callable/referrals.ts`                     |
| `tsup` build                             | `tsc` → `lib/`                                  |
| `npm run dev` (tsx watch)                | `firebase emulators:start`                      |

Business logic (Zod schemas, Firestore queries) transfers directly — only the transport layer and export shape change.

---

## What Is Not Changing

- **`~/dev/RecoveryConnect`** — no changes required for Phase 1. RecoveryConnect can integrate with `recovery-platform` using the same `X-Service-Key` pattern as regroup-functions when cross-app features are needed, following the pattern already established in `regroup-functions/src/util/sharedPlatform.ts`.
- **Firebase Auth in each app's existing project** — no migration, no disruption to existing users in either app.
- **regroup-rn7 Firebase SDK initialization** — continues to point at the regroup Firebase project only.
