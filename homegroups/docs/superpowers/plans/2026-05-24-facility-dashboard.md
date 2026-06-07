# Treatment Center Facility Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web dashboard where treatment center admins can see anonymized alumni engagement metrics (meetings attended, sobriety milestones, sponsorship connections) for groups affiliated with their facility.

**Architecture:** A new `getFacilityEngagementMetrics` Cloud Function (callable) aggregates data from `meetingInstances`, per-group `milestones` subcollections, and the `sponsorships` collection. A new standalone React web page (`FacilityDashboardPage.js`) calls this function, requiring Firebase Auth + the caller's UID to be in `intergroups/{intergroupId}.adminUids`. No JWT claim changes are needed — auth follows the same `adminUids` check pattern used by `affiliateGroupToIntergroup`.

**Tech Stack:** TypeScript Cloud Functions v2 (onCall), Firebase Firestore, React 18 (inline styles, no styled-components), Firebase client SDK (`httpsCallable`, `onAuthStateChanged`), Jest (function unit tests following `getMilestones.test.ts` pattern).

---

## File Map

| Action | File                                                       | Responsibility                              |
| ------ | ---------------------------------------------------------- | ------------------------------------------- |
| Create | `functions/src/callable/getFacilityEngagementMetrics.ts`   | Aggregates engagement data for one facility |
| Create | `functions/src/tests/getFacilityEngagementMetrics.test.ts` | Unit tests for the callable handler         |
| Modify | `functions/src/index.ts`                                   | Export the new callable                     |
| Create | `web/src/pages/FacilityDashboardPage.js`                   | Authenticated dashboard UI                  |
| Modify | `web/src/App.js`                                           | Add `/facility-dashboard` route             |
| Modify | `web/src/pages/TreatmentCenterSuccessPage.js`              | Add "View Dashboard" link                   |

---

## Task 1: Cloud Function — `getFacilityEngagementMetrics`

**Files:**

- Create: `functions/src/callable/getFacilityEngagementMetrics.ts`
- Create: `functions/src/tests/getFacilityEngagementMetrics.test.ts`

### Background for engineers new to this codebase

The `intergroups/{intergroupId}` Firestore document represents a treatment center. Key fields:

- `adminUids: string[]` — UIDs authorized to manage it (caller must be in this array)
- `type: "treatment_center"` — the subtype we gate on
- `affiliatedGroupIds: string[]` — groups linked to this facility (populated by `affiliateGroupToIntergroup`)
- `subscriptionStatus: "active" | "incomplete" | ...` — must be `"active"` to access dashboard

Meeting check-in data lives in the top-level `meetingInstances` collection:

- `groupId: string` — links to a group
- `scheduledAt: Firestore.Timestamp`
- `attendees: string[]` — array of user UIDs who checked in
- `attendeeCount: number`
- `isCancelled?: boolean`

Milestone data lives in `groups/{groupId}/milestones` subcollection docs:

- Each doc has `milestones: Array<{ days: number; chipGivenAt: Timestamp; chipGivenBy: string }>`

Sponsorship data lives in `sponsorships/{id}`:

- `sponsorId: string` — UID of sponsor
- `sponseeId: string` — UID of sponsee

The existing Firestore composite index `(groupId ASC, scheduledAt ASC)` on `meetingInstances` covers our batch queries — no new index creation needed. Firestore `in` queries support up to 30 values per batch.

---

- [ ] **Step 1.1: Write the failing test**

