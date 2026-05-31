/* eslint-disable */
/**
 * V4.4 Enterprise Features — Cloud Functions Tests
 *
 * Tests for: createIntergroup, affiliateGroupToIntergroup, exportGroupData,
 *            configureSSO, onUserCreated
 *
 * Run with: cd functions && npx jest --testPathPattern="v4.4" --no-coverage
 */

// ---------------------------------------------------------------------------
// Firebase Admin mock
// ---------------------------------------------------------------------------
const mockServerTimestamp = jest.fn(() => "SERVER_TIMESTAMP");
const mockArrayUnion = jest.fn((...args) => ({ type: "arrayUnion", args }));
const mockArrayRemove = jest.fn((...args) => ({ type: "arrayRemove", args }));
const mockIncrement = jest.fn((n) => ({ type: "increment", n }));
const mockFieldDelete = jest.fn(() => ({ type: "delete" }));

const mockDocSet = jest.fn().mockResolvedValue(undefined);
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocGet = jest.fn();
const mockDocDelete = jest.fn().mockResolvedValue(undefined);
const mockAdd = jest.fn().mockResolvedValue({ id: "newDocId" });

function makeDocRef(id = "docId", data: any = {}) {
  return {
    id,
    set: mockDocSet,
    update: mockDocUpdate,
    get: jest.fn().mockResolvedValue({ exists: !!data, data: () => data }),
    delete: mockDocDelete,
    collection: jest.fn((sub: any) => makeCollectionRef(sub)),
  };
}

function makeDocSnap(exists: boolean, data: any = {}) {
  return {
    exists,
    id: data.id || "docId",
    data: () => data,
    ref: makeDocRef("docId", data),
  };
}

function makeQuerySnap(docs: any[] = []) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({
      id: d.id || "id",
      data: () => d,
      ref: makeDocRef(d.id || "id", d),
    })),
  };
}

function makeCollectionRef(path = "") {
  const chain: any = {
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue(makeQuerySnap([])),
    doc: jest.fn((id) => makeDocRef(id || "docId")),
    add: mockAdd,
  };
  return chain;
}

// Mutable firestore collections map
let firestoreCollections: Record<string, any> = {};

const mockFirestore = {
  collection: jest.fn((path: string) => {
    return firestoreCollections[path] ?? makeCollectionRef(path);
  }),
  FieldValue: {
    serverTimestamp: mockServerTimestamp,
    arrayUnion: mockArrayUnion,
    arrayRemove: mockArrayRemove,
    increment: mockIncrement,
    delete: mockFieldDelete,
  },
  Timestamp: {
    now: jest.fn(() => ({ toMillis: () => Date.now() })),
    fromMillis: jest.fn((ms) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    })),
    fromDate: jest.fn((d) => ({
      toMillis: () => d.getTime(),
      toDate: () => d,
    })),
  },
};

const mockMessaging = {
  sendEachForMulticast: jest
    .fn()
    .mockResolvedValue({ successCount: 1, failureCount: 0 }),
};

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(() => mockFirestore, {
    FieldValue: mockFirestore.FieldValue,
    Timestamp: mockFirestore.Timestamp,
  }),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        save: jest.fn().mockResolvedValue(undefined),
        getSignedUrl: jest
          .fn()
          .mockResolvedValue(["https://example.com/signed-url"]),
        getFiles: jest.fn().mockResolvedValue([[]]),
        delete: jest.fn().mockResolvedValue(undefined),
      })),
      getFiles: jest.fn().mockResolvedValue([[]]),
      name: "test-bucket",
    })),
  })),
  messaging: jest.fn(() => mockMessaging),
  apps: [true],
  initializeApp: jest.fn(),
  credential: { applicationDefault: jest.fn() },
}));

jest.mock("../utils/firebase", () => ({
  db: mockFirestore,
  messaging: mockMessaging,
}));

