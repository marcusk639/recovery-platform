/**
 * ees.ts service — createEESRecords write-shape regression tests
 *
 * Hardened 2026-07-05: createEESRecords previously wrote records with no
 * `createdAt` or `type` field. OxfordDashboard's transaction reader orders
 * by `createdAt` (Firestore silently excludes docs missing the ordered
 * field) and renders `tx.type.charAt(0)` — so every real EES record was
 * invisible on the dashboard, and would have crashed the renderer if the
 * orderBy issue were fixed in isolation. These tests confirm both fields
 * are now written.
 */

const mocks = {
  batchSet: jest.fn(),
  batchCommit: jest.fn(() => Promise.resolve()),
};

let mockDocIdCounter = 0;

jest.mock("../../../../firebase-setup", () => {
  return {
    firestore: {
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ id: `doc-${mockDocIdCounter++}` })),
      })),
      batch: jest.fn(() => ({
        set: mocks.batchSet,
        commit: mocks.batchCommit,
      })),
    },
  };
});

import { createEESRecords } from "../ees";

describe("createEESRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocIdCounter = 0;
  });

  it("writes createdAt and type on every record so they surface on the dashboard", async () => {
    await createEESRecords("house-1", "2026-07-06", ["guest-1", "guest-2"], 42);

    expect(mocks.batchSet).toHaveBeenCalledTimes(2);
    mocks.batchSet.mock.calls.forEach(([, record]) => {
      expect(record.createdAt).toEqual(expect.any(String));
      expect(new Date(record.createdAt).toISOString()).toBe(record.createdAt);
      expect(record.type).toBe("payment");
    });
  });

  it("still writes the original EESRecord fields unchanged", async () => {
    await createEESRecords("house-1", "2026-07-06", ["guest-1"], 42);

    const [, record] = mocks.batchSet.mock.calls[0];
    expect(record).toMatchObject({
      guestId: "guest-1",
      houseId: "house-1",
      weekStart: "2026-07-06",
      amount: 42,
      paid: false,
    });
  });
});
