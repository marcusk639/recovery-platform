// src/__tests__/triggers/firestore.test.ts
//
// All firebase-admin and firebase-functions mocks must be declared before any
// imports that transitively pull in those modules.

// ─── firebase-admin ───────────────────────────────────────────────────────────
const mockSetCustomUserClaims = jest.fn().mockResolvedValue(undefined);
const mockAuthInstance = { setCustomUserClaims: mockSetCustomUserClaims };

// ─── Firestore query + batch mock ─────────────────────────────────────────────
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(undefined);
const mockBatch = { update: mockBatchUpdate, commit: mockBatchCommit };

const mockGuestsGet = jest.fn();
const mockEesGet = jest.fn();

function makeQueryChain(getFn: jest.Mock) {
  const chain = { where: jest.fn().mockReturnThis(), get: getFn };
  return chain;
}

jest.mock("firebase-admin", () => ({
  auth: jest.fn(() => mockAuthInstance),
  app: jest.fn(() => ({})),
  firestore: jest.fn(() => ({
    collection: jest.fn((name: string) => {
      if (name === "guests") return makeQueryChain(mockGuestsGet);
      if (name === "ees-records") return makeQueryChain(mockEesGet);
      return makeQueryChain(jest.fn().mockResolvedValue({ docs: [] }));
    }),
    batch: jest.fn(() => mockBatch),
  })),
  messaging: jest.fn(() => ({ sendEachForMulticast: jest.fn() })),
  initializeApp: jest.fn(),
}));

// ─── firebase-functions (logger used inside util modules) ─────────────────────
jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

// ─── v2 firestore trigger wrappers ───────────────────────────────────────────
jest.mock("firebase-functions/v2/firestore", () => ({
  onDocumentCreated: jest.fn((_pathOrOpts: any, handler?: any) =>
    typeof _pathOrOpts === "function" ? _pathOrOpts : (handler ?? _pathOrOpts),
  ),
  onDocumentUpdated: jest.fn((_pathOrOpts: any, handler?: any) =>
    typeof _pathOrOpts === "function" ? _pathOrOpts : (handler ?? _pathOrOpts),
  ),
  onDocumentDeleted: jest.fn((_pathOrOpts: any, handler?: any) =>
    typeof _pathOrOpts === "function" ? _pathOrOpts : (handler ?? _pathOrOpts),
  ),
  onDocumentWritten: jest.fn((_pathOrOpts: any, handler?: any) =>
    typeof _pathOrOpts === "function" ? _pathOrOpts : (handler ?? _pathOrOpts),
  ),
}));

// ─── util/notifications ───────────────────────────────────────────────────────
const mockSendNotification = jest.fn().mockResolvedValue(undefined);
jest.mock("../../util/notifications", () => ({
  sendNotification: (...args: any[]) => mockSendNotification(...args),
  createInviteNotification: jest.fn(),
}));

// ─── util/email ───────────────────────────────────────────────────────────────
const mockSendEmail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../util/email", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  regroupEmail: "admin@regroup-app.com",
}));

// ─── api/firestore ────────────────────────────────────────────────────────────
const mockUpdateContact = jest.fn().mockResolvedValue(undefined);
jest.mock("../../api/firestore", () => ({
  updateContact: (...args: any[]) => mockUpdateContact(...args),
  createGuestId: jest.fn(() => "guest-id-mock"),
  createHouseId: jest.fn(() => "house-id-mock"),
  // Collections used transitively by util modules
  userCollection: { doc: jest.fn(() => ({ update: jest.fn() })) },
  app: {},
  addNotification: jest.fn(),
  getUser: jest.fn(),
  // onGuestWrite EES recalculation reads guestCollection + ratsFirestore directly.
  guestCollection: makeQueryChain(mockGuestsGet),
  houseCollection: makeQueryChain(
    jest.fn().mockResolvedValue({ docs: [], empty: true }),
  ),
  notificationCollection: {
    doc: jest.fn(() => ({ set: jest.fn(), update: jest.fn() })),
  },
  ratsFirestore: {
    collection: jest.fn((name: string) =>
      name === "ees-records"
        ? makeQueryChain(mockEesGet)
        : makeQueryChain(
            jest.fn().mockResolvedValue({ docs: [], empty: true }),
          ),
    ),
    batch: jest.fn(() => mockBatch),
  },
}));

