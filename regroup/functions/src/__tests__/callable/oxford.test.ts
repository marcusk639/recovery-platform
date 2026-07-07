// src/__tests__/callable/oxford.test.ts

jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) =>
      typeof _opts === "function" ? _opts : handler,
  };
});

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetHouse = jest.fn();
const mockGetUser = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn();
const mockSwapSubscriptionItemPrice = jest.fn();

const mockGuestQueryGet = jest.fn();
const mockGuestQuery: any = {
  where: jest.fn(() => mockGuestQuery),
  limit: jest.fn(() => mockGuestQuery),
  get: mockGuestQueryGet,
};

const mockVoteDocGet = jest.fn();
const mockVoteDocUpdate = jest.fn();
const mockVoteDoc = { id: "vote-1" };
const mockHouseCollectionDoc = jest.fn(() => ({
  id: "house-1",
  collection: jest.fn(() => ({ doc: jest.fn(() => mockVoteDoc) })),
}));
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockVoteDocGet, update: mockVoteDocUpdate }),
);

jest.mock("../../api/firestore", () => ({
  getHouse: mockGetHouse,
  getUser: mockGetUser,
  houseCollection: { doc: mockHouseCollectionDoc },
  userCollection: { doc: jest.fn(() => ({ id: "op-1" })) },
  guestCollection: { where: jest.fn(() => mockGuestQuery) },
  ratsFirestore: {
    batch: jest.fn(() => ({
      update: mockBatchUpdate,
      commit: mockBatchCommit,
    })),
    runTransaction: mockRunTransaction,
  },
}));

jest.mock("../../api/stripe", () => ({
  OXFORD_PRICE_ID: "price_oxford",
  HOUSE_PRICE_ID: "price_house",
  swapSubscriptionItemPrice: mockSwapSubscriptionItemPrice,
}));

jest.mock("../../config", () => ({
  STRIPE_SECRET_KEY: "STRIPE_SECRET_KEY",
}));

import { setOxfordEnabled, castOxfordVote } from "../../callable/oxford";
import { HttpsError } from "firebase-functions/v2/https";

const fakeAuth = { uid: "op-1" };
const call = (data: unknown, auth: object | null = fakeAuth) =>
  (setOxfordEnabled as unknown as Function)({ data, auth: auth ?? undefined });

const baseHouse = {
  houseType: "traditional",
  superAdminId: "op-1",
  adminId: "op-1",
};
const baseUser = {
  subscriptionMetadata: {
    items: { houseItemId: "si_abc123" },
    oxfordEnabled: false,
  },
};

beforeEach(() => jest.clearAllMocks());

describe("setOxfordEnabled — auth guards", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(
      call({ houseId: "house-1", enabled: true }, null),
    ).rejects.toThrow(HttpsError);
  });

  it("throws not-found when house does not exist", async () => {
    mockGetHouse.mockResolvedValue(undefined);
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not superAdminId", async () => {
    mockGetHouse.mockResolvedValue({
      ...baseHouse,
      superAdminId: "other-user",
    });
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws failed-precondition when user has no subscription", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue({ subscriptionMetadata: {} });
    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

describe("setOxfordEnabled — no-op path", () => {
  it("returns changed:false when already in desired state", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "traditional" });
    mockGetUser.mockResolvedValue(baseUser);
    const result = await call({ houseId: "house-1", enabled: false });
    expect(result).toEqual({ success: true, changed: false });
    expect(mockSwapSubscriptionItemPrice).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});

describe("setOxfordEnabled — happy paths", () => {
  it("swaps Stripe to Oxford price and writes Firestore when enabling", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await call({ houseId: "house-1", enabled: true });

    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledWith(
      "si_abc123",
      "price_oxford",
    );
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true, changed: true });
  });

  it("swaps Stripe to house price and writes Firestore when disabling", async () => {
    mockGetHouse.mockResolvedValue({ ...baseHouse, houseType: "oxford" });
    mockGetUser.mockResolvedValue({
      subscriptionMetadata: {
        items: { houseItemId: "si_abc123" },
        oxfordEnabled: true,
      },
    });
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockResolvedValue(undefined);

    const result = await call({ houseId: "house-1", enabled: false });

    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledWith(
      "si_abc123",
      "price_house",
    );
    expect(result).toEqual({ success: true, changed: true });
  });
});