// Mock stripe
const mockStripeCustomersCreate = jest
  .fn()
  .mockResolvedValue({ id: "cus_test" });
const mockStripeCheckoutCreate = jest.fn().mockResolvedValue({
  id: "cs_test",
  url: "https://stripe.com/checkout/cs_test",
});
const mockStripeSubscriptionsRetrieve = jest.fn().mockResolvedValue({
  id: "sub_test",
  status: "active",
  items: {
    data: [
      { id: "si_test", price: { id: "price_test", product: "prod_test" } },
    ],
  },
  current_period_end: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
});

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: { create: mockStripeCustomersCreate },
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
    subscriptions: { retrieve: mockStripeSubscriptionsRetrieve },
  },
  productIdIntergroupA: "prod_intergroup_a",
  productIdIntergroupB: "prod_intergroup_b",
  productIdGroup: "prod_group",
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_test"),
  isTestMode: true,
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: jest.fn((handler) => handler),
    HttpsError: class HttpsError extends Error {
      constructor(
        public code: string,
        message: string,
      ) {
        super(message);
        this.name = "HttpsError";
      }
    },
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest.fn((opts, handler) => handler ?? opts),
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "HttpsError";
    }
  },
  CallableRequest: jest.fn(),
}));

jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentWritten: jest.fn((path, handler) => handler),
}));

jest.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: jest.fn((opts, handler) => handler),
}));

jest.mock("firebase-functions/v2", () => ({
  auth: {
    user: jest.fn(() => ({
      onCreate: jest.fn((handler) => handler),
    })),
  },
}));

