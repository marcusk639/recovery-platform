// directoryMapping imports the SerializedMeeting type from the findMeetings
// callable, which pulls in firebase-functions/v2 + params at module load.
// Stub those so importing the mapper has no Cloud Functions side effects.
jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: jest
    .fn()
    .mockImplementation((arg1: unknown, arg2?: unknown) =>
      typeof arg1 === "function" ? arg1 : arg2,
    ),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock("firebase-functions/params", () => ({
  defineSecret: jest.fn().mockReturnValue({ value: () => "test-key" }),
}));

import { mapDirectoryToSerialized } from "../../utils/directoryMapping";
import { DirectoryMeeting } from "../../entities/DirectoryMeeting";

const base: DirectoryMeeting = {
  id: "dir-1",
  source: "external",
  provider: "AA",
  name: "Serenity Group",
  day: 1,
  time: "19:30",
  location: {
    address: "123 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    lat: 30.267,
    lng: -97.743,
    geohash: "9v6m",
  },
  online: false,
};

describe("mapDirectoryToSerialized", () => {
  it("maps core fields onto the SerializedMeeting shape", () => {
    const m = mapDirectoryToSerialized(base);
    expect(m.id).toBe("dir-1");
    expect(m.name).toBe("Serenity Group");
    expect(m.time).toBe("19:30");
    expect(m.address).toBe("123 Main St");
    expect(m.street).toBe("123 Main St");
    expect(m.city).toBe("Austin");
    expect(m.state).toBe("TX");
    expect(m.zip).toBe("78701");
    expect(m.lat).toBeCloseTo(30.267);
    expect(m.lng).toBeCloseTo(-97.743);
    expect(m.geohash).toBe("9v6m");
  });

  it("emits deterministic empty timestamps and verified=false (no directory provenance)", () => {
    const m = mapDirectoryToSerialized(base);
    expect(m.verified).toBe(false);
    expect(m.addedBy).toBe("");
    expect(m.createdAt).toBe("");
    expect(m.updatedAt).toBe("");
  });

  it("converts the integer day (0–6) to a lowercase weekday", () => {
    expect(mapDirectoryToSerialized({ ...base, day: 0 }).day).toBe("sunday");
    expect(mapDirectoryToSerialized({ ...base, day: 1 }).day).toBe("monday");
    expect(mapDirectoryToSerialized({ ...base, day: 6 }).day).toBe("saturday");
  });

  it("maps providers onto homegroups meeting types", () => {
    expect(mapDirectoryToSerialized({ ...base, provider: "AA" }).type).toBe(
      "AA",
    );
    expect(mapDirectoryToSerialized({ ...base, provider: "NA" }).type).toBe(
      "NA",
    );
    expect(
      mapDirectoryToSerialized({ ...base, provider: "CELEBRATE_RECOVERY" })
        .type,
    ).toBe("Celebrate Recovery");
    expect(mapDirectoryToSerialized({ ...base, provider: "CUSTOM" }).type).toBe(
      "Custom",
    );
  });

  it("carries online and link fields through", () => {
    const m = mapDirectoryToSerialized({
      ...base,
      online: true,
      link: "https://zoom.us/j/1",
      onlineNotes: "passcode 123",
    });
    expect(m.online).toBe(true);
    expect(m.link).toBe("https://zoom.us/j/1");
    expect(m.onlineNotes).toBe("passcode 123");
  });
});
