/**
 * Tests for onMilestoneWrite — D-6 idempotency regression.
 *
 * Without an idempotency guard, v2 Firestore trigger retries (timeout,
 * OOM, network blip between increment landing and function returning)
 * would silently double-count `totalMilestonesAwarded` /
 * `milestonesThisMonth` / `milestonesThisYear` — directly inflating the
 * treatment-center facility-dashboard metrics that are sold at $99-999/mo.
 *
 * Refs: .audit/doc-code-discrepancies.md D-6
 */

export {};

// ---- Captured handler ----

let capturedHandler: (event: unknown) => Promise<unknown>;

jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: jest
    .fn()
    .mockImplementation((_path: string, handler: Function) => {
      capturedHandler = handler as typeof capturedHandler;
      return handler;
    }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ---- Firestore mocks ----

const mockStatsSet = jest.fn().mockResolvedValue(undefined);
const mockLockCreate = jest.fn().mockResolvedValue(undefined);
const mockLockUpdate = jest.fn().mockResolvedValue(undefined);
const mockLockDelete = jest.fn().mockResolvedValue(undefined);

const groupDoc = {
  exists: true,
  data: () => ({ orgId: "ig-1" }),
};
const intergroupDoc = {
  exists: true,
  data: () => ({ type: "treatment_center" }),
};

const mockCollection = jest.fn();

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: mockCollection }),
    {
      FieldValue: {
        increment: (n: number) => ({ __increment: n }),
        serverTimestamp: () => ({ __serverTimestamp: true }),
      },
    },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

// ------------------------------------------------------------------
// Transaction mocks (D-6 atomic rewrite).
//
// `db.runTransaction(fn)` invokes `fn` with a `tx` object exposing
// `get`/`set`. The default implementation here forwards to whatever
// `get`/`set` method exists on the ref that was passed in — this lets
// every pre-existing test (which wires `get`/`set` directly onto doc refs
// via `setupCollections`) keep working unchanged, since
// `tx.set(statsRef, ...)` transparently becomes `statsRef.set(...)`.
// Individual "D-6 idempotency" tests override `mockTxGet`/`mockTxSet`
// directly where the test's behavior hinges on the transaction body.
// ------------------------------------------------------------------
const mockTxGet = jest.fn(async (ref: any) => {
  if (ref && typeof ref.get === "function") {
    return ref.get();
  }
  return { exists: false };
});
const mockTxSet = jest.fn((ref: any, data: any, opts?: any) => {
  if (ref && typeof ref.set === "function") {
    return ref.set(data, opts);
  }
  return undefined;
});
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockTxGet, set: mockTxSet }),
);

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection, runTransaction: mockRunTransaction },
}));

// Wire up the collection mock for each test. `setupCollections` lets each
// test override behavior (e.g. simulate group not affiliated with intergroup).
function setupCollections(
  opts: {
    group?: typeof groupDoc;
    intergroup?: typeof intergroupDoc;
  } = {},
) {
  const g = opts.group ?? groupDoc;
  const ig = opts.intergroup ?? intergroupDoc;
  mockCollection.mockImplementation((name: string) => {
    if (name === "groups") {
      return {
        doc: jest.fn().mockReturnValue({
          __collection: "groups",
          get: jest.fn().mockResolvedValue(g),
          collection: jest.fn(),
        }),
      };
    }
    if (name === "intergroups") {
      return {
        doc: jest.fn().mockReturnValue({
          __collection: "intergroups",
          get: jest.fn().mockResolvedValue(ig),
          collection: jest.fn().mockReturnValue({
            doc: jest.fn().mockReturnValue({
              __collection: "facilityStats",
              set: mockStatsSet,
            }),
          }),
        }),
      };
    }
    if (name === "processed_milestone_events") {
      return {
        doc: jest.fn().mockReturnValue({
          __collection: "processed_milestone_events",
          create: mockLockCreate,
          update: mockLockUpdate,
          delete: mockLockDelete,
        }),
      };
    }
    return {};
  });
}

// ---- Helpers ----