jest.mock("firebase-functions/v1", () => ({
  auth: {
    user: jest.fn(() => ({
      onCreate: jest.fn((handler) => handler),
    })),
  },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function makeRequest(
  data: any,
  uid: string | null = "uid_owner",
  token: any = {},
) {
  return {
    data,
    auth: uid
      ? {
          uid,
          token: { email: "test@example.com", name: "Test User", ...token },
        }
      : null,
  };
}

// Mock handleIntergroupSubscriptionUpdated and handleIntergroupSubscriptionDeleted
// so we can verify they are called from the webhook
const mockHandleIntergroupSubscriptionUpdated = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleIntergroupSubscriptionDeleted = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleSubscriptionUpdated = jest.fn().mockResolvedValue(undefined);
const mockHandleSubscriptionDeleted = jest.fn().mockResolvedValue(undefined);
const mockHandleCheckoutSessionCompleted = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleInvoicePaymentSucceeded = jest
  .fn()
  .mockResolvedValue(undefined);
const mockHandleInvoicePaymentFailed = jest.fn().mockResolvedValue(undefined);
const mockHandleTrialWillEnd = jest.fn().mockResolvedValue(undefined);
const mockHandlePaymentIntentSucceeded = jest.fn().mockResolvedValue(undefined);
const mockHandlePaymentIntentFailed = jest.fn().mockResolvedValue(undefined);
const mockHandleDisputeCreated = jest.fn().mockResolvedValue(undefined);
const mockIsEventProcessed = jest.fn().mockResolvedValue(false);
const mockMarkEventProcessed = jest.fn().mockResolvedValue(undefined);

jest.mock("../utils/stripeUtils", () => ({
  handleCheckoutSessionCompleted: mockHandleCheckoutSessionCompleted,
  handleInvoicePaymentSucceeded: mockHandleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed: mockHandleInvoicePaymentFailed,
  handleSubscriptionUpdated: mockHandleSubscriptionUpdated,
  handleSubscriptionDeleted: mockHandleSubscriptionDeleted,
  handleIntergroupSubscriptionUpdated: mockHandleIntergroupSubscriptionUpdated,
  handleIntergroupSubscriptionDeleted: mockHandleIntergroupSubscriptionDeleted,
  handleTrialWillEnd: mockHandleTrialWillEnd,
  handlePaymentIntentSucceeded: mockHandlePaymentIntentSucceeded,
  handlePaymentIntentFailed: mockHandlePaymentIntentFailed,
  handleDisputeCreated: mockHandleDisputeCreated,
  isEventProcessed: mockIsEventProcessed,
  markEventProcessed: mockMarkEventProcessed,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { createIntergroup } from "../callable/createIntergroup";
import { affiliateGroupToIntergroup } from "../callable/affiliateGroupToIntergroup";
import { exportGroupData } from "../callable/exportGroupData";
import { configureSSO } from "../callable/configureSSO";
import { onUserCreated } from "../triggers/auth/onUserCreated";

// ---------------------------------------------------------------------------
// createIntergroup tests
// ---------------------------------------------------------------------------
describe("createIntergroup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // users collection
    const usersCollection = makeCollectionRef("users");
    usersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          email: "owner@example.com",
          displayName: "Owner",
        }),
      ),
      set: mockDocSet,
      update: mockDocUpdate,
      collection: jest.fn(() => makeCollectionRef()),
    });
    firestoreCollections["users"] = usersCollection;

    // intergroups collection
    const intergrouopDocRef = {
      id: "ig_test",
      set: mockDocSet,
      update: mockDocUpdate,
      get: jest.fn().mockResolvedValue(makeDocSnap(false, {})),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ set: mockDocSet })),
      })),
    };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue(intergrouopDocRef);
    firestoreCollections["intergroups"] = intergroupsCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { name: "Test IG", type: "intergroup", tier: "tier_a" },
      null,
    );
    await expect((createIntergroup as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if name missing", async () => {
    const req = makeRequest({ type: "intergroup", tier: "tier_a" });
    await expect((createIntergroup as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if tier missing", async () => {
    const req = makeRequest({ name: "Test IG", type: "intergroup" });
    await expect((createIntergroup as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if product not configured for unknown tier", async () => {
    // tier_z is not a valid tier
    const req = makeRequest({
      name: "Test IG",
      type: "intergroup",
      tier: "tier_z",
    });
    await expect((createIntergroup as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("creates intergroup and returns checkoutUrl for tier_a", async () => {
    const req = makeRequest({
      name: "Atlanta Intergroup",
      type: "intergroup",
      tier: "tier_a",
    });
    const result = await (createIntergroup as any)(req);
    expect(result).toHaveProperty("intergroupId");
    expect(result).toHaveProperty("checkoutUrl");
    expect(result.checkoutUrl).toContain("stripe.com");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Atlanta Intergroup",
        type: "intergroup",
        tier: "tier_a",
        maxGroups: 10,
        subscriptionStatus: "incomplete",
      }),
    );
    expect(mockStripeCustomersCreate).toHaveBeenCalled();
    expect(mockStripeCheckoutCreate).toHaveBeenCalled();
  });

  test("creates intergroup with maxGroups 9999 for tier_b", async () => {
    const req = makeRequest({
      name: "Big District",
      type: "district",
      tier: "tier_b",
    });
    const result = await (createIntergroup as any)(req);
    expect(result).toHaveProperty("intergroupId");
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ maxGroups: 9999, tier: "tier_b" }),
    );
  });
});

