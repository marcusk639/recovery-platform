/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Firestore mock plumbing (mirrors getMilestones.test.ts pattern) ---
const mockGet = jest.fn();

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

const BASE_INTERGROUP = {
  type: "treatment_center",
  subscriptionStatus: "active",
  adminUids: ["admin-uid"],
  affiliatedGroupIds: ["g1", "g2"],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDocRef.get.mockResolvedValue(makeSnap(true, BASE_INTERGROUP));
  mockDocRef.collection.mockReturnValue(mockCollectionRef);
  const emptyQuery = makeChainedQuery();
  emptyQuery.get.mockResolvedValue(makeQuerySnap([]));
  mockCollectionRef.where.mockReturnValue(emptyQuery);
  mockCollectionRef.get.mockResolvedValue(makeQuerySnap([]));
  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    return {
      doc: jest.fn(() => mockDocRef),
      where: jest.fn(() => makeChainedQuery()),
    };
  });
});

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

test("returns zeros when no groups are affiliated", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, { ...BASE_INTERGROUP, affiliatedGroupIds: [] }),
  );
  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.affiliatedGroupCount).toBe(0);
  expect(result.meetings.last7Days).toBe(0);
  expect(result.meetings.last30Days).toBe(0);
  expect(result.milestones.total).toBe(0);
  expect(result.sponsorships.total).toBe(0);
});

test("allows access when subscription is trialing", async () => {
  mockDocRef.get.mockResolvedValue(
    makeSnap(true, {
      ...BASE_INTERGROUP,
      subscriptionStatus: "trialing",
      affiliatedGroupIds: [],
    }),
  );
  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.intergroupId).toBe("ig1");
  expect(result.affiliatedGroupCount).toBe(0);
});

test("counts meetings correctly: excludes cancelled, returns week and month separately", async () => {
  let meetingCallCount = 0;
  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    if (name === "meetingInstances") {
      return {
        where: jest.fn().mockImplementation(() => {
          const inner: any = { where: jest.fn(), get: jest.fn() };
          inner.where.mockImplementation(() => {
            meetingCallCount++;
            if (meetingCallCount === 1) {
              // last7Days batch
              return {
                get: jest
                  .fn()
                  .mockResolvedValue(
                    makeQuerySnap([
                      { data: () => ({ groupId: "g1", isCancelled: false }) },
                      { data: () => ({ groupId: "g1", isCancelled: true }) },
                    ]),
                  ),
              };
            }
            // last30Days batch
            return {
              get: jest
                .fn()
                .mockResolvedValue(
                  makeQuerySnap([
                    { data: () => ({ groupId: "g1", isCancelled: false }) },
                    { data: () => ({ groupId: "g2", isCancelled: false }) },
                    { data: () => ({ groupId: "g1", isCancelled: false }) },
                  ]),
                ),
            };
          });
          return inner;
        }),
      };
    }
    if (name === "groups") {
      return {
        doc: () => ({
          collection: () => ({ get: async () => makeQuerySnap([]) }),
        }),
      };
    }
    // members and sponsorships: empty
    const q = makeChainedQuery();
    q.get.mockResolvedValue(makeQuerySnap([]));
    return { where: jest.fn().mockReturnValue(q) };
  });

  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.meetings.last7Days).toBe(1); // cancelled excluded
  expect(result.meetings.last30Days).toBe(3); // all non-cancelled
});

test("counts milestones by tier and excludes records outside 180-day window and unknown tiers", async () => {
  const now = Date.now();
  const recentMs = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago — within window
  const oldMs = now - 200 * 24 * 60 * 60 * 1000; // 200 days ago — outside window
  const makeTimestamp = (ms: number) => ({
    toDate: () => new Date(ms),
    seconds: Math.floor(ms / 1000),
  });

  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    if (name === "meetingInstances") {
      const q = makeChainedQuery();
      q.get.mockResolvedValue(makeQuerySnap([]));
      return {
        where: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockReturnValue(q) }),
      };
    }
    if (name === "groups") {
      return {
        doc: (groupId: string) => ({
          collection: () => ({
            get: async () =>
              groupId === "g1"
                ? makeQuerySnap([
                    {
                      data: () => ({
                        milestones: [
                          {
                            days: 30,
                            chipGivenAt: makeTimestamp(recentMs),
                            chipGivenBy: "u1",
                          }, // count
                          {
                            days: 90,
                            chipGivenAt: makeTimestamp(recentMs),
                            chipGivenBy: "u2",
                          }, // count
                          {
                            days: 30,
                            chipGivenAt: makeTimestamp(oldMs),
                            chipGivenBy: "u3",
                          }, // outside window
                          {
                            days: 45,
                            chipGivenAt: makeTimestamp(recentMs),
                            chipGivenBy: "u4",
                          }, // unknown tier
                          {
                            days: 180,
                            chipGivenAt: makeTimestamp(recentMs),
                            chipGivenBy: "u5",
                          }, // count
                        ],
                      }),
                    },
                  ])
                : makeQuerySnap([]),
          }),
        }),
      };
    }
    const q = makeChainedQuery();
    q.get.mockResolvedValue(makeQuerySnap([]));
    return { where: jest.fn().mockReturnValue(q) };
  });

  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.milestones.thirtyDay).toBe(1);
  expect(result.milestones.sixtyDay).toBe(0);
  expect(result.milestones.ninetyDay).toBe(1);
  expect(result.milestones.oneEightyDay).toBe(1);
  expect(result.milestones.total).toBe(3);
});

test("counts sponsorships by collecting member UIDs from affiliated groups", async () => {
  mockDb.collection.mockImplementation((name: string) => {
    if (name === "intergroups") return { doc: () => mockDocRef };
    if (name === "meetingInstances") {
      const q = makeChainedQuery();
      q.get.mockResolvedValue(makeQuerySnap([]));
      return {
        where: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockReturnValue(q) }),
      };
    }
    if (name === "groups") {
      return {
        doc: () => ({
          collection: () => ({ get: async () => makeQuerySnap([]) }),
        }),
      };
    }
    if (name === "members") {
      const q = makeChainedQuery();
      q.get.mockResolvedValue(
        makeQuerySnap([
          { data: () => ({ userId: "u1", groupId: "g1" }) },
          { data: () => ({ userId: "u2", groupId: "g2" }) },
        ]),
      );
      return { where: jest.fn().mockReturnValue(q) };
    }
    if (name === "sponsorships") {
      const q = makeChainedQuery();
      q.get.mockResolvedValue(
        makeQuerySnap([
          { id: "s1", data: () => ({ sponsorId: "u1" }) },
          { id: "s2", data: () => ({ sponsorId: "u2" }) },
        ]),
      );
      return { where: jest.fn().mockReturnValue(q) };
    }
    return { where: jest.fn().mockReturnValue(makeChainedQuery()) };
  });

  const result = await getFacilityEngagementMetricsHandler(
    makeRequest({ intergroupId: "ig1" }),
  );
  expect(result.sponsorships.total).toBe(2);
});