Create `functions/src/tests/getFacilityEngagementMetrics.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Firestore mock plumbing (mirrors getMilestones.test.ts pattern) ---
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockWhere = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();

const makeChainedQuery = () => {
  const q: any = {
    where: jest.fn(),
    get: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };
  q.where.mockReturnValue(q);
  q.orderBy.mockReturnValue(q);
  q.limit.mockReturnValue(q);
  return q;
};

const mockCollectionRef: any = {
  doc: jest.fn(),
  where: jest.fn(),
  get: jest.fn(),
};

const mockDocRef: any = {
  get: mockGet,
  update: mockUpdate,
  collection: jest.fn(),
};

const mockDb: any = {
  collection: jest.fn(),
};

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => mockDb),
    {
      Timestamp: {
        fromDate: (d: Date) => ({
          toDate: () => d,
          seconds: Math.floor(d.getTime() / 1000),
        }),
        fromMillis: (ms: number) => ({
          toDate: () => new Date(ms),
          seconds: Math.floor(ms / 1000),
        }),
      },
    },
  ),
  auth: jest.fn(),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler: any) => handler,
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("../utils/firebase", () => ({ db: mockDb }));

import { getFacilityEngagementMetricsHandler } from "../callable/getFacilityEngagementMetrics";

function makeRequest(data: any, uid = "admin-uid") {
  return { auth: { uid, token: {} }, data } as any;
}

function makeSnap(exists: boolean, data?: any) {
  return { exists, data: () => data };
}

function makeQuerySnap(docs: any[]) {
  return {
    size: docs.length,
    docs,
    empty: docs.length === 0,
    forEach: (fn: any) => docs.forEach(fn),
  };
}

// ------------------------------------------------------------------
// Baseline intergroup Firestore doc returned for most tests
// ------------------------------------------------------------------
const BASE_INTERGROUP = {
  type: "treatment_center",
  subscriptionStatus: "active",
  adminUids: ["admin-uid"],
  affiliatedGroupIds: ["g1", "g2"],
};

beforeEach(() => {
  jest.clearAllMocks();

  // Default: intergroup doc resolves to BASE_INTERGROUP
  mockDocRef.get.mockResolvedValue(makeSnap(true, BASE_INTERGROUP));
  mockDocRef.collection.mockReturnValue(mockCollectionRef);

  // Default: meetings queries return empty
  const emptyQuery = makeChainedQuery();
  emptyQuery.get.mockResolvedValue(makeQuerySnap([]));
  mockCollectionRef.where.mockReturnValue(emptyQuery);
  mockCollectionRef.get.mockResolvedValue(makeQuerySnap([]));

  // Default: db.collection() routing
  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    return {
      doc: jest.fn(() => mockDocRef),
      where: jest.fn(() => makeChainedQuery()),
    };
  });
});

// ---- auth guards ----

test("throws unauthenticated when no auth", async () => {
  const req = { auth: null, data: { intergroupId: "ig1" } } as any;
  await expect(getFacilityEngagementMetricsHandler(req)).rejects.toMatchObject({
    code: "unauthenticated",
  });
});

test("throws invalid-argument when intergroupId missing", async () => {
  await expect(
    getFacilityEngagementMetricsHandler(makeRequest({})),
  ).rejects.toMatchObject({ code: "invalid-argument" });
});

test("throws not-found when intergroup does not exist", async () => {
  mockDocRef.get.mockResolvedValue(makeSnap(false));
  await expect(
    getFacilityEngagementMetricsHandler(makeRequest({ intergroupId: "bad" })),
  ).rejects.toMatchObject({ code: "not-found" });
});

test("throws permission-denied when caller not in adminUids", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, { ...BASE_INTERGROUP, adminUids: ["other-uid"] }),
  );
  await expect(
    getFacilityEngagementMetricsHandler(makeRequest({ intergroupId: "ig1" })),
  ).rejects.toMatchObject({ code: "permission-denied" });
});

test("throws invalid-argument when intergroup is not a treatment center", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, { ...BASE_INTERGROUP, type: "intergroup" }),
  );
  await expect(
    getFacilityEngagementMetricsHandler(makeRequest({ intergroupId: "ig1" })),
  ).rejects.toMatchObject({ code: "invalid-argument" });
});

test("throws failed-precondition when subscription is not active", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, { ...BASE_INTERGROUP, subscriptionStatus: "incomplete" }),
  );
  await expect(
    getFacilityEngagementMetricsHandler(makeRequest({ intergroupId: "ig1" })),
  ).rejects.toMatchObject({ code: "failed-precondition" });
});

// ---- zero-groups fast path ----

test("returns zeros when no groups are affiliated", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, { ...BASE_INTERGROUP, affiliatedGroupIds: [] }),
  );
  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.affiliatedGroupCount).toBe(0);
  expect(result.meetings.thisWeek).toBe(0);
  expect(result.meetings.thisMonth).toBe(0);
  expect(result.milestones.total).toBe(0);
  expect(result.sponsorships.total).toBe(0);
});

// ---- happy path ----

test("returns meeting counts from meetingInstances", async () => {
  const weekQuery = makeChainedQuery();
  weekQuery.get.mockResolvedValue(
    makeQuerySnap([
      { data: () => ({ groupId: "g1", isCancelled: false }) },
      { data: () => ({ groupId: "g2", isCancelled: false }) },
    ]),
  );
  const monthQuery = makeChainedQuery();
  monthQuery.get.mockResolvedValue(
    makeQuerySnap([
      { data: () => ({ groupId: "g1", isCancelled: false }) },
      { data: () => ({ groupId: "g2", isCancelled: false }) },
      { data: () => ({ groupId: "g1", isCancelled: false }) },
    ]),
  );

  let callCount = 0;
  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    if (name === "meetingInstances") {
      const base: any = { where: jest.fn() };
      base.where.mockImplementation(() => {
        callCount++;
        // First where chain = week query, second = month query
        const chain = callCount <= 2 ? weekQuery : monthQuery;
        chain.where = jest.fn().mockReturnValue(chain);
        return chain;
      });
      return base;
    }
    // milestones and sponsorships: empty
    return {
      doc: () => ({
        collection: () => ({ get: async () => makeQuerySnap([]) }),
      }),
      where: () => ({ get: async () => makeQuerySnap([]) }),
    };
  });

  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.meetings.thisWeek).toBe(2);
  expect(result.meetings.thisMonth).toBe(3);
  expect(result.affiliatedGroupCount).toBe(2);
  expect(result.computedAt).toBeTruthy();
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd functions && npm test -- --testPathPattern=getFacilityEngagementMetrics --no-coverage 2>&1 | tail -20
```

