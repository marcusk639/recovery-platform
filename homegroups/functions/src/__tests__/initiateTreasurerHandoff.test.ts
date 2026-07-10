export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
  }),
}));

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (optsOrHandler: any, maybeHandler?: (req: any) => Promise<any>) =>
    typeof maybeHandler === "function" ? maybeHandler : optsOrHandler,
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

let docStore: Record<string, Record<string, any> | null> = {};
const mockGroupUpdate = jest.fn().mockResolvedValue(undefined);
let membersQueryEmpty = false;
const mockSendEachForMulticast = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockGroupUpdate,
  };
}

const mockMembersQuery = {
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockImplementation(async () => ({ empty: membersQueryEmpty })),
};

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => {
    if (name === "members") return mockMembersQuery;
    return { doc: (id: string) => buildDocRef(name, id) };
  }),
};

jest.mock("../utils/firebase", () => ({
  db: mockDb,
  messaging: { sendEachForMulticast: mockSendEachForMulticast },
}));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid } : null, data };
}

describe("initiateTreasurerHandoff", () => {
  const groupId = "group-handoff-1";
  const fromUserId = "treasurer-1";
  const toUserId = "member-2";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    membersQueryEmpty = false;
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
    });
    setDoc("users", fromUserId, { displayName: "Fran Treasurer" });
    setDoc("users", toUserId, { displayName: "Nia New", fcmTokens: ["tok1"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(null, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if toUserId is missing", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws invalid-argument when transferring to yourself", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId: fromUserId }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not a treasurer", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: ["someone-else"],
    });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws failed-precondition if a handoff is already pending", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
      pendingTreasurerHandoff: { fromUserId, toUserId: "someone-else" },
    });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws failed-precondition if toUserId is not a member of the group", async () => {
    membersQueryEmpty = true;
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("writes pendingTreasurerHandoff onto the group doc with both display names", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, {
        groupId,
        toUserId,
        message: "Time to pass it on",
      }),
    );

    expect(mockGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingTreasurerHandoff: expect.objectContaining({
          fromUserId,
          toUserId,
          fromUserName: "Fran Treasurer",
          toUserName: "Nia New",
          message: "Time to pass it on",
        }),
      }),
    );
  });

  it("notifies the target user's FCM tokens", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId, toUserId }),
    );

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok1"] }),
    );
  });

  it("does not throw when the target user has no FCM tokens", async () => {
    setDoc("users", toUserId, { displayName: "Nia New" });
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    await expect(
      (initiateTreasurerHandoff as any)(
        makeRequest(fromUserId, { groupId, toUserId }),
      ),
    ).resolves.toMatchObject({ success: true });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("returns success with the pendingHandoff summary", async () => {
    jest.resetModules();
    const { initiateTreasurerHandoff } =
      await import("../callable/initiateTreasurerHandoff");
    const result = await (initiateTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId, toUserId }),
    );
    expect(result).toMatchObject({
      success: true,
      pendingHandoff: { fromUserId, toUserId },
    });
  });
});
