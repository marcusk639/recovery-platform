// src/screens/HouseSearch/__tests__/HouseSearchFilterForm.test.ts
//
// Regression coverage for the "Any" gender filter bug: selecting "Any" used
// to map to the literal string 'any', which src/services/house.tsx#searchForHouses
// treats as an active filter (`if (searchData?.filters?.gender)` is truthy
// for any non-empty string), so it filtered for `house.gender === 'any'` —
// a value no house ever has — and always returned zero results.
//
// HouseSearchFilter's own default (src/entities/HouseSearch.tsx) uses '' as
// the "no filter" sentinel, and searchForHouses's falsy check only treats ''
// (or undefined) as "don't filter". "Any" must map to that same sentinel.

import { genderPickerItems } from "../HouseSearchFilterForm";

describe("genderPickerItems", () => {
  it('maps "Male" to the "male" gender value', () => {
    expect(genderPickerItems.Male).toBe("male");
  });

  it('maps "Female" to the "female" gender value', () => {
    expect(genderPickerItems.Female).toBe("female");
  });

  it('maps "Non-binary" to the "non-binary" gender value', () => {
    expect(genderPickerItems["Non-binary"]).toBe("non-binary");
  });

  it('maps "Any" to the empty-string "no filter" sentinel, not the literal string "any"', () => {
    // HouseSearchFilter.gender defaults to '' and searchForHouses only skips
    // the gender filter when the value is falsy — 'any' is truthy and would
    // filter for house.gender === 'any', which never matches any house.
    expect(genderPickerItems.Any).toBe("");
    expect(genderPickerItems.Any).not.toBe("any");
  });
});