Expected output: `Cannot find module '../callable/getFacilityEngagementMetrics'`

- [ ] **Step 1.3: Implement `getFacilityEngagementMetrics.ts`**

Create `functions/src/callable/getFacilityEngagementMetrics.ts`:

```typescript
import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as functions from "firebase-functions";
import { db } from "../utils/firebase";
import * as admin from "firebase-admin";

interface GetFacilityEngagementMetricsData {
  intergroupId: string;
}

export interface FacilityEngagementMetrics {
  intergroupId: string;
  affiliatedGroupCount: number;
  meetings: {
    thisWeek: number;
    thisMonth: number;
  };
  milestones: {
    thirtyDay: number;
    sixtyDay: number;
    ninetyDay: number;
    oneEightyDay: number;
    total: number;
  };
  sponsorships: {
    total: number;
  };
  computedAt: string;
}

const MILESTONE_TIERS = [30, 60, 90, 180] as const;
const FIRESTORE_IN_BATCH_SIZE = 30;

// Exported for testing without the onCall wrapper.
export async function getFacilityEngagementMetricsHandler(
  request: CallableRequest<GetFacilityEngagementMetricsData>,
): Promise<FacilityEngagementMetrics> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { intergroupId } = request.data ?? {};
  if (!intergroupId || typeof intergroupId !== "string") {
    throw new HttpsError("invalid-argument", "intergroupId is required");
  }

  // --- Load intergroup and verify access ---
  const intergroupSnap = await db
    .collection("intergroups")
    .doc(intergroupId)
    .get();
  if (!intergroupSnap.exists) {
    throw new HttpsError("not-found", "Facility not found");
  }

  const ig = intergroupSnap.data()!;
  if (!ig.adminUids?.includes(request.auth.uid)) {
    throw new HttpsError("permission-denied", "Must be a facility admin");
  }
  if (ig.type !== "treatment_center") {
    throw new HttpsError(
      "invalid-argument",
      "This intergroup is not a treatment center",
    );
  }
  if (ig.subscriptionStatus !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "Facility subscription is not active",
    );
  }

  const affiliatedGroupIds: string[] = ig.affiliatedGroupIds ?? [];

  if (affiliatedGroupIds.length === 0) {
    return {
      intergroupId,
      affiliatedGroupCount: 0,
      meetings: { thisWeek: 0, thisMonth: 0 },
      milestones: {
        thirtyDay: 0,
        sixtyDay: 0,
        ninetyDay: 0,
        oneEightyDay: 0,
        total: 0,
      },
      sponsorships: { total: 0 },
      computedAt: new Date().toISOString(),
    };
  }

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const halfYearStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // ---- Meeting counts (batched IN queries) ----
  // Uses existing (groupId ASC, scheduledAt ASC) composite index.
  // isCancelled filtered in-memory to avoid a second inequality field.
  let meetingsThisWeek = 0;
  let meetingsThisMonth = 0;

  for (let i = 0; i < affiliatedGroupIds.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = affiliatedGroupIds.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const weekTs = admin.firestore.Timestamp.fromDate(weekStart);
    const monthTs = admin.firestore.Timestamp.fromDate(monthStart);

    const [weekSnap, monthSnap] = await Promise.all([
      db
        .collection("meetingInstances")
        .where("groupId", "in", batch)
        .where("scheduledAt", ">=", weekTs)
        .get(),
      db
        .collection("meetingInstances")
        .where("groupId", "in", batch)
        .where("scheduledAt", ">=", monthTs)
        .get(),
    ]);

    weekSnap.docs.forEach((doc) => {
      if (!doc.data().isCancelled) meetingsThisWeek++;
    });
    monthSnap.docs.forEach((doc) => {
      if (!doc.data().isCancelled) meetingsThisMonth++;
    });
  }

  // ---- Milestone counts (per-group subcollection reads) ----
  const halfYearTs = admin.firestore.Timestamp.fromDate(halfYearStart);
  const milestoneCounts: Record<number, number> = {
    30: 0,
    60: 0,
    90: 0,
    180: 0,
  };

  await Promise.all(
    affiliatedGroupIds.map(async (groupId) => {
      const milestonesSnap = await db
        .collection("groups")
        .doc(groupId)
        .collection("milestones")
        .get();

      milestonesSnap.docs.forEach((doc) => {
        const records: any[] = doc.data().milestones ?? [];
        records.forEach((r) => {
          if (!MILESTONE_TIERS.includes(r.days)) return;
          const chipDate =
            typeof r.chipGivenAt?.toDate === "function"
              ? r.chipGivenAt
              : admin.firestore.Timestamp.fromMillis(
                  new Date(r.chipGivenAt).getTime(),
                );
          if (chipDate.seconds >= halfYearTs.seconds) {
            milestoneCounts[r.days] = (milestoneCounts[r.days] ?? 0) + 1;
          }
        });
      });
    }),
  );

  const milestoneTotal = Object.values(milestoneCounts).reduce(
    (a, b) => a + b,
    0,
  );

  // ---- Sponsorship count (member UIDs → sponsorships) ----
  // Collect member UIDs from affiliated groups (batched IN query).
  const memberUidSet = new Set<string>();
  for (let i = 0; i < affiliatedGroupIds.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = affiliatedGroupIds.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const membersSnap = await db
      .collection("members")
      .where("groupId", "in", batch)
      .get();
    membersSnap.docs.forEach((doc) => {
      const uid = doc.data().userId;
      if (uid) memberUidSet.add(uid);
    });
  }

  // Count sponsorships where any affiliated member is the sponsor.
  const memberUIDs = Array.from(memberUidSet);
  const sponsorshipIds = new Set<string>();

  for (let i = 0; i < memberUIDs.length; i += FIRESTORE_IN_BATCH_SIZE) {
    const batch = memberUIDs.slice(i, i + FIRESTORE_IN_BATCH_SIZE);
    const snap = await db
      .collection("sponsorships")
      .where("sponsorId", "in", batch)
      .get();
    snap.docs.forEach((doc) => sponsorshipIds.add(doc.id));
  }

  functions.logger.info(
    `getFacilityEngagementMetrics: intergroupId=${intergroupId}, groups=${affiliatedGroupIds.length}, ` +
      `meetingsWeek=${meetingsThisWeek}, meetingsMonth=${meetingsThisMonth}, ` +
      `milestones=${milestoneTotal}, sponsorships=${sponsorshipIds.size}`,
  );

  return {
    intergroupId,
    affiliatedGroupCount: affiliatedGroupIds.length,
    meetings: { thisWeek: meetingsThisWeek, thisMonth: meetingsThisMonth },
    milestones: {
      thirtyDay: milestoneCounts[30],
      sixtyDay: milestoneCounts[60],
      ninetyDay: milestoneCounts[90],
      oneEightyDay: milestoneCounts[180],
      total: milestoneTotal,
    },
    sponsorships: { total: sponsorshipIds.size },
    computedAt: new Date().toISOString(),
  };
}

export const getFacilityEngagementMetrics = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60, cpu: 1 },
  getFacilityEngagementMetricsHandler,
);
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd functions && npm test -- --testPathPattern=getFacilityEngagementMetrics --no-coverage 2>&1 | tail -30
```