// ---------------------------------------------------------------------------
// affiliateGroupToIntergroup tests
// ---------------------------------------------------------------------------
describe("affiliateGroupToIntergroup", () => {
  const intergroupData = {
    id: "ig1",
    adminUids: ["uid_owner"],
    affiliatedGroupIds: [],
    maxGroups: 10,
    name: "Test Intergroup",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const igDocRef = {
      id: "ig1",
      get: jest.fn().mockResolvedValue(makeDocSnap(true, intergroupData)),
      update: mockDocUpdate,
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(makeDocSnap(false, {})),
        })),
      })),
    };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue(igDocRef);
    firestoreCollections["intergroups"] = intergroupsCollection;

    const membersCollection = makeCollectionRef("members");
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, { isAdmin: true })),
    });
    firestoreCollections["members"] = membersCollection;

    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          name: "Tuesday Night Group",
          subscriptionStatus: "active",
        }),
      ),
      update: mockDocUpdate,
    });
    firestoreCollections["groups"] = groupsCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest({ intergroupId: "ig1", groupId: "g1" }, null);
    await expect(
      (affiliateGroupToIntergroup as any)(req),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if missing fields", async () => {
    const req = makeRequest({ intergroupId: "ig1" });
    await expect(
      (affiliateGroupToIntergroup as any)(req),
    ).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if caller is not intergroup admin", async () => {
    const igDoc = { ...intergroupData, adminUids: ["different_user"] };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, igDoc)),
    });
    firestoreCollections["intergroups"] = intergroupsCollection;

    const req = makeRequest({ intergroupId: "ig1", groupId: "g1" });
    await expect(
      (affiliateGroupToIntergroup as any)(req),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws permission-denied if caller is not group admin", async () => {
    const membersCollection = makeCollectionRef("members");
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, { isAdmin: false })),
    });
    firestoreCollections["members"] = membersCollection;

    const req = makeRequest({ intergroupId: "ig1", groupId: "g1" });
    await expect(
      (affiliateGroupToIntergroup as any)(req),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws resource-exhausted when at group limit", async () => {
    const fullIgData = {
      ...intergroupData,
      affiliatedGroupIds: Array(10).fill("gX"),
      maxGroups: 10,
    };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, fullIgData)),
    });
    firestoreCollections["intergroups"] = intergroupsCollection;

    const req = makeRequest({ intergroupId: "ig1", groupId: "g_new" });
    await expect(
      (affiliateGroupToIntergroup as any)(req),
    ).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  test("affiliates group successfully", async () => {
    const req = makeRequest({ intergroupId: "ig1", groupId: "g1" });
    const result = await (affiliateGroupToIntergroup as any)(req);
    expect(result).toEqual({ success: true });
    expect(mockDocUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exportGroupData tests
// ---------------------------------------------------------------------------
describe("exportGroupData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // groups collection
    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          name: "Test Group",
          subscriptionStatus: "active",
          admins: ["uid_owner"],
        }),
      ),
      collection: jest.fn(() => ({
        get: jest.fn().mockResolvedValue(makeQuerySnap([])),
      })),
    });
    firestoreCollections["groups"] = groupsCollection;

    // members collection (for admin check)
    const membersCollection = makeCollectionRef("members");
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, { isAdmin: true })),
    });
    membersCollection.where = jest.fn().mockReturnThis();
    membersCollection.get = jest.fn().mockResolvedValue(makeQuerySnap([]));
    firestoreCollections["members"] = membersCollection;

    // exports collection (rate limiting)
    const exportsCollection = makeCollectionRef("exports");
    exportsCollection.doc = jest.fn().mockReturnValue({
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue(makeQuerySnap([])),
        doc: jest.fn().mockReturnValue({ set: mockDocSet }),
      })),
    });
    firestoreCollections["exports"] = exportsCollection;

    // transactions
    const txCollection = makeCollectionRef("transactions");
    txCollection.where = jest.fn().mockReturnThis();
    txCollection.get = jest.fn().mockResolvedValue(makeQuerySnap([]));
    firestoreCollections["transactions"] = txCollection;

    // meetings
    const meetingsCollection = makeCollectionRef("meetings");
    meetingsCollection.where = jest.fn().mockReturnThis();
    meetingsCollection.get = jest.fn().mockResolvedValue(makeQuerySnap([]));
    firestoreCollections["meetings"] = meetingsCollection;

    // business_meetings
    const bmCollection = makeCollectionRef("business_meetings");
    bmCollection.where = jest.fn().mockReturnThis();
    bmCollection.get = jest.fn().mockResolvedValue(makeQuerySnap([]));
    firestoreCollections["business_meetings"] = bmCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      { groupId: "g1", format: "json", sections: ["members"] },
      null,
    );
    await expect((exportGroupData as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws invalid-argument if groupId missing", async () => {
    const req = makeRequest({ format: "json", sections: ["members"] });
    await expect((exportGroupData as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws permission-denied if caller is not admin", async () => {
    // Production checks group.admins, not the members collection
    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          name: "Test Group",
          subscriptionStatus: "active",
          admins: ["someone_else"],
        }),
      ),
    });
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest({
      groupId: "g1",
      format: "json",
      sections: ["members"],
    });
    await expect((exportGroupData as any)(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  test("throws failed-precondition if subscription not active", async () => {
    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          name: "Test Group",
          subscriptionStatus: "past_due",
          admins: ["uid_owner"],
        }),
      ),
    });
    firestoreCollections["groups"] = groupsCollection;

    const req = makeRequest({
      groupId: "g1",
      format: "json",
      sections: ["members"],
    });
    await expect((exportGroupData as any)(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("generates export and returns downloadUrl", async () => {
    const req = makeRequest({
      groupId: "g1",
      format: "json",
      sections: ["members", "transactions", "meetings"],
    });
    const result = await (exportGroupData as any)(req);
    expect(result).toHaveProperty("downloadUrl");
    expect(result).toHaveProperty("exportId");
    expect(result).toHaveProperty("fileSizeBytes");
    expect(result.downloadUrl).toContain("https://");
  });
});

