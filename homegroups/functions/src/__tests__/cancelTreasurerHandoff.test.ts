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
const mockGroupUpdate = jest.fn().mockResolvedValue(undefined);
const mockAuditLogSet = jest.fn().mockResolvedValue(undefined);
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
    collection: (_sub: string) => ({
      doc: () => ({ set: mockAuditLogSet }),
    }),
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
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

describe("cancelTreasurerHandoff", () => {
  const groupId = "group-handoff-3";
  const fromUserId = "treasurer-old";
  const toUserId = "treasurer-new";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, {
      name: "Handoff Group",
      pendingTreasurerHandoff: {
        fromUserId,
        toUserId,
        fromUserName: "Old Treasurer",
        toUserName: "New Treasurer",
      },
    });
    setDoc("users", fromUserId, { fcmTokens: ["tok-old"] });
    setDoc("users", toUserId, { fcmTokens: ["tok-new"] });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition if there is no pending handoff to cancel", async () => {
    setDoc("groups", groupId, { name: "Handoff Group" });
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws permission-denied if caller is neither the initiator nor the target", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await expect(
      (cancelTreasurerHandoff as any)(makeRequest("random-user", { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows the initiator (fromUserId) to withdraw the handoff", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    const result = await (cancelTreasurerHandoff as any)(
      makeRequest(fromUserId, { groupId }),
    );
    expect(result.message).toContain("withdrawn");
    expect(mockGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ pendingTreasurerHandoff: "__FIELD_DELETE__" }),
    );
  });

  it("allows the target (toUserId) to decline the handoff", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    const result = await (cancelTreasurerHandoff as any)(
      makeRequest(toUserId, { groupId }),
    );
    expect(result.message).toContain("declined");
  });

  it("notifies the other party — target's tokens when initiator cancels", async () => {
    jest.resetModules();
    const { cancelTreasurerHandoff } =
      await import("../callable/cancelTreasurerHandoff");
    await (cancelTreasurerHandoff as any)(makeRequest(fromUserId, { groupId }));
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ["tok-new"] }),
    );
  });
});
