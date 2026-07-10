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

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (opts: any, handler: (req: any) => Promise<any>) => handler,
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

const mockAccountsCreate = jest.fn();
const mockAccountLinksCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: {
    accounts: { create: mockAccountsCreate },
    accountLinks: { create: mockAccountLinksCreate },
  },
}));

jest.mock("../utils/appConfig", () => ({
  APP_BASE_URL: "https://homegroups-app.com",
}));

let docStore: Record<string, Record<string, any> | null> = {};
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
    update: mockDocUpdate,
  };
}

const mockDb = {
  collection: jest.fn().mockImplementation((name: string) => ({
    doc: (id: string) => buildDocRef(name, id),
  })),
};

jest.mock("../utils/firebase", () => ({ db: mockDb }));

function setDoc(
  collection: string,
  id: string,
  data: Record<string, any> | null,
) {
  docStore[`${collection}/${id}`] = data;
}

function makeRequest(uid: string | null, data: Record<string, any> = {}): any {
  return { auth: uid ? { uid, token: {} } : null, data };
}

describe("createStripeAccountLink", () => {
  const groupId = "group-connect-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    setDoc("groups", groupId, { name: "Test Group", admins: [userId] });
    mockAccountsCreate.mockResolvedValue({ id: "acct_new_123" });
    mockAccountLinksCreate.mockResolvedValue({
      url: "https://connect.stripe.com/setup/acct_new_123",
    });
    mockDocUpdate.mockResolvedValue(undefined);
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not a group admin", async () => {
    setDoc("groups", groupId, { name: "Test Group", admins: ["someone-else"] });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("falls back to adminUids when admins is absent", async () => {
    setDoc("groups", groupId, { name: "Test Group", adminUids: [userId] });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await expect(
      (createStripeAccountLink as any)(makeRequest(userId, { groupId })),
    ).resolves.toMatchObject({ url: expect.any(String) });
  });

  it("creates a new Connect Express account with a deterministic idempotency key when none exists", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockAccountsCreate).toHaveBeenCalledTimes(1);
    const [params, opts] = mockAccountsCreate.mock.calls[0];
    expect(params).toMatchObject({
      type: "express",
      metadata: { groupId },
      capabilities: { transfers: { requested: true } },
    });
    expect(opts).toMatchObject({ idempotencyKey: `connect-acct-${groupId}` });
  });

  it("saves the new stripeConnectAccountId onto the group doc", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockDocUpdate).toHaveBeenCalledWith({
      stripeConnectAccountId: "acct_new_123",
    });
  });

  it("reuses an existing stripeConnectAccountId without calling accounts.create", async () => {
    setDoc("groups", groupId, {
      name: "Test Group",
      admins: [userId],
      stripeConnectAccountId: "acct_existing_456",
    });
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    expect(mockAccountsCreate).not.toHaveBeenCalled();
    const linkArgs = mockAccountLinksCreate.mock.calls[0][0];
    expect(linkArgs.account).toBe("acct_existing_456");
  });

  it("builds refresh_url/return_url with the groupId and account_onboarding type", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    await (createStripeAccountLink as any)(makeRequest(userId, { groupId }));

    const linkArgs = mockAccountLinksCreate.mock.calls[0][0];
    expect(linkArgs.type).toBe("account_onboarding");
    expect(linkArgs.refresh_url).toContain(`groupId=${groupId}`);
    expect(linkArgs.return_url).toContain(`groupId=${groupId}`);
  });

  it("returns the onboarding url on success", async () => {
    jest.resetModules();
    const { createStripeAccountLink } =
      await import("../callable/createStripeAccountLink");
    const result = await (createStripeAccountLink as any)(
      makeRequest(userId, { groupId }),
    );
    expect(result.url).toBe("https://connect.stripe.com/setup/acct_new_123");
  });
});