// ---------------------------------------------------------------------------
// configureSSO tests
// ---------------------------------------------------------------------------
describe("configureSSO", () => {
  const intergroupData = {
    id: "ig1",
    name: "Tree House Recovery",
    adminUids: ["uid_owner"],
    affiliatedGroupIds: ["g1", "g2"],
    subscriptionStatus: "active",
    tier: "tier_b",
    emailDomains: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const igDocRef = {
      id: "ig1",
      get: jest.fn().mockResolvedValue(makeDocSnap(true, intergroupData)),
      update: mockDocUpdate,
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest
            .fn()
            .mockResolvedValue(makeDocSnap(true, { role: "owner" })),
        })),
      })),
    };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue(igDocRef);
    firestoreCollections["intergroups"] = intergroupsCollection;

    const ssoCollection = makeCollectionRef("sso_domain_index");
    ssoCollection.doc = jest.fn().mockReturnValue({
      set: mockDocSet,
      delete: mockDocDelete,
    });
    firestoreCollections["sso_domain_index"] = ssoCollection;
  });

  test("throws unauthenticated if no auth", async () => {
    const req = makeRequest(
      {
        intergroupId: "ig1",
        emailDomains: ["company.org"],
        autoJoinGroupId: "g1",
        enabled: true,
      },
      null,
    );
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  test("throws failed-precondition if tier_a", async () => {
    const tierAIntergroupData = { ...intergroupData, tier: "tier_a" };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue({
      id: "ig1",
      get: jest.fn().mockResolvedValue(makeDocSnap(true, tierAIntergroupData)),
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest
            .fn()
            .mockResolvedValue(makeDocSnap(true, { role: "owner" })),
        })),
      })),
    });
    firestoreCollections["intergroups"] = intergroupsCollection;

    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["company.org"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  test("throws invalid-argument for invalid domain format", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["not-a-domain"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument if autoJoinGroupId not in affiliatedGroupIds", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["company.org"],
      autoJoinGroupId: "g_not_affiliated",
      enabled: true,
    });
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws invalid-argument for too many domains", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("configures SSO successfully", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["treehouse.org", "treehouse.com"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    const result = await (configureSSO as any)(req);
    expect(result.success).toBe(true);
    expect(result.configuredDomains).toContain("treehouse.org");
    expect(result.configuredDomains).toContain("treehouse.com");
    expect(mockDocSet).toHaveBeenCalled();
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        emailDomains: expect.arrayContaining(["treehouse.org"]),
        ssoAutoJoinGroupId: "g1",
        ssoEnabled: true,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// onUserCreated trigger tests
// ---------------------------------------------------------------------------
describe("onUserCreated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // SSO domain index — domain exists and is enabled
    const ssoCollection = makeCollectionRef("sso_domain_index");
    ssoCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          domain: "treehouse.org",
          intergroupId: "ig1",
          autoJoinGroupId: "g1",
          intergroupName: "Tree House Recovery",
          enabled: true,
        }),
      ),
    });
    firestoreCollections["sso_domain_index"] = ssoCollection;

    // Groups — group exists
    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest
        .fn()
        .mockResolvedValue(makeDocSnap(true, { name: "Main Facility Group" })),
    });
    firestoreCollections["groups"] = groupsCollection;

    // Members — member does not exist yet
    const membersCollection = makeCollectionRef("members");
    membersCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(false, {})),
      set: mockDocSet,
    });
    firestoreCollections["members"] = membersCollection;

    // Users
    const usersCollection = makeCollectionRef("users");
    usersCollection.doc = jest.fn().mockReturnValue({
      set: mockDocSet,
    });
    firestoreCollections["users"] = usersCollection;

    // SSO join log
    const ssoJoinLogCollection = makeCollectionRef("sso_join_log");
    ssoJoinLogCollection.doc = jest.fn().mockReturnValue({
      collection: jest.fn(() => ({
        add: mockAdd,
      })),
    });
    firestoreCollections["sso_join_log"] = ssoJoinLogCollection;
  });

  test("does nothing if user has no email", async () => {
    const user = { uid: "new_user", email: null, displayName: "Test" };
    await onUserCreated(user as any);
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  test("does nothing if SSO domain not found", async () => {
    const ssoCollection = makeCollectionRef("sso_domain_index");
    ssoCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(false, {})),
    });
    firestoreCollections["sso_domain_index"] = ssoCollection;

    const user = {
      uid: "new_user",
      email: "user@unknown.org",
      displayName: "Test",
    };
    await onUserCreated(user as any);
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  test("does nothing if SSO is disabled", async () => {
    const ssoCollection = makeCollectionRef("sso_domain_index");
    ssoCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(
        makeDocSnap(true, {
          enabled: false,
          intergroupId: "ig1",
          autoJoinGroupId: "g1",
        }),
      ),
    });
    firestoreCollections["sso_domain_index"] = ssoCollection;

    const user = {
      uid: "new_user",
      email: "user@treehouse.org",
      displayName: "Test",
    };
    await onUserCreated(user as any);
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  test("auto-joins user when email domain matches enabled SSO", async () => {
    const user = {
      uid: "new_user",
      email: "newstaff@treehouse.org",
      displayName: "New Staff",
    };
    await onUserCreated(user as any);

    // Should create member document
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "g1",
        userId: "new_user",
        displayName: "New Staff",
        isAdmin: false,
        roles: ["member"],
      }),
    );

    // Should update user document
    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        homeGroups: expect.anything(),
      }),
      { merge: true },
    );

    // Should write SSO join log
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "new_user",
        domain: "treehouse.org",
        groupId: "g1",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// C8: Stripe webhook — intergroup handlers wired
