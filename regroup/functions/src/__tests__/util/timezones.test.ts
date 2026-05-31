import {
  WEEKLY_TRANSFER_TIMEZONES,
  FALLBACK_TIMEZONE,
  SupportedTimezone,
} from "../../util/timezones";

describe("timezones", () => {
  it("includes all four North American timezones used today", () => {
    expect(WEEKLY_TRANSFER_TIMEZONES).toEqual(
      expect.arrayContaining([
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
      ]),
    );
  });

  it("exports exactly four supported timezones (fallback is separate)", () => {
    expect(WEEKLY_TRANSFER_TIMEZONES).toHaveLength(4);
  });

  it("uses null to represent the fallback (houses with no tz set)", () => {
    expect(FALLBACK_TIMEZONE).toBeNull();
  });

  it("types are exported", () => {
    const tz: SupportedTimezone = "America/New_York";
    expect(tz).toBe("America/New_York");
  });
});