Expected: All tests pass. If the mock wiring produces unexpected failures, the most common fix is making the query chain mock return `this` from `.where()`.

- [ ] **Step 1.5: Commit**

```bash
cd functions && git add src/callable/getFacilityEngagementMetrics.ts src/tests/getFacilityEngagementMetrics.test.ts
git commit -m "feat: add getFacilityEngagementMetrics callable — treatment center alumni engagement aggregation"
```

---

## Task 2: Export the callable from `index.ts`

**Files:**

- Modify: `functions/src/index.ts`

- [ ] **Step 2.1: Add the export**

In `functions/src/index.ts`, after the `createIntergroup` export line (line ~150), add:

```typescript
export { getFacilityEngagementMetrics } from "./callable/getFacilityEngagementMetrics";
```

- [ ] **Step 2.2: Verify TypeScript compiles**

```bash
cd functions && npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully` with no errors. If there are type errors in the new file, fix them before proceeding.

- [ ] **Step 2.3: Commit**

```bash
cd functions && git add src/index.ts
git commit -m "feat: export getFacilityEngagementMetrics from functions index"
```

---

## Task 3: Web Page — `FacilityDashboardPage.js`

**Files:**

- Create: `web/src/pages/FacilityDashboardPage.js`

This is a standalone authenticated page (same group as `/subscribe`, `/billing`, `/treatment-center-success`). It uses inline styles — no styled-components, no header/footer, consistent with the other standalone pages.

