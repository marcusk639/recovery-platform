# recovery-api Firebase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `recovery-platform/recovery-api/` from Hono/Cloud Run to Firebase Functions v2, restructuring routes into callable functions and an HTTP health endpoint.

**Architecture:** Replace the Hono app server with Firebase Functions v2 callables (`onCall`) for user profile and referral operations, and an HTTP function for the liveness probe. Business logic (Zod schemas, Firestore queries) transfers directly — only the transport layer and export shape change. The new `requireServiceAuth` middleware reads `X-Service-Key` + `X-App-Id` + `X-User-Uid` headers for Phase 1 and falls back to `request.auth` for Phase 2.

**Tech Stack:** TypeScript, Firebase Functions v2, Firebase Admin SDK, Zod, Jest 29

**All files are under `recovery-platform/recovery-api/` unless noted.**

**Spec:** `docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md`

---

## File Structure

```
src/
├── index.ts              REPLACE — re-exports only, no serve()
├── config.ts             CREATE — defineSecret, setGlobalOptions
├── lib/
│   └── firebase.ts       KEEP — Admin SDK singleton, no changes needed
├── middleware/
│   └── auth.ts           REPLACE — requireServiceAuth replaces requireAuth
├── entities/
│   ├── User.ts           CREATE — shared TypeScript interface
│   └── Referral.ts       CREATE — shared TypeScript interface
├── callable/
│   ├── users.ts          CREATE (from src/routes/users.ts)
│   ├── users.test.ts     CREATE
│   ├── referrals.ts      CREATE (from src/routes/referrals.ts)
│   ├── referrals.test.ts CREATE
│   └── identity.ts       CREATE — Phase 2 scaffold (empty)
├── http/
│   ├── health.ts         CREATE (from src/routes/health.ts)
│   └── health.test.ts    CREATE (replaces src/routes/health.test.ts)
└── triggers/
    └── onUserWrite.ts    CREATE — Phase 2 scaffold (commented out)

DELETE: src/routes/health.ts, src/routes/health.test.ts,
        src/routes/users.ts, src/routes/referrals.ts

UPDATE: package.json, tsconfig.json, jest.config.cjs
CREATE: firebase.json, .firebaserc
```

---

### Task 1: Update build system (package.json, tsconfig.json, jest.config.cjs)

**Files:**

- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `jest.config.cjs`

- [ ] **Step 1: Replace package.json**

```json
{
  "name": "recovery-shared-api",
  "version": "0.1.0",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "18" },
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "serve": "firebase emulators:start --only functions",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^6.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "@types/node": "^18.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Replace tsconfig.json**

Firebase Functions require CommonJS output. Remove NodeNext/ESM settings.

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2017"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "lib"]
}
```

- [ ] **Step 3: Replace jest.config.cjs**

Remove the `NODE_OPTIONS=--experimental-vm-modules` workaround — no longer needed with CommonJS.

```js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};
```

- [ ] **Step 4: Install dependencies**

```bash
cd recovery-platform/recovery-api
npm install
```

Expected: `node_modules/firebase-functions/` appears. `hono`, `tsup`, `tsx` are gone.

- [ ] **Step 5: Verify typecheck passes with empty src**

```bash
npm run typecheck
```

Expected: PASS (no source files yet to type-check against new config).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json jest.config.cjs package-lock.json
git commit -m "chore(recovery-api): swap build system ESM/tsup → CJS/tsc for Firebase Functions"
```

---

### Task 2: Create src/config.ts and firebase.json + .firebaserc

**Files:**

- Create: `src/config.ts`
- Create: `firebase.json`
- Create: `.firebaserc`

- [ ] **Step 1: Write src/config.ts**

```typescript
/**
 * Firebase Secret Manager definitions for recovery-platform functions.
 * Set before deploying:
 *   firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
 *
 * Access at runtime via process.env.RECOVERY_PLATFORM_API_KEY
 */
import { defineSecret, setGlobalOptions } from "firebase-functions/v2";

export const RECOVERY_PLATFORM_API_KEY = defineSecret(
  "RECOVERY_PLATFORM_API_KEY",
);

