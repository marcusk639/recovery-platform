import * as admin from "firebase-admin";

// Transaction mocks — tx.get returns the snap, tx.set records the write
const mockTxGet = jest.fn();
const mockTxSet = jest.fn();
const mockTx = { get: mockTxGet, set: mockTxSet };
// runTransaction executes the callback with mockTx and propagates throws
const mockRunTransaction = jest.fn((fn: (tx: any) => Promise<void>) =>
  fn(mockTx),
);

const mockDoc = jest.fn(() => ({})); // ref object; read/write via tx
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin", () => ({
  apps: ["mock-app"],
  firestore: jest.fn(() => ({
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  })),
  initializeApp: jest.fn(),
}));

class MockHttpsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

jest.mock("firebase-functions", () => ({
  https: {
    HttpsError: MockHttpsError,
    onCall: (optsOrHandler: any, maybeHandler?: any) =>
      typeof optsOrHandler === "object" && typeof maybeHandler === "function"
        ? maybeHandler
        : optsOrHandler,
  },
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: MockHttpsError,
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler: any) => handler,
  HttpsError: MockHttpsError,
}));

// logger mock comes from functions/jest.setup.ts (shared)

jest.mock("../utils/firebase", () => ({ db: { collection: mockCollection } }));

jest.mock("../utils/stripe", () => ({
  stripe: {
    customers: { create: jest.fn() },
    subscriptions: { create: jest.fn() },
    prices: { retrieve: jest.fn() },
  },
  productIdGroup: "prod_test",
  getDefaultPriceForProduct: jest.fn(),
  assertGroupPriceIsAnnual: jest.fn(),
  TRIAL_PERIOD_DAYS: 7,
}));

jest.mock("../callable/getMultiGroupPricing", () => ({
  getMultiGroupPriceId: jest.fn().mockReturnValue(null),
}));

import { checkAndRecordTrial } from "../callable/createGroupSubscription";

describe("checkAndRecordTrial", () => {
  const now = Date.now();
  const elevenMonthsAgo = now - 11 * 30 * 24 * 60 * 60 * 1000;
  const thirteenMonthsAgo = now - 13 * 30 * 24 * 60 * 60 * 1000;

  beforeEach(() => jest.clearAllMocks());

  it("allows first trial (no history) and writes the timestamp", async () => {
    mockTxGet.mockResolvedValue({ exists: false });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.anything(),
      { trials: expect.arrayContaining([expect.any(Number)]) },
      { merge: false },
    );
  });

  it("allows second trial when only one recent trial exists", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [elevenMonthsAgo] }),
    });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
    expect(mockTxSet).toHaveBeenCalled();
  });

  it("blocks third trial when two recent trials exist", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [elevenMonthsAgo, elevenMonthsAgo - 1000] }),
    });
    await expect(checkAndRecordTrial("user1")).rejects.toThrow(
      /Maximum of 2 free trials/,
    );
    expect(mockTxSet).not.toHaveBeenCalled();
  });

  it("ignores trials older than 12 months", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [thirteenMonthsAgo, thirteenMonthsAgo - 1000] }),
    });
    await expect(checkAndRecordTrial("user1")).resolves.not.toThrow();
  });

  it("prunes old trials from stored array — writes only recent entries", async () => {
    mockTxGet.mockResolvedValue({
      exists: true,
      data: () => ({ trials: [thirteenMonthsAgo, elevenMonthsAgo] }),
    });
    await checkAndRecordTrial("user1");
    const writtenTrials = mockTxSet.mock.calls[0][1].trials as number[];
    // thirteenMonthsAgo should be pruned; only elevenMonthsAgo + new timestamp remain
    expect(writtenTrials).toHaveLength(2);
    expect(writtenTrials).not.toContain(thirteenMonthsAgo);
  });
});
