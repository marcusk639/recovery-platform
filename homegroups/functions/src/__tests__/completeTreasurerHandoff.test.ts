export {};

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  initializeApp: jest.fn(),
  firestore: Object.assign(jest.fn(), {
    FieldValue: {
      serverTimestamp: () => "__SERVER_TIMESTAMP__",
      delete: () => "__FIELD_DELETE__",
    },
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
const mockTransactionUpdate = jest.fn();
const mockTransactionSet = jest.fn();
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
    collection: (subCollection: string) => buildCollectionRef(subCollection),
  };
}

function buildCollectionRef(name: string): any {
  return {
    doc: (id?: string) => buildDocRef(name, id || "audit-auto-id"),
  };
}

const mockTransaction = {
  get: jest.fn().mockImplementation(async (ref: any) => ref.get()),
  update: mockTransactionUpdate,
  set: mockTransactionSet,
};

const mockDb = {
  collection: jest
    .fn()
    .mockImplementation((name: string) => buildCollectionRef(name)),
  runTransaction: jest.fn(async (fn: (tx: any) => Promise<any>) =>
    fn(mockTransaction),
  ),
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

describe("completeTreasurerHandoff", () => {
  const groupId = "group-handoff-2";
  const fromUserId = "treasurer-old";
  const toUserId = "treasurer-new";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
      pendingTreasurerHandoff: {
        fromUserId,
        toUserId,
        fromUserName: "Old Treasurer",
        toUserName: "New Treasurer",
      },
    });
    setDoc("users", fromUserId, { fcmTokens: ["tok-old"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition if there is no pending handoff", async () => {
    setDoc("groups", groupId, {
      name: "Handoff Group",
      treasurers: [fromUserId],
    });
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws permission-denied if caller is not the designated target", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await expect(
      (completeTreasurerHandoff as any)(
        makeRequest("random-user", { groupId }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("swaps treasurers atomically: removes fromUserId, adds toUserId", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    const [, updateArgs] = mockTransactionUpdate.mock.calls[0];
    expect(updateArgs.treasurers).toEqual([toUserId]);
    expect(updateArgs.pendingTreasurerHandoff).toBe("__FIELD_DELETE__");
  });

  it("writes a treasurer_handoff_completed audit log entry within the transaction", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "treasurer_handoff_completed",
        fromUserId,
        toUserId,
        performedBy: toUserId,
      }),
    );
  });

  it("notifies the old treasurer's FCM tokens after the transaction commits", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    await (completeTreasurerHandoff as any)(makeRequest(toUserId, { groupId }));

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok-old"] }),
    );
  });

  it("returns success with the new treasurer's id and name", async () => {
    jest.resetModules();
    const { completeTreasurerHandoff } =
      await import("../callable/completeTreasurerHandoff");
    const result = await (completeTreasurerHandoff as any)(
      makeRequest(toUserId, { groupId }),
    );
    expect(result).toMatchObject({
      success: true,
      newTreasurerId: toUserId,
      newTreasurerName: "New Treasurer",
    });
  });
});
