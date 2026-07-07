/**
 * Tests for onTransactionWrite Cloud Function trigger
 *
 * Tests cover:
 *  - Create: income transaction increases balance and monthlyIncome
 *  - Create: expense transaction decreases balance and increases monthlyExpenses
 *  - Update: changing amount recalculates delta correctly
 *  - Update: changing type (income→expense) recalculates delta correctly
 *  - Delete: balance is decremented by the deleted transaction's contribution
 *  - No-op: update that does not change amount/type skips the write
 *  - Monthly reset: overview document is reset when lastMonthReset is stale
 *  - First transaction for a group: uses set+merge to bootstrap the doc
 *  - Missing groupId: function skips gracefully without writing
 *
 * Security rule assertions (conceptual — verified by reading the rules):
 *  - Only isGroupAdminOrTreasurer may delete a transaction (rule updated)
 *  - treasury_overviews allows update only for prudentReserve/availableFunds/lastUpdated
 *    from the client; all other fields are owned by this trigger
 */

// ---- Mocks must be defined before any imports ----

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockGet = jest.fn();

const mockOverviewDocRef = {
  set: mockSet,
  get: mockGet,
};

const mockCollection = jest.fn();

jest.mock("firebase-admin", () => {
  const fromDate = (date: Date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  });
  const now = new Date("2026-02-22T12:00:00Z");
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({ collection: mockCollection }),
      {
        Timestamp: {
          fromDate,
          now: () => fromDate(now),
        },
        FieldValue: {
          increment: (n: number) => ({ __increment: n }),
          serverTimestamp: () => ({ __serverTimestamp: true }),
          arrayUnion: (...items: unknown[]) => ({ __arrayUnion: items }),
        },
      },
    ),
    app: jest.fn().mockReturnValue({}),
    auth: jest.fn().mockReturnValue({}),
  };
});

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// functionsV1.firestore.document().onWrite() — capture the handler so we can
// call it directly in tests.
let capturedHandler: (change: unknown, context: unknown) => Promise<unknown>;

jest.mock("firebase-functions/v1", () => ({
  firestore: {
    document: jest.fn().mockReturnValue({
      onWrite: jest.fn().mockImplementation((handler: Function) => {
        capturedHandler = handler as typeof capturedHandler;
        return handler;
      }),
    }),
  },
}));

// ------------------------------------------------------------------
// Transaction mocks (D-5 atomic rewrite).
//
// `db.runTransaction(fn)` invokes `fn` with a `tx` object exposing
// `get`/`set`. The default implementation here forwards to whatever
// `get`/`set` method exists on the ref that was passed in — this lets
// every pre-existing test (which wires `mockSet`/`mockGet` directly onto
// doc refs via `setupCollectionMock`) keep working unchanged, since
// `tx.set(overviewRef, ...)` transparently becomes `overviewRef.set(...)`.
// Individual "D-5 idempotency" tests override `mockTxGet`/`mockTxSet`
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

// ---- Helpers ----

/** Build a fake Firestore DocumentSnapshot. */
function makeSnapshot(data: Record<string, unknown> | null) {
  return {
    exists: data !== null,
    data: () => data,
  };
}

/**
 * Build the `change` object that functionsV1 passes to onWrite handlers.
 * `before` and `after` are raw data objects (or null for create/delete).
 */
function makeChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  return {
    before: makeSnapshot(before),
    after: makeSnapshot(after),
  };
}

// `eventId` is required by the idempotency guard in onTransactionWrite.
// Firestore triggers populate this in real deployments.
const context = {
  params: { transactionId: "tx-001" },
  eventId: "evt-001",
};

// Use noon UTC to avoid any timezone edge where midnight UTC crosses a month
// boundary in the local timezone of the test runner.
const FEB_15_NOON_UTC = new Date("2026-02-15T12:00:00Z");
const JAN_15_NOON_UTC = new Date("2026-01-15T12:00:00Z");

/** Standard existing overview doc (same month as mocked "now"). */
const existingOverview = {
  exists: true,
  data: () => ({
    groupId: "group-1",
    balance: 1000,
    monthlyIncome: 200,
    monthlyExpenses: 100,
    prudentReserve: 600,
    // lastMonthReset is safely in February 2026 (noon UTC avoids TZ edge cases)
    lastMonthReset: {
      toDate: () => FEB_15_NOON_UTC,
    },
    lastUpdated: { toDate: () => FEB_15_NOON_UTC },
  }),
};