setGlobalOptions({
  region: "us-central1",
  secrets: [RECOVERY_PLATFORM_API_KEY],
});
```

- [ ] **Step 2: Write firebase.json**

```json
{
  "functions": [
    {
      "source": ".",
      "codebase": "recovery-platform",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "src"
      ]
    }
  ],
  "emulators": {
    "functions": { "port": 5002 },
    "firestore": { "port": 8082 },
    "auth": { "port": 9100 },
    "ui": { "enabled": true, "port": 4001 }
  }
}
```

Note: Ports are offset from regroup's defaults (5001/8080/9099) so both can run simultaneously.

- [ ] **Step 3: Write .firebaserc**

```json
{
  "projects": {
    "default": "recovery-platform"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/config.ts firebase.json .firebaserc
git commit -m "feat(recovery-api): add Firebase Functions config and emulator setup"
```

---

### Task 3: Create entity types

**Files:**

- Create: `src/entities/User.ts`
- Create: `src/entities/Referral.ts`

- [ ] **Step 1: Write src/entities/User.ts**

```typescript
import type { Timestamp } from "firebase-admin/firestore";

export interface User {
  uid: string;
  appId: "homegroups" | "sober-living";
  email: string;
  displayName?: string;
  sobrietyDate?: string; // ISO date "YYYY-MM-DD"
  homeApp?: string;
  linkedProfileId?: string; // Phase 2: accountLinks doc reference
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

- [ ] **Step 2: Write src/entities/Referral.ts**

```typescript
import type { Timestamp } from "firebase-admin/firestore";

export interface Referral {
  fromApp: "homegroups" | "sober-living";
  toApp:
    | "treatment-center"
    | "phoenix-cleanhouse"
    | "homegroups"
    | "sober-living";
  referredBy: string; // uid
  referredByApp: string; // appId — uid alone is ambiguous across projects
  clientName: string;
  clientEmail: string;
  condition?: string;
  notes?: string;
  status: "pending" | "accepted" | "declined";
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/entities/
git commit -m "feat(recovery-api): add User and Referral entity types"
```

---

### Task 4: Replace src/middleware/auth.ts

**Files:**

- Modify: `src/middleware/auth.ts`
- Create: `src/middleware/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/middleware/auth.test.ts`:

```typescript
import { requireServiceAuth } from "./auth";

const makeRequest = (
  headers: Record<string, string>,
  auth?: { uid: string; token: Record<string, unknown> },
) =>
  ({
    rawRequest: { headers },
    auth,
  }) as any;

describe("requireServiceAuth", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, RECOVERY_PLATFORM_API_KEY: "test-key" };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("extracts context from valid service key headers", () => {
    const req = makeRequest({
      "x-service-key": "test-key",
      "x-app-id": "homegroups",
      "x-user-uid": "uid123",
      "x-user-email": "user@test.com",
    });
    expect(requireServiceAuth(req)).toEqual({
      appId: "homegroups",
      uid: "uid123",
      email: "user@test.com",
    });
  });

  it("throws unauthenticated when service key is wrong", () => {
    const req = makeRequest({
      "x-service-key": "wrong-key",
      "x-app-id": "homegroups",
      "x-user-uid": "uid123",
    });
    expect(() => requireServiceAuth(req)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("throws unauthenticated when appId is invalid", () => {
    const req = makeRequest({
      "x-service-key": "test-key",
      "x-app-id": "unknown-app",
      "x-user-uid": "uid123",
    });
    expect(() => requireServiceAuth(req)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("throws unauthenticated when uid is missing", () => {
    const req = makeRequest({
      "x-service-key": "test-key",
      "x-app-id": "homegroups",
    });
    expect(() => requireServiceAuth(req)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });

  it("falls back to request.auth for Phase 2 token flow", () => {
    const req = makeRequest(
      {},
      {
        uid: "uid456",
        token: { appId: "sober-living", email: "user2@test.com" },
      },
    );
    expect(requireServiceAuth(req)).toEqual({
      appId: "sober-living",
      uid: "uid456",
      email: "user2@test.com",
    });
  });

  it("throws when no service key and no request.auth", () => {
    const req = makeRequest({});
    expect(() => requireServiceAuth(req)).toThrow(
      expect.objectContaining({ code: "unauthenticated" }),
    );
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=middleware/auth
```

Expected: FAIL — `requireServiceAuth` not yet implemented.

- [ ] **Step 3: Replace src/middleware/auth.ts**

```typescript
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

export interface ServiceAuthContext {
  appId: "homegroups" | "sober-living";
  uid: string;
  email: string;
}

const VALID_APP_IDS: ReadonlySet<string> = new Set([
  "homegroups",
  "sober-living",
]);

/**
 * Phase 1: Verify X-Service-Key + extract X-App-Id / X-User-Uid / X-User-Email.
 * Phase 2 fallback: use request.auth token claims (appId, email).
 */
export function requireServiceAuth(
  request: CallableRequest,
): ServiceAuthContext {
  const headers = request.rawRequest.headers;
  const serviceKey = headers["x-service-key"] as string | undefined;
  const apiKey = process.env.RECOVERY_PLATFORM_API_KEY;

  if (apiKey && serviceKey === apiKey) {
    const appId = headers["x-app-id"] as string | undefined;
    const uid = headers["x-user-uid"] as string | undefined;
    const email = (headers["x-user-email"] as string | undefined) ?? "";

    if (!appId || !VALID_APP_IDS.has(appId)) {
      throw new HttpsError(
        "unauthenticated",
        "X-App-Id must be homegroups or sober-living",
      );
    }
    if (!uid) {
      throw new HttpsError("unauthenticated", "Missing X-User-Uid header");
    }
    return { appId: appId as ServiceAuthContext["appId"], uid, email };
  }

  // Phase 2: Firebase custom token flow
  if (request.auth) {
    const appId = request.auth.token["appId"] as string | undefined;
    if (!appId || !VALID_APP_IDS.has(appId)) {
      throw new HttpsError("unauthenticated", "Missing or invalid appId claim");
    }
    return {
      appId: appId as ServiceAuthContext["appId"],
      uid: request.auth.uid,
      email: (request.auth.token.email as string | undefined) ?? "",
    };
  }

  throw new HttpsError("unauthenticated", "Unauthorized");
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=middleware/auth
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.ts src/middleware/auth.test.ts
git commit -m "feat(recovery-api): replace requireAuth with requireServiceAuth (Phase 1 service key + Phase 2 token)"
```

---

### Task 5: Create src/http/health.ts

**Files:**

- Create: `src/http/health.ts`
- Create: `src/http/health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/http/health.test.ts`:

```typescript
import { healthHandler } from "./health";

describe("GET /health", () => {
  it("returns ok: true with a valid ISO timestamp", () => {
    const mockRes = { json: jest.fn() } as any;
    healthHandler({} as any, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    );
    const call = mockRes.json.mock.calls[0][0] as { ok: boolean; ts: string };
    expect(typeof call.ts).toBe("string");
    expect(new Date(call.ts).toString()).not.toBe("Invalid Date");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=http/health
```

Expected: FAIL — `healthHandler` not defined.

- [ ] **Step 3: Write src/http/health.ts**

```typescript
import { onRequest, Request, Response } from "firebase-functions/v2/https";

// Exported for testing — call the handler directly without the onRequest wrapper.
export function healthHandler(_req: Request, res: Response): void {
  res.json({ ok: true, ts: new Date().toISOString() });
}

export const health = onRequest(healthHandler);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=http/health
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/http/health.ts src/http/health.test.ts
git commit -m "feat(recovery-api): add health HTTP function"
```

---

### Task 6: Create src/callable/users.ts

**Files:**

- Create: `src/callable/users.ts`
- Create: `src/callable/users.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/callable/users.test.ts`:

```typescript
import { handleGetUserProfile, handleUpdateUserProfile } from "./users";

const ctx = {
  appId: "homegroups" as const,
  uid: "uid123",
  email: "user@test.com",
};

const makeDb = (docData?: Record<string, unknown>) =>
  ({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: docData !== undefined,
          data: () => docData,
        }),
        set: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  }) as any;

describe("handleGetUserProfile", () => {
  it("returns null profile when document does not exist", async () => {
    const result = await handleGetUserProfile(ctx, makeDb());
    expect(result).toEqual({ profile: null });
  });

  it("returns profile data when document exists", async () => {
    const profile = {
      uid: "uid123",
      appId: "homegroups",
      email: "user@test.com",
    };
    const result = await handleGetUserProfile(ctx, makeDb(profile));
    expect(result).toEqual({ profile });
  });

  it("uses composite doc ID appId:uid", async () => {
    const db = makeDb();
    await handleGetUserProfile(ctx, db);
    expect(db.collection).toHaveBeenCalledWith("users");
    const collectionMock = db.collection.mock.results[0].value;
    expect(collectionMock.doc).toHaveBeenCalledWith("homegroups:uid123");
  });
});

describe("handleUpdateUserProfile", () => {
  it("merges updates and returns updated: true", async () => {
    const db = makeDb();
    const result = await handleUpdateUserProfile(
      { displayName: "Jane" },
      ctx,
      db,
    );
    expect(result).toEqual({ updated: true });
    const docMock =
      db.collection.mock.results[0].value.doc.mock.results[0].value;
    expect(docMock.set).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Jane" }),
      { merge: true },
    );
  });

  it("throws ZodError on invalid sobrietyDate format", async () => {
    const db = makeDb();
    await expect(
      handleUpdateUserProfile({ sobrietyDate: "not-a-date" }, ctx, db),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=callable/users
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/callable/users.ts**

```typescript
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { requireServiceAuth, ServiceAuthContext } from "../middleware/auth";
import type { User } from "../entities/User";
import { RECOVERY_PLATFORM_API_KEY } from "../config";

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  sobrietyDate: z.string().date().optional(),
  homeApp: z.string().optional(),
});

export async function handleGetUserProfile(
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ profile: User | null }> {
  const docId = `${context.appId}:${context.uid}`;
  const doc = await db.collection("users").doc(docId).get();
  if (!doc.exists) return { profile: null };
  return { profile: doc.data() as User };
}

export async function handleUpdateUserProfile(
  data: unknown,
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ updated: true }> {
  const parsed = UpdateProfileSchema.parse(data);
  const docId = `${context.appId}:${context.uid}`;
  await db
    .collection("users")
    .doc(docId)
    .set({ ...parsed, updatedAt: new Date() }, { merge: true });
  return { updated: true };
}

export const getUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetUserProfile(context, getFirestore());
  },
);

