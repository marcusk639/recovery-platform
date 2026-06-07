# regroup/functions — Recovery Platform Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recovery-platform integration to `regroup/functions/` so that Regroup can read/write shared user profiles and create cross-app referrals without needing a second Firebase app instance.

**Architecture:** Add a typed `callPlatform` HTTP client util that posts to recovery-platform callable functions with service-key headers. Wrap it in thin `sharedProfile` and `referrals` callable functions that Regroup calls via its existing Firebase SDK. Seed the shared platform on user creation via a Firestore trigger.

**Tech Stack:** TypeScript, Firebase Functions v2, Jest 29, `fetch` (Node 18 built-in)

**All files are under `recovery-platform/regroup/functions/` unless noted.**

**Spec:** `recovery-api/docs/superpowers/specs/2026-05-31-recovery-platform-cloud-functions-design.md`

**Dependency:** recovery-platform functions (firebase-migration plan) must be deployed to at least the Firebase emulator before running integration smoke tests.

---

## File Structure

```
src/
├── config.ts                              MODIFY — add RECOVERY_PLATFORM_API_KEY
├── index.ts                               MODIFY — add 2 new callable exports
├── util/
│   └── sharedPlatform.ts                  CREATE — typed fetch wrapper
├── callable/
│   ├── sharedProfile.ts                   CREATE — proxy getUserProfile, updateUserProfile
│   └── referrals.ts                       CREATE — proxy createReferral, getReferrals, getReferral
└── triggers/
    └── firestore/
        ├── index.ts                       MODIFY — add onUserCreate export
        └── onUserCreate.ts                CREATE — seed shared platform on user write

src/__tests__/
├── util/
│   └── sharedPlatform.test.ts             CREATE
├── callable/
│   ├── sharedProfile.test.ts              CREATE
│   └── referrals.test.ts                  CREATE
└── triggers/
    └── firestore/
        └── onUserCreate.test.ts           CREATE
```

---

### Task 1: Add RECOVERY_PLATFORM_API_KEY to config.ts

**Files:**

- Modify: `src/config.ts`

- [ ] **Step 1: Add secret to src/config.ts**

Open `src/config.ts`. After the `RATS_API_KEY` export line, add:

```typescript
// Shared service key for calling recovery-platform functions (cross-app integration).
// Set before deploying: firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY
// The same value must be configured in the recovery-platform Firebase project.
export const RECOVERY_PLATFORM_API_KEY = defineSecret(
  "RECOVERY_PLATFORM_API_KEY",
);
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat(regroup/functions): add RECOVERY_PLATFORM_API_KEY secret"
```

---

### Task 2: Create src/util/sharedPlatform.ts

**Files:**

- Create: `src/util/sharedPlatform.ts`
- Create: `src/__tests__/util/sharedPlatform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/util/sharedPlatform.test.ts`:

```typescript
import { callPlatform, PlatformCallOptions } from "../../util/sharedPlatform";

global.fetch = jest.fn();

const opts: PlatformCallOptions = {
  serviceKey: "test-key",
  uid: "uid123",
  email: "user@test.com",
};

describe("callPlatform", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POSTs to the correct URL with required headers", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ result: { profile: null } }),
    });
    const result = await callPlatform("getUserProfile", {}, opts);
    expect(result).toEqual({ profile: null });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("getUserProfile"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Service-Key": "test-key",
          "X-App-Id": "sober-living",
          "X-User-Uid": "uid123",
          "X-User-Email": "user@test.com",
        }),
        body: JSON.stringify({ data: {} }),
      }),
    );
  });

  it("throws unavailable on network failure", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      callPlatform("getUserProfile", {}, opts),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("throws internal on non-OK HTTP response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await expect(
      callPlatform("getUserProfile", {}, opts),
    ).rejects.toMatchObject({ code: "internal" });
  });

  it("uses RECOVERY_PLATFORM_URL env var when set", async () => {
    process.env.RECOVERY_PLATFORM_URL = "http://localhost:5002";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} }),
    });
    await callPlatform("health", {}, opts);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:5002/health",
      expect.anything(),
    );
    delete process.env.RECOVERY_PLATFORM_URL;
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=util/sharedPlatform
```

