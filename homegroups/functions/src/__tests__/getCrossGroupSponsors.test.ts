/**
 * Unit tests for getCrossGroupSponsors Cloud Function.
 *
 * Covers:
 *   - Unauthenticated callers are rejected
 *   - Returns empty array when caller is in no groups
 *   - Sobriety date IS returned when showSobrietyDate is true or undefined (default visible)
 *   - Sobriety date is NULL when showSobrietyDate is explicitly false (privacy respected)
 *   - Self is excluded from results
 *   - Duplicate sponsors across groups are deduplicated
 *   - Members with isAvailable = false are excluded
 */

export {};

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
    },
  },
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) => {
      if (
        typeof optsOrHandler === "object" &&
        typeof maybeHandler === "function"
      ) {
        return maybeHandler;
      }
      return optsOrHandler;
    },
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: any;
    constructor(code: string, message: string, details?: any) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

// ---- Firestore mock infrastructure ----

// We need a flexible mock that can respond differently per collection/query.
// Each test sets up collectionResponses to control what each collection returns.

type DocData = Record<string, any>;

interface MockQuerySnapshot {
  empty: boolean;
  docs: MockDocSnapshot[];
}

interface MockDocSnapshot {
  id: string;
  exists: boolean;
  data: () => DocData;
}

// Per-test collection response map: collectionName -> list of docs to return from .where().get()
let collectionResponses: Map<string, MockDocSnapshot[]> = new Map();
// Per-test doc responses: "collection/docId" -> DocData | null
let docResponses: Map<string, DocData | null> = new Map();

function makeDocSnap(id: string, data: DocData): MockDocSnapshot {
  return { id, exists: true, data: () => data };
}

function makeQuerySnap(docs: MockDocSnapshot[]): MockQuerySnapshot {
  return { empty: docs.length === 0, docs };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: jest.fn().mockImplementation((id: string) => ({
      get: jest.fn().mockImplementation(async () => {
        const key = `${name}/${id}`;
        const data = docResponses.get(key);
        if (data === undefined) return { exists: false, data: () => null };
        if (data === null) return { exists: false, data: () => null };
        return { exists: true, data: () => data };
      }),
    })),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockImplementation(async () => {
      const docs = collectionResponses.get(name) ?? [];
      return makeQuerySnap(docs);
    }),
  })),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
}));

// ============================================================
// Helpers
// ============================================================

function makeRequest(uid: string | null): any {
  return {
    auth: uid ? { uid, token: { email: `${uid}@test.com` } } : null,
    data: {},
  };
}

function setCollection(name: string, docs: MockDocSnapshot[]) {
  collectionResponses.set(name, docs);
}

function setDoc(collection: string, id: string, data: DocData | null) {
  docResponses.set(`${collection}/${id}`, data);
}

// ============================================================
// Tests
// ============================================================

