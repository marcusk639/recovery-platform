# Meeting Attendance Verification API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose an authenticated HTTP endpoint RATS (a sober living house app) can call to retrieve a resident's meeting check-in history by `userId`, without requiring the Firebase SDK.

**Architecture:** A new `functions.https.onRequest` HTTP function (`getMeetingAttendance`) validates a shared API key from the `Authorization` header, then queries the `meetingInstances` collection for records where `attendees` contains the given `userId`. Auth is a shared secret stored in Firebase Functions environment config — RATS is a server-to-server caller that cannot use Firebase client SDK auth.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript), Firestore `meetingInstances` collection, Jest for unit tests.

---

## File Structure

| File                                               | Action           | Responsibility                                                    |
| -------------------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `functions/src/http/getMeetingAttendance.ts`       | Create           | HTTP handler, auth check, Firestore query, response serialization |
| `functions/src/tests/getMeetingAttendance.test.ts` | Create           | Unit tests for all cases                                          |
| `functions/src/index.ts`                           | Modify (line 92) | Export new HTTP function                                          |

---

### Task 1: Write the failing tests

**Files:**

- Create: `functions/src/tests/getMeetingAttendance.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// functions/src/tests/getMeetingAttendance.test.ts
const mockGet = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn().mockReturnThis();

const mockDb: any = {
  collection: jest.fn(() => ({
    where: mockWhere,
    orderBy: mockOrderBy,
    limit: mockLimit,
    get: mockGet,
  })),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: { now: jest.fn() },
      FieldValue: { serverTimestamp: jest.fn() },
    },
  ),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  https: { onRequest: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onRequest: (opts: any, handler: any) => handler,
}));

import { getMeetingAttendanceHandler } from "../http/getMeetingAttendance";

// Helper to build fake Express req/res
function makeReq(overrides: Partial<any> = {}): any {
  return {
    method: "GET",
    headers: { authorization: "Bearer test-api-key" },
    query: { userId: "user-1", groupId: "group-1" },
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("getMeetingAttendanceHandler", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, RATS_API_KEY: "test-api-key" };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("returns 401 when API key is wrong", async () => {
    const req = makeReq({ headers: { authorization: "Bearer wrong-key" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 when userId is missing", async () => {
    const req = makeReq({ query: { groupId: "group-1" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("userId") }),
    );
  });

  it("returns 400 when groupId is missing", async () => {
    const req = makeReq({ query: { userId: "user-1" } });
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("groupId") }),
    );
  });

  it("returns empty checkIns array when no instances found", async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      userId: "user-1",
      groupId: "group-1",
      checkIns: [],
      count: 0,
    });
  });

  it("returns serialized checkIns when instances found", async () => {
    const fakeTs = { toDate: () => new Date("2026-05-01T19:00:00Z") };
    mockGet.mockResolvedValueOnce({
      docs: [
        {
          id: "inst-1",
          data: () => ({
            meetingId: "mtg-1",
            scheduledAt: fakeTs,
            attendeeCount: 12,
          }),
        },
      ],
    });
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      userId: "user-1",
      groupId: "group-1",
      checkIns: [
        {
          instanceId: "inst-1",
          meetingId: "mtg-1",
          scheduledAt: "2026-05-01T19:00:00.000Z",
          attendeeCount: 12,
        },
      ],
      count: 1,
    });
  });

  it("returns 500 and logs error when Firestore query throws", async () => {
    mockGet.mockRejectedValueOnce(new Error("Firestore down"));
    const req = makeReq();
    const res = makeRes();
    await getMeetingAttendanceHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd functions && npx jest src/tests/getMeetingAttendance.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../http/getMeetingAttendance'`

---

### Task 2: Implement the HTTP handler

**Files:**

- Create: `functions/src/http/getMeetingAttendance.ts`

- [ ] **Step 3: Create the handler file**