The page:

1. Reads `?intergroupId=xxx` from the URL
2. Waits for Firebase Auth state (shows loading spinner)
3. If unauthenticated, shows sign-in form (same Google Auth + email/password pattern as TreatmentCentersPage.js)
4. If authenticated, calls `getFacilityEngagementMetrics({ intergroupId })`
5. Shows three metric cards: Meetings (week/month), Milestones (by tier), Sponsorships

- [ ] **Step 3.1: Create the page**

Create `web/src/pages/FacilityDashboardPage.js`:

```javascript
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";

const INTERGROUP_ID_PATTERN = /^[a-zA-Z0-9]{10,30}$/;
const getFacilityEngagementMetrics = httpsCallable(
  functions,
  "getFacilityEngagementMetrics",
);

export default function FacilityDashboardPage() {
  const [searchParams] = useSearchParams();
  const intergroupId = searchParams.get("intergroupId") ?? "";
  const isValidId = INTERGROUP_ID_PATTERN.test(intergroupId);

  const [authState, setAuthState] = useState("loading"); // "loading" | "signed-out" | "signed-in"
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? "signed-in" : "signed-out");
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (authState !== "signed-in" || !isValidId) return;

    setMetricsLoading(true);
    setMetricsError(null);

    getFacilityEngagementMetrics({ intergroupId })
      .then(({ data }) => setMetrics(data))
      .catch((err) => setMetricsError(err.message ?? "Failed to load data"))
      .finally(() => setMetricsLoading(false));
  }, [authState, intergroupId, isValidId]);

  const handleGoogleSignIn = async () => {
    setSignInError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setSignInError("Google sign-in failed. Try email/password instead.");
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setSignInError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setSignInError("Invalid email or password.");
    }
  };

  if (!isValidId) {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <p style={s.errorText}>Invalid or missing facility ID.</p>
        </div>
      </div>
    );
  }

  if (authState === "loading") {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <p style={s.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "signed-out") {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h1 style={s.title}>Facility Dashboard</h1>
          <p style={s.subtitle}>Sign in to view your alumni engagement data.</p>
          <button onClick={handleGoogleSignIn} style={s.googleBtn}>
            Sign in with Google
          </button>
          <div style={s.divider}>or</div>
          <form onSubmit={handleEmailSignIn}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={s.input}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={s.input}
              required
            />
            <button type="submit" style={s.primaryBtn}>
              Sign In
            </button>
          </form>
          {signInError && <p style={s.errorText}>{signInError}</p>}
        </div>
      </div>
    );
  }

  // Signed in — show dashboard
  return (
    <div style={s.container}>
      <div style={{ ...s.card, maxWidth: 720, textAlign: "left" }}>
        <h1 style={s.title}>Alumni Engagement</h1>
        <p style={s.muted}>
          {metrics
            ? `${metrics.affiliatedGroupCount} affiliated group${metrics.affiliatedGroupCount !== 1 ? "s" : ""} · Updated ${new Date(metrics.computedAt).toLocaleTimeString()}`
            : " "}
        </p>

        {metricsLoading && <p style={s.muted}>Loading data…</p>}
        {metricsError && <p style={s.errorText}>{metricsError}</p>}

        {metrics && (
          <div style={s.grid}>
            <MetricCard title="Meetings Attended">
              <Stat label="This week" value={metrics.meetings.thisWeek} />
              <Stat label="This month" value={metrics.meetings.thisMonth} />
            </MetricCard>

            <MetricCard title="Sobriety Milestones">
              <Stat label="30-day chips" value={metrics.milestones.thirtyDay} />
              <Stat label="60-day chips" value={metrics.milestones.sixtyDay} />
              <Stat label="90-day chips" value={metrics.milestones.ninetyDay} />
              <Stat
                label="180-day chips"
                value={metrics.milestones.oneEightyDay}
              />
            </MetricCard>

            <MetricCard title="Sponsorship Connections">
              <Stat
                label="Alumni with sponsors"
                value={metrics.sponsorships.total}
              />
              <p
                style={{ ...s.muted, fontSize: "0.8rem", marginTop: "0.5rem" }}
              >
                All data is anonymized. No names or personal information are
                shown.
              </p>
            </MetricCard>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, children }) {
  return (
    <div style={s.metricCard}>
      <h2 style={s.cardTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={s.statRow}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value ?? "—"}</span>
    </div>
  );
}

const s = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    backgroundColor: "#f8f9fa",
  },
  card: {
    maxWidth: 480,
    width: "100%",
    padding: "2.5rem",
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    textAlign: "center",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#212121",
    marginBottom: "0.5rem",
  },
  subtitle: { color: "#555", marginBottom: "1.5rem" },
  muted: { color: "#9E9E9E", fontSize: "0.875rem" },
  errorText: { color: "#c62828", fontSize: "0.9rem", marginTop: "1rem" },
  googleBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "1px solid #ddd",
    background: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 500,
    marginBottom: "1rem",
  },
  divider: { color: "#9E9E9E", margin: "0.75rem 0", fontSize: "0.875rem" },
  input: {
    display: "block",
    width: "100%",
    padding: "0.65rem 0.75rem",
    marginBottom: "0.75rem",
    borderRadius: "6px",
    border: "1px solid #ddd",
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    background: "#2196F3",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1.25rem",
    marginTop: "1.5rem",
  },
  metricCard: {
    background: "#f8f9fa",
    borderRadius: "8px",
    padding: "1.25rem",
  },
  cardTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#424242",
    marginBottom: "0.75rem",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.4rem",
  },
  statLabel: { color: "#757575", fontSize: "0.875rem" },
  statValue: { fontWeight: 700, fontSize: "1.1rem", color: "#212121" },
};
```