Expected: FAIL — `../../util/sharedPlatform` not found.

- [ ] **Step 3: Write src/util/sharedPlatform.ts**

```typescript
import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

// Override for local emulator:
//   RECOVERY_PLATFORM_URL=http://localhost:5002 firebase emulators:start
const PLATFORM_BASE_URL =
  process.env.RECOVERY_PLATFORM_URL ??
  "https://us-central1-recovery-platform.cloudfunctions.net";

export interface PlatformCallOptions {
  serviceKey: string;
  uid: string;
  email: string;
}

/**
 * Call a recovery-platform callable function as a trusted service caller.
 * Sends X-Service-Key + X-App-Id: sober-living headers (Phase 1 auth).
 * Returns the `result` field from the Firebase callable response envelope.
 */
export async function callPlatform<T>(
  functionName: string,
  data: unknown,
  opts: PlatformCallOptions,
): Promise<T> {
  const url = `${PLATFORM_BASE_URL}/${functionName}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Key": opts.serviceKey,
        "X-App-Id": "sober-living",
        "X-User-Uid": opts.uid,
        "X-User-Email": opts.email,
      },
      body: JSON.stringify({ data }),
    });
  } catch (err) {
    logger.error("sharedPlatform: network error", { functionName, err });
    throw new HttpsError("unavailable", "Recovery platform unreachable");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    logger.error("sharedPlatform: error response", {
      functionName,
      status: res.status,
      body,
    });
    const msg = (body?.error as { message?: string })?.message;
    throw new HttpsError(
      "internal",
      `Platform call failed: ${msg ?? res.status}`,
    );
  }

  const json = (await res.json()) as { result: T };
  return json.result;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=util/sharedPlatform
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/util/sharedPlatform.ts src/__tests__/util/sharedPlatform.test.ts
git commit -m "feat(regroup/functions): add callPlatform HTTP client"
```

---

### Task 3: Create src/callable/sharedProfile.ts

**Files:**

- Create: `src/callable/sharedProfile.ts`
- Create: `src/__tests__/callable/sharedProfile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/callable/sharedProfile.test.ts`:

```typescript
import {
  handleGetUserProfile,
  handleUpdateUserProfile,
} from "../../callable/sharedProfile";

jest.mock("../../util/sharedPlatform", () => ({
  callPlatform: jest.fn(),
}));
import { callPlatform } from "../../util/sharedPlatform";

const opts = { serviceKey: "key", uid: "uid123", email: "u@test.com" };

describe("handleGetUserProfile", () => {
  it("delegates to callPlatform(getUserProfile)", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ profile: null });
    const result = await handleGetUserProfile(opts);
    expect(callPlatform).toHaveBeenCalledWith("getUserProfile", {}, opts);
    expect(result).toEqual({ profile: null });
  });
});

