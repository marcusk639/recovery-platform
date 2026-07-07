export {}; // Ensure isolated module

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn((_docId: string) => ({}));
const mockRunTransaction = jest.fn(async (fn: any) =>
  fn({ get: mockGet, set: mockSet }),
);
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("../firebase", () => ({
  db: {
    collection: mockCollection,
    runTransaction: mockRunTransaction,
  },
}));

import { enforceRateLimit, callerKey } from "../rateLimit";

function snap(data: any, exists = true) {
  return { exists, data: () => data };
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTransaction.mockImplementation(async (fn: any) =>
      fn({ get: mockGet, set: mockSet }),
    );
  });

  it("allows the first request in a new window", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 }),
    );
  });

  it("allows requests under the threshold within the window", async () => {
    const now = Date.now();
    mockGet.mockResolvedValueOnce(snap({ windowStart: now, count: 5 }));
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 6 }),
    );
  });

  it("throws resource-exhausted once the threshold is reached within the window", async () => {
    const now = Date.now();
    mockGet.mockResolvedValueOnce(snap({ windowStart: now, count: 30 }));
    await expect(enforceRateLimit("test-key")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("resets the count once the window has expired", async () => {
    const staleWindowStart = Date.now() - 61_000; // just past the 60s window
    mockGet.mockResolvedValueOnce(
      snap({ windowStart: staleWindowStart, count: 30 }),
    );
    await expect(enforceRateLimit("test-key")).resolves.toBeUndefined();
    expect(mockSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ count: 1 }),
    );
  });

  it("hashes the key into a fixed-length, slash-free Firestore document ID", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("getPublicGroupProfile:1.2.3.4");
    const docId = mockDoc.mock.calls[0][0];
    expect(docId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cannot be steered into a different Firestore path via slashes or traversal segments in the key", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("getPublicGroupProfile:../../groups/some-group");
    const docId = mockDoc.mock.calls[0][0];
    expect(docId).not.toContain("/");
    expect(docId).not.toContain("..");
  });

  it("produces the same document ID for the same key (rate limiting still works after hashing)", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("same-caller");
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("same-caller");
    expect(mockDoc.mock.calls[0][0]).toBe(mockDoc.mock.calls[1][0]);
  });

  it("produces different document IDs for different keys", async () => {
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("caller-a");
    mockGet.mockResolvedValueOnce(snap(undefined, false));
    await enforceRateLimit("caller-b");
    expect(mockDoc.mock.calls[0][0]).not.toBe(mockDoc.mock.calls[1][0]);
  });
});

describe("callerKey", () => {
  it("prefers rawRequest.ip over X-Forwarded-For when both are present", () => {
    const key = callerKey({
      rawRequest: {
        ip: "9.9.9.9",
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      },
    } as any);
    expect(key).toBe("9.9.9.9");
  });

  it("falls back to the LAST X-Forwarded-For entry when rawRequest.ip is absent", () => {
    const key = callerKey({
      rawRequest: { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } },
    } as any);
    expect(key).toBe("5.6.7.8");
  });

  it('falls back to "unknown" when neither ip nor X-Forwarded-For is present', () => {
    const key = callerKey({ rawRequest: {} } as any);
    expect(key).toBe("unknown");
  });

  it("sanitizes a slash-containing ip so it cannot break a Firestore document path", () => {
    const key = callerKey({
      rawRequest: { ip: "1.2.3.4/../../etc" },
    } as any);
    expect(key).not.toContain("/");
    expect(key).toBe("1.2.3.4_.._.._etc");
  });

  it("sanitizes a slash-containing X-Forwarded-For fallback value", () => {
    const key = callerKey({
      rawRequest: { headers: { "x-forwarded-for": "a/b/c" } },
    } as any);
    expect(key).not.toContain("/");
  });
});