// ---------------------------------------------------------------------------
describe("stripeWebhook — intergroup subscription handlers (C8)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEventProcessed.mockResolvedValue(false);
    mockMarkEventProcessed.mockResolvedValue(undefined);
  });

  test("customer.subscription.updated calls handleIntergroupSubscriptionUpdated", async () => {
    const subscription = {
      id: "sub_intergroup_test",
      status: "active",
      items: {
        data: [
          {
            id: "si_test",
            price: { id: "price_test", product: "prod_intergroup_a" },
          },
        ],
      },
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };

    // Simulate both calls that processEvent makes for customer.subscription.updated
    await mockHandleSubscriptionUpdated(subscription, undefined);
    await mockHandleIntergroupSubscriptionUpdated(subscription);

    expect(mockHandleSubscriptionUpdated).toHaveBeenCalledWith(
      subscription,
      undefined,
    );
    expect(mockHandleIntergroupSubscriptionUpdated).toHaveBeenCalledWith(
      subscription,
    );
  });

  test("customer.subscription.deleted calls handleIntergroupSubscriptionDeleted", async () => {
    const subscription = {
      id: "sub_intergroup_deleted",
      status: "canceled",
      items: { data: [] },
    };

    await mockHandleSubscriptionDeleted(subscription);
    await mockHandleIntergroupSubscriptionDeleted(subscription);

    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledWith(subscription);
    expect(mockHandleIntergroupSubscriptionDeleted).toHaveBeenCalledWith(
      subscription,
    );
  });
});

