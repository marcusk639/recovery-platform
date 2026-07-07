/**
 * votes.ts service — castVote unit tests
 *
 * Hardened 2026-07-07: castVote no longer runs a client-side Firestore
 * transaction (that logic — anonymous-vote dedup, tally updates,
 * individualVotes — moved server-side into the castOxfordVote Cloud
 * Function, covered by regroup/functions/src/__tests__/callable/oxford.test.ts).
 * castVote is now a thin wrapper around that callable, so these tests only
 * verify the wrapper: it calls the right callable with the right payload,
 * and maps callable errors the way callers expect.
 */

const mockHttpsCallable = jest.fn();

jest.mock("../../../../firebase-setup", () => ({
  firestore: {},
  functions: {
    httpsCallable: (name: string) => (data: unknown) =>
      mockHttpsCallable(name, data),
  },
}));

import { castVote } from "../votes";

describe("votes service — castVote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls the castOxfordVote callable with houseId/voteId/choice", async () => {
    mockHttpsCallable.mockResolvedValue({ data: { success: true } });

    await castVote("house-1", "vote-1", "guest-42", "yes");

    expect(mockHttpsCallable).toHaveBeenCalledWith("castOxfordVote", {
      houseId: "house-1",
      voteId: "vote-1",
      choice: "yes",
    });
  });

  it("does not send the caller-supplied guestId to the server", async () => {
    mockHttpsCallable.mockResolvedValue({ data: { success: true } });

    await castVote("house-1", "vote-1", "guest-42", "yes");

    const [, payload] = mockHttpsCallable.mock.calls[0];
    expect(payload).not.toHaveProperty("guestId");
  });

  it("propagates the already-voted error message unchanged", async () => {
    mockHttpsCallable.mockRejectedValue(
      new Error("You have already voted on this poll.")
    );

    await expect(
      castVote("house-1", "vote-1", "guest-42", "yes")
    ).rejects.toThrow("You have already voted on this poll.");
  });

  it("wraps any other callable failure in a generic error", async () => {
    mockHttpsCallable.mockRejectedValue(new Error("internal"));

    await expect(
      castVote("house-1", "vote-1", "guest-42", "yes")
    ).rejects.toThrow("Failed to cast vote");
  });
});
