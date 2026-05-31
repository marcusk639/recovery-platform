/**
 * Tests for V3.3 Intergroup Features:
 *  - getCrossGroupSponsors (Callable)
 *  - createMultiGroupAnnouncement (Callable)
 *  - getPublicEvents (Callable)
 */

// ---- Mocks must be defined before any imports ----

const mockUpdate = jest.fn().mockResolvedValue(undefined);
const mockSet = jest.fn().mockResolvedValue(undefined);
const mockSendEachForMulticast = jest.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn() as jest.MockedFunction<(name: string) => any>;

const mockServerTimestamp = jest.fn(() => ({
  _methodName: "FieldValue.serverTimestamp",
}));

jest.mock("firebase-admin", () => {
  const fromDate = (date: Date) => ({
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
    toMillis: () => date.getTime(),
  });

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(
      jest.fn().mockReturnValue({ collection: mockCollection }),
      {
        Timestamp: {
          fromDate,
          now: () => fromDate(new Date()),
        },
        FieldValue: {
          serverTimestamp: mockServerTimestamp,
          arrayUnion: jest.fn((...args: unknown[]) => ({
            _methodName: "FieldValue.arrayUnion",
            args,
          })),
          arrayRemove: jest.fn(),
          increment: jest.fn((n: number) => ({
            _methodName: "FieldValue.increment",
            n,
          })),
          delete: jest.fn(),
        },
      },
    ),
    app: jest.fn().mockReturnValue({}),
    auth: jest.fn().mockReturnValue({}),
  };
});

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn().mockReturnValue({
    sendEachForMulticast: mockSendEachForMulticast,
  }),
}));