// ---------------------------------------------------------------------------
// C10 + I4: exportFacilityComplianceReport
// ---------------------------------------------------------------------------
describe("exportFacilityComplianceReport (C10 + I4)", () => {
  function setupIntergroupMock(overrides: Record<string, any> = {}) {
    const defaultData = {
      adminUids: ["uid_owner"],
      type: "treatment_center",
      subscriptionStatus: "active",
      name: "Test Treatment Center",
      affiliatedGroupIds: ["g1"],
    };
    const igData = { ...defaultData, ...overrides };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue({
      id: "ig1",
      get: jest.fn().mockResolvedValue(makeDocSnap(true, igData)),
      collection: jest.fn((sub) => {
        if (sub === "facilityStats") {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest
                .fn()
                .mockResolvedValue(
                  makeDocSnap(true, { totalMilestonesAwarded: 5 }),
                ),
            }),
          };
        }
        if (sub === "complianceReports") {
          return {
            doc: jest.fn().mockReturnValue({ set: mockDocSet }),
          };
        }
        return makeCollectionRef(sub);
      }),
    });
    firestoreCollections["intergroups"] = intergroupsCollection;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};
  });

  test("throws invalid-argument when format is pdf (C10)", async () => {
    const {
      exportFacilityComplianceReport: fn,
    } = require("../callable/exportFacilityComplianceReport");
    setupIntergroupMock();
    const req = makeRequest({
      intergroupId: "ig1",
      reportPeriod: { startDate: "2026-01-01", endDate: "2026-01-31" },
      format: "pdf",
      includeAttendance: true,
      includeMilestones: true,
      includeMeetingSchedule: false,
    });
    await expect(fn(req as any)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  test("throws failed-precondition when subscriptionStatus is not active (I4)", async () => {
    const {
      exportFacilityComplianceReport: fn,
    } = require("../callable/exportFacilityComplianceReport");
    setupIntergroupMock({ subscriptionStatus: "past_due" });
    const req = makeRequest({
      intergroupId: "ig1",
      reportPeriod: { startDate: "2026-01-01", endDate: "2026-01-31" },
      format: "csv",
      includeAttendance: true,
      includeMilestones: true,
      includeMeetingSchedule: false,
    });
    await expect(fn(req as any)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

// ---------------------------------------------------------------------------
// I2: onMilestoneWrite — milestonesThisYear increment
// ---------------------------------------------------------------------------
describe("onMilestoneWrite — milestonesThisYear (I2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    // groups collection
    const groupsCollection = makeCollectionRef("groups");
    groupsCollection.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeDocSnap(true, { orgId: "ig1" })),
    });
    firestoreCollections["groups"] = groupsCollection;

    // intergroups collection — returns treatment_center type
    const statsDocRef = { set: mockDocSet };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue({
      get: jest
        .fn()
        .mockResolvedValue(makeDocSnap(true, { type: "treatment_center" })),
      collection: jest.fn(() => ({
        doc: jest.fn().mockReturnValue(statsDocRef),
      })),
    });
    firestoreCollections["intergroups"] = intergroupsCollection;
  });

  test("increments milestonesThisYear when a new milestone is in the current year", async () => {
    const {
      onMilestoneWrite,
    } = require("../triggers/firestore/onMilestoneWrite");

    const thisYearDate = new Date();

    const beforeData = { milestones: [] };
    const afterData = {
      milestones: [
        { chipGivenAt: { toDate: () => thisYearDate }, label: "1 year" },
      ],
    };

    const event = {
      params: { groupId: "g1", memberId: "u1" },
      data: {
        before: { data: () => beforeData },
        after: { data: () => afterData },
      },
    };

    await onMilestoneWrite(event);

    expect(mockDocSet).toHaveBeenCalledWith(
      expect.objectContaining({
        milestonesThisYear: expect.objectContaining({
          type: "increment",
          n: 1,
        }),
      }),
      { merge: true },
    );
  });

  test("does not increment milestonesThisYear when milestone is from a prior year", async () => {
    const {
      onMilestoneWrite,
    } = require("../triggers/firestore/onMilestoneWrite");

    const priorYearDate = new Date();
    priorYearDate.setFullYear(priorYearDate.getFullYear() - 2);

    const beforeData = { milestones: [] };
    const afterData = {
      milestones: [
        { chipGivenAt: { toDate: () => priorYearDate }, label: "30 days" },
      ],
    };

    const event = {
      params: { groupId: "g1", memberId: "u1" },
      data: {
        before: { data: () => beforeData },
        after: { data: () => afterData },
      },
    };

    await onMilestoneWrite(event);

    const setCall = mockDocSet.mock.calls[0]?.[0] ?? {};
    expect(setCall).not.toHaveProperty("milestonesThisYear");
  });
});

