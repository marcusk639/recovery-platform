export {}; // Ensure isolated module

const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn(() => ({}));
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
});

describe("callerKey", () => {
  it("prefers the first X-Forwarded-For entry", () => {
    const key = callerKey({
      rawRequest: {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
        ip: "9.9.9.9",
      },
    } as any);
    expect(key).toBe("1.2.3.4");
  });

  it("falls back to rawRequest.ip when no X-Forwarded-For header is present", () => {
    const key = callerKey({ rawRequest: { ip: "9.9.9.9" } } as any);
    expect(key).toBe("9.9.9.9");
  });

  it('falls back to "unknown" when neither is present', () => {
    const key = callerKey({ rawRequest: {} } as any);
    expect(key).toBe("unknown");
  });
});
