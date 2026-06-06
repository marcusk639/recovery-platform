> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Dead Trigger Cleanup + Callable Zod Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `dmNotification` RTDB trigger and add Zod input validation to all callable function boundaries.

**Architecture:** `dmNotification` fires on RTDB writes to `/direct-messages/{...}`, but the client migrated to Firestore for DMs (Phase 5.3 migration) — no RTDB writes occur, so the trigger is dead. `notifyNewHouseCreated` is alive (Firestore houses are still created). For callables, a shared `parseInput(schema, data)` helper converts Zod validation errors into `HttpsError('invalid-argument', ...)`, which is the correct error code for Firebase clients. Schemas live inline in each callable file.

**Tech Stack:** Firebase Functions v2, Zod, TypeScript, Jest/ts-jest

---

## File Structure

### Files to Remove

- `functions/src/triggers/rtdb/index.ts` — delete `dmNotification` export; file may become empty (delete file if so)
- `functions/src/__tests__/triggers/rtdb.test.ts` — delete `dmNotification` describe block; file may become empty (delete file if so)

### Files to Create

- `functions/src/validation/index.ts` — `parseInput` helper: wraps Zod `.parse()` and converts `ZodError` → `HttpsError('invalid-argument', ...)`
- `functions/src/__tests__/validation/index.test.ts` — unit tests for `parseInput`

### Files to Modify

- `functions/src/index.ts` — remove `export * from "./triggers/rtdb"` if the RTDB trigger file is deleted
- `scripts/deploy-batched.sh` — remove `dmNotification` from the deploy list
- `functions/src/callable/auth.ts` — add Zod schemas + `parseInput` calls to all 6 functions
- `functions/src/__tests__/callable/auth.test.ts` — add invalid-input test cases
- `functions/src/callable/meetings.ts` — add Zod schemas + `parseInput` to `findMeetings` and `userIsAtMeeting`
- `functions/src/__tests__/callable/meetings.test.ts` — add invalid-input test cases
- `functions/src/callable/payments.ts` — add Zod schemas + `parseInput` to all 8 functions
- `functions/src/__tests__/payments.test.ts` — add invalid-input test cases
- `functions/src/callable/subscriptions.ts` — add Zod schemas + `parseInput` to all 7 functions
- `functions/src/__tests__/callable/subscriptions.test.ts` — add invalid-input test cases

---

## Task 1: Remove dmNotification

**Audit summary (already done, do not re-audit):**

- `dmNotification` triggers on RTDB path `/direct-messages/{conversationId}/{messageId}`.
- `functions/src/services/message.tsx` comment: "MIGRATED: Phase 5.3 - Switched from Firebase Realtime Database to Firestore". Messages now go to Firestore `direct-messages/{id}/chat/{msgId}`. No RTDB writes exist.
- Conclusion: dead. Remove.
- `notifyNewHouseCreated` — `rats-v2/src/services/house.tsx:185` does `batch.set(newHouseDoc, newHouse)`. Still active. Do not remove.

**Files:**

- Modify: `functions/src/triggers/rtdb/index.ts`
- Modify: `functions/src/__tests__/triggers/rtdb.test.ts`
- Modify: `functions/src/index.ts`
- Modify: `scripts/deploy-batched.sh`

- [ ] **Step 1: Delete dmNotification from the RTDB trigger file**

Replace the entire contents of `functions/src/triggers/rtdb/index.ts` with an empty module (only the imports that remain after removing dmNotification). Since `dmNotification` is the only export, delete the file entirely.

```bash
rm /Users/marcusklein/dev/regroup-functions/functions/src/triggers/rtdb/index.ts
```

- [ ] **Step 2: Delete the RTDB test file**

Since `dmNotification` was the only test subject in the file:

```bash
rm /Users/marcusklein/dev/regroup-functions/functions/src/__tests__/triggers/rtdb.test.ts
```

- [ ] **Step 3: Remove the RTDB export from index.ts**

In `functions/src/index.ts`, find and remove this line:

```typescript
export * from "./triggers/rtdb";
```

- [ ] **Step 4: Remove dmNotification from deploy script**

In `scripts/deploy-batched.sh`, change line 23 from:

```
  onGuestWrite dmNotification
```

to:

```
  onGuestWrite
```

