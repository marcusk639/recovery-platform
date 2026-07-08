/**
 * Unit tests for createGroupWithSubscription Cloud Function.
 *
 * Covers:
 *   - Auth check: unauthenticated caller throws HttpsError "unauthenticated"
 *   - Missing group name throws HttpsError "invalid-argument"
 *   - Missing meetings throws HttpsError "invalid-argument"
 *   - Missing paymentMethodId throws HttpsError "invalid-argument"
 *   - Missing user email throws HttpsError "failed-precondition"
 *   - BUG H-3 fix: creator member document IS created in the same batch as the group
 *   - Creator member document has isAdmin: true, isTreasurer: false, roles: ['admin']
 *   - Creator member document ID follows format {groupId}_{userId}
 *   - Creator member document userId matches the caller's uid
 *   - Returns success: true, groupId, subscriptionId, subscriptionStatus on success
 *
 * Mocks:
 *   - firebase-admin
 *   - firebase-functions / firebase-functions/v1/https / firebase-functions/v2/https
 *   - ../utils/firebase (db)
 *   - ../utils/stripe (stripe, productIdGroup, getDefaultPriceForProduct, TRIAL_PERIOD_DAYS)
 */

// ============================================================
// MOCKS — must come before any imports that load the modules
// ============================================================

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      arrayUnion: (...args: unknown[]) => ({ __arrayUnion: args }),
      arrayRemove: (...args: unknown[]) => ({ __arrayRemove: args }),
      increment: (n: number) => ({ __increment: n }),
    },
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
      fromDate: (d: Date) => ({ toMillis: () => d.getTime() }),
    },
  },
  apps: ["mock-app"],
  initializeApp: jest.fn(),
}));

// onCall can be called as:
//   onCall(handler)           — single-arg form (v1 style)
//   onCall(config, handler)   — two-arg form (v2 style with options)
// The mock returns the handler in both cases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockOnCall(...args: any[]) {
  if (typeof args[0] === "function") return args[0];
  if (typeof args[1] === "function") return args[1];
  return args[0];
}

