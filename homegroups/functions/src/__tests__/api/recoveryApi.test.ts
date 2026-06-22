jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { fetchDirectoryMeetings } from "../../api/recoveryApi";

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const caller = { uid: "user-1", email: "u@example.com" };
const input = { location: { lat: 30.2, lng: -97.7 }, day: 1 };
const deps = { baseUrl: "https://recovery-api.test", apiKey: "secret-key" };

describe("fetchDirectoryMeetings", () => {
  it("returns the meetings array from the callable result envelope", async () => {
    const meetings = [{ id: "1", name: "AA" }];
    const fetchFn = jest
      .fn()
      .mockResolvedValue(okResponse({ result: { meetings } }));
    const result = await fetchDirectoryMeetings(input, caller, {
      ...deps,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual(meetings);
  });

  it("POSTs the callable wire protocol with service-auth headers (X-App-Id: homegroups)", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(okResponse({ result: { meetings: [] } }));
    await fetchDirectoryMeetings(input, caller, {
      ...deps,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "https://recovery-api.test/findMeetings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Service-Key": "secret-key",
          "X-App-Id": "homegroups",
          "X-User-Uid": "user-1",
        }),
        body: JSON.stringify({ data: input }),
      }),
    );
  });

  it("returns [] when the directory is not configured", async () => {
    const fetchFn = jest.fn();
    const result = await fetchDirectoryMeetings(input, caller, {
      baseUrl: undefined,
      apiKey: undefined,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns [] on a non-OK response", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const result = await fetchDirectoryMeetings(input, caller, {
      ...deps,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
  });

  it("returns [] when the call throws", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
    const result = await fetchDirectoryMeetings(input, caller, {
      ...deps,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
  });

  it("defaults missing meetings in the envelope to []", async () => {
    const fetchFn = jest.fn().mockResolvedValue(okResponse({ result: {} }));
    const result = await fetchDirectoryMeetings(input, caller, {
      ...deps,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
  });
});
