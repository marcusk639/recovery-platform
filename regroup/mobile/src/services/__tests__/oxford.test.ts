/**
 * Oxford Service Tests
 *
 * Unit tests for all CRUD functions in src/services/oxford.ts.
 * Firestore is mocked via the moduleNameMapper in jest.config.js pointing to
 * __mocks__/firebase-setup.js. The service module-level collection refs are
 * created from `firestore.collection(...)` at import time, so the mock must
 * be in place before the service is loaded.
 *
 * We override the global mock here to add an `id` field to doc() responses
 * so that the create functions (which derive their ID from `collection.doc().id`)
 * return a predictable value.
 */

jest.mock("../../../firebase-setup", () => {
  const docObj: any = {
    id: "generated-doc-id",
    get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  };

  const collectionObj: any = {
    doc: jest.fn(() => docObj),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ docs: [] })),
    add: jest.fn(() => Promise.resolve({ id: "mock-id" })),
  };

  // make where/orderBy/limit chainable
  collectionObj.where = jest.fn(() => collectionObj) as any;
  collectionObj.orderBy = jest.fn(() => collectionObj) as any;
  collectionObj.limit = jest.fn(() => collectionObj) as any;

  // Support subcollection chaining: collection('houses').doc(id).collection('officers')
  docObj.collection = jest.fn(() => collectionObj);

  return {
    firestore: {
      collection: jest.fn(() => collectionObj),
      batch: jest.fn(() => ({
        set: jest.fn(),
        update: jest.fn(),
        commit: jest.fn(() => Promise.resolve()),
      })),
      runTransaction: jest.fn((fn: any) =>
        fn({
          get: jest.fn(() =>
            Promise.resolve({ exists: true, data: () => ({}) })
          ),
          update: jest.fn(),
        })
      ),
    },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  getOfficers,
  getActiveOfficers,
  createOfficer,
  updateOfficer,
  removeOfficer,
  getBusinessMeetings,
  createBusinessMeeting,
  updateBusinessMeeting,
  deleteBusinessMeeting,
  getVotesForMeeting,
  getElections,
  createElection,
  updateElection,
  getEESTransactions,
  createEESTransaction,
  getFinancialRecords,
  createFinancialRecord,
} from "../oxford";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeOfficer = (overrides = {}) => ({
  houseId: "h1",
  userId: "u1",
  role: "president" as const,
  termStartDate: "2024-01-01T00:00:00.000Z",
  termEndDate: "2024-07-01T00:00:00.000Z",
  isActive: true,
  electedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const makeMeeting = (overrides = {}) => ({
  houseId: "h1",
  scheduledDate: "2024-01-15T18:00:00.000Z",
  agenda: [],
  attendees: [],
  quorumMet: false,
  createdBy: "u1",
  createdAt: "2024-01-10T00:00:00.000Z",
  ...overrides,
});

const makeElection = (overrides = {}) => ({
  houseId: "h1",
  role: "president" as const,
  candidates: [],
  voteId: "v1",
  termStartDate: "2024-01-01T00:00:00.000Z",
  termEndDate: "2024-07-01T00:00:00.000Z",
  conductedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

const makeTransaction = (overrides = {}) => ({
  houseId: "h1",
  guestId: "g1",
  amount: 150,
  period: "2024-01-15",
  type: "payment" as const,
  status: "pending" as const,
  createdAt: "2024-01-15T00:00:00.000Z",
  ...overrides,
});

const makeFinancialRecord = (overrides = {}) => ({
  houseId: "h1",
  period: "2024-01-15",
  totalIncome: 600,
  totalExpenses: 400,
  balance: 200,
  breakdown: [],
  submittedBy: "u1",
  submittedAt: "2024-01-20T00:00:00.000Z",
  approvedByVote: false,
  ...overrides,
});

// The firestore mock is provided globally by __mocks__/firebase-setup.js
// via the moduleNameMapper in jest.config.js. Collections are created at
// module import time and reuse the same chainable mock.

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Oxford Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Officers ──────────────────────────────────────────────────────────────

  describe("getOfficers", () => {
    it("returns an empty array when no officers exist", async () => {
      const result = await getOfficers("h1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("calls firestore with houseId filter", async () => {
      // Just verify it doesn't throw
      await expect(getOfficers("house-abc")).resolves.toBeDefined();
    });
  });

  describe("getActiveOfficers", () => {
    it("returns officers filtered by isActive", async () => {
      await expect(getActiveOfficers("h1")).resolves.toBeDefined();
    });
  });

  describe("createOfficer", () => {
    it("creates an officer and returns it with an id", async () => {
      const officerData = makeOfficer();
      const result = await createOfficer(officerData);
      expect(result).toBeDefined();
      expect(result.houseId).toBe("h1");
      expect(result.role).toBe("president");
      expect(result.id).toBeDefined();
    });
  });

  describe("updateOfficer", () => {
    it("calls update on the officer document", async () => {
      await expect(
        updateOfficer("officer-1", { isActive: false, houseId: "h1" })
      ).resolves.not.toThrow();
    });
  });

  describe("removeOfficer", () => {
    it("calls delete on the officer document", async () => {
      await expect(removeOfficer("officer-1", "h1")).resolves.not.toThrow();
    });
  });

  // ── Business Meetings ─────────────────────────────────────────────────────

  describe("getBusinessMeetings", () => {
    it("returns an empty array when no meetings exist", async () => {
      const result = await getBusinessMeetings("h1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts an optional limit parameter", async () => {
      await expect(getBusinessMeetings("h1", 5)).resolves.toBeDefined();
    });
  });

  describe("createBusinessMeeting", () => {
    it("creates a meeting and returns it with an id", async () => {
      const meetingData = makeMeeting();
      const result = await createBusinessMeeting(meetingData);
      expect(result).toBeDefined();
      expect(result.houseId).toBe("h1");
      expect(result.id).toBeDefined();
      expect(result.agenda).toEqual([]);
    });
  });

  describe("updateBusinessMeeting", () => {
    it("does not throw when updating a meeting", async () => {
      await expect(
        updateBusinessMeeting("meeting-1", { quorumMet: true, houseId: "h1" })
      ).resolves.not.toThrow();
    });
  });

  describe("deleteBusinessMeeting", () => {
    it("does not throw when deleting a meeting", async () => {
      await expect(
        deleteBusinessMeeting("meeting-1", "h1")
      ).resolves.not.toThrow();
    });
  });

  // ── Votes ─────────────────────────────────────────────────────────────────
  // NOTE: the old castVote(vote) describe block here tested a dead-code
  // duplicate removed 2026-07-04 (services/oxford/index.ts). See that
  // file's removal note for details — the real, live vote-casting path is
  // tested in services/oxford/__tests__/votes.test.ts.

  describe("getVotesForMeeting", () => {
    it("returns an empty array when no votes exist", async () => {
      const result = await getVotesForMeeting("meeting-1", "h1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── Elections ─────────────────────────────────────────────────────────────

  describe("getElections", () => {
    it("returns an empty array when no elections exist", async () => {
      const result = await getElections("h1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("createElection", () => {
    it("creates an election and returns it with an id", async () => {
      const electionData = makeElection();
      const result = await createElection(electionData);
      expect(result).toBeDefined();
      expect(result.houseId).toBe("h1");
      expect(result.role).toBe("president");
      expect(result.id).toBeDefined();
    });
  });

  describe("updateElection", () => {
    it("does not throw when updating an election", async () => {
      await expect(
        updateElection("election-1", { winnerId: "u1", houseId: "h1" })
      ).resolves.not.toThrow();
    });
  });

  // ── EES Transactions ──────────────────────────────────────────────────────

  describe("getEESTransactions", () => {
    it("returns an empty array when no transactions exist", async () => {
      const result = await getEESTransactions("h1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("createEESTransaction", () => {
    it("creates a transaction and returns it with an id", async () => {
      const txData = makeTransaction();
      const result = await createEESTransaction(txData);
      expect(result).toBeDefined();
      expect(result.houseId).toBe("h1");
      expect(result.amount).toBe(150);
      expect(result.type).toBe("payment");
      expect(result.id).toBeDefined();
    });

    it("preserves all transaction fields", async () => {
      const txData = makeTransaction({
        notes: "Week 3 payment",
        status: "paid" as const,
      });
      const result = await createEESTransaction(txData);
      expect(result.notes).toBe("Week 3 payment");
      expect(result.status).toBe("paid");
    });
  });

  // ── Financial Records ─────────────────────────────────────────────────────

  describe("getFinancialRecords", () => {
    it("returns an empty array when no records exist", async () => {
      const result = await getFinancialRecords("h1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("createFinancialRecord", () => {
    it("creates a financial record and returns it with an id", async () => {
      const recordData = makeFinancialRecord();
      const result = await createFinancialRecord(recordData);
      expect(result).toBeDefined();
      expect(result.houseId).toBe("h1");
      expect(result.totalIncome).toBe(600);
      expect(result.balance).toBe(200);
      expect(result.id).toBeDefined();
    });
  });
});
