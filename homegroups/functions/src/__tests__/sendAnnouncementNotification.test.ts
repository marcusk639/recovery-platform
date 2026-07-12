/**
 * Tests for sendAnnouncementNotification.
 *
 * Regression: the callable previously had ZERO auth check. Any caller —
 * authenticated or not — could push arbitrary FCM notifications to every
 * member of any group, with a forged `authorId`. Now requires the caller
 * to be authenticated AND an admin of the target group; `authorId` from
 * the request payload is deprecated and ignored (auth.uid is used).
 *
 * Refs: .audit/doc-code-discrepancies.md D-2
 */

export {};

// ---- Mocks ----

const sanDocs: Record<string, { exists: boolean; data: () => unknown }> = {};
const sanCollectionCalls: string[] = [];
const sanMulticastCalls: Array<{ tokenCount: number }> = [];

function makeQueryMock() {
  const q: Record<string, jest.Mock> = {};
  q.where = jest.fn(() => q);
  q.get = jest.fn().mockResolvedValue({ empty: true, docs: [] });
  return q;
}

const sanMockDoc = jest.fn((id: string) => ({
  get: jest.fn().mockResolvedValue(
    sanDocs[id] ?? {
      exists: false,
      data: () => null,
    },
  ),
}));

const sanMockCollection = jest.fn((name: string) => {
  sanCollectionCalls.push(name);
  const q = makeQueryMock();
  (q as unknown as { doc: jest.Mock }).doc = sanMockDoc;
  return q;
});

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn().mockReturnValue({ collection: sanMockCollection }),
    { FieldValue: {} },
  ),
  app: jest.fn().mockReturnValue({}),
  auth: jest.fn().mockReturnValue({}),
}));

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn().mockReturnValue({
    sendEachForMulticast: jest.fn((req: { tokens: string[] }) => {
      sanMulticastCalls.push({ tokenCount: req.tokens.length });
      return Promise.resolve({
        successCount: req.tokens.length,
        failureCount: 0,
        responses: req.tokens.map(() => ({ success: true })),
      });
    }),
  }),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  https: {
    onCall: jest.fn().mockImplementation((handler: Function) => handler),
  },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

// v2/https + logger mocks come from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({
  db: { collection: sanMockCollection },
  messaging: {
    sendEachForMulticast: jest.fn((req: { tokens: string[] }) => {
      sanMulticastCalls.push({ tokenCount: req.tokens.length });
      return Promise.resolve({
        successCount: req.tokens.length,
        failureCount: 0,
        responses: req.tokens.map(() => ({ success: true })),
      });
    }),
  },
}));

// ---- Test ----

import { sendAnnouncementNotification } from "../callable/sendAnnouncementNotification";

const validData = {
  groupId: "group-1",
  announcementId: "ann-1",
  title: "Test announcement",
  body: "Body text",
};

describe("sendAnnouncementNotification — D-2 auth check", () => {
  beforeEach(() => {
    sanCollectionCalls.length = 0;
    sanMulticastCalls.length = 0;
    // Default: group exists with no admins, no members fallback
    sanDocs["group-1"] = {
      exists: true,
      data: () => ({ name: "Test Group", admins: [] }),
    };
  });

  it("throws invalid-argument when data is missing required fields", async () => {
    await expect(
      (sendAnnouncementNotification as unknown as Function)({
        auth: { uid: "user-1" },
        data: { groupId: "g" }, // missing announcementId & title
      }),
    ).rejects.toThrow(/required/i);
  });

  it("throws unauthenticated when no auth context (the original bug)", async () => {
    await expect(
      (sendAnnouncementNotification as unknown as Function)({
        auth: undefined,
        data: validData,
      }),
    ).rejects.toThrow(/must be authenticated/i);

    // And critically: no FCM was sent.
    expect(sanMulticastCalls).toHaveLength(0);
  });

  it("throws permission-denied for non-admin authenticated caller", async () => {
    // Caller authenticated but NOT in groups.admins and no admin members doc
    sanDocs["group-1_attacker"] = {
      exists: true,
      data: () => ({ isAdmin: false, isTreasurer: false }),
    };

    await expect(
      (sendAnnouncementNotification as unknown as Function)({
        auth: { uid: "attacker" },
        data: validData,
      }),
    ).rejects.toThrow(/admin/i);

    expect(sanMulticastCalls).toHaveLength(0);
  });

  it("ignores client-supplied authorId; uses auth.uid for admin check", async () => {
    // Attacker passes an admin's UID as authorId — must NOT bypass.
    sanDocs["group-1"] = {
      exists: true,
      data: () => ({ name: "Test Group", admins: ["real-admin"] }),
    };

    await expect(
      (sendAnnouncementNotification as unknown as Function)({
        auth: { uid: "attacker" },
        data: { ...validData, authorId: "real-admin" },
      }),
    ).rejects.toThrow(/admin/i);

    expect(sanMulticastCalls).toHaveLength(0);
  });

  /**
   * Helper: invoke the handler and capture any error. The handler may fail
   * downstream of the auth check (mock gaps); we only care that the failure
   * is NOT a permission-denied / unauthenticated error.
   */
  async function runAndCaptureError(uid: string): Promise<unknown> {
    try {
      await (sendAnnouncementNotification as unknown as Function)({
        auth: { uid },
        data: validData,
      });
      return null;
    } catch (err) {
      return err;
    }
  }

  it("allows admin via groups.admins array (no permission-denied)", async () => {
    sanDocs["group-1"] = {
      exists: true,
      data: () => ({ name: "Test Group", admins: ["admin-1"] }),
    };
    const err = (await runAndCaptureError("admin-1")) as { code?: string };
    expect(err?.code).not.toBe("permission-denied");
    expect(err?.code).not.toBe("unauthenticated");
  });

  it("allows admin via members collection fallback (no permission-denied)", async () => {
    sanDocs["group-1_admin-fallback"] = {
      exists: true,
      data: () => ({ isAdmin: true }),
    };
    const err = (await runAndCaptureError("admin-fallback")) as {
      code?: string;
    };
    expect(err?.code).not.toBe("permission-denied");
    expect(err?.code).not.toBe("unauthenticated");
  });
});
