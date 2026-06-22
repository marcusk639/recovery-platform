import { mapDirectoryToRats } from "../../util/directoryMapping";
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
  },
  online: false,
};

describe("mapDirectoryToRats", () => {
  it("maps core fields onto the RatsMeeting shape", () => {
    const m = mapDirectoryToRats(base);
    expect(m.name).toBe("Serenity Group");
    expect(m.time).toBe("19:30");
    expect(m.street).toBe("123 Main St");
    expect(m.city).toBe("Austin");
    expect(m.state).toBe("TX");
    expect(m.zip).toBe("78701");
    expect(m.lat).toBeCloseTo(30.267);
    expect(m.lng).toBeCloseTo(-97.743);
  });

  it("converts the integer day (0–6) to a lowercase weekday", () => {
    expect(mapDirectoryToRats({ ...base, day: 0 }).day).toBe("sunday");
    expect(mapDirectoryToRats({ ...base, day: 1 }).day).toBe("monday");
    expect(mapDirectoryToRats({ ...base, day: 6 }).day).toBe("saturday");
  });

  it("maps providers onto regroup meeting types", () => {
    expect(mapDirectoryToRats({ ...base, provider: "AA" }).type).toBe("AA");
    expect(mapDirectoryToRats({ ...base, provider: "NA" }).type).toBe("NA");
    expect(
      mapDirectoryToRats({ ...base, provider: "CELEBRATE_RECOVERY" }).type,
    ).toBe("Celebrate Recovery");
    expect(mapDirectoryToRats({ ...base, provider: "CUSTOM" }).type).toBe(
      "CUSTOM",
    );
  });

  it("defaults onlineNotes to an empty string when absent", () => {
    expect(mapDirectoryToRats(base).onlineNotes).toBe("");
  });

  it("carries online and link fields through", () => {
    const m = mapDirectoryToRats({
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