```typescript
// functions/src/http/getMeetingAttendance.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

export async function getMeetingAttendanceHandler(
  req: Request,
  res: Response,
): Promise<void> {
  // Auth: shared secret in Authorization header
  const apiKey = process.env.RATS_API_KEY;
  const authHeader = req.headers.authorization;
  if (!apiKey || !authHeader || authHeader !== `Bearer ${apiKey}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { userId, groupId } = req.query as Record<string, string | undefined>;

  if (!userId || typeof userId !== "string") {
    res.status(400).json({ error: "userId query parameter is required" });
    return;
  }
  if (!groupId || typeof groupId !== "string") {
    res.status(400).json({ error: "groupId query parameter is required" });
    return;
  }

  try {
    const db = admin.firestore();
    const snapshot = await db
      .collection("meetingInstances")
      .where("groupId", "==", groupId)
      .where("attendees", "array-contains", userId)
      .orderBy("scheduledAt", "desc")
      .limit(100)
      .get();

    const checkIns = snapshot.docs.map((doc) => {
      const data = doc.data();
      const scheduledAt: Date | null = data.scheduledAt?.toDate?.() ?? null;
      return {
        instanceId: doc.id,
        meetingId: (data.meetingId as string) ?? null,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
        attendeeCount: (data.attendeeCount as number) ?? 0,
      };
    });

    functions.logger.info(
      `getMeetingAttendance: ${checkIns.length} check-ins for userId=${userId} groupId=${groupId}`,
    );

    res.status(200).json({
      userId,
      groupId,
      checkIns,
      count: checkIns.length,
    });
  } catch (err) {
    functions.logger.error("getMeetingAttendance error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

export const getMeetingAttendance = functions.https.onRequest(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 30,
    region: "us-central1",
  },
  getMeetingAttendanceHandler,
);
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
cd functions && npx jest src/tests/getMeetingAttendance.test.ts --no-coverage
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add functions/src/http/getMeetingAttendance.ts functions/src/tests/getMeetingAttendance.test.ts
git commit -m "feat: add getMeetingAttendance HTTP endpoint for RATS integration"
```

---

### Task 3: Export the function and verify build

**Files:**

- Modify: `functions/src/index.ts` (after line 92, the existing HTTP exports line)

- [ ] **Step 6: Add export to index.ts**

Find this line in `functions/src/index.ts`:

```typescript
export { stripeWebhook, stripeConnectWebhook } from "./http/stripeWebhook";
```

Add below it:

```typescript
export { getMeetingAttendance } from "./http/getMeetingAttendance";
```

- [ ] **Step 7: Build to confirm no type errors**

```bash
cd functions && npm run build
```

Expected: No output (clean compile).

- [ ] **Step 8: Run full test suite**

```bash
cd functions && npm test -- --no-coverage
```

Expected: All tests pass, no regressions.

- [ ] **Step 9: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: export getMeetingAttendance in index.ts"
```

---

### Task 4: Document the RATS_API_KEY environment variable

**Files:**

- Modify: `docs/BILLING_AND_PAYMENTS.md` (or create a new section if needed)

- [ ] **Step 10: Add env var documentation**

Open `docs/BILLING_AND_PAYMENTS.md`. At the end of the file, add:

````markdown
## RATS Integration

The `getMeetingAttendance` HTTP endpoint is called by the RATS sober living app to verify
a resident's meeting attendance without embedding the full Homegroups UI.

**Endpoint:** `GET https://us-central1-<project>.cloudfunctions.net/getMeetingAttendance`

**Auth:** `Authorization: Bearer <RATS_API_KEY>`

**Query params:**

- `userId` (string, required) — Firebase UID of the resident
- `groupId` (string, required) — Homegroups group ID

**Response:**

```json
{
  "userId": "abc123",
  "groupId": "grp456",
  "checkIns": [
    {
      "instanceId": "...",
      "meetingId": "...",
      "scheduledAt": "ISO-8601",
      "attendeeCount": 12
    }
  ],
  "count": 1
}
```
````

**Setup:** Set `RATS_API_KEY` in Firebase Functions environment config:

```bash
firebase functions:config:set rats.api_key="<generate-a-random-64-char-hex-string>"
```

Then reference it in your `.env` or secrets config as `RATS_API_KEY`.

````

- [ ] **Step 11: Commit**

```bash
git add docs/BILLING_AND_PAYMENTS.md
git commit -m "docs: document getMeetingAttendance RATS API endpoint"
````

---

## Acceptance Criteria

- [ ] `GET /getMeetingAttendance?userId=X&groupId=Y` with correct `Authorization: Bearer` key returns 200 with check-in array
- [ ] Missing or wrong API key returns 401
- [ ] Missing `userId` or `groupId` returns 400
- [ ] Firestore failure returns 500 (no stack trace leaked to caller)
- [ ] All 6 unit tests pass
- [ ] `npm run build` clean