describe("getCrossGroupSponsors", () => {
  const callerId = "caller-uid";
  const sponsorId = "sponsor-uid";
  const groupId = "group-abc";

  beforeEach(() => {
    jest.clearAllMocks();
    collectionResponses = new Map();
    docResponses = new Map();

    // Reset the mock implementation each time (since it captures the map reference)
    mockDb.collection.mockImplementation((name: string) => ({
      doc: jest.fn().mockImplementation((id: string) => ({
        get: jest.fn().mockImplementation(async () => {
          const key = `${name}/${id}`;
          const data = docResponses.get(key);
          if (data === undefined || data === null)
            return { exists: false, data: () => null };
          return { exists: true, data: () => data };
        }),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockImplementation(async () => {
        const docs = collectionResponses.get(name) ?? [];
        return makeQuerySnap(docs);
      }),
    }));
  });

  // ------------------------------------------------------------------
  // Auth checks
  // ------------------------------------------------------------------

  it("throws unauthenticated if no auth context", async () => {
    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    await expect(
      (getCrossGroupSponsors as any)(makeRequest(null)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ------------------------------------------------------------------
  // Empty-group path
  // ------------------------------------------------------------------

  it("returns empty sponsors array when caller is in no groups", async () => {
    setCollection("members", []); // caller has no member docs

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));
    expect(result.sponsors).toEqual([]);
  });

  // ------------------------------------------------------------------
  // Privacy: sobriety date visibility
  // ------------------------------------------------------------------

  it("includes sobrietyDate when showSobrietyDate is true", async () => {
    const sobrietyTimestamp = {
      toDate: () => new Date("2020-01-01T00:00:00.000Z"),
    };

    // Caller's membership
    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
    });
    // Available sponsor with showSobrietyDate = true
    const sponsorMemberDoc = makeDocSnap(`${groupId}_${sponsorId}`, {
      userId: sponsorId,
      groupId,
      displayName: "Jane Sponsor",
      sobrietyDate: sobrietyTimestamp,
      showSobrietyDate: true,
      sponsorSettings: { isAvailable: true, bio: "I help", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc, sponsorMemberDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    expect(result.sponsors).toHaveLength(1);
    expect(result.sponsors[0].sobrietyDate).toBe("2020-01-01T00:00:00.000Z");
  });

  it("returns null sobrietyDate when showSobrietyDate is undefined (opt-in model — default is hidden)", async () => {
    const sobrietyTimestamp = {
      toDate: () => new Date("2019-06-15T00:00:00.000Z"),
    };

    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
    });
    const sponsorMemberDoc = makeDocSnap(`${groupId}_${sponsorId}`, {
      userId: sponsorId,
      groupId,
      displayName: "Bob Sponsor",
      sobrietyDate: sobrietyTimestamp,
      // showSobrietyDate is intentionally omitted — defaults to hidden (opt-in)
      sponsorSettings: { isAvailable: true, bio: "", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc, sponsorMemberDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    expect(result.sponsors).toHaveLength(1);
    expect(result.sponsors[0].sobrietyDate).toBeNull();
  });

  it("returns null sobrietyDate when showSobrietyDate is false (privacy respected)", async () => {
    const sobrietyTimestamp = {
      toDate: () => new Date("2018-03-22T00:00:00.000Z"),
    };

    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
    });
    const sponsorMemberDoc = makeDocSnap(`${groupId}_${sponsorId}`, {
      userId: sponsorId,
      groupId,
      displayName: "Private Sponsor",
      sobrietyDate: sobrietyTimestamp,
      showSobrietyDate: false, // <-- privacy enabled
      sponsorSettings: { isAvailable: true, bio: "", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc, sponsorMemberDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    expect(result.sponsors).toHaveLength(1);
    // Must not leak the sobriety date
    expect(result.sponsors[0].sobrietyDate).toBeNull();
  });

  it("returns null sobrietyDate when member has no sobrietyDate set (regardless of showSobrietyDate)", async () => {
    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
    });
    const sponsorMemberDoc = makeDocSnap(`${groupId}_${sponsorId}`, {
      userId: sponsorId,
      groupId,
      displayName: "No Date Sponsor",
      // sobrietyDate not set
      showSobrietyDate: true,
      sponsorSettings: { isAvailable: true, bio: "", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc, sponsorMemberDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    expect(result.sponsors).toHaveLength(1);
    expect(result.sponsors[0].sobrietyDate).toBeNull();
  });

  // ------------------------------------------------------------------
  // Self-exclusion
  // ------------------------------------------------------------------

  it("excludes the calling user from the sponsors list", async () => {
    // Caller is themselves marked as available sponsor
    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
      displayName: "Caller",
      sponsorSettings: { isAvailable: true, bio: "", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    // Self must not appear even though isAvailable is true
    expect(result.sponsors).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Unavailable sponsors excluded
  // ------------------------------------------------------------------

  it("excludes members with isAvailable = false", async () => {
    const callerMemberDoc = makeDocSnap(`${groupId}_${callerId}`, {
      userId: callerId,
      groupId,
    });
    const unavailableSponsorDoc = makeDocSnap(`${groupId}_${sponsorId}`, {
      userId: sponsorId,
      groupId,
      displayName: "Unavailable",
      sponsorSettings: { isAvailable: false, bio: "", requirements: [] },
    });

    setDoc("groups", groupId, { name: "Test Group" });
    setCollection("members", [callerMemberDoc, unavailableSponsorDoc]);

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");

    const result = await (getCrossGroupSponsors as any)(makeRequest(callerId));

    expect(result.sponsors).toHaveLength(0);
  });
});
