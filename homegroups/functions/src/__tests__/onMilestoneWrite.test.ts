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

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
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
          get: jest.fn().mockResolvedValue(g),
          collection: jest.fn(),
        }),
      };
    }
    if (name === "intergroups") {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(ig),
          collection: jest.fn().mockReturnValue({
            doc: jest.fn().mockReturnValue({
              set: mockStatsSet,
            }),
          }),
        }),
      };
    }
    if (name === "processed_milestone_events") {
      return {
        doc: jest.fn().mockReturnValue({
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
    it("first delivery: claims lock, increments stats, marks processed", async () => {
      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockLockCreate).toHaveBeenCalledTimes(1);
      expect(mockStatsSet).toHaveBeenCalledWith(
        expect.objectContaining({
          totalMilestonesAwarded: expect.objectContaining({ __increment: 1 }),
        }),
        { merge: true },
      );
      expect(mockLockUpdate).toHaveBeenCalledWith({ status: "processed" });
      expect(mockLockDelete).not.toHaveBeenCalled();
    });

    it("no delta: skips the stats write but still claims the lock", async () => {
      await capturedHandler(makeEvent({ beforeCount: 2, afterCount: 2 }));

      expect(mockLockCreate).toHaveBeenCalledTimes(1);
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

  describe("D-6 idempotency", () => {
    it("duplicate delivery (ALREADY_EXISTS): skips the stats write entirely", async () => {
      setupCollections();
      mockLockCreate.mockRejectedValueOnce(
        Object.assign(new Error("Document already exists"), { code: 6 }),
      );

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      expect(mockLockCreate).toHaveBeenCalledTimes(1);
      // No stats update on duplicate delivery
      expect(mockStatsSet).not.toHaveBeenCalled();
      // No lock delete (we didn't claim it; existing lock stays)
      expect(mockLockDelete).not.toHaveBeenCalled();
    });

    it("non-ALREADY_EXISTS lock failure: proceeds (event-drop avoidance)", async () => {
      setupCollections();
      mockLockCreate.mockRejectedValueOnce(
        Object.assign(new Error("Firestore unavailable"), { code: 14 }),
      );

      await capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 }));

      // Stats still updated despite the lock not being claimed
      expect(mockStatsSet).toHaveBeenCalledTimes(1);
    });

    it("downstream failure after lock claimed: releases the lock and rethrows", async () => {
      setupCollections();
      mockStatsSet.mockRejectedValueOnce(new Error("Firestore write failed"));

      await expect(
        capturedHandler(makeEvent({ beforeCount: 0, afterCount: 1 })),
      ).rejects.toThrow(/Firestore write failed/);

      expect(mockLockCreate).toHaveBeenCalledTimes(1);
      expect(mockLockDelete).toHaveBeenCalledTimes(1);
      // Lock was NOT marked "processed" — that only happens on success
      expect(mockLockUpdate).not.toHaveBeenCalled();
    });

    it("uses event.id as the lock document ID", async () => {
      const lockDocSpy = jest.fn().mockReturnValue({
        create: mockLockCreate,
        update: mockLockUpdate,
        delete: mockLockDelete,
      });
      mockCollection.mockImplementation((name: string) => {
        if (name === "groups") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(groupDoc),
              collection: jest.fn(),
            }),
          };
        }
        if (name === "intergroups") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(intergroupDoc),
              collection: jest.fn().mockReturnValue({
                doc: jest.fn().mockReturnValue({ set: mockStatsSet }),
              }),
            }),
          };
        }
        if (name === "processed_milestone_events") {
          return { doc: lockDocSpy };
        }
        return {};
      });

      await capturedHandler(
        makeEvent({ beforeCount: 0, afterCount: 1, eventId: "unique-evt-id" }),
      );

      expect(lockDocSpy).toHaveBeenCalledWith("unique-evt-id");
    });
  });
});
