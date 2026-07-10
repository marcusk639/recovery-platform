export {};

jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
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

const mockPortalSessionsCreate = jest.fn();

jest.mock("../utils/stripe", () => ({
  stripe: { billingPortal: { sessions: { create: mockPortalSessionsCreate } } },
}));

jest.mock("../utils/appConfig", () => ({
  APP_BASE_URL: "https://homegroups-app.com",
}));

let docStore: Record<string, Record<string, any> | null> = {};

function buildDocRef(collection: string, id: string): any {
  const key = `${collection}/${id}`;
  return {
    id,
    get: jest.fn().mockImplementation(async () => {
      const data = docStore[key];
      if (data == null) return { exists: false, data: () => null };
      return { exists: true, data: () => data };
    }),
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
  return { auth: uid ? { uid } : null, data };
}

describe("createCustomerPortalSession", () => {
  const groupId = "group-portal-1";
  const userId = "admin-1";

  beforeEach(() => {
    jest.clearAllMocks();
    docStore = {};
    mockPortalSessionsCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session/abc",
    });
  });

  it("throws unauthenticated if no auth", async () => {
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(null, { groupId })),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws invalid-argument if groupId is missing", async () => {
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, {})),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("throws not-found if the group does not exist", async () => {
    setDoc("groups", groupId, null);
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws permission-denied if caller is not an admin", async () => {
    setDoc("groups", groupId, { admins: ["someone-else"] });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws failed-precondition if the group has no stripeCustomerId", async () => {
    setDoc("groups", groupId, { admins: [userId] });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    await expect(
      (createCustomerPortalSession as any)(makeRequest(userId, { groupId })),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("returns a portal url with return_url containing the groupId", async () => {
    setDoc("groups", groupId, { admins: [userId], stripeCustomerId: "cus_1" });
    jest.resetModules();
    const { createCustomerPortalSession } =
      await import("../callable/createCustomerPortalSession");
    const result = await (createCustomerPortalSession as any)(
      makeRequest(userId, { groupId }),
    );

    expect(result).toMatchObject({ success: true, url: expect.any(String) });
    const args = mockPortalSessionsCreate.mock.calls[0][0];
    expect(args.customer).toBe("cus_1");
    expect(args.return_url).toContain(`groupId=${groupId}`);
  });
});