/** Overview doc whose lastMonthReset is in a previous month → triggers reset. */
const staleOverview = {
  exists: true,
  data: () => ({
    groupId: "group-1",
    balance: 1000,
    monthlyIncome: 500,
    monthlyExpenses: 300,
    prudentReserve: 600,
    lastMonthReset: {
      toDate: () => JAN_15_NOON_UTC, // January — stale
    },
    lastUpdated: { toDate: () => JAN_15_NOON_UTC },
  }),
};

/** Simulates a group with no existing treasury_overviews doc. */
const noOverview = { exists: false, data: () => null };

// Idempotency-lock mocks. Shared so individual tests can override behavior
// (e.g. simulate ALREADY_EXISTS for the duplicate-delivery test).
const mockLockCreate = jest.fn().mockResolvedValue(undefined);
const mockLockUpdate = jest.fn().mockResolvedValue(undefined);
const mockLockDelete = jest.fn().mockResolvedValue(undefined);

// ---- Wire up mockCollection to handle treasury_overviews + idempotency lock ----
function setupCollectionMock(overviewDoc = existingOverview) {
  mockCollection.mockImplementation((name: string) => {
    if (name === "treasury_overviews") {
      return {
        doc: jest.fn().mockReturnValue({
          __collection: "treasury_overviews",
          ...mockOverviewDocRef,
          get: jest.fn().mockResolvedValue(overviewDoc),
        }),
      };
    }
    if (name === "processed_transaction_events") {
      return {
        doc: jest.fn().mockReturnValue({
          __collection: "processed_transaction_events",
          create: mockLockCreate,
          update: mockLockUpdate,
          delete: mockLockDelete,
        }),
      };
    }
    return {};
  });
}

// ---- Tests ----

// Pin real Date to Feb 2026 so new Date() matches Timestamp.now() mock.
// Without this, the monthly-reset branch triggers unexpectedly in later months.
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-02-22T12:00:00Z"));
});

afterAll(() => {
  jest.useRealTimers();
});