- [ ] **Step 5: Verify tests pass**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm test -- --testPathPattern="triggers" 2>&1 | tail -20
```

Expected: all trigger tests pass (firestore.test.ts passes, rtdb.test.ts is gone so no failure).

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions
git add functions/src/triggers/rtdb/index.ts functions/src/__tests__/triggers/rtdb.test.ts functions/src/index.ts scripts/deploy-batched.sh
git commit -m "chore: remove dead dmNotification RTDB trigger (DM writes migrated to Firestore in Phase 5.3)"
```

---

## Task 2: Install Zod and Create parseInput Helper

**Files:**

- Create: `functions/src/validation/index.ts`
- Create: `functions/src/__tests__/validation/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `functions/src/__tests__/validation/index.test.ts`:

```typescript
// src/__tests__/validation/index.test.ts

jest.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { z } from "zod";
import { parseInput } from "../../validation";
import { HttpsError } from "firebase-functions/v2/https";

const schema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

describe("parseInput", () => {
  it("returns parsed data when input is valid", () => {
    const result = parseInput(schema, { name: "Alice", age: 30 });
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("throws HttpsError with invalid-argument code on invalid input", () => {
    expect(() => parseInput(schema, { name: "", age: 30 })).toThrow(HttpsError);
    try {
      parseInput(schema, { name: "", age: 30 });
    } catch (err) {
      expect((err as any).code).toBe("invalid-argument");
    }
  });

  it("throws HttpsError when a required field is missing", () => {
    expect(() => parseInput(schema, { name: "Bob" })).toThrow(HttpsError);
  });

  it("throws HttpsError when wrong type is supplied", () => {
    expect(() => parseInput(schema, { name: "Bob", age: "thirty" })).toThrow(
      HttpsError,
    );
  });

  it("includes a human-readable message from Zod", () => {
    try {
      parseInput(schema, { name: "", age: 30 });
    } catch (err) {
      expect((err as any).message).toBeTruthy();
    }
  });

  it("re-throws non-ZodError exceptions unchanged", () => {
    const badSchema = {
      parse: () => {
        throw new RangeError("unexpected");
      },
    } as any;
    expect(() => parseInput(badSchema, {})).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/validation/index.test.ts --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `Cannot find module '../../validation'`

- [ ] **Step 3: Install Zod**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm install zod
```

- [ ] **Step 4: Create the parseInput helper**

Create `functions/src/validation/index.ts`:

```typescript
import { ZodSchema, ZodError } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

export function parseInput<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const message = err.errors[0]?.message ?? "Invalid input";
      throw new HttpsError("invalid-argument", message);
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/validation/index.test.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS — 6 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && git add -A
git commit -m "feat(validation): add parseInput helper wrapping Zod for Firebase callable boundaries"
```

---

## Task 3: Validate auth.ts Callable Inputs

**Files:**

- Modify: `functions/src/callable/auth.ts`
- Modify: `functions/src/__tests__/callable/auth.test.ts`

- [ ] **Step 1: Write failing validation tests**

Append to the **bottom** of `functions/src/__tests__/callable/auth.test.ts`:

```typescript
// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

import { HttpsError } from "firebase-functions/v2/https";

describe("addGuestAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { houseId: "h1" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseId is missing", async () => {
    await expect(
      call(addGuestAuthorization, { userId: "u1" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("addAdminAuthorization — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(
      call(addAdminAuthorization, { houseIds: [], superAdmin: [] }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when houseIds is not an array", async () => {
    await expect(
      call(addAdminAuthorization, {
        userId: "u1",
        houseIds: "bad",
        superAdmin: [],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("deleteAdminAuthorization — input validation", () => {
  it("throws invalid-argument when admin.userId is missing", async () => {
    await expect(
      call(deleteAdminAuthorization, {
        admin: {},
        adminHouseIds: [],
        superAdminHouseIds: [],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("verifyUserEmail — input validation", () => {
  it("throws invalid-argument when userId is missing", async () => {
    await expect(call(verifyUserEmail, {})).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument when userId is empty string", async () => {
    await expect(call(verifyUserEmail, { userId: "" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("removePrivilegesForGuests — input validation", () => {
  it("throws invalid-argument when role is not a valid Role", async () => {
    const guests = [{ userId: "u1", houseId: "h1" }];
    await expect(
      call(removePrivilegesForGuests, { guests, role: "invalid-role" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/auth.test.ts --no-coverage 2>&1 | grep -E "FAIL|PASS|validation|●" | head -20
```

Expected: FAIL — new validation tests throw but not `HttpsError`.

- [ ] **Step 3: Add Zod schemas and parseInput calls to auth.ts**

Replace the top of `functions/src/callable/auth.ts` (after the existing imports) with:

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { auth } from "firebase-admin";
import { z } from "zod";
import { Guest } from "../entities/Guest";
import { createClaims, deleteClaim } from "../util/claims";
import Admin from "../entities/Admin";
import UserClaims from "../entities/UserClaim";
import { getGuestsAsUsers } from "../util/user";
import { Role } from "../entities/Roles";
import { _verifyUserEmail } from "../util/user";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const guestAuthSchema = z
  .object({
    userId: z.string().min(1),
    houseId: z.string().min(1),
    isAdmin: z.boolean().optional(),
  })
  .passthrough();

const adminAuthSchema = z
  .object({
    userId: z.string().min(1),
    houseIds: z.array(z.string()),
    superAdmin: z.array(z.string()),
  })
  .passthrough();

const deleteAdminSchema = z.object({
  admin: z.object({ userId: z.string().min(1) }).passthrough(),
  adminHouseIds: z.array(z.string()),
  superAdminHouseIds: z.array(z.string()),
});

const guestMinSchema = z
  .object({
    userId: z.string().min(1),
    houseId: z.string().min(1),
  })
  .passthrough();

const removePrivilegesSchema = z.object({
  guests: z.array(guestMinSchema),
  role: z.enum(["admin", "superAdmin", "guest", "supporter"]),
});

const verifyEmailSchema = z.object({ userId: z.string().min(1) });
```

Then update each function body to parse input first. For `addGuestAuthorization`:

```typescript
export const addGuestAuthorization = onCall(async (request) => {
  const guest = parseInput(guestAuthSchema, request.data) as Guest;
  logger.info("Adding authorization for guest", guest);
  try {
    let userClaims = await createClaims(guest.userId, [guest.houseId], "guest");
    await auth().setCustomUserClaims(guest.userId, userClaims);
    if (guest.isAdmin) {
      userClaims = await createClaims(
        guest.userId,
        [guest.houseId],
        "admin",
        false,
      );
      await auth().setCustomUserClaims(guest.userId, userClaims);
    }
    logger.info("Claims created for guest", userClaims);
    return true;
  } catch (error) {
    return false;
  }
});
```

For `addAdminAuthorization`:

```typescript
export const addAdminAuthorization = onCall(async (request) => {
  const admin = parseInput(adminAuthSchema, request.data) as Admin;
  logger.info(
    "Adding claim for admin and houses",
    admin,
    admin.superAdmin,
    admin.houseIds,
  );
  // ... rest unchanged
});
```

For `deleteAdminAuthorization`:

```typescript
export const deleteAdminAuthorization = onCall(async (request) => {
  const data = parseInput(deleteAdminSchema, request.data) as {
    admin: Admin;
    adminHouseIds: string[];
    superAdminHouseIds: string[];
  };
  // ... rest unchanged
});
```

For `promoteGuestsToAdmin`:

```typescript
export const promoteGuestsToAdmin = onCall(async (request) => {
  const data = parseInput(z.array(guestMinSchema), request.data) as Guest[];
  // ... rest unchanged (replace `const data = request.data as Guest[]`)
});
```

For `removePrivilegesForGuests`:

```typescript
export const removePrivilegesForGuests = onCall(async (request) => {
  const data = parseInput(removePrivilegesSchema, request.data) as {
    guests: Guest[];
    role: Role;
  };
  // ... rest unchanged
});
```

For `verifyUserEmail`:

```typescript
export const verifyUserEmail = onCall(async (request) => {
  const data = parseInput(verifyEmailSchema, request.data) as {
    userId: string;
  };
  return _verifyUserEmail(data.userId);
});
```

`givePotentialSuperAdminPrivilege` receives no user-supplied data (only uses `request.auth.uid`), so no schema needed.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/auth.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS — all existing tests + new validation tests pass.

- [ ] **Step 5: Type-check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
git add functions/src/callable/auth.ts functions/src/__tests__/callable/auth.test.ts
git commit -m "feat(validation): add Zod input validation to auth callable boundaries"
```

---

## Task 4: Validate meetings.ts Callable Inputs

**Files:**

- Modify: `functions/src/callable/meetings.ts`
- Modify: `functions/src/__tests__/callable/meetings.test.ts`

- [ ] **Step 1: Write failing validation tests**

Append to the bottom of `functions/src/__tests__/callable/meetings.test.ts`:

```typescript
// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

import { HttpsError } from "firebase-functions/v2/https";

describe("findMeetings — input validation", () => {
  it("throws invalid-argument when filters is missing", async () => {
    await expect(
      (findMeetings as Function)({ data: {} }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when location is missing from filters", async () => {
    await expect(
      (findMeetings as Function)({
        data: { filters: { day: "Monday", type: "AA" } },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when type is an unknown meeting type", async () => {
    await expect(
      (findMeetings as Function)({
        data: {
          filters: {
            location: { lat: 0, lng: 0 },
            day: "Monday",
            type: "UNKNOWN",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("userIsAtMeeting — input validation", () => {
  it("returns false gracefully when all location fields are missing", async () => {
    // No required fields — all optional — should not throw
    const result = await (userIsAtMeeting as Function)({ data: {} });
    expect(result).toBe(false);
  });

  it("throws invalid-argument when userLocation has wrong shape", async () => {
    await expect(
      (userIsAtMeeting as Function)({
        data: { userLocation: { x: 1, y: 2 } },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/meetings.test.ts --no-coverage 2>&1 | grep -E "FAIL|PASS|●" | head -15
```

Expected: FAIL on the new validation tests.

- [ ] **Step 3: Add Zod schemas and parseInput calls to meetings.ts**

Add after the existing imports in `functions/src/callable/meetings.ts`:

```typescript
import { z } from "zod";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const locationSchema = z.object({ lat: z.number(), lng: z.number() });

const findMeetingsSchema = z.object({
  filters: z.object({
    location: locationSchema,
    day: z.string(),
    type: z.enum([
      "AA",
      "NA",
      "AL-ANON",
      "Religious",
      "Custom",
      "all",
      "Celebrate Recovery",
    ]),
  }),
  criteria: z
    .object({
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      time: z.string().optional(),
      location: locationSchema.optional(),
      street: z.string().optional(),
    })
    .optional(),
});

const userIsAtMeetingSchema = z.object({
  userLocation: locationSchema.optional(),
  meetingLocation: locationSchema.optional(),
  meetingAddress: z.string().optional(),
});
```

Update `findMeetings` to replace the cast:

```typescript
// Replace:  const data = request.data as MeetingSearchInput;
// With:
const data = parseInput(findMeetingsSchema, request.data) as MeetingSearchInput;
```

Update `userIsAtMeeting` to replace the cast:

```typescript
// Replace:  const data = request.data as MeetingVerificationInput;
// With:
const data = parseInput(
  userIsAtMeetingSchema,
  request.data,
) as MeetingVerificationInput;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/meetings.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Type-check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
git add functions/src/callable/meetings.ts functions/src/__tests__/callable/meetings.test.ts
git commit -m "feat(validation): add Zod input validation to meetings callable boundaries"
```

---

## Task 5: Validate payments.ts Callable Inputs

**Files:**

- Modify: `functions/src/callable/payments.ts`
- Modify: `functions/src/__tests__/payments.test.ts`

- [ ] **Step 1: Write failing validation tests**

Append to the bottom of `functions/src/__tests__/payments.test.ts`:

```typescript
// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

import { HttpsError } from "firebase-functions/v2/https";
import {
  listPayments,
  listHousePayments,
  getPaymentMethod,
  updatePaymentInfo,
  disconnectStripeAccount,
  getStripeAccountStatus,
} from "../callable/payments";

// helper: wrap function that is already extracted as handler by onCall mock
const call = (fn: unknown, data: unknown, auth?: object) =>
  (fn as Function)({ data, auth });

describe("listPayments — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1", token: {} };
    await expect(
      call(listPayments, { guestId: "g1" }, auth),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("listHousePayments — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1", token: {} };
    await expect(call(listHousePayments, {}, auth)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});

describe("getPaymentMethod — input validation", () => {
  it("throws invalid-argument when customerId is missing", async () => {
    await expect(call(getPaymentMethod, {})).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws invalid-argument when customerId is empty", async () => {
    await expect(
      call(getPaymentMethod, { customerId: "" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updatePaymentInfo — input validation", () => {
  it("throws invalid-argument when paymentMethod is missing", async () => {
    await expect(
      call(updatePaymentInfo, {
        user: { subscriptionMetadata: { customerId: "cus_123" } },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when customerId is missing from user.subscriptionMetadata", async () => {
    await expect(
      call(updatePaymentInfo, {
        user: { subscriptionMetadata: {} },
        paymentMethod: "pm_123",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("disconnectStripeAccount — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1" };
    await expect(call(disconnectStripeAccount, {}, auth)).rejects.toMatchObject(
      { code: "invalid-argument" },
    );
  });
});

describe("getStripeAccountStatus — input validation", () => {
  it("throws invalid-argument when houseId is missing", async () => {
    const auth = { uid: "u1" };
    await expect(call(getStripeAccountStatus, {}, auth)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
```

Note: `createPaymentIntent` already has manual validation that produces `HttpsError('invalid-argument', ...)` — we will replace those with Zod without adding new tests. `connectStripeAccount` uses a custom URL scheme check; we wrap it with Zod but keep the same permissive URL validation logic.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/payments.test.ts --no-coverage 2>&1 | grep -E "FAIL|PASS|●" | head -20
```

Expected: FAIL on the new validation tests (wrong error or no error thrown).

- [ ] **Step 3: Add Zod schemas and parseInput calls to payments.ts**

Add after existing imports in `functions/src/callable/payments.ts`:

```typescript
import { z } from "zod";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().optional(),
  guestId: z.string().min(1),
  houseId: z.string().min(1),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const listPaymentsSchema = z.object({
  guestId: z.string(),
  houseId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

const listHousePaymentsSchema = z.object({
  houseId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

const getPaymentMethodSchema = z.object({ customerId: z.string().min(1) });

const updatePaymentInfoSchema = z.object({
  user: z
    .object({
      subscriptionMetadata: z
        .object({ customerId: z.string().min(1) })
        .passthrough(),
    })
    .passthrough(),
  paymentMethod: z.string().min(1),
});

// Allows any URI scheme except javascript: (matches existing URL validation logic)
const safeUrlSchema = z
  .string()
  .refine(
    (u) => !/^javascript:/i.test(u) && /^[a-z][a-z0-9+\-.]*:\/\//i.test(u),
    { message: "Invalid URL scheme" },
  );

const connectStripeAccountSchema = z.object({
  houseId: z.string().min(1),
  returnUrl: safeUrlSchema.optional(),
  refreshUrl: safeUrlSchema.optional(),
});

const houseIdSchema = z.object({ houseId: z.string().min(1) });
```

Update each function to parse first:

**`createPaymentIntent`** — replace the manual destructuring-and-check block:

```typescript
// Replace the cast + manual checks with:
const {
  amount,
  currency = "usd",
  guestId,
  houseId,
  description,
  idempotencyKey: clientKey,
} = parseInput(createPaymentIntentSchema, request.data);

// Remove the old manual checks for amount/guestId/houseId and isInteger —
// Zod schema (z.number().int().positive()) handles them.
```

**`listPayments`** — replace `const { guestId, houseId, limit = 20 } = request.data as {...}`:

```typescript
const {
  guestId,
  houseId,
  limit = 20,
} = parseInput(listPaymentsSchema, request.data);
// Remove: if (!houseId) throw new HttpsError(...)
```

**`listHousePayments`** — replace cast:

```typescript
const { houseId, limit = 100 } = parseInput(
  listHousePaymentsSchema,
  request.data,
);
// Remove: if (!houseId) throw new HttpsError(...)
```

**`getPaymentMethod`** — replace cast:

```typescript
const data = parseInput(getPaymentMethodSchema, request.data);
```

**`updatePaymentInfo`** — replace cast:

```typescript
const { user, paymentMethod } = parseInput(
  updatePaymentInfoSchema,
  request.data,
) as { user: User; paymentMethod: string };
```

**`connectStripeAccount`** — replace cast + remove the manual URL safety checks (Zod schema handles them):

```typescript
const { houseId, returnUrl, refreshUrl } = parseInput(
  connectStripeAccountSchema,
  request.data,
);
// Remove the urlIsSafe / dangerousSchemes / allowedSchemes block + the if(!houseId) check
```

**`disconnectStripeAccount`** — replace cast:

```typescript
const { houseId } = parseInput(houseIdSchema, request.data);
// Remove: if (!houseId) throw new HttpsError(...)
```

**`getStripeAccountStatus`** — replace cast:

```typescript
const { houseId } = parseInput(houseIdSchema, request.data);
// Remove: if (!houseId) throw new HttpsError(...)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/payments.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Type-check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
git add functions/src/callable/payments.ts functions/src/__tests__/payments.test.ts
git commit -m "feat(validation): add Zod input validation to payments callable boundaries"
```

---

## Task 6: Validate subscriptions.ts Callable Inputs

**Files:**

- Modify: `functions/src/callable/subscriptions.ts`
- Modify: `functions/src/__tests__/callable/subscriptions.test.ts`

- [ ] **Step 1: Write failing validation tests**

Append to the bottom of `functions/src/__tests__/callable/subscriptions.test.ts`:

```typescript
// ──────────────────────────────────────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────────────────────────────────────

import { HttpsError } from "firebase-functions/v2/https";

const callFn = (fn: unknown, data: unknown, auth?: object) =>
  (fn as Function)({ data, auth });

describe("createOperatorSubscription — input validation", () => {
  it("throws invalid-argument when user.email is not an email", async () => {
    await expect(
      callFn(createOperatorSubscription, {
        user: { email: "not-an-email" },
        paymentMethod: "pm_123",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when paymentMethod is missing", async () => {
    await expect(
      callFn(createOperatorSubscription, {
        user: { email: "test@test.com" },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("cancelUserSubscription — input validation", () => {
  it("throws invalid-argument when subscriptionId is missing", async () => {
    await expect(
      callFn(cancelUserSubscription, {
        user: { subscriptionMetadata: { status: "active" } },
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updateSubscriptionGuests — input validation", () => {
  it("throws invalid-argument when action is not add or remove", async () => {
    await expect(
      callFn(updateSubscriptionGuests, {
        ownerUserId: "u1",
        houseIds: ["h1"],
        action: "invalid",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when ownerUserId is missing", async () => {
    await expect(
      callFn(updateSubscriptionGuests, {
        houseIds: ["h1"],
        action: "add",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("updateSubscriptionHouses — input validation", () => {
  it("throws invalid-argument when action is invalid", async () => {
    await expect(
      callFn(updateSubscriptionHouses, {
        ownerUserId: "u1",
        action: "delete",
        houseIds: ["h1"],
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("sendConfirmationEmail — input validation", () => {
  it("throws invalid-argument when email is not a valid email", async () => {
    await expect(
      callFn(sendConfirmationEmail, {
        email: "not-an-email",
        dynamicLink: "https://example.com",
        name: "Alice",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when dynamicLink is missing", async () => {
    await expect(
      callFn(sendConfirmationEmail, {
        email: "test@test.com",
        name: "Alice",
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});
```

Add the following imports to the top of the test file (if not already present):

```typescript
import {
  createOperatorSubscription,
  reactivateOperatorSubscription,
  cancelUserSubscription,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
  sendInviteEmails,
  sendConfirmationEmail,
} from "../../callable/subscriptions";
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/subscriptions.test.ts --no-coverage 2>&1 | grep -E "FAIL|PASS|●" | head -20
```

Expected: FAIL on new validation tests.

- [ ] **Step 3: Add Zod schemas and parseInput calls to subscriptions.ts**

Add after existing imports in `functions/src/callable/subscriptions.ts`:

```typescript
import { z } from "zod";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const subscriptionMetadataMinSchema = z
  .object({
    status: z.string(),
    subscriptionId: z.string().optional(),
    customerId: z.string().optional(),
  })
  .passthrough();

const userMinSchema = z
  .object({
    id: z.string().optional(),
    email: z.string().optional(),
    subscriptionMetadata: subscriptionMetadataMinSchema,
  })
  .passthrough();

const createOperatorSubscriptionSchema = z.object({
  user: userMinSchema.extend({ email: z.string().email() }),
  paymentMethod: z.string().min(1),
});

const reactivateOperatorSubscriptionSchema = z.object({ user: userMinSchema });

const cancelUserSubscriptionSchema = z.object({
  user: userMinSchema,
  subscriptionId: z.string().min(1),
});

const actionEnum = z.enum(["add", "remove"]);

const updateSubscriptionGuestsSchema = z.object({
  ownerUserId: z.string().min(1),
  houseIds: z.array(z.string().min(1)),
  action: actionEnum,
  amountToAdjust: z.number().optional(),
});

const updateSubscriptionHousesSchema = z.object({
  ownerUserId: z.string().min(1),
  action: actionEnum,
  houseIds: z.array(z.string().min(1)),
  amountToAdjust: z.number().optional(),
});

const inviteEmailSchema = z.array(
  z.object({
    email: z.object({
      to: z.string().email(),
      from: z.string(),
      subject: z.string(),
      text: z.string(),
    }),
    dynamicLink: z.string().min(1),
    type: z.enum(["guest", "admin", "superAdmin", "supporter"]),
  }),
);

const sendConfirmationEmailSchema = z.object({
  email: z.string().email(),
  dynamicLink: z.string().min(1),
  name: z.string().min(1),
});
```

Update each function — replace `request.data as {...}` with `parseInput(schema, request.data)`:

```typescript
// createOperatorSubscription
const data = parseInput(createOperatorSubscriptionSchema, request.data) as {
  user: User;
  paymentMethod: string;
};

// reactivateOperatorSubscription
const data = parseInput(reactivateOperatorSubscriptionSchema, request.data) as {
  user: User;
};

// cancelUserSubscription
const data = parseInput(cancelUserSubscriptionSchema, request.data) as {
  user: User;
  subscriptionId: string;
};

// updateSubscriptionGuests
const data = parseInput(
  updateSubscriptionGuestsSchema,
  request.data,
) as SubParams;

// updateSubscriptionHouses
const data = parseInput(
  updateSubscriptionHousesSchema,
  request.data,
) as SubParams;

// sendInviteEmails
const data = parseInput(
  inviteEmailSchema,
  request.data,
) as InviteEmailPayload[];

// sendConfirmationEmail
const data = parseInput(
  sendConfirmationEmailSchema,
  request.data,
) as EmailConfirmationPayload;
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm test -- --no-coverage 2>&1 | tail -25
```

Expected: all test suites PASS.

- [ ] **Step 5: Type-check**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
git add functions/src/callable/subscriptions.ts functions/src/__tests__/callable/subscriptions.test.ts
git commit -m "feat(validation): add Zod input validation to subscriptions callable boundaries"
```

---

## Self-Review

### Spec Coverage

| Requirement                         | Covered by                                                       |
| ----------------------------------- | ---------------------------------------------------------------- |
| Verify dmNotification is dead       | Task 1 (audit already done — RTDB→Firestore migration confirmed) |
| Remove dmNotification if dead       | Task 1, Steps 1–4                                                |
| Leave notifyNewHouseCreated alone   | Not in task list (correct — it's alive)                          |
| Install Zod                         | Task 2, Step 3                                                   |
| parseInput helper                   | Task 2, Steps 4–5                                                |
| Validate auth.ts callables          | Task 3                                                           |
| Validate meetings.ts callables      | Task 4                                                           |
| Validate payments.ts callables      | Task 5                                                           |
| Validate subscriptions.ts callables | Task 6                                                           |

### Notes

- `givePotentialSuperAdminPrivilege` in `auth.ts` receives no user data (`request.auth.uid` only) — no schema needed, correctly excluded.
- `connectStripeAccount` custom URL validation logic (permits custom URI schemes like `regroup-app://`) is preserved in `safeUrlSchema` using `.refine()` instead of `z.string().url()` which only accepts http/https.
- `createPaymentIntent` already had manual `HttpsError` guards — Task 5 replaces them with Zod, removing duplication.
- Tests for existing behavior (happy paths) are not touched. New tests only cover invalid-input rejection.