jest.mock("firebase-functions", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

jest.mock("firebase-functions/v1", () => ({
  https: {
    HttpsError: class HttpsError extends Error {
      code: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(code: string, message: string, details?: any) {
        super(message);
        this.code = code;
        this.details = details;
      }
    },
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: { collection: mockCollection },
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

// ---- Helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createDoc = (id: string, data: Record<string, any>) => ({
  id,
  data: () => data,
  ref: { update: mockUpdate, set: mockSet },
});

const makeTimestamp = (date: Date) => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0,
  toMillis: () => date.getTime(),
});

/** Build a mock CallableRequest */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeRequest = (uid: string, data: any, token?: Record<string, any>) => ({
  auth: {
    uid,
    token: { name: "Test User", email: "test@example.com", ...token },
  },
  data,
});

// ============================================================
// getCrossGroupSponsors Tests
// ============================================================

describe("getCrossGroupSponsors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("returns sponsors from ALL caller's groups", async () => {
    const callerId = "user-caller";
    const group1Id = "group-1";
    const group2Id = "group-2";

    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        // Differentiate queries based on the first .where() field argument
        return {
          where: jest
            .fn()
            .mockImplementation((field: string, _op: string, value: string) => {
              if (field === "userId") {
                // First query: find which groups the caller belongs to
                return {
                  get: jest.fn().mockResolvedValue({
                    empty: false,
                    docs: [
                      createDoc("group-1_user-caller", {
                        userId: callerId,
                        groupId: group1Id,
                      }),
                      createDoc("group-2_user-caller", {
                        userId: callerId,
                        groupId: group2Id,
                      }),
                    ],
                  }),
                };
              }
              // field === "groupId": fetch members of that group
              const groupId = value;
              return {
                get: jest.fn().mockResolvedValue({
                  empty: false,
                  docs:
                    groupId === group1Id
                      ? [
                          createDoc("group-1_user-caller", {
                            userId: callerId,
                            groupId: group1Id,
                          }),
                          createDoc("group-1_sponsor-a", {
                            userId: "sponsor-a",
                            groupId: group1Id,
                            displayName: "Alice",
                            sponsorSettings: {
                              isAvailable: true,
                              bio: "Bio A",
                              requirements: [],
                            },
                          }),
                        ]
                      : [
                          createDoc("group-2_user-caller", {
                            userId: callerId,
                            groupId: group2Id,
                          }),
                          createDoc("group-2_sponsor-b", {
                            userId: "sponsor-b",
                            groupId: group2Id,
                            displayName: "Bob",
                            sponsorSettings: {
                              isAvailable: true,
                              bio: "Bio B",
                              requirements: [],
                            },
                          }),
                        ],
                }),
              };
            }),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockImplementation((groupId: string) => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                name: groupId === group1Id ? "Group One" : "Group Two",
              }),
            }),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");
    const result = await (getCrossGroupSponsors as Function)(
      makeRequest(callerId, {}),
    );

    expect(result.sponsors.length).toBeGreaterThanOrEqual(1);
    // Both sponsors should be present
    const userIds = result.sponsors.map((s: { userId: string }) => s.userId);
    expect(userIds).toContain("sponsor-a");
    expect(userIds).toContain("sponsor-b");
  });

  it("deduplicates users appearing in multiple groups", async () => {
    const callerId = "user-caller";
    const group1Id = "group-1";
    const group2Id = "group-2";
    const sharedSponsorId = "sponsor-shared";

    // The same sponsor-shared appears in both groups
    mockCollection.mockImplementation((name: string) => {
      if (name === "members") {
        return {
          where: jest
            .fn()
            .mockImplementation((field: string, _op: string, value: string) => {
              if (field === "userId") {
                // First query: find caller's groups
                return {
                  get: jest.fn().mockResolvedValue({
                    empty: false,
                    docs: [
                      createDoc("group-1_user-caller", {
                        userId: callerId,
                        groupId: group1Id,
                      }),
                      createDoc("group-2_user-caller", {
                        userId: callerId,
                        groupId: group2Id,
                      }),
                    ],
                  }),
                };
              }
              // field === "groupId": fetch members of that group
              const groupId = value;
              return {
                get: jest.fn().mockResolvedValue({
                  docs: [
                    createDoc(`${groupId}_user-caller`, {
                      userId: callerId,
                      groupId,
                    }),
                    createDoc(`${groupId}_${sharedSponsorId}`, {
                      userId: sharedSponsorId,
                      groupId,
                      displayName: "Shared Sponsor",
                      sponsorSettings: {
                        isAvailable: true,
                        bio: "",
                        requirements: [],
                      },
                    }),
                  ],
                }),
              };
            }),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "Some Group" }),
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
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");
    const result = await (getCrossGroupSponsors as Function)(
      makeRequest(callerId, {}),
    );

    // The shared sponsor should appear exactly once
    const sponsorHits = result.sponsors.filter(
      (s: { userId: string }) => s.userId === sharedSponsorId,
    );
    expect(sponsorHits).toHaveLength(1);
  });

  it("returns empty array (not error) if user is in no groups", async () => {
    const callerId = "user-no-groups";

    mockCollection.mockImplementation((_name: string) => ({
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      }),
    }));

    jest.resetModules();
    const { getCrossGroupSponsors } =
      await import("../callable/getCrossGroupSponsors");
    const result = await (getCrossGroupSponsors as Function)(
      makeRequest(callerId, {}),
    );

    expect(result).toEqual({ sponsors: [] });
  });
});

// ============================================================
// createMultiGroupAnnouncement Tests
// ============================================================