- [ ] **Step 3.2: Verify the web app builds**

```bash
cd web && npm run build 2>&1 | grep -E "error|Error|warning|Warning" | head -20
```

Expected: No errors. Warnings about unused vars in other files are pre-existing and can be ignored.

- [ ] **Step 3.3: Commit**

```bash
cd web && git add src/pages/FacilityDashboardPage.js
git commit -m "feat: add FacilityDashboardPage — authenticated alumni engagement dashboard"
```

---

## Task 4: Wire Route and Entry Point

**Files:**

- Modify: `web/src/App.js`
- Modify: `web/src/pages/TreatmentCenterSuccessPage.js`

- [ ] **Step 4.1: Add the route to `App.js`**

In `web/src/App.js`, add the import at the top (with the other standalone page imports):

```javascript
import FacilityDashboardPage from "./pages/FacilityDashboardPage";
```

Then add the route in the standalone pages group (after line 41, before the main site pages group):

```javascript
<Route path="/facility-dashboard" element={<FacilityDashboardPage />} />
```

- [ ] **Step 4.2: Add "View Dashboard" link to TreatmentCenterSuccessPage.js**

In `web/src/pages/TreatmentCenterSuccessPage.js`, add a link to the dashboard after the existing `<p style={styles.note}>` block:

```javascript
{
  isValidId && (
    <div style={{ marginTop: "1.5rem" }}>
      <a
        href={`/facility-dashboard?intergroupId=${encodeURIComponent(intergroupId)}`}
        style={styles.link}
      >
        View your facility dashboard →
      </a>
    </div>
  );
}
```