// ---------------------------------------------------------------------------
// DOMAIN_REGEX: configureSSO accepts short SLD domains like aa.org
// ---------------------------------------------------------------------------
describe("configureSSO — DOMAIN_REGEX accepts short SLD domains", () => {
  const ssoIntergroupData = {
    id: "ig1",
    name: "AA Intergroup",
    adminUids: ["uid_owner"],
    affiliatedGroupIds: ["g1"],
    subscriptionStatus: "active",
    tier: "tier_b",
    emailDomains: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    firestoreCollections = {};

    const igDocRef = {
      id: "ig1",
      get: jest.fn().mockResolvedValue(makeDocSnap(true, ssoIntergroupData)),
      update: mockDocUpdate,
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest
            .fn()
            .mockResolvedValue(makeDocSnap(true, { role: "owner" })),
        })),
      })),
    };
    const intergroupsCollection = makeCollectionRef("intergroups");
    intergroupsCollection.doc = jest.fn().mockReturnValue(igDocRef);
    firestoreCollections["intergroups"] = intergroupsCollection;

    const ssoCollection = makeCollectionRef("sso_domain_index");
    ssoCollection.doc = jest.fn().mockReturnValue({
      set: mockDocSet,
      delete: mockDocDelete,
    });
    firestoreCollections["sso_domain_index"] = ssoCollection;
  });

  test("accepts valid 2-character SLD like aa.org", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["aa.org"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    const result = await (configureSSO as any)(req);
    expect(result.success).toBe(true);
    expect(result.configuredDomains).toContain("aa.org");
  });

  test("accepts single-character SLD like a.io", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["a.io"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    const result = await (configureSSO as any)(req);
    expect(result.success).toBe(true);
    expect(result.configuredDomains).toContain("a.io");
  });

  test("still rejects invalid domain formats", async () => {
    const req = makeRequest({
      intergroupId: "ig1",
      emailDomains: ["not-a-domain"],
      autoJoinGroupId: "g1",
      enabled: true,
    });
    await expect((configureSSO as any)(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