describe("setOxfordEnabled — rollback on Firestore failure", () => {
  it("rolls back Stripe and throws internal when Firestore batch fails", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockResolvedValue({});
    mockBatchCommit.mockRejectedValue(new Error("Firestore unavailable"));

    await expect(
      call({ houseId: "house-1", enabled: true }),
    ).rejects.toMatchObject({
      code: "internal",
    });

    // First call: enable (house → oxford), second call: rollback (oxford → house)
    expect(mockSwapSubscriptionItemPrice).toHaveBeenCalledTimes(2);
    expect(mockSwapSubscriptionItemPrice).toHaveBeenNthCalledWith(
      1,
      "si_abc123",
      "price_oxford",
    );
    expect(mockSwapSubscriptionItemPrice).toHaveBeenNthCalledWith(
      2,
      "si_abc123",
      "price_house",
    );
  });

  it("does not touch Firestore when Stripe swap fails", async () => {
    mockGetHouse.mockResolvedValue(baseHouse);
    mockGetUser.mockResolvedValue(baseUser);
    mockSwapSubscriptionItemPrice.mockRejectedValue(new Error("Stripe error"));

    await expect(call({ houseId: "house-1", enabled: true })).rejects.toThrow(
      "Stripe error",
    );
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});

// ─── castOxfordVote ──────────────────────────────────────────────────────────

const castVoteAuth = {
  uid: "guest-user-1",
  token: { guest: { "house-1": true } },
};
const castVoteCall = (data: unknown, auth: object | null = castVoteAuth) =>
  (castOxfordVote as unknown as Function)({ data, auth: auth ?? undefined });

const oxfordHouse = {
  houseType: "oxford",
  subscriptionStatus: "active",
};

function mockVoteSnap(data: any, exists = true) {
  return { exists, data: () => data };
}

beforeEach(() => {
  mockGuestQuery.where.mockClear();
  mockGuestQueryGet.mockResolvedValue({
    empty: false,
    docs: [{ id: "guest-1" }],
  });
});

describe("castOxfordVote — auth guards", () => {
  it("throws unauthenticated when no auth", async () => {
    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }, null),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("throws not-found when house does not exist", async () => {
    mockGetHouse.mockResolvedValue(undefined);
    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws failed-precondition when the house is not an active Oxford house", async () => {
    mockGetHouse.mockResolvedValue({
      ...oxfordHouse,
      houseType: "traditional",
    });
    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("throws permission-denied when the caller has no guest or admin claim for the house", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    await expect(
      castVoteCall(
        { houseId: "house-1", voteId: "v1", choice: "yes" },
        { uid: "stranger", token: {} },
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("throws permission-denied when the caller has a guest claim but no guest doc for this house", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockGuestQueryGet.mockResolvedValue({ empty: true, docs: [] });
    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("resolves the caller's guestId from their own auth uid, not from client-supplied data", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(
      mockVoteSnap({ isAnonymous: false, results: {}, voterIds: [] }),
    );

    await castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" });

    // The guest query is scoped by the caller's own auth.uid, never by a
    // client-supplied guestId — this is what makes the dedup unforgeable.
    expect(mockGuestQuery.where).toHaveBeenCalledWith(
      "userId",
      "==",
      "guest-user-1",
    );
  });
});

describe("castOxfordVote — anonymous vote dedup (the core security fix)", () => {
  it("rejects a second anonymous vote from the same guest", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(
      mockVoteSnap({
        isAnonymous: true,
        results: { yes: 1 },
        voterIds: ["guest-1"],
      }),
    );

    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    expect(mockVoteDocUpdate).not.toHaveBeenCalled();
  });

  it("allows a first anonymous vote and records the caller's guestId in voterIds", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(
      mockVoteSnap({ isAnonymous: true, results: {}, voterIds: [] }),
    );

    const result = await castVoteCall({
      houseId: "house-1",
      voteId: "v1",
      choice: "yes",
    });

    expect(result).toEqual({ success: true });
    expect(mockVoteDocUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        results: { yes: 1 },
        voterIds: ["guest-1"],
      }),
    );
    // Anonymous votes never record who chose what.
    expect(mockVoteDocUpdate.mock.calls[0][1]).not.toHaveProperty(
      "individualVotes.guest-1",
    );
  });

  it("allows a different guest to vote after another guest already has", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(
      mockVoteSnap({
        isAnonymous: true,
        results: { yes: 1 },
        voterIds: ["some-other-guest"],
      }),
    );

    const result = await castVoteCall({
      houseId: "house-1",
      voteId: "v1",
      choice: "no",
    });

    expect(result).toEqual({ success: true });
    expect(mockVoteDocUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        results: { yes: 1, no: 1 },
        voterIds: ["some-other-guest", "guest-1"],
      }),
    );
  });
});

describe("castOxfordVote — non-anonymous vote changes", () => {
  it("lets a guest change their previously-cast vote without double counting", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(
      mockVoteSnap({
        isAnonymous: false,
        results: { yes: 1 },
        voterIds: ["guest-1"],
        individualVotes: { "guest-1": "yes" },
      }),
    );

    const result = await castVoteCall({
      houseId: "house-1",
      voteId: "v1",
      choice: "no",
    });

    expect(result).toEqual({ success: true });
    expect(mockVoteDocUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        results: { yes: 0, no: 1 },
        "individualVotes.guest-1": "no",
      }),
    );
  });
});

describe("castOxfordVote — miscellaneous", () => {
  it("throws not-found when the vote document does not exist", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    mockVoteDocGet.mockResolvedValue(mockVoteSnap(undefined, false));

    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "yes" }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an invalid choice value", async () => {
    mockGetHouse.mockResolvedValue(oxfordHouse);
    await expect(
      castVoteCall({ houseId: "house-1", voteId: "v1", choice: "maybe" }),
    ).rejects.toThrow();
  });
});
