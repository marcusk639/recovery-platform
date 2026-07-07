// src/__tests__/util/house.test.ts
//
// Regression coverage for 2026-07-05: getOverallPercentage read the legacy
// embedded `guest.currentWeek.days` field, which no longer exists on the
// current Guest model (migrated to currentWeekId/currentWeekStartDate) —
// Object.getOwnPropertyNames(undefined) threw for every migrated guest,
// silently killing house health updates every week (caught by an inner
// try/catch in transferStats that only logs a warning). This suite confirms
// getOverallPercentage/getHousePercentage/calculateWeeklyHealth now read the
// live week-summaries aggregate instead, and degrade gracefully (rather than
// throwing) when a guest has no currentWeekId or summary doc yet.

const mockWeekSummaryGet = jest.fn();
const mockWeekSummaryDoc = jest.fn((_id: string) => ({
  get: mockWeekSummaryGet,
}));

jest.mock("../../api/firestore", () => ({
  weekSummariesCollection: {
    doc: (id: string) => mockWeekSummaryDoc(id),
  },
}));

import {
  getOverallPercentage,
  getHousePercentage,
  calculateWeeklyHealth,
} from "../../util/house";
import { House } from "../../entities/House";
import { Guest } from "../../entities/Guest";
import { PhaseConfiguration } from "../../entities/Phase";

function makePhase(overrides: { meetings?: number; work?: number } = {}) {
  const phase = new PhaseConfiguration();
  phase.rules.meetings = overrides.meetings ?? 4;
  phase.rules.work = overrides.work ?? 10;
  return phase;
}

function makeHouse(overrides: Partial<House> = {}): House {
  const house = Object.create(House.prototype) as House;
  house.id = "house1";
  house.name = "Test House";
  house.phases = { Default: makePhase() };
  return Object.assign(house, overrides);
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  const guest = Object.create(Guest.prototype) as Guest;
  guest.id = "guest1";
  guest.phase = "Default";
  return Object.assign(guest, overrides);
}

function mockSummaryDoc(stats: Partial<Record<string, number>> | null) {
  mockWeekSummaryGet.mockResolvedValueOnce(
    stats === null
      ? { exists: false }
      : { exists: true, data: () => ({ stats }) },
  );
}

describe("getOverallPercentage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not throw for a guest with no currentWeekId (never crashes like the legacy days-based read did)", async () => {
    const guest = makeGuest({ currentWeekId: undefined });
    const house = makeHouse();

    await expect(
      getOverallPercentage(guest, house),
    ).resolves.toEqual(expect.any(Number));
    expect(mockWeekSummaryDoc).not.toHaveBeenCalled();
  });

  it("treats a missing week-summary doc as all-zero stats instead of throwing", async () => {
    mockSummaryDoc(null);
    const guest = makeGuest({ currentWeekId: "guest1_2026-06-29" });
    const house = makeHouse();

    const result = await getOverallPercentage(guest, house);

    expect(result).toBe(0);
  });

  it("computes 100% when every category fully meets the phase rules", async () => {
    mockSummaryDoc({
      meetingsAttended: 4,
      choresCompleted: 7,
      hoursWorked: 10,
      primarySupporterMet: 1,
    });
    const guest = makeGuest({ currentWeekId: "guest1_2026-06-29" });
    const house = makeHouse({
      phases: { Default: makePhase({ meetings: 4, work: 10 }) },
    });

    const result = await getOverallPercentage(guest, house);

    expect(result).toBe(100);
  });

  it("caps the work percentage at 100% when hoursWorked exceeds the phase requirement", async () => {
    mockSummaryDoc({
      meetingsAttended: 4,
      choresCompleted: 7,
      hoursWorked: 999,
      primarySupporterMet: 1,
    });
    const guest = makeGuest({ currentWeekId: "guest1_2026-06-29" });
    const house = makeHouse({
      phases: { Default: makePhase({ meetings: 4, work: 10 }) },
    });

    const result = await getOverallPercentage(guest, house);

    expect(result).toBe(100);
  });

  it("treats primarySupporterMet as a count, crediting full weight for any positive value", async () => {
    mockSummaryDoc({
      meetingsAttended: 0,
      choresCompleted: 0,
      hoursWorked: 0,
      primarySupporterMet: 3,
    });
    const guest = makeGuest({ currentWeekId: "guest1_2026-06-29" });
    const house = makeHouse({
      phases: { Default: makePhase({ meetings: 4, work: 10 }) },
    });

    const result = await getOverallPercentage(guest, house);

    // Only the supporter category (25%) is credited.
    expect(result).toBe(25);
  });

  it("fetches the summary doc keyed by the guest currentWeekId", async () => {
    mockSummaryDoc({});
    const guest = makeGuest({ currentWeekId: "guest1_2026-06-29" });
    const house = makeHouse();

    await getOverallPercentage(guest, house);

    expect(mockWeekSummaryDoc).toHaveBeenCalledWith("guest1_2026-06-29");
  });
});

describe("getHousePercentage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 0 for a house with no guests", async () => {
    const house = makeHouse();
    const result = await getHousePercentage(house, {});
    expect(result).toBe(0);
  });

  it("averages the percentage across multiple guests without throwing", async () => {
    mockSummaryDoc(null);
    mockSummaryDoc(null);
    const house = makeHouse();
    const guests = {
      guest1: makeGuest({ id: "guest1" }),
      guest2: makeGuest({ id: "guest2", currentWeekId: "guest2_2026-06-29" }),
    };

    const result = await getHousePercentage(house, guests);

    expect(result).toBe(0);
  });
});

describe("calculateWeeklyHealth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets house.health for the computed week without throwing for migrated guests", async () => {
    mockSummaryDoc(null);
    const house = makeHouse({ health: {} });
    const guestsQuery = {
      docs: [{ data: () => makeGuest({ currentWeekId: undefined }) }],
    } as any;

    await calculateWeeklyHealth(guestsQuery, house);

    expect(Object.keys(house.health!).length).toBe(1);
  });
});