// ─── util/claims ─────────────────────────────────────────────────────────────
const mockDeleteClaim = jest.fn();
jest.mock("../../util/claims", () => ({
  deleteClaim: (...args: any[]) => mockDeleteClaim(...args),
}));

// ─── util/date ────────────────────────────────────────────────────────────────
jest.mock("../../util/date", () => ({
  getCurrentTime: jest.fn(() => "2026-02-23T00:00:00Z"),
  getTodaysDate: jest.fn(() => "2026-02-23"),
}));

// ─── Now import the module under test ─────────────────────────────────────────
import {
  notify,
  notifyNewHouseCreated,
  sendContactEmail,
  sendSubscriptionUpdateEmail,
  reportBug,
  submitFeedback,
} from "../../triggers/firestore";

// ─── Event helpers ────────────────────────────────────────────────────────────

/** Simulates an onDocumentCreated / onDocumentDeleted event. */
const makeEvent = (
  docData: any,
  docId = "doc-1",
  extraParams: Record<string, string> = {},
) => ({
  data: {
    data: () => docData,
    id: docId,
    ref: { path: `collection/${docId}` },
  },
  params: { ...extraParams },
});

/** Simulates an onDocumentUpdated event (before/after snapshots). */
const makeUpdatedEvent = (
  beforeData: any,
  afterData: any,
  extraParams: Record<string, string> = {},
) => ({
  data: {
    before: { data: () => beforeData, exists: beforeData !== null },
    after: { data: () => afterData, exists: afterData !== null },
    ref: { path: "collection/doc-1" },
  },
  params: { ...extraParams },
});

/** Simulates an onDocumentWritten event (create, update, or delete). */
const makeWrittenEvent = (
  beforeData: any,
  afterData: any,
  guestId = "guest-1",
) => ({
  data: {
    before: { data: () => beforeData, exists: beforeData !== null },
    after: { data: () => afterData, exists: afterData !== null },
  },
  params: { guestId },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
});

// ─── notify ───────────────────────────────────────────────────────────────────

