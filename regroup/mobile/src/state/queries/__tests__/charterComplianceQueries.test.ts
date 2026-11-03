/**
 * useCharterCompliance with the data shapes its queries really return.
 *
 * useGuests resolves to an id-keyed map (guestService.getGuests), not an
 * array. Treating it as an array threw "undefined is not a function" during
 * OxfordDashboard's and CharterCompliance's render as soon as the queries
 * settled. The screen tests mock this hook, so only a hook-level test covers it.
 */
import { renderHook } from '@testing-library/react-native';

const settled = (data: unknown) => ({ data, isLoading: false, isError: false });
const mockQueries: Record<string, ReturnType<typeof settled>> = {};

jest.mock('../oxfordQueries', () => ({
  useHouseVotes: () => mockQueries.votes,
  useBusinessMeetings: () => mockQueries.meetings,
  useEESRecordsRecent: () => mockQueries.ees,
  useFinancialRecords: () => mockQueries.financial,
}));
jest.mock('../drugTestQueries', () => ({
  useHouseDrugTests: () => mockQueries.drugTests,
}));
jest.mock('../guestQueries', () => ({
  useGuests: () => mockQueries.guests,
}));
const mockCompute = jest.fn((_input: unknown) => ({ overall: 'ok' }));
jest.mock('../../../services/oxford/charterCompliance', () => ({
  computeCharterCompliance: (input: unknown) => mockCompute(input),
}));

import { useCharterCompliance } from '../charterComplianceQueries';

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries.votes = settled([]);
  mockQueries.meetings = settled([]);
  mockQueries.ees = settled([]);
  mockQueries.financial = settled([]);
  mockQueries.drugTests = settled([]);
  mockQueries.guests = settled({
    g1: { id: 'g1', status: 'active' },
    g2: { id: 'g2', status: 'active' },
    g3: { id: 'g3', status: 'discharged' },
  });
});

describe('useCharterCompliance', () => {
  it('computes a summary from the id-keyed guests map useGuests returns', () => {
    const { result } = renderHook(() => useCharterCompliance('house-1'));

    expect(result.current.summary).toEqual({ overall: 'ok' });
  });

  it('counts only active residents, and passes their ids', () => {
    renderHook(() => useCharterCompliance('house-1'));

    const input = mockCompute.mock.calls[0][0] as {
      activeResidentCount: number;
      inHouseGuestIds: Set<string>;
    };
    expect(input.activeResidentCount).toBe(2);
    expect([...input.inHouseGuestIds].sort()).toEqual(['g1', 'g2']);
  });

  it('computes with no residents when the house has no guests yet', () => {
    mockQueries.guests = settled(undefined);

    const { result } = renderHook(() => useCharterCompliance('house-1'));

    expect(result.current.summary).toEqual({ overall: 'ok' });
    const input = mockCompute.mock.calls[0][0] as { activeResidentCount: number };
    expect(input.activeResidentCount).toBe(0);
  });

  it('returns no summary while a query is still loading', () => {
    mockQueries.guests = { data: undefined, isLoading: true, isError: false };

    const { result } = renderHook(() => useCharterCompliance('house-1'));

    expect(result.current.summary).toBeNull();
    expect(mockCompute).not.toHaveBeenCalled();
  });
});
