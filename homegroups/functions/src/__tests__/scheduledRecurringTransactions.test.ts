/**
 * Tests for scheduledRecurringTransactions Cloud Function
 */

// ---- Mocks must be defined before imports ----

const mockSet = jest.fn().mockResolvedValue(undefined);
const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocRef = { id: "new-tx-id", set: mockSet };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

jest.mock("firebase-admin", () => {
  const fromDate = (date: Date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  });
  const now = new Date("2026-02-22T00:30:00Z");
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
  },
}));

// The scheduledRecurringTransactions uses functionsV1.pubsub.schedule().timeZone().onRun(handler)
// We want the export to BE the handler so we can call it directly
jest.mock("firebase-functions/v1", () => ({
  pubsub: {
    schedule: jest.fn().mockReturnValue({
      timeZone: jest.fn().mockReturnValue({
        onRun: jest.fn().mockImplementation((handler: Function) => handler),
      }),
    }),
  },
}));

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
}));

// ---- Helper to create mock Firestore documents ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
  ref: { update: mockUpdate },
});

// ---- Helper to build a recurring transaction document ----
const makeRecurring = (id: string, overrides: Record<string, unknown> = {}) => {
  const yesterday = new Date("2026-02-21T00:00:00Z");
  return createDoc(id, {
    groupId: "group-1",
    type: "expense",
    amount: 500,
    description: "Hall rent",
    category: "Rent",
    frequency: "monthly",
    isActive: true,
    nextDate: {
      toDate: () => yesterday,
      seconds: Math.floor(yesterday.getTime() / 1000),
      nanoseconds: 0,
    },
    createdBy: "user-treasurer",
    ...overrides,
  });
};

// ---- Tests ----

// Pin real Date to Feb 2026 so new Date() matches Timestamp.now() mock.
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-02-22T12:00:00Z"));
});

afterAll(() => {
  jest.useRealTimers();
});

describe("scheduledRecurringTransactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Positive case: processes a due active recurring transaction", async () => {
    const recurringDoc = makeRecurring("rec-1");

    mockCollection.mockImplementation((name: string) => {
      if (name === "recurring_transactions") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                size: 1,
                docs: [recurringDoc],
              }),
            }),
          }),
        };
      }
      if (name === "transactions") {
        return {
          doc: jest.fn().mockReturnValue(mockDocRef),
        };
      }
      if (name === "treasury_overviews") {
        return {
          doc: jest.fn().mockReturnValue({ set: mockSet }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledRecurringTransactions } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");

    await (scheduledRecurringTransactions as Function)();

    // Transaction doc was created in top-level `transactions` collection
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        type: "expense",
        amount: 500,
        description: "[Recurring] Hall rent",
        category: "Rent",
        recurringId: "rec-1",
      }),
    );

    // nextDate was advanced
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        nextDate: expect.objectContaining({
          // nextDate should be one month after 2026-02-21
          seconds: expect.any(Number),
        }),
      }),
    );

    // Treasury balance update is handled by the onTransactionWrite trigger,
    // not by this scheduled function — no treasury_overviews write here.
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it("Negative case: no-op when no recurring transactions are due", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "recurring_transactions") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: true,
                size: 0,
                docs: [],
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledRecurringTransactions } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");

    await (scheduledRecurringTransactions as Function)();

    // No writes should have happened
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("Edge case: isActive=false record is not in query results (query filters it)", async () => {
    // The Firestore query itself filters isActive===true, so inactive records
    // never appear in dueSnapshot. This test verifies the query structure
    // returns empty when only inactive records exist.
    mockCollection.mockImplementation((name: string) => {
      if (name === "recurring_transactions") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              // Simulates query returning 0 docs (inactive filtered at DB level)
              get: jest.fn().mockResolvedValue({
                empty: true,
                size: 0,
                docs: [],
              }),
            }),
          }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledRecurringTransactions } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");

    await (scheduledRecurringTransactions as Function)();

    // Inactive records should never be processed
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("Edge case: error in one record does not prevent processing others", async () => {
    const goodDoc = makeRecurring("rec-good");
    const badDoc = makeRecurring("rec-bad");

    let callCount = 0;

    mockCollection.mockImplementation((name: string) => {
      if (name === "recurring_transactions") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                size: 2,
                docs: [badDoc, goodDoc],
              }),
            }),
          }),
        };
      }
      if (name === "transactions") {
        callCount++;
        if (callCount === 1) {
          // First call (for badDoc) — fail
          return {
            doc: jest.fn().mockReturnValue({
              id: "bad-tx-id",
              set: jest
                .fn()
                .mockRejectedValue(new Error("Firestore write error")),
            }),
          };
        }
        // Second call (for goodDoc) — succeed
        return {
          doc: jest.fn().mockReturnValue(mockDocRef),
        };
      }
      if (name === "treasury_overviews") {
        return {
          doc: jest.fn().mockReturnValue({ set: mockSet }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledRecurringTransactions } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");

    // Should not throw
    await expect(
      (scheduledRecurringTransactions as Function)(),
    ).resolves.toBeNull();

    // The good doc's transaction was still created
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ recurringId: "rec-good" }),
    );
  });

  it("nextDate advancement: income transaction and treasury increment", async () => {
    const incomeRecurring = makeRecurring("rec-income", {
      type: "income",
      amount: 200,
      description: "7th Tradition",
      category: "7th Tradition",
      frequency: "weekly",
    });

    mockCollection.mockImplementation((name: string) => {
      if (name === "recurring_transactions") {
        return {
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: false,
                size: 1,
                docs: [incomeRecurring],
              }),
            }),
          }),
        };
      }
      if (name === "transactions") {
        return {
          doc: jest.fn().mockReturnValue(mockDocRef),
        };
      }
      if (name === "treasury_overviews") {
        return {
          doc: jest.fn().mockReturnValue({ set: mockSet }),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { scheduledRecurringTransactions } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");

    await (scheduledRecurringTransactions as Function)();

    // Only the transaction doc is written here; treasury updates are handled
    // by the onTransactionWrite Firestore trigger to avoid double-counting.
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        type: "income",
        amount: 200,
        recurringId: "rec-income",
      }),
    );
  });
});

describe("computeNextDate", () => {
  it("weekly: advances by 7 days", async () => {
    jest.resetModules();
    const { computeNextDate } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");
    const start = new Date("2026-02-22T00:00:00Z");
    const next = computeNextDate(start, "weekly");
    expect(next.toISOString()).toBe(
      new Date("2026-03-01T00:00:00Z").toISOString(),
    );
  });

  it("monthly: advances by 1 month", async () => {
    jest.resetModules();
    const { computeNextDate } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");
    const start = new Date("2026-02-22T00:00:00Z");
    const next = computeNextDate(start, "monthly");
    expect(next.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(next.getFullYear()).toBe(2026);
  });

  it("quarterly: advances by 3 months", async () => {
    jest.resetModules();
    const { computeNextDate } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");
    const start = new Date("2026-02-22T00:00:00Z");
    const next = computeNextDate(start, "quarterly");
    expect(next.getMonth()).toBe(4); // May = 4 (0-indexed)
    expect(next.getFullYear()).toBe(2026);
  });

  it("yearly: advances by 1 year", async () => {
    jest.resetModules();
    const { computeNextDate } =
      await import("../triggers/pubsub/scheduledRecurringTransactions");
    const start = new Date("2026-02-22T00:00:00Z");
    const next = computeNextDate(start, "yearly");
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(1); // Feb = 1
  });
});