- [ ] **Step 4.3: Verify web app builds and routes work**

```bash
cd web && npm run build 2>&1 | grep -E "^(src|ERROR)" | head -20
```

Expected: No errors.

Run dev server and manually verify:

```bash
cd web && npm start
```

Open `http://localhost:3000/facility-dashboard?intergroupId=testid123456789` — should show the sign-in form (not a 404 or blank screen).

Open `http://localhost:3000/treatment-center-success?intergroupId=testid123456789` — should show the "View your facility dashboard →" link.

- [ ] **Step 4.4: Commit**

```bash
cd web && git add src/App.js src/pages/TreatmentCenterSuccessPage.js
git commit -m "feat: wire /facility-dashboard route and add entry link from treatment center success page"
```

---

## Task 5: Deploy

- [ ] **Step 5.1: Deploy the new Cloud Function**

```bash
cd functions && npm run deploy:changed 2>&1 | tail -20
```

Expected: `getFacilityEngagementMetrics` appears in the deployed functions list. If `deploy:changed` doesn't detect it as changed, run:

```bash
firebase deploy --only functions:getFacilityEngagementMetrics
```

- [ ] **Step 5.2: Deploy web hosting**

```bash
cd web && npm run build && firebase deploy --only hosting 2>&1 | tail -10
```

