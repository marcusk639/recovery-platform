/**
 * Tests for grantSponsorStepAccess Cloud Function
 *
 * Run with:
 *   cd functions && npx jest src/tests/grantSponsorStepAccess.test.ts --no-coverage
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockSend = jest.fn();

// Mock firebase-admin
jest.mock("firebase-admin", () => {
  const firestoreMock = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: mockGet,
    set: mockSet,
  };
  return {
    firestore: jest.fn(() => firestoreMock),
    initializeApp: jest.fn(),
    apps: ["fake"],
  };
});

// Mock the shared db util used by the function
jest.mock("../utils/firebase", () => {
  const firestoreMock = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: mockGet,
    set: mockSet,
  };
  return { db: firestoreMock };
});

// Mock firebase-admin messaging
const mockMessaging = {
  send: mockSend,
};
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => mockMessaging),
}));

// Mock firebase-functions v1 HttpsError
class MockHttpsError extends Error {
  code: string;
  details: any;
  constructor(code: string, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "HttpsError";
  }
}

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: MockHttpsError,
}));

// ---------------------------------------------------------------------------
// Import the handler under test
// ---------------------------------------------------------------------------

import { grantSponsorStepAccessHandler } from "../callable/grantSponsorStepAccess";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeRequest(
  uid: string | null,
  data: { sponsorId: string; allow: boolean },
) {
  return {
    auth: uid ? { uid } : undefined,
    data,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("grantSponsorStepAccess", () => {
  const CALLER_UID = "user-123";
  const SPONSOR_UID = "sponsor-456";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws unauthenticated error when no auth context", async () => {
    const request = makeRequest(null, { sponsorId: SPONSOR_UID, allow: true });

    await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument when sponsorId is missing", async () => {
    const request = makeRequest(CALLER_UID, { sponsorId: "", allow: true });

    await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws permission-denied when no active sponsorship relationship exists", async () => {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: true,
    });
    await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
      code: "permission-denied",
      message: expect.stringContaining("No active sponsorship"),
    });
  });

  it("throws permission-denied when sponsorship does not exist for revoke", async () => {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] });
    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: false,
    });
    await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws not-found when sponsee has no step progress document", async () => {
    mockGet
      .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship found
      .mockResolvedValueOnce({ exists: false }); // stepProgress missing

    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: true,
    });

    await expect(grantSponsorStepAccessHandler(request)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("updates stepProgress doc with allow=true and sends notification", async () => {
    // Sponsee progress document exists
    const callerDoc = { exists: true, data: () => ({ displayName: "Alice" }) };
    // Sponsor user document
    const sponsorDoc = {
      exists: true,
      data: () => ({
        displayName: "Bob",
        fcmTokens: ["token-abc"],
      }),
    };

    // sponsorship query; stepProgress/current; caller user doc; sponsor user doc
    mockGet
      .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
      .mockResolvedValueOnce({ exists: true }) // stepProgress/current
      .mockResolvedValueOnce(callerDoc) // users/{callerId}
      .mockResolvedValueOnce(sponsorDoc); // users/{sponsorId}

    mockSet.mockResolvedValue(undefined);
    mockSend.mockResolvedValue("message-id-001");

    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: true,
    });

    const result = await grantSponsorStepAccessHandler(request);

    expect(result).toMatchObject({ success: true });
    expect(mockSet).toHaveBeenCalledTimes(1);
    // Verify the Firestore write contains the correct fields
    const writePayload = mockSet.mock.calls[0][0];
    expect(writePayload).toMatchObject({
      sponsorId: SPONSOR_UID,
      allowSponsorAccess: true,
    });
  });

  it("updates stepProgress doc with allow=false and does NOT send notification", async () => {
    mockGet
      .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
      .mockResolvedValueOnce({ exists: true }); // stepProgress/current

    mockSet.mockResolvedValue(undefined);

    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: false,
    });

    const result = await grantSponsorStepAccessHandler(request);

    expect(result).toMatchObject({ success: true });
    expect(mockSet).toHaveBeenCalledTimes(1);
    const writePayload = mockSet.mock.calls[0][0];
    expect(writePayload).toMatchObject({
      sponsorId: SPONSOR_UID,
      allowSponsorAccess: false,
    });
    // Notification should not be sent when revoking access
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("still succeeds when sponsor has no FCM tokens (no notification sent)", async () => {
    const callerDoc = { exists: true, data: () => ({ displayName: "Alice" }) };
    const sponsorDocNoTokens = {
      exists: true,
      data: () => ({ displayName: "Bob", fcmTokens: [] }),
    };

    mockGet
      .mockResolvedValueOnce({ empty: false, docs: [{}] }) // active sponsorship
      .mockResolvedValueOnce({ exists: true }) // stepProgress/current
      .mockResolvedValueOnce(callerDoc)
      .mockResolvedValueOnce(sponsorDocNoTokens);

    mockSet.mockResolvedValue(undefined);

    const request = makeRequest(CALLER_UID, {
      sponsorId: SPONSOR_UID,
      allow: true,
    });

    const result = await grantSponsorStepAccessHandler(request);
    expect(result).toMatchObject({ success: true });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