function makeEvent(opts: {
  beforeCount?: number;
  afterCount?: number;
  eventId?: string;
}) {
  const { beforeCount = 0, afterCount = 1, eventId = "evt-001" } = opts;
  const makeMilestones = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      days: 30 * (i + 1),
      chipGivenAt: { toDate: () => new Date() },
      chipGivenBy: "admin-1",
    }));
  return {
    id: eventId,
    params: { groupId: "group-1", memberId: "member-1" },
    data: {
      before: {
        data: () =>
          beforeCount > 0 ? { milestones: makeMilestones(beforeCount) } : {},
      },
      after: {
        data: () => ({ milestones: makeMilestones(afterCount) }),
      },
    },
  };
}

// ---- Tests ----

describe("onMilestoneWrite", () => {
  beforeAll(async () => {
    await import("../triggers/firestore/onMilestoneWrite");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setupCollections();
  });

  describe("happy path", () => {
    it("first delivery: runs the atomic transaction, increments stats, writes a processed lock", async () => {
      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockStatsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          totalMilestonesAwarded: expect.objectContaining({ __increment: 1 }),
        }),
        { merge: true },
      );
    });

    it("no delta: skips the stats write and never starts a transaction", async () => {
      await capturedHandler(makeEvent({ beforeCount: 2, afterCount: 2 }));

      // delta === 0 returns before the lock/transaction is ever touched.
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockStatsSet).not.toHaveBeenCalled();
    });

    it("group not affiliated with any intergroup: short-circuits without stats write", async () => {
      setupCollections({
        group: { exists: true, data: () => ({ orgId: undefined }) },
      });

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockStatsSet).not.toHaveBeenCalled();
    });

    it("intergroup is not a treatment_center: short-circuits", async () => {
      setupCollections({
        intergroup: { exists: true, data: () => ({ type: "intergroup" }) },
      });

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockStatsSet).not.toHaveBeenCalled();
    });
  });

  describe("D-6 idempotency (atomic transaction)", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupCollections();
      mockRunTransaction.mockImplementation(async (fn: any) =>
        fn({ get: mockTxGet, set: mockTxSet }),
      );
    });

    it("first delivery: no existing lock, applies the increment and writes a processed lock", async () => {
      mockTxGet.mockImplementation(async (ref: any) => {
        if (ref.__collection === "processed_milestone_events") {
          return { exists: false };
        }
        if (ref.__collection === "groups") {
          return groupDoc;
        }
        if (ref.__collection === "intergroups") {
          return intergroupDoc;
        }
        return { exists: false };
      });

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          __collection: "processed_milestone_events",
        }),
        expect.objectContaining({ status: "processed" }),
      );
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({ __collection: "facilityStats" }),
        expect.anything(),
        { merge: true },
      );
    });

    it("duplicate delivery: lock already exists, skips the increment entirely", async () => {
      mockTxGet.mockImplementation(async (ref: any) => {
        if (ref.__collection === "processed_milestone_events") {
          return { exists: true };
        }
        return { exists: false };
      });

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockTxSet).not.toHaveBeenCalled();
    });

    it("a failed transaction rethrows and leaves no partial state to clean up", async () => {
      mockRunTransaction.mockRejectedValueOnce(
        new Error("Firestore contention"),
      );

      await expect(
        capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 })),
      ).rejects.toThrow(/Firestore contention/);
    });

    it("uses event.id as the lock document ID", async () => {
      mockTxGet.mockResolvedValue({ exists: false });
      const lockDocSpy = jest.fn((id: string) => ({
        id,
        __collection: "processed_milestone_events",
      }));
      mockCollection.mockImplementation((name: string) => {
        if (name === "processed_milestone_events") {
          return { doc: lockDocSpy };
        }
        return {
          doc: jest.fn((id: string) => ({ id, __collection: name })),
        };
      });

      await capturedHandler(
        makeEvent({ beforeCount: 0, afterCount: 1, eventId: "unique-evt-id" }),
      );

      expect(lockDocSpy).toHaveBeenCalledWith("unique-evt-id");
    });
  });
});