Expected: `Deploy complete!`

- [ ] **Step 5.3: Smoke-test the live function**

In a browser DevTools console on the deployed web app, signed in as a treatment center admin:

```javascript
// Replace with a real intergroupId from Firestore
const { httpsCallable, getFunctions } =
  await import("https://www.gstatic.com/firebasejs/10.0.0/firebase-functions.js");
```

Or more practically: navigate to `/facility-dashboard?intergroupId=<real-id>` and sign in as the treatment center admin. Verify the three metric cards appear with numbers (including zeros for early installs with no data yet).

- [ ] **Step 5.4: Commit deploy notes**

```bash
git commit --allow-empty -m "chore: deploy getFacilityEngagementMetrics function and facility dashboard web page"
```

---

## Bonus Task: Verify `getMeetingAttendance` is Regroup-callable

This is a verification task, not a code change. The function is already implemented — confirm it's deployed and accessible.

- [ ] **Step B.1: Confirm the function is deployed**

```bash
firebase functions:list 2>&1 | grep getMeetingAttendance
```

Expected output: `getMeetingAttendance` with status `ACTIVE` and an HTTP URL.

- [ ] **Step B.2: Test with a Regroup API key**

The function uses `Authorization: Bearer <RATS_API_KEY>` (not Firebase Auth). The key is stored in Firebase environment config. Confirm it's set:

```bash
firebase functions:config:get 2>&1 | grep rats
```

Or for Functions v2 (secrets):

```bash
firebase functions:secrets:access RATS_API_KEY 2>&1 | head -5
```

Share the function URL with Regroup. They should be able to call it as:

```
GET https://us-central1-recovery-connect-cad4b.cloudfunctions.net/getMeetingAttendance?groupId=XXX&userId=YYY
Authorization: Bearer <RATS_API_KEY>
```

- [ ] **Step B.3: Mark complete in REVENUE_OPPORTUNITIES.md**

Once Regroup confirms a successful call, update `docs/REVENUE_OPPORTUNITIES.md` item #11 to ✅:

```bash
# Find the line and mark it done
grep -n "getMeetingAttendance" docs/REVENUE_OPPORTUNITIES.md
```

Then edit the file and commit:

```bash
git add docs/REVENUE_OPPORTUNITIES.md
git commit -m "docs: mark getMeetingAttendance Regroup endpoint as verified"
```

---

## Self-Review

**Spec coverage check:**

| Requirement                                                              | Task                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| New `FacilityDashboardPage.js`                                           | Task 3                                                       |
| Cloud Function aggregating per-facility signals                          | Task 1                                                       |
| Auth gate: only `facilityId` / intergroup admins can access              | Task 1 (adminUids check)                                     |
| Meetings attended this week / month (anonymized)                         | Task 1 (meetings aggregation)                                |
| Milestone events 30/60/90/180-day (anonymized)                           | Task 1 (milestones aggregation)                              |
| Sponsorship links formed (anonymized)                                    | Task 1 (sponsorships count)                                  |
| No individual member data exposed                                        | Task 1 (only counts returned), Task 3 (UI shows only counts) |
| Works with existing `createIntergroup` + `type: "treatment_center"` flow | Task 4 (success page link)                                   |
| `getMeetingAttendance` Regroup verification                                 | Bonus Task                                                   |
| Deployed                                                                 | Task 5                                                       |

**Placeholder scan:** No TBD/TODO/placeholder patterns present.

**Type consistency:** `FacilityEngagementMetrics` interface defined once in `getFacilityEngagementMetrics.ts`, referenced in tests and returned by handler. Web page accesses `metrics.meetings.thisWeek`, `metrics.milestones.thirtyDay`, etc. — all match the interface definition.