export const updateUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleUpdateUserProfile(request.data, context, getFirestore());
  },
);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=callable/users
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/callable/users.ts src/callable/users.test.ts
git commit -m "feat(recovery-api): add getUserProfile and updateUserProfile callables"
```

---

### Task 7: Create src/callable/referrals.ts

**Files:**

- Create: `src/callable/referrals.ts`
- Create: `src/callable/referrals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/callable/referrals.test.ts`:

```typescript
import {
  handleCreateReferral,
  handleGetReferrals,
  handleGetReferral,
} from "./referrals";

const ctx = {
  appId: "homegroups" as const,
  uid: "uid123",
  email: "user@test.com",
};

const makeDb = (docData?: Record<string, unknown>) => {
  const docMock = {
    exists: docData !== undefined,
    id: "ref123",
    data: () => docData,
  };
  return {
    collection: jest.fn().mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: "ref123" }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest
        .fn()
        .mockResolvedValue({
          docs: docData ? [{ id: "ref123", data: () => docData }] : [],
        }),
      doc: jest
        .fn()
        .mockReturnValue({ get: jest.fn().mockResolvedValue(docMock) }),
    }),
  } as any;
};

describe("handleCreateReferral", () => {
  it("creates referral and returns id + pending status", async () => {
    const db = makeDb();
    const result = await handleCreateReferral(
      {
        toApp: "phoenix-cleanhouse",
        clientName: "Jane Doe",
        clientEmail: "jane@test.com",
      },
      ctx,
      db,
    );
    expect(result).toEqual({ id: "ref123", status: "pending" });
    expect(db.collection).toHaveBeenCalledWith("referrals");
  });

  it("throws on invalid toApp value", async () => {
    const db = makeDb();
    await expect(
      handleCreateReferral(
        { toApp: "unknown", clientName: "Jane", clientEmail: "jane@test.com" },
        ctx,
        db,
      ),
    ).rejects.toThrow();
  });

  it("writes fromApp and referredByApp from context.appId", async () => {
    const db = makeDb();
    await handleCreateReferral(
      { toApp: "sober-living", clientName: "Bob", clientEmail: "bob@test.com" },
      ctx,
      db,
    );
    const addCall = db.collection.mock.results[0].value.add.mock.calls[0][0];
    expect(addCall.fromApp).toBe("homegroups");
    expect(addCall.referredByApp).toBe("homegroups");
  });
});