describe("handleUpdateUserProfile", () => {
  it("delegates to callPlatform(updateUserProfile) with data", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ updated: true });
    const result = await handleUpdateUserProfile({ displayName: "Jane" }, opts);
    expect(callPlatform).toHaveBeenCalledWith(
      "updateUserProfile",
      { displayName: "Jane" },
      opts,
    );
    expect(result).toEqual({ updated: true });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=callable/sharedProfile
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/callable/sharedProfile.ts**

```typescript
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { callPlatform, PlatformCallOptions } from "../util/sharedPlatform";
import { RECOVERY_PLATFORM_API_KEY } from "../config";

export async function handleGetUserProfile(
  opts: PlatformCallOptions,
): Promise<unknown> {
  return callPlatform("getUserProfile", {}, opts);
}

export async function handleUpdateUserProfile(
  data: unknown,
  opts: PlatformCallOptions,
): Promise<unknown> {
  return callPlatform("updateUserProfile", data, opts);
}

function platformOpts(request: CallableRequest): PlatformCallOptions {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Must be logged in");
  return {
    serviceKey: process.env.RECOVERY_PLATFORM_API_KEY!,
    uid: request.auth.uid,
    email: (request.auth.token.email as string | undefined) ?? "",
  };
}

export const getUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  (request: CallableRequest) => handleGetUserProfile(platformOpts(request)),
);

export const updateUserProfile = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  (request: CallableRequest) =>
    handleUpdateUserProfile(request.data, platformOpts(request)),
);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=callable/sharedProfile
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/callable/sharedProfile.ts src/__tests__/callable/sharedProfile.test.ts
git commit -m "feat(regroup/functions): add getUserProfile and updateUserProfile proxies"
```

---

### Task 4: Create src/callable/referrals.ts

**Files:**

- Create: `src/callable/referrals.ts`
- Create: `src/__tests__/callable/referrals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/callable/referrals.test.ts`:

```typescript
import {
  handleCreateReferral,
  handleGetReferrals,
  handleGetReferral,
} from "../../callable/referrals";

jest.mock("../../util/sharedPlatform", () => ({
  callPlatform: jest.fn(),
}));
import { callPlatform } from "../../util/sharedPlatform";

const opts = { serviceKey: "key", uid: "uid123", email: "u@test.com" };

describe("handleCreateReferral", () => {
  it("delegates to callPlatform(createReferral)", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({
      id: "ref1",
      status: "pending",
    });
    const data = {
      toApp: "homegroups",
      clientName: "Jane",
      clientEmail: "j@t.com",
    };
    const result = await handleCreateReferral(data, opts);
    expect(callPlatform).toHaveBeenCalledWith("createReferral", data, opts);
    expect(result).toEqual({ id: "ref1", status: "pending" });
  });
});

describe("handleGetReferrals", () => {
  it("delegates to callPlatform(getReferrals) with empty data", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ referrals: [] });
    const result = await handleGetReferrals(opts);
    expect(callPlatform).toHaveBeenCalledWith("getReferrals", {}, opts);
    expect(result).toEqual({ referrals: [] });
  });
});

describe("handleGetReferral", () => {
  it("delegates to callPlatform(getReferral) with id", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ id: "ref1" });
    const result = await handleGetReferral({ id: "ref1" }, opts);
    expect(callPlatform).toHaveBeenCalledWith(
      "getReferral",
      { id: "ref1" },
      opts,
    );
    expect(result).toEqual({ id: "ref1" });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=callable/referrals
```

Expected: FAIL — `../../callable/referrals` not found.

- [ ] **Step 3: Write src/callable/referrals.ts**

```typescript
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import { callPlatform, PlatformCallOptions } from "../util/sharedPlatform";
import { RECOVERY_PLATFORM_API_KEY } from "../config";

export async function handleCreateReferral(
  data: unknown,
  opts: PlatformCallOptions,
): Promise<unknown> {
  return callPlatform("createReferral", data, opts);
}

export async function handleGetReferrals(
  opts: PlatformCallOptions,
): Promise<unknown> {
  return callPlatform("getReferrals", {}, opts);
}

export async function handleGetReferral(
  data: { id: string },
  opts: PlatformCallOptions,
): Promise<unknown> {
  return callPlatform("getReferral", data, opts);
}

function platformOpts(request: CallableRequest): PlatformCallOptions {
  if (!request.auth)
    throw new HttpsError("unauthenticated", "Must be logged in");
  return {
    serviceKey: process.env.RECOVERY_PLATFORM_API_KEY!,
    uid: request.auth.uid,
    email: (request.auth.token.email as string | undefined) ?? "",
  };
}

export const createReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  (request: CallableRequest) =>
    handleCreateReferral(request.data, platformOpts(request)),
);

export const getReferrals = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  (request: CallableRequest) => handleGetReferrals(platformOpts(request)),
);

export const getReferral = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  (request: CallableRequest) =>
    handleGetReferral(request.data, platformOpts(request)),
);
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- --testPathPattern=callable/referrals
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/callable/referrals.ts src/__tests__/callable/referrals.test.ts
git commit -m "feat(regroup/functions): add createReferral, getReferrals, getReferral proxies"
```

---

### Task 5: Create onUserCreate trigger

**Files:**

- Create: `src/triggers/firestore/onUserCreate.ts`
- Create: `src/__tests__/triggers/firestore/onUserCreate.test.ts`
- Modify: `src/triggers/firestore/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/triggers/firestore/onUserCreate.test.ts`:

```typescript
import { seedSharedProfile } from "../../../triggers/firestore/onUserCreate";

jest.mock("../../../util/sharedPlatform", () => ({
  callPlatform: jest.fn(),
}));
import { callPlatform } from "../../../util/sharedPlatform";

describe("seedSharedProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RECOVERY_PLATFORM_API_KEY = "test-key";
  });

  it("calls updateUserProfile on the platform with display name", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ updated: true });
    await seedSharedProfile({
      uid: "uid123",
      email: "user@test.com",
      displayName: "Jane",
    });
    expect(callPlatform).toHaveBeenCalledWith(
      "updateUserProfile",
      { displayName: "Jane" },
      expect.objectContaining({ uid: "uid123", email: "user@test.com" }),
    );
  });

  it("calls updateUserProfile with empty object when no displayName", async () => {
    (callPlatform as jest.Mock).mockResolvedValue({ updated: true });
    await seedSharedProfile({ uid: "uid123", email: "user@test.com" });
    expect(callPlatform).toHaveBeenCalledWith(
      "updateUserProfile",
      {},
      expect.objectContaining({ uid: "uid123" }),
    );
  });

  it("does not throw if platform call fails (fire-and-forget)", async () => {
    (callPlatform as jest.Mock).mockRejectedValue(new Error("platform down"));
    await expect(
      seedSharedProfile({ uid: "uid123", email: "user@test.com" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern=triggers/firestore/onUserCreate
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write src/triggers/firestore/onUserCreate.ts**

```typescript
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { callPlatform } from "../../util/sharedPlatform";
import { RECOVERY_PLATFORM_API_KEY } from "../../config";

interface UserSeedData {
  uid: string;
  email: string;
  displayName?: string;
}

/**
 * Extracted for testability.
 * Seeds users/sober-living:{uid} in the shared platform Firestore so
 * email-based identity matching works from the moment the user exists.
 * Fire-and-forget: logs errors but does not re-throw.
 */
export async function seedSharedProfile(data: UserSeedData): Promise<void> {
  try {
    await callPlatform(
      "updateUserProfile",
      data.displayName ? { displayName: data.displayName } : {},
      {
        serviceKey: process.env.RECOVERY_PLATFORM_API_KEY!,
        uid: data.uid,
        email: data.email,
      },
    );
  } catch (err) {
    logger.error("onUserCreate: failed to seed shared platform profile", err);
  }
}

export const onUserCreate = onDocumentCreated(
  { document: "users/{uid}", secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (event) => {
    const docData = event.data?.data();
    if (!docData) return;
    await seedSharedProfile({
      uid: event.params.uid,
      email: (docData.email as string | undefined) ?? "",
      displayName: docData.displayName as string | undefined,
    });
  },
);
```

- [ ] **Step 4: Add export to src/triggers/firestore/index.ts**

Open `src/triggers/firestore/index.ts` and append at the end:

```typescript
export * from "./onUserCreate";
```

- [ ] **Step 5: Run test — verify it passes**

```bash
npm test -- --testPathPattern=triggers/firestore/onUserCreate
```

Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/triggers/firestore/onUserCreate.ts \
        src/__tests__/triggers/firestore/onUserCreate.test.ts \
        src/triggers/firestore/index.ts
git commit -m "feat(regroup/functions): add onUserCreate trigger to seed recovery-platform profile"
```

---

### Task 6: Wire exports in src/index.ts + final checks

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Add two callable exports**

Open `src/index.ts`. After `export * from "./callable/homegroups"`, add:

```typescript
export * from "./callable/sharedProfile";
export * from "./callable/referrals";
```

The trigger (`onUserCreate`) is already picked up via `export * from "./triggers/firestore"`.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All pre-existing tests pass, plus 12 new tests pass.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(regroup/functions): wire sharedProfile and referrals exports — integration complete"
```
