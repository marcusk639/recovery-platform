import {
  withinResidentCap,
  withinPropertyCap,
  totalResidents,
} from "../../util/tierCaps";

describe("tierCaps", () => {
  it("allows when under the cap", () => {
    expect(withinResidentCap(9, 10)).toBe(true);
  });
  it("blocks when at/over the cap", () => {
    expect(withinResidentCap(10, 10)).toBe(false);
    expect(withinResidentCap(11, 10)).toBe(false);
  });
  it("treats null cap as unlimited", () => {
    expect(withinResidentCap(9999, null)).toBe(true);
    expect(withinPropertyCap(50, null)).toBe(true);
  });
  it("blocks property additions at the property cap", () => {
    expect(withinPropertyCap(0, 1)).toBe(true);
    expect(withinPropertyCap(1, 1)).toBe(false);
  });

  describe("totalResidents", () => {
    it("sums numberOfGuests across all houses", () => {
      expect(
        totalResidents({
          houses: {
            "house-1": { numberOfGuests: 2 },
            "house-2": { numberOfGuests: 3 },
          },
        }),
      ).toBe(5);
    });
    it("returns 0 when the houses map is missing or empty", () => {
      expect(totalResidents({})).toBe(0);
      expect(totalResidents({ houses: {} })).toBe(0);
    });
  });
});
