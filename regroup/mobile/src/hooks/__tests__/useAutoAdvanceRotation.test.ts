// House Summary advances the weekly chore rotation for whoever opens it. The
// rules let only the house's staff (admin or owner claim) update it, so a
// resident's advance was refused and logged as an error on every House
// Summary view until staff opened the screen. Only staff advance it now.

const mockAdvance = jest.fn();
let mockRotation: { lastRotatedAt: string } | undefined;

jest.mock("../../state/queries/choreRotationQueries", () => ({
  useChoreRotation: () => ({ data: mockRotation }),
  useAdvanceRotation: () => ({ mutate: mockAdvance }),
}));

import { renderHook } from "@testing-library/react-native";
import { useAutoAdvanceRotation } from "../useAutoAdvanceRotation";

const LAST_WEEK = "2000-01-02";
const FAR_FUTURE = "2999-12-31";

beforeEach(() => {
  mockAdvance.mockReset();
  mockRotation = undefined;
});

describe("useAutoAdvanceRotation", () => {
  it("advances an out-of-date rotation for the house's staff", () => {
    mockRotation = { lastRotatedAt: LAST_WEEK };

    renderHook(() => useAutoAdvanceRotation("h1", true));

    expect(mockAdvance).toHaveBeenCalledTimes(1);
  });

  it("never advances the rotation for a resident", () => {
    mockRotation = { lastRotatedAt: LAST_WEEK };

    renderHook(() => useAutoAdvanceRotation("h1", false));

    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it("leaves a rotation already advanced this week alone", () => {
    mockRotation = { lastRotatedAt: FAR_FUTURE };

    renderHook(() => useAutoAdvanceRotation("h1", true));

    expect(mockAdvance).not.toHaveBeenCalled();
  });

  it("does nothing before the rotation loads", () => {
    renderHook(() => useAutoAdvanceRotation("h1", true));

    expect(mockAdvance).not.toHaveBeenCalled();
  });
});