describe("notify", () => {
  it("calls sendNotification with the correct recipient, title, and body", async () => {
    const event = makeEvent({
      userId: "user-42",
      message: "Hello there",
      subject: "Test Subject",
      type: "",
    });

    await (notify as Function)(event);

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith({
      recipientId: "user-42",
      body: "Hello there",
      title: "Test Subject",
    });
  });

  it("returns early when event.data is missing", async () => {
    const event = { data: undefined, params: {} };
    await (notify as Function)(event);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("uses empty strings when message and subject are undefined", async () => {
    const event = makeEvent({ userId: "user-1" });
    await (notify as Function)(event);
    expect(mockSendNotification).toHaveBeenCalledWith({
      recipientId: "user-1",
      body: "",
      title: "",
    });
  });
});

// ─── notifyNewHouseCreated ────────────────────────────────────────────────────

describe("notifyNewHouseCreated", () => {
  it("sends an email when a new house is created", async () => {
    const event = makeEvent({
      name: "Sunrise House",
      id: "house-99",
      superAdminId: "admin-1",
      createdDate: "2026-02-23",
    });

    await (notifyNewHouseCreated as Function)(event);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const callArg = mockSendEmail.mock.calls[0][0];
    expect(callArg.subject).toBe("New house created");
    expect(callArg.to).toBe("admin@regroup-app.com");
    expect(callArg.text).toContain("Sunrise House");
    expect(callArg.text).toContain("house-99");
    expect(callArg.text).toContain("admin-1");
  });

  it("returns early and does not send an email when event.data is missing", async () => {
    const event = { data: undefined, params: {} };
    await (notifyNewHouseCreated as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── sendContactEmail ─────────────────────────────────────────────────────────

describe("sendContactEmail", () => {
  it("sends an email and updates the contact document", async () => {
    const event = makeEvent(
      {
        name: "Jane Doe",
        email: "jane@example.com",
        message: "I need help",
        subject: "Support Request",
        date: "",
      },
      "contact-1",
      { contactId: "contact-1" },
    );

    await (sendContactEmail as Function)(event);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.subject).toBe("Support Request");
    expect(emailArg.text).toContain("Jane Doe");
    expect(emailArg.text).toContain("jane@example.com");
    expect(emailArg.text).toContain("I need help");

    expect(mockUpdateContact).toHaveBeenCalledTimes(1);
    const [contactId, contactData] = mockUpdateContact.mock.calls[0];
    expect(contactId).toBe("contact-1");
    expect(contactData.date).toBe("2026-02-23T00:00:00Z");
  });

  it("returns early when event.data is missing", async () => {
    const event = { data: undefined, params: { contactId: "c-1" } };
    await (sendContactEmail as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });
});

// ─── sendSubscriptionUpdateEmail ──────────────────────────────────────────────

describe("sendSubscriptionUpdateEmail", () => {
  it("sends an email when subscription status changes", async () => {
    const before = {
      id: "user-7",
      subscriptionMetadata: { status: "inactive" },
    };
    const after = { id: "user-7", subscriptionMetadata: { status: "active" } };
    const event = makeUpdatedEvent(before, after);

    await (sendSubscriptionUpdateEmail as Function)(event);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.subject).toBe("User subscription changed");
    expect(emailArg.text).toContain("user-7");
    expect(emailArg.text).toContain("inactive");
    expect(emailArg.text).toContain("active");
  });

  it("does not send an email when subscription status is unchanged", async () => {
    const before = { id: "user-7", subscriptionMetadata: { status: "active" } };
    const after = { id: "user-7", subscriptionMetadata: { status: "active" } };
    const event = makeUpdatedEvent(before, after);

    await (sendSubscriptionUpdateEmail as Function)(event);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns early when event.data is missing", async () => {
    const event = { data: undefined, params: {} };
    await (sendSubscriptionUpdateEmail as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns early when before snapshot is missing", async () => {
    const event = makeUpdatedEvent(null, {
      id: "user-7",
      subscriptionMetadata: { status: "active" },
    });
    // Simulate missing before by making data() return undefined
    (event.data as any).before.data = () => undefined;
    await (sendSubscriptionUpdateEmail as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── reportBug ────────────────────────────────────────────────────────────────

describe("reportBug", () => {
  it("sends an email when a new bug report is created", async () => {
    const event = makeEvent({
      description: "App crashes on startup",
      reporter: "user-5",
      id: "bug-10",
      createdDate: "2026-02-23",
    });

    await (reportBug as Function)(event);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.subject).toBe("New bug report");
    expect(emailArg.text).toContain("App crashes on startup");
    expect(emailArg.text).toContain("user-5");
    expect(emailArg.text).toContain("bug-10");
  });

  it("returns early when event.data is missing", async () => {
    const event = { data: undefined, params: {} };
    await (reportBug as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── submitFeedback ───────────────────────────────────────────────────────────

describe("submitFeedback", () => {
  it("sends an email when new feedback is submitted", async () => {
    const event = makeEvent({
      description: "Love the new dashboard!",
      reviewer: "user-3",
      id: "feedback-5",
      createdDate: "2026-02-23",
      type: "app",
      houseId: "house-1",
    });

    await (submitFeedback as Function)(event);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArg = mockSendEmail.mock.calls[0][0];
    expect(emailArg.subject).toBe("New feedback");
    expect(emailArg.text).toContain("Love the new dashboard!");
    expect(emailArg.text).toContain("user-3");
    expect(emailArg.text).toContain("feedback-5");
  });

  it("returns early when event.data is missing", async () => {
    const event = { data: undefined, params: {} };
    await (submitFeedback as Function)(event);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// ─── onGuestWrite — EES recalculation detail ─────────────────────────────────

describe("onGuestWrite (EES recalculation)", () => {
  let onGuestWrite: Function;
  beforeAll(() => {
    onGuestWrite = require("../../triggers/firestore").onGuestWrite;
  });

  const activeGuest = {
    houseId: "house-1",
    status: "active",
    moveOutDate: undefined,
  };
  const inactiveGuest = { houseId: "house-1", status: "inactive" };
  const expelledGuest = {
    houseId: "house-1",
    status: "expelled",
    moveOutDate: "2026-01-01",
  };

  function makeGuestSnap(guests: any[]) {
    return { docs: guests.map((d) => ({ data: () => d })) };
  }

  function makeEesSnap(records: any[]) {
    return {
      empty: records.length === 0,
      docs: records.map((r, i) => ({ data: () => r, ref: { id: `ees-${i}` } })),
    };
  }

  it("recalculates EES when a guest is updated", async () => {
    mockGuestsGet.mockResolvedValue(makeGuestSnap([activeGuest, activeGuest]));
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 200, paid: false }]),
    );

    const event = makeWrittenEvent(activeGuest, { ...activeGuest, step: 2 });
    await onGuestWrite(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), {
      amount: 100,
      residentCount: 2,
    });
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("excludes inactive and expelled guests from the active count", async () => {
    mockGuestsGet.mockResolvedValue(
      makeGuestSnap([activeGuest, inactiveGuest, expelledGuest]),
    );
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 100, paid: false }]),
    );

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await onGuestWrite(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), {
      amount: 100,
      residentCount: 1,
    });
  });

  it("uses the before snapshot houseId on a delete event", async () => {
    mockGuestsGet.mockResolvedValue(makeGuestSnap([activeGuest]));
    mockEesGet.mockResolvedValue(
      makeEesSnap([{ houseId: "house-1", totalExpenses: 50, paid: false }]),
    );

    const event = makeWrittenEvent(activeGuest, null);
    await onGuestWrite(event);

    expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), {
      amount: 50,
      residentCount: 1,
    });
  });

  it("returns early when no EES records exist for the current week", async () => {
    mockGuestsGet.mockResolvedValue(makeGuestSnap([activeGuest]));
    mockEesGet.mockResolvedValue(makeEesSnap([]));

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await onGuestWrite(event);

    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("returns early when activeCount is zero", async () => {
    mockGuestsGet.mockResolvedValue(
      makeGuestSnap([inactiveGuest, expelledGuest]),
    );

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await onGuestWrite(event);

    expect(mockEesGet).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it("returns early when event data is entirely missing", async () => {
    const event = { data: undefined, params: { guestId: "g-1" } };
    await onGuestWrite(event);
    expect(mockGuestsGet).not.toHaveBeenCalled();
  });

  it("re-throws on Firestore failure so Firebase can retry", async () => {
    mockGuestsGet.mockRejectedValue(new Error("Firestore unavailable"));

    const event = makeWrittenEvent(activeGuest, activeGuest);
    await expect(onGuestWrite(event)).rejects.toThrow("Firestore unavailable");
  });
});

// ─── onGuestWrite (merged) ────────────────────────────────────────────────────
// These tests will fail until Task 3 implements the export.

describe("onGuestWrite (merged handler)", () => {
  const guest = { userId: "user-1", houseId: "house-1", status: "active" };

  beforeEach(() => {
    mockDeleteClaim
      .mockResolvedValueOnce({ guest: [] })
      .mockResolvedValueOnce({ admin: [] });
    mockGuestsGet.mockResolvedValue({ docs: [{ data: () => guest }] });
    mockEesGet.mockResolvedValue({ empty: true, docs: [] });
  });

  it("runs EES recalculation on a create event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    const event = makeWrittenEvent(null, guest);

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });

  it("runs EES recalculation on an update event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    const event = makeWrittenEvent(guest, { ...guest, step: 2 });

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
    expect(mockDeleteClaim).not.toHaveBeenCalled();
  });

  it("runs both EES recalculation and auth cleanup on a delete event", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockEesGet.mockResolvedValue({
      empty: false,
      docs: [{ data: () => ({ totalExpenses: 100, paid: false }), ref: {} }],
    });
    const event = makeWrittenEvent(guest, null);

    await (onGuestWrite as Function)(event);

    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
    expect(mockDeleteClaim).toHaveBeenCalledTimes(2);
    expect(mockSetCustomUserClaims).toHaveBeenCalledTimes(1);
  });

  it("still runs EES if auth cleanup fails on delete", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockDeleteClaim.mockReset();
    mockDeleteClaim.mockRejectedValue(new Error("Auth service down"));
    mockGuestsGet.mockResolvedValue({ docs: [{ data: () => guest }] });
    mockEesGet.mockResolvedValue({ empty: true, docs: [] });

    const event = makeWrittenEvent(guest, null);
    await expect((onGuestWrite as Function)(event)).resolves.toBeUndefined();
    expect(mockGuestsGet).toHaveBeenCalledTimes(1);
  });

  it("still runs auth cleanup if EES fails on delete", async () => {
    const { onGuestWrite } = require("../../triggers/firestore");
    mockGuestsGet.mockReset();
    mockGuestsGet.mockRejectedValue(new Error("Firestore down"));

    const event = makeWrittenEvent(guest, null);
    await expect((onGuestWrite as Function)(event)).resolves.toBeUndefined();
    expect(mockDeleteClaim).toHaveBeenCalledTimes(2);
  });
});
