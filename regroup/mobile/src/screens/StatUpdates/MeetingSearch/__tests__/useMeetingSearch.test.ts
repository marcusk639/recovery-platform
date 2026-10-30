/**
 * useMeetingSearch: the duplicate check-in guard. Check-ins feed phase
 * compliance, so the list of today's check-ins must be the checking-in guest's
 * own, and a check-in must not go ahead when that list could not be loaded.
 */
import { act, renderHook } from '@testing-library/react-native';

const mockNotify = jest.fn();
const mockCheckInMutate = jest.fn();
const mockUseActivities = jest.fn();
const mockUseSelectedGuest = jest.fn();
let mockUserAsGuest: { id: string } | null = null;

jest.mock('../../../../context', () => ({
  useModal: () => ({ showFormModal: jest.fn(), dismissFormModal: jest.fn() }),
  useNotification: () => ({ notify: mockNotify, showPopover: jest.fn() }),
}));
jest.mock('../../../../state/store', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({ guests: { userAsGuest: mockUserAsGuest }, user: { user: { id: 'user-1' } } }),
}));
jest.mock('../../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: { id: 'house-1' }, houseId: 'house-1', isLoading: false }),
}));
jest.mock('../../../../hooks/useSelectedGuest', () => ({
  useSelectedGuest: () => mockUseSelectedGuest(),
}));
jest.mock('../../../../hooks/activity', () => ({
  useActivities: (options: unknown) => mockUseActivities(options),
}));
jest.mock('../../../../state/queries/meetingQueries', () => ({
  useSearchMeetings: () => ({ mutate: jest.fn(), isPending: false, data: undefined }),
  useCheckIntoMeeting: () => ({ mutate: mockCheckInMutate, isPending: false }),
}));
jest.mock('../../../../util/permissions', () => ({
  checkAndRequestLocationPermissions: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../../../util/geolocation', () => ({ getCurrentPosition: jest.fn() }));
jest.mock('../../../../util/logging', () => ({ logException: jest.fn() }));

import { useMeetingSearch } from '../useMeetingSearch';

const meeting: any = { id: 'meeting-1', name: 'AA', day: 'all', time: '00:00' };

const render = () => renderHook(() => useMeetingSearch({ navigation: { navigate: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUserAsGuest = null;
  mockUseSelectedGuest.mockReturnValue({ guest: { id: 'guest-1' } });
  mockUseActivities.mockReturnValue({ activities: [], loading: false, error: null });
});

describe("today's check-ins list", () => {
  it("is the checking-in guest's own, in the selected house", () => {
    render();

    expect(mockUseActivities).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: 'guest-1', houseId: 'house-1' }),
    );
  });

  it('follows userAsGuest, the guest a check-in is recorded for', () => {
    mockUserAsGuest = { id: 'resident-self' };

    render();

    expect(mockUseActivities).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: 'resident-self', houseId: 'house-1' }),
    );
  });

  it('is not loaded house-wide when there is no guest', () => {
    mockUseSelectedGuest.mockReturnValue({ guest: null });

    render();

    expect(mockUseActivities).toHaveBeenCalledWith(
      expect.objectContaining({ guestId: undefined, houseId: undefined }),
    );
  });
});

describe('checkInto', () => {
  it("refuses, and says why, when today's check-ins could not be loaded", () => {
    mockUseActivities.mockReturnValue({
      activities: [],
      loading: false,
      error: new Error('permission-denied'),
    });
    const { result } = render();

    act(() => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith('Check-in Unavailable', expect.any(String), []);
    expect(mockCheckInMutate).not.toHaveBeenCalled();
  });
});