describe("handleGetReferral", () => {
  it("throws not-found when document does not exist", async () => {
    const db = makeDb(); // docData undefined → exists: false
    await expect(
      handleGetReferral({ id: "nonexistent" }, ctx, db),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied when referredBy does not match", async () => {
    const db = makeDb({
      referredBy: "other-uid",
      referredByApp: "homegroups",
      toApp: "sober-living",
      clientName: "Jane",
      clientEmail: "jane@test.com",
      status: "pending",
      fromApp: "homegroups",
    });
    await expect(
      handleGetReferral({ id: "ref123" }, ctx, db),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=callable/referrals
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/callable/referrals.ts**

```typescript
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { requireServiceAuth, ServiceAuthContext } from "../middleware/auth";
import type { Referral } from "../entities/Referral";
import { RECOVERY_PLATFORM_API_KEY } from "../config";

const TARGET_APPS = [
  "treatment-center",
  "phoenix-cleanhouse",
  "homegroups",
  "sober-living",
] as const;

const CreateReferralSchema = z.object({
  toApp: z.enum(TARGET_APPS),
  clientName: z.string().min(1).max(100),
  clientEmail: z.string().email(),
  condition: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function handleCreateReferral(
  data: unknown,
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ id: string; status: "pending" }> {
  const parsed = CreateReferralSchema.parse(data);
  const ref = await db.collection("referrals").add({
    ...parsed,
    fromApp: context.appId,
    referredBy: context.uid,
    referredByApp: context.appId,
    status: "pending",
    createdAt: new Date(),
  });
  return { id: ref.id, status: "pending" };
}

export async function handleGetReferrals(
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<{ referrals: (Referral & { id: string })[] }> {
  const snap = await db
    .collection("referrals")
    .where("referredBy", "==", context.uid)
    .where("referredByApp", "==", context.appId)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const referrals = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Referral),
  }));
  return { referrals };
}

export async function handleGetReferral(
  data: { id: string },
  context: ServiceAuthContext,
  db: FirebaseFirestore.Firestore,
): Promise<Referral & { id: string }> {
  const doc = await db.collection("referrals").doc(data.id).get();
  if (!doc.exists) throw new HttpsError("not-found", "Referral not found");
  const referral = doc.data() as Referral;
  if (
    referral.referredBy !== context.uid ||
    referral.referredByApp !== context.appId
  ) {
    throw new HttpsError("permission-denied", "Forbidden");
  }
  return { id: doc.id, ...referral };
}

export const createReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleCreateReferral(request.data, context, getFirestore());
  },
);

export const getReferrals = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetReferrals(context, getFirestore());
  },
);

export const getReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleGetReferral(request.data, context, getFirestore());
  },
);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=callable/referrals
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/callable/referrals.ts src/callable/referrals.test.ts
git commit -m "feat(recovery-api): add createReferral, getReferrals, getReferral callables"
```

---

### Task 8: Create Phase 2 scaffolds

**Files:**

- Create: `src/callable/identity.ts`
- Create: `src/triggers/onUserWrite.ts`

- [ ] **Step 1: Write src/callable/identity.ts**

```typescript
// Phase 2 — Account linking. Scaffolded to allow re-exports; not deployed in Phase 1.
// findLinkedAccounts will link accounts across homegroups and sober-living by email.
// import { onCall } from "firebase-functions/v2/https";
// export const findLinkedAccounts = onCall(async (request) => { ... });

export {}; // keep module valid for TypeScript
```

- [ ] **Step 2: Write src/triggers/onUserWrite.ts**

```typescript
// Phase 2 — Account link detection on user document write.
// Uncomment when custom token exchange (Phase 2) is implemented.
//
// import { onDocumentWritten } from "firebase-functions/v2/firestore";
// export const onUserWrite = onDocumentWritten("users/{docId}", async (event) => {
//   // On upsert, check accountLinks collection by email hash.
//   // If match found, update linkedProfileId on both documents.
// });

export {}; // keep module valid for TypeScript
```

- [ ] **Step 3: Commit**

```bash
git add src/callable/identity.ts src/triggers/onUserWrite.ts
git commit -m "feat(recovery-api): add Phase 2 scaffolds for identity linking and user triggers"
```

---

### Task 9: Replace src/index.ts + delete old route files

**Files:**

- Modify: `src/index.ts`
- Delete: `src/routes/health.ts`, `src/routes/health.test.ts`, `src/routes/users.ts`, `src/routes/referrals.ts`

- [ ] **Step 1: Replace src/index.ts**

```typescript
// Pure re-export file — no serve(), no listen(), no app bootstrap.
// Firebase Functions v2 discovers and deploys each exported function.
export * from "./callable/users";
export * from "./callable/referrals";
export * from "./callable/identity";
export * from "./http/health";
export * from "./triggers/onUserWrite";
```

- [ ] **Step 2: Delete old route files**

```bash
rm src/routes/health.ts src/routes/health.test.ts \
   src/routes/users.ts src/routes/referrals.ts
rmdir src/routes
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: PASS — auth.test.ts (6), health.test.ts (1), users.test.ts (5), referrals.test.ts (5). All 17 tests pass.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: `lib/` directory created with `.js` files. No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git rm src/routes/health.ts src/routes/health.test.ts \
       src/routes/users.ts src/routes/referrals.ts
git commit -m "feat(recovery-api): complete Firebase Functions migration — remove Hono routes, wire up re-exports"
```

---

### Task 10: Update recovery-api/CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md to reflect new structure**

Replace the Architecture and Commands sections with:

````markdown
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
````

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
├── http/              health — GET /health liveness probe
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

````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(recovery-api): update CLAUDE.md to reflect Firebase Functions architecture"
````

---

## Self-Review

**Spec coverage:**

| Requirement                                                 | Task                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Hono → Firebase Functions v2                                | Tasks 1, 9                                                                               |
| `tsc` → `lib/` CommonJS build                               | Task 1                                                                                   |
| `src/config.ts` with `defineSecret`                         | Task 2                                                                                   |
| `firebase.json` + `.firebaserc`                             | Task 2                                                                                   |
| `entities/User.ts` + `Referral.ts`                          | Task 3                                                                                   |
| `requireServiceAuth` (X-Service-Key + Phase 2 fallback)     | Task 4                                                                                   |
| `src/http/health.ts`                                        | Task 5                                                                                   |
| `src/callable/users.ts` (getUserProfile, updateUserProfile) | Task 6                                                                                   |
| `src/callable/referrals.ts` (create/get/list)               | Task 7                                                                                   |
| `toApp` includes `"sober-living"`                           | Task 7 (TARGET_APPS enum)                                                                |
| `referredByApp` field on Referral                           | Task 7                                                                                   |
| Composite doc ID `{appId}:{uid}`                            | Task 6 (users)                                                                           |
| `src/callable/identity.ts` Phase 2 scaffold                 | Task 8                                                                                   |
| `src/triggers/onUserWrite.ts` Phase 2 scaffold              | Task 8                                                                                   |
| `src/index.ts` re-exports only                              | Task 9                                                                                   |
| Delete old Hono routes                                      | Task 9                                                                                   |
| `accountLinks` collection                                   | Spec says "scaffolded" — security rules are out of scope for this plan; add as follow-up |

**Note on `accountLinks`:** The spec says the collection must be present in Firestore security rules and composite index definitions. Firestore rules (`firestore.rules`) and indexes (`firestore.indexes.json`) live at the Firebase project root, not in `recovery-api/`. A separate follow-up plan for Firestore config is recommended.