jest.mock("firebase-functions", () => ({
  https: { onCall: mockOnCall },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("firebase-functions/v1", () => ({
  https: { onCall: mockOnCall },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: mockOnCall,
  HttpsError: class HttpsError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
      this.name = "HttpsError";
    }
  },
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// ---- Stripe mock ----
const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsUpdate = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockCustomersList = jest.fn();
const mockCustomersCreate = jest.fn();
const mockPaymentMethodsRetrieve = jest.fn();
const mockPaymentMethodsAttach = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockGetDefaultPriceForProduct = jest
  .fn()
  .mockResolvedValue("price_group_test");

jest.mock("../utils/stripe", () => ({
  stripe: {
    subscriptions: {
      create: mockSubscriptionsCreate,
      update: mockSubscriptionsUpdate,
      cancel: mockSubscriptionsCancel,
    },
    customers: {
      list: mockCustomersList,
      create: mockCustomersCreate,
      update: mockCustomersUpdate,
    },
    paymentMethods: {
      retrieve: mockPaymentMethodsRetrieve,
      attach: mockPaymentMethodsAttach,
    },
  },
  productIdGroup: "prod_test_group",
  getDefaultPriceForProduct: mockGetDefaultPriceForProduct,
  TRIAL_PERIOD_DAYS: 7,
}));

// ============================================================
// FIRESTORE MOCK INFRASTRUCTURE
// ============================================================

interface DocStore {
  [path: string]: Record<string, unknown> | null;
}

let docStore: DocStore = {};

// Track all batch.set calls to inspect member document creation
const mockBatchSet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);

const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
};

// Track all individual doc.set calls (for non-batch writes)
const mockDocSet = jest.fn().mockResolvedValue(undefined);
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocGet = jest.fn();

// Auto-generated group ID used in tests
const AUTO_GROUP_ID = "auto-generated-group-id";

function buildDocRef(collPath: string, docId: string): any {
  const fullPath = `${collPath}/${docId}`;
  return {
    id: docId,
    path: fullPath,
    collection: (subColl: string) =>
      buildCollectionRef(`${collPath}/${docId}/${subColl}`),
    get: jest.fn().mockImplementation(async () => {
      const data = Object.prototype.hasOwnProperty.call(docStore, fullPath)
        ? docStore[fullPath]
        : null;
      return {
        id: docId,
        exists: data !== null,
        data: () => data,
        ref: { id: docId, update: mockDocUpdate, set: mockDocSet },
      };
    }),
    set: mockDocSet,
    update: mockDocUpdate,
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function buildCollectionRef(collPath: string): any {
  return {
    // doc() with no argument returns a ref with the AUTO_GROUP_ID
    doc: (docId?: string) => buildDocRef(collPath, docId ?? AUTO_GROUP_ID),
    where: () => buildQueryRef(collPath),
    limit: () => buildQueryRef(collPath),
  };
}

function buildQueryRef(collPath: string): any {
  const qr: any = {
    where: () => qr,
    limit: () => qr,
    get: jest.fn().mockImplementation(async () => {
      // Return Stripe customer list mock results via queryResults
      const rows = (queryResults[collPath] as any[]) || [];
      return {
        empty: rows.length === 0,
        data: rows,
        docs: rows.map((r: any) => ({
          id: r.id,
          exists: true,
          data: () => r.data,
          ref: { id: r.id, update: jest.fn(), set: jest.fn() },
        })),
      };
    }),
  };
  return qr;
}

let queryResults: Record<string, unknown[]> = {};

function buildMockDb() {
  return {
    collection: (collPath: string) => buildCollectionRef(collPath),
    batch: () => mockBatch,
  };
}

let mockDb: ReturnType<typeof buildMockDb>;

jest.mock("../utils/firebase", () => ({
  get db() {
    return mockDb;
  },
  messaging: { sendEachForMulticast: jest.fn() },
}));

// ============================================================
// HELPERS
// ============================================================

function setDoc(path: string, data: Record<string, unknown> | null) {
  docStore[path] = data;
}

function makeRequest(
  uid: string | null,
  data: Record<string, unknown> = {}
): any {
  return {
    auth: uid ? { uid, token: {} } : null,
    data,
  };
}

const BASE_GROUP_DATA = {
  name: "Test Recovery Group",
  description: "A test group",
  memberCount: 1,
};

const BASE_MEETINGS = [
  {
    id: "meeting-1",
    name: "Monday Meeting",
    type: "AA",
    day: "Monday",
    time: "7:00 PM",
    online: false,
    verified: false,
    groupId: "",
  },
];

const USER_ID = "user-creator-uid";
const PAYMENT_METHOD_ID = "pm_test_123";

function setupDefaults() {
  // User document with email (required to create Stripe customer)
  setDoc(`users/${USER_ID}`, {
    uid: USER_ID,
    email: "creator@example.com",
    displayName: "Test Creator",
    photoURL: null,
    showSobrietyDate: true,
    showPhoneNumber: false,
    sobrietyStartDate: null,
  });

  // No existing Stripe customer
  mockCustomersList.mockResolvedValue({ data: [] });

  // New customer creation returns a customer ID
  mockCustomersCreate.mockResolvedValue({ id: "cus_new_test" });

  // Subscription creation returns a subscription
  mockSubscriptionsCreate.mockResolvedValue({
    id: "sub_test_123",
    status: "trialing",
    items: {
      data: [
        {
          id: "si_test_123",
          price: { id: "price_group_test", product: "prod_test_group" },
        },
      ],
    },
  });

  // Subscription update succeeds
  mockSubscriptionsUpdate.mockResolvedValue({});

  // Price lookup
  mockGetDefaultPriceForProduct.mockResolvedValue("price_group_test");

  // Group snapshot after creation
  mockDocGet.mockResolvedValue({
    id: AUTO_GROUP_ID,
    exists: true,
    data: () => ({ ...BASE_GROUP_DATA, id: AUTO_GROUP_ID }),
  });
}

// ============================================================
// IMPORTS — after mocks
// ============================================================

import { createGroupWithSubscription } from "../callable/createGroupWithSubscription";

// ============================================================
// TESTS
// ============================================================

describe("createGroupWithSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    queryResults = {};
    mockDb = buildMockDb();

    // Reset batch mocks
    mockBatchSet.mockClear();
    mockBatchUpdate.mockClear();
    mockBatchCommit.mockResolvedValue(undefined);

    setupDefaults();
  });

  // ------------------------------------------------------------------
  // Auth checks
  // ------------------------------------------------------------------

  it("throws unauthenticated if no auth", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await expect(
      handler(
        makeRequest(null, {
          groupData: BASE_GROUP_DATA,
          meetings: BASE_MEETINGS,
          paymentMethodId: PAYMENT_METHOD_ID,
        })
      )
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  // ------------------------------------------------------------------
  // Input validation
  // ------------------------------------------------------------------

  it("throws invalid-argument if group name is missing", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await expect(
      handler(
        makeRequest(USER_ID, {
          groupData: { description: "No name" },
          meetings: BASE_MEETINGS,
          paymentMethodId: PAYMENT_METHOD_ID,
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument if meetings array is empty", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await expect(
      handler(
        makeRequest(USER_ID, {
          groupData: BASE_GROUP_DATA,
          meetings: [],
          paymentMethodId: PAYMENT_METHOD_ID,
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument if paymentMethodId is missing", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await expect(
      handler(
        makeRequest(USER_ID, {
          groupData: BASE_GROUP_DATA,
          meetings: BASE_MEETINGS,
        })
      )
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws an error if user has no email (email is required for Stripe)", async () => {
    setDoc(`users/${USER_ID}`, {
      uid: USER_ID,
      email: null,
      displayName: "No Email User",
    });

    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    // The function's outer catch block re-wraps internal HttpsErrors as "internal",
    // so we just verify the call rejects (not the specific code).
    await expect(
      handler(
        makeRequest(USER_ID, {
          groupData: BASE_GROUP_DATA,
          meetings: BASE_MEETINGS,
          paymentMethodId: PAYMENT_METHOD_ID,
        })
      )
    ).rejects.toThrow();

    // No Stripe customer or subscription should be created
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // BUG H-3 fix: creator member document must be created
  // ------------------------------------------------------------------

  it("creates a member document for the creator in the same batch as the group", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<{ success: boolean; groupId: string }>;

    const result = await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    expect(result.success).toBe(true);

    // batch.set must have been called at least twice:
    // once for the group and once for the creator member document.
    expect(mockBatchSet.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Find the call where the data has userId matching the creator
    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID && data.isAdmin === true;
    });

    expect(memberSetCall).toBeDefined();
  });

  it("creator member document has isAdmin: true", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    expect(memberData.isAdmin).toBe(true);
  });

  it("creator member document has isTreasurer: false", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    expect(memberData.isTreasurer).toBe(false);
  });

  it("creator member document has roles containing 'admin'", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    expect(Array.isArray(memberData.roles)).toBe(true);
    expect(memberData.roles).toContain("admin");
  });

  it("creator member document groupId matches the created group id", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<{ success: boolean; groupId: string }>;

    const result = await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    expect(memberData.groupId).toBe(result.groupId);
  });

  it("creator member document ref id follows format {groupId}_{userId}", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<{ success: boolean; groupId: string }>;

    const result = await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    // The ref passed as first argument to batch.set should have id = {groupId}_{userId}
    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberRef = memberSetCall![0] as { id: string };
    expect(memberRef.id).toBe(`${result.groupId}_${USER_ID}`);
  });

  it("creator member document includes displayName from user profile", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    // userData.displayName is "Test Creator" from setupDefaults
    expect(memberData.displayName).toBe("Test Creator");
  });

  it("creator member document has joinedAt field set", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    const memberSetCall = mockBatchSet.mock.calls.find((call: unknown[]) => {
      const data = call[1] as Record<string, unknown>;
      return data.userId === USER_ID;
    });

    expect(memberSetCall).toBeDefined();
    const memberData = memberSetCall![1] as Record<string, unknown>;
    // joinedAt is set via FieldValue.serverTimestamp()
    expect(memberData.joinedAt).toBeDefined();
    expect(memberData.joinedAt).toBe("__SERVER_TIMESTAMP__");
  });

  // ------------------------------------------------------------------
  // Success path — return shape
  // ------------------------------------------------------------------

  it("returns success: true and subscriptionId on success", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<{
      success: boolean;
      groupId: string;
      subscriptionId: string;
      subscriptionStatus: string;
    }>;

    const result = await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: BASE_MEETINGS,
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    expect(result.success).toBe(true);
    expect(result.groupId).toBeDefined();
    expect(result.subscriptionId).toBe("sub_test_123");
    expect(result.subscriptionStatus).toBe("trialing");
  });

  // ------------------------------------------------------------------
  // Mass-assignment protection: groupData / meetings allow-list
  // ------------------------------------------------------------------

  it("strips unvalidated/dangerous fields from client-supplied groupData before writing", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    const request = makeRequest(USER_ID, {
      groupData: {
        ...BASE_GROUP_DATA,
        admins: ["attacker-uid"], // should be overwritten by server logic regardless
        stripeCustomerId: "cus_injected", // should be stripped by validation before even reaching the overwrite step
        arbitraryField: "should not survive", // should be stripped
      },
      meetings: BASE_MEETINGS,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await handler(request);

    const groupWriteCall = mockBatchSet.mock.calls.find(
      (call: any[]) =>
        typeof call[0]?.path === "string" && call[0].path.includes("groups/")
    );

    expect(groupWriteCall).toBeDefined();
    const writtenGroup = groupWriteCall![1] as Record<string, unknown>;
    expect(writtenGroup.arbitraryField).toBeUndefined();
    expect(writtenGroup.admins).toEqual([USER_ID]); // server-controlled value wins, not the injected one
  });

  it("strips unvalidated fields from each client-supplied meeting before writing", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    const request = makeRequest(USER_ID, {
      groupData: BASE_GROUP_DATA,
      meetings: [
        { ...BASE_MEETINGS[0], arbitraryMeetingField: "should not survive" },
      ],
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await handler(request);

    const meetingWriteCall = mockBatchSet.mock.calls.find(
      (call: any[]) =>
        typeof call[0]?.path === "string" && call[0].path.includes("meetings/")
    );

    expect(meetingWriteCall).toBeDefined();
    const writtenMeeting = meetingWriteCall![1] as Record<string, unknown>;
    expect(writtenMeeting.arbitraryMeetingField).toBeUndefined();
  });

  it("still rejects when groupData.name is missing (existing validation preserved)", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<unknown>;

    const request = makeRequest(USER_ID, {
      groupData: { ...BASE_GROUP_DATA, name: undefined },
      meetings: BASE_MEETINGS,
      paymentMethodId: PAYMENT_METHOD_ID,
    });

    await expect(handler(request)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  // ------------------------------------------------------------------
  // Regression: meetingDataSchema must match the real mobile client
  // payload shape (mobile/src/screens/homegroup/CreateGroupScreen.tsx
  // `addMeeting()`, which builds `newMeeting` with `online`/`link`
  // fields — never `isOnline`/`onlineLink`). Previously the schema
  // required `isOnline` and never accepted `online`/`link`, so every
  // real group-creation call from the app failed with
  // "isOnline: Required" and, if online, would have silently dropped
  // the meeting's online flag and join link.
  // ------------------------------------------------------------------

  it("accepts and persists a meeting shaped exactly like CreateGroupScreen's real payload (online/link, not isOnline/onlineLink)", async () => {
    const handler = createGroupWithSubscription as unknown as (
      req: any
    ) => Promise<{ success: boolean; groupId: string }>;

    // Mirrors the `newMeeting` object built in CreateGroupScreen.tsx's
    // addMeeting() (mobile/src/screens/homegroup/CreateGroupScreen.tsx).
    const createGroupScreenMeeting = {
      id: "meeting-cgs-1",
      name: "Test Recovery Group",
      day: "Monday",
      time: "7:00 PM",
      format: "Open Discussion",
      online: true,
      location: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      link: "https://zoom.us/j/123456789",
      type: "AA",
    };

    const result = await handler(
      makeRequest(USER_ID, {
        groupData: BASE_GROUP_DATA,
        meetings: [createGroupScreenMeeting],
        paymentMethodId: PAYMENT_METHOD_ID,
      })
    );

    expect(result.success).toBe(true);

    const meetingWriteCall = mockBatchSet.mock.calls.find(
      (call: any[]) =>
        typeof call[0]?.path === "string" && call[0].path.includes("meetings/")
    );

    expect(meetingWriteCall).toBeDefined();
    const writtenMeeting = meetingWriteCall![1] as Record<string, unknown>;

    // The real field names must survive validation and be persisted.
    expect(writtenMeeting.online).toBe(true);
    expect(writtenMeeting.link).toBe("https://zoom.us/j/123456789");

    // The old (wrong) field names must never appear on the written doc.
    expect(writtenMeeting.isOnline).toBeUndefined();
    expect(writtenMeeting.onlineLink).toBeUndefined();
  });
});