describe("createMultiGroupAnnouncement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("creates announcement in each specified group", async () => {
    const callerId = "admin-user";
    const group1Id = "group-a";
    const group2Id = "group-b";

    let announcementDocIdCounter = 0;
    const mockAnnouncementRef = () => {
      announcementDocIdCounter++;
      const id = `ann-${announcementDocIdCounter}`;
      return { id, set: mockSet };
    };

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockImplementation((groupId: string) => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                name: groupId === group1Id ? "Group A" : "Group B",
                admins: [callerId],
                adminUids: [],
              }),
            }),
            collection: jest.fn().mockReturnValue({
              doc: jest.fn().mockReturnValue(mockAnnouncementRef()),
            }),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { createMultiGroupAnnouncement } =
      await import("../callable/createMultiGroupAnnouncement");

    const result = await (createMultiGroupAnnouncement as Function)(
      makeRequest(callerId, {
        groupIds: [group1Id, group2Id],
        title: "Important Update",
        content: "Please read this carefully.",
      }),
    );

    expect(result.createdCount).toBe(2);
    expect(result.announcementIds).toHaveLength(2);
    expect(mockSet).toHaveBeenCalledTimes(2);
    // Verify the announcement data was correct
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Important Update",
        content: "Please read this carefully.",
        status: "published",
        isMultiGroup: true,
      }),
    );
  });

  it("throws permission-denied if caller is not admin of all groups", async () => {
    const callerId = "regular-user";
    const group1Id = "group-a";
    const group2Id = "group-b"; // user is NOT admin here

    mockCollection.mockImplementation((name: string) => {
      if (name === "groups") {
        return {
          doc: jest.fn().mockImplementation((groupId: string) => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                name: groupId === group1Id ? "Group A" : "Group B",
                admins: groupId === group1Id ? [callerId] : ["other-admin"],
                adminUids: [],
              }),
            }),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    });

    jest.resetModules();
    const { createMultiGroupAnnouncement } =
      await import("../callable/createMultiGroupAnnouncement");

    await expect(
      (createMultiGroupAnnouncement as Function)(
        makeRequest(callerId, {
          groupIds: [group1Id, group2Id],
          title: "Hello",
          content: "World",
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    // No announcements should have been created
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("throws invalid-argument when groupIds is empty", async () => {
    const callerId = "admin-user";

    jest.resetModules();
    const { createMultiGroupAnnouncement } =
      await import("../callable/createMultiGroupAnnouncement");

    await expect(
      (createMultiGroupAnnouncement as Function)(
        makeRequest(callerId, {
          groupIds: [],
          title: "Hello",
          content: "World",
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

// ============================================================
// getPublicEvents Tests
// ============================================================

describe("getPublicEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("only returns instances with isPublic: true", async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const futureTimestamp = makeTimestamp(futureDate);

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [
                createDoc("inst-public", {
                  meetingId: "meeting-1",
                  groupId: "group-1",
                  name: "Open Meeting",
                  scheduledAt: futureTimestamp,
                  isPublic: true,
                  isCancelled: false,
                  type: "AA",
                }),
                // Note: non-public instances are filtered by the Firestore query itself
                // (where isPublic == true), so we shouldn't receive them
              ],
            }),
          }),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "Test Group" }),
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
    const { getPublicEvents } = await import("../callable/getPublicEvents");
    const result = await (getPublicEvents as Function)(
      makeRequest("user-1", {}),
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0].instanceId).toBe("inst-public");
    expect(result.events[0].groupName).toBe("Test Group");
  });

  it("only returns future instances (not past)", async () => {
    // Past instance — should be excluded by the Firestore query (scheduledAt > now)
    // We simulate Firestore correctly filtering these out by returning only future docs
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
    const futureTimestamp = makeTimestamp(futureDate);

    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [
                // Only future docs (Firestore filtered past ones out)
                createDoc("inst-future", {
                  meetingId: "meeting-future",
                  groupId: "group-1",
                  name: "Future Meeting",
                  scheduledAt: futureTimestamp,
                  isPublic: true,
                  isCancelled: false,
                  type: "NA",
                }),
              ],
            }),
          }),
        };
      }
      if (name === "groups") {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ name: "Future Group" }),
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
    const { getPublicEvents } = await import("../callable/getPublicEvents");
    const result = await (getPublicEvents as Function)(
      makeRequest("user-1", {}),
    );

    // Should only have future events
    expect(result.events).toHaveLength(1);
    expect(result.events[0].instanceId).toBe("inst-future");

    // Verify the date is in the future
    const eventDate = new Date(result.events[0].scheduledAt);
    expect(eventDate.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns empty array when no public events exist", async () => {
    mockCollection.mockImplementation((name: string) => {
      if (name === "meetingInstances") {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: true,
              docs: [],
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
    const { getPublicEvents } = await import("../callable/getPublicEvents");
    const result = await (getPublicEvents as Function)(
      makeRequest("user-1", {}),
    );

    expect(result).toEqual({ events: [] });
  });
});