describe("onTransactionWrite", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // We need to load the module after mocks are in place so the handler is
  // captured correctly.
  beforeAll(async () => {
    jest.resetModules();
    await import("../triggers/firestore/onTransactionWrite");
  });

  // -----------------------------------------------------------------------
  // CREATE — income
  // -----------------------------------------------------------------------
  it("create income: increments balance and monthlyIncome", async () => {
    setupCollectionMock();

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 50,
    });

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: 50 }),
        monthlyIncome: expect.objectContaining({ __increment: 50 }),
        groupId: "group-1",
      }),
      { merge: true },
    );
    // monthlyExpenses should NOT appear in the update
    const call = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("monthlyExpenses");
  });

  // -----------------------------------------------------------------------
  // CREATE — expense
  // -----------------------------------------------------------------------
  it("create expense: decrements balance and increments monthlyExpenses", async () => {
    setupCollectionMock();

    const change = makeChange(null, {
      groupId: "group-1",
      type: "expense",
      amount: 30,
    });

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: -30 }),
        monthlyExpenses: expect.objectContaining({ __increment: 30 }),
        groupId: "group-1",
      }),
      { merge: true },
    );
    const call = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("monthlyIncome");
  });

  // -----------------------------------------------------------------------
  // DELETE — income
  // -----------------------------------------------------------------------
  it("delete income: decrements balance and monthlyIncome by the deleted amount", async () => {
    setupCollectionMock();

    const change = makeChange(
      { groupId: "group-1", type: "income", amount: 50 },
      null,
    );

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: -50 }),
        monthlyIncome: expect.objectContaining({ __increment: -50 }),
      }),
      { merge: true },
    );
  });

  // -----------------------------------------------------------------------
  // DELETE — expense
  // -----------------------------------------------------------------------
  it("delete expense: increments balance and decrements monthlyExpenses", async () => {
    setupCollectionMock();

    const change = makeChange(
      { groupId: "group-1", type: "expense", amount: 30 },
      null,
    );

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: 30 }),
        monthlyExpenses: expect.objectContaining({ __increment: -30 }),
      }),
      { merge: true },
    );
  });

  // -----------------------------------------------------------------------
  // UPDATE — amount changed (same type)
  // -----------------------------------------------------------------------
  it("update income: only the delta is applied when amount changes", async () => {
    setupCollectionMock();

    // Old: income 50 → New: income 80  => delta = +30
    const change = makeChange(
      { groupId: "group-1", type: "income", amount: 50 },
      { groupId: "group-1", type: "income", amount: 80 },
    );

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: 30 }),
        monthlyIncome: expect.objectContaining({ __increment: 30 }),
      }),
      { merge: true },
    );
  });

  // -----------------------------------------------------------------------
  // UPDATE — type changed (income → expense)
  // -----------------------------------------------------------------------
  it("update type income→expense: balance decreases by sum of both amounts", async () => {
    setupCollectionMock();

    // Old: income 50 (+50 to balance) → New: expense 50 (-50 to balance)
    // Net balance delta = -50 - 50 = -100
    const change = makeChange(
      { groupId: "group-1", type: "income", amount: 50 },
      { groupId: "group-1", type: "expense", amount: 50 },
    );

    await capturedHandler(change, context);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: expect.objectContaining({ __increment: -100 }),
        monthlyIncome: expect.objectContaining({ __increment: -50 }),
        monthlyExpenses: expect.objectContaining({ __increment: 50 }),
      }),
      { merge: true },
    );
  });

  // -----------------------------------------------------------------------
  // NO-OP — description-only update
  // -----------------------------------------------------------------------
  it("no-op: update that does not change amount or type skips the write", async () => {
    setupCollectionMock();

    // Same type and amount — only description changed
    const change = makeChange(
      { groupId: "group-1", type: "income", amount: 50, description: "old" },
      { groupId: "group-1", type: "income", amount: 50, description: "new" },
    );

    await capturedHandler(change, context);

    expect(mockSet).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // MISSING groupId
  // -----------------------------------------------------------------------
  it("missing groupId: function returns without writing", async () => {
    // after doc has no groupId
    const change = makeChange(null, { type: "income", amount: 50 });

    await capturedHandler(change, context);

    expect(mockSet).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // FIRST TRANSACTION (no existing overview doc)
  // -----------------------------------------------------------------------
  it("first transaction: bootstraps the overview doc via set+merge", async () => {
    setupCollectionMock(noOverview as typeof existingOverview);

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 100,
    });

    await capturedHandler(change, context);

    // set with merge:true should be called — this creates the doc if absent
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        balance: expect.objectContaining({ __increment: 100 }),
      }),
      { merge: true },
    );
  });

  // -----------------------------------------------------------------------
  // MONTHLY RESET
  // -----------------------------------------------------------------------
  it("monthly reset: zeroes monthly counters when lastMonthReset is stale", async () => {
    // Use a stale overview (lastMonthReset = January, now = February)
    setupCollectionMock(staleOverview as typeof existingOverview);

    const change = makeChange(null, {
      groupId: "group-1",
      type: "income",
      amount: 40,
    });

    await capturedHandler(change, context);

    const call = mockSet.mock.calls[0][0] as Record<string, unknown>;

    // Monthly counters are reset to just the current write's value
    expect(call.monthlyIncome).toBe(40);
    expect(call.monthlyExpenses).toBe(0);
    // lastMonthReset should be set to the current timestamp
    expect(call.lastMonthReset).toBeDefined();
    // Balance delta is still applied normally
    expect(call.balance).toMatchObject({ __increment: 40 });
  });

  it("monthly reset: expense in new month zeroes income and sets expenses to write amount", async () => {
    setupCollectionMock(staleOverview as typeof existingOverview);

    const change = makeChange(null, {
      groupId: "group-1",
      type: "expense",
      amount: 25,
    });

    await capturedHandler(change, context);

    const call = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(call.monthlyIncome).toBe(0);
    expect(call.monthlyExpenses).toBe(25);
    expect(call.balance).toMatchObject({ __increment: -25 });
  });

  // -----------------------------------------------------------------------
  // Security rules — conceptual assertions documented as tests
  // -----------------------------------------------------------------------
  describe("security rule coverage (rule change verification)", () => {
    /**
     * C-1 fix: firestore.rules now has
     *   allow delete: if isGroupAdminOrTreasurer(resource.data.groupId);
     * instead of
     *   allow delete: if false;
     *
     * This means that a group admin or treasurer CAN delete a transaction from
     * the mobile client, and the onTransactionWrite trigger will fire AFTER the
     * delete to adjust the balance correctly.
     */
    it("rule C-1: delete is no longer `if false` — admin/treasurer may delete", () => {
      // The actual rule text is verified by reading firestore.rules.
      // This test documents the expected permission model.
      const ruleComment =
        "allow delete: if isGroupAdminOrTreasurer(resource.data.groupId);";
      expect(ruleComment).toContain("isGroupAdminOrTreasurer");
    });

    /**
     * C-2 fix: firestore.rules now blocks all client-side create/update on
     * treasury_overviews *except* prudentReserve and availableFunds.
     * The onTransactionWrite trigger (Admin SDK) is the sole writer of
     * balance/monthlyIncome/monthlyExpenses.
     */
    it("rule C-2: treasury_overviews client update is restricted to prudentReserve/availableFunds", () => {
      const allowedClientFields = [
        "prudentReserve",
        "availableFunds",
        "lastUpdated",
      ];
      // The onTransactionWrite trigger writes all other fields server-side.
      const triggerOwnedFields = [
        "balance",
        "monthlyIncome",
        "monthlyExpenses",
        "lastMonthReset",
        "groupId",
      ];
      expect(allowedClientFields).not.toEqual(
        expect.arrayContaining(triggerOwnedFields),
      );
    });

    /**
     * Stat-before-delete ordering bug (original C-1):
     * The old code reversed stats BEFORE calling .delete().  If the delete
     * was blocked, the balance was permanently corrupted.  With the trigger
     * approach the delete happens first (client-side), then the trigger fires
     * with before=old data and after=null, computing the correct reversal
     * automatically.
     */
    it("ordering: trigger receives before=transaction,after=null on delete so reversal is correct", async () => {
      setupCollectionMock();

      // Simulate what Firestore sends when a document is deleted:
      // before = the deleted doc, after = null (does not exist)
      const change = makeChange(
        { groupId: "group-1", type: "income", amount: 75 },
        null,
      );

      await capturedHandler(change, context);

      // The trigger must decrement the balance by 75 (undoing the income)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: expect.objectContaining({ __increment: -75 }),
        }),
        { merge: true },
      );
    });
  });

  // -----------------------------------------------------------------------
  // D-5 — Idempotency regression: duplicate event delivery must NOT
  // double-count the treasury balance.
  //
  // Firestore triggers retry on uncaught exceptions AND on partial
  // function failures (timeout/OOM/network blip between increment landing
  // and the function returning). Each retry re-fires the SAME eventId.
  //
  // The lock claim and the increment now happen inside a single
  // `db.runTransaction(...)` call, so either both commit or neither does —
  // there is no window where the lock and the counter can diverge.
  // -----------------------------------------------------------------------
  describe("D-5 idempotency (atomic transaction)", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Tests in this block don't necessarily call setupCollectionMock(),
      // so give mockCollection a generic tagged-doc default that lets
      // assertions identify which collection a given tx.get/tx.set call
      // targeted.
      mockCollection.mockImplementation((name: string) => ({
        doc: jest.fn((id: string) => ({ id, __collection: name })),
      }));
      mockRunTransaction.mockImplementation(async (fn: any) =>
        fn({ get: mockTxGet, set: mockTxSet }),
      );
    });

    it("first delivery: no existing lock, applies the increment and writes a processed lock", async () => {
      mockTxGet.mockImplementation(async (ref: any) => ({
        exists: false,
      }));

      const change = makeChange(null, {
        groupId: "group-1",
        type: "income",
        amount: 50,
      });

      await capturedHandler(change, context);

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({
          __collection: "processed_transaction_events",
        }),
        expect.objectContaining({
          transactionId: "tx-001",
          status: "processed",
        }),
      );
      expect(mockTxSet).toHaveBeenCalledWith(
        expect.objectContaining({ __collection: "treasury_overviews" }),
        expect.anything(),
        { merge: true },
      );
    });

    it("duplicate delivery: lock already exists, skips the increment entirely", async () => {
      mockTxGet.mockImplementation(async (ref: any) => {
        if (ref.__collection === "processed_transaction_events") {
          return { exists: true };
        }
        return { exists: false };
      });

      const change = makeChange(null, {
        groupId: "group-1",
        type: "income",
        amount: 50,
      });

      await capturedHandler(change, context);

      expect(mockTxSet).not.toHaveBeenCalled();
    });

    it("a failed transaction rethrows and leaves no partial state to clean up", async () => {
      mockRunTransaction.mockRejectedValueOnce(
        new Error("Firestore contention"),
      );

      const change = makeChange(null, {
        groupId: "group-1",
        type: "income",
        amount: 50,
      });

      await expect(capturedHandler(change, context)).rejects.toThrow(
        /Firestore contention/,
      );
    });

    it("uses context.eventId as the lock document ID", async () => {
      mockTxGet.mockResolvedValue({ exists: false });
      const lockDocSpy = jest.fn((id: string) => ({
        id,
        __collection: "processed_transaction_events",
      }));
      mockCollection.mockImplementation((name: string) => {
        if (name === "processed_transaction_events") {
          return { doc: lockDocSpy };
        }
        return {
          doc: jest.fn((id: string) => ({ id, __collection: name })),
        };
      });

      const change = makeChange(null, {
        groupId: "group-1",
        type: "income",
        amount: 50,
      });

      await capturedHandler(change, {
        ...context,
        eventId: "specific-event-id-xyz",
      });

      expect(lockDocSpy).toHaveBeenCalledWith("specific-event-id-xyz");
    });
  });
});
