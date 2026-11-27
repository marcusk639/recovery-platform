/**
 * useMeetingSearch: the duplicate check-in guard. Check-ins feed phase
 * compliance, so the list of today's check-ins must be the checking-in guest's
 * own, and a check-in must not go ahead when that list could not be loaded.
 */
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockNotify = jest.fn();
const mockCheckInMutate = jest.fn(() => Promise.resolve());
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
  useSearchMeetings: jest.fn(() => ({ mutate: jest.fn(), isPending: false, data: undefined })),
  useCheckIntoMeeting: () => ({ mutateAsync: mockCheckInMutate, isPending: false }),
}));
jest.mock('../../../../util/permissions', () => ({
  checkAndRequestLocationPermissions: jest.fn(() => Promise.resolve(false)),
}));
jest.mock('../../../../util/geolocation', () => ({ getCurrentPosition: jest.fn() }));
jest.mock('../../../../util/logging', () => ({ logException: jest.fn() }));

import { SEARCH_TERM_DEBOUNCE_MS, useMeetingSearch } from '../useMeetingSearch';

const meeting: any = { id: 'meeting-1', name: 'AA', day: 'all', time: '00:00' };

const render = () => renderHook(() => useMeetingSearch({ navigation: { navigate: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUserAsGuest = null;
  mockUseSelectedGuest.mockReturnValue({ guest: { id: 'guest-1' } });
  mockUseActivities.mockReturnValue({
    activities: [],
    loading: false,
    idle: false,
    error: null,
    refetch: jest.fn(),
  });
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
    const refetch = jest.fn();
    mockUseActivities.mockReturnValue({
      activities: [],
      loading: false,
      error: new Error('permission-denied'),
      refetch,
    });
    const { result } = render();

    act(() => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith('Check-in Unavailable', expect.any(String), []);
    expect(mockCheckInMutate).not.toHaveBeenCalled();
    // The listener is gone after an error: "try again" must re-subscribe.
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("refuses while today's check-ins are still loading (an empty list proves nothing)", () => {
    mockUseActivities.mockReturnValue({ activities: [], loading: true, idle: false, error: null });
    const { result } = render();

    act(() => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith('Check-in Unavailable', expect.any(String), []);
    expect(mockCheckInMutate).not.toHaveBeenCalled();
  });

  it('tells the user when the hourly limit refused the check-in', async () => {
    // The test meeting is off-hours: confirm "Check In Anyway".
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    const limit =
      "You've checked into meetings many times in the last hour. Please try again in 5 minutes.";
    mockCheckInMutate.mockImplementationOnce(() =>
      Promise.reject({ code: 'resource-exhausted', message: limit }),
    );
    const { result } = render();

    await act(async () => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith('Check-in Failed', limit, []);
    alert.mockRestore();
  });

  it('tells the user a check-in failed, without showing raw server text', async () => {
    // The test meeting is off-hours: confirm "Check In Anyway".
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    mockCheckInMutate.mockImplementationOnce(() =>
      Promise.reject({ code: 'internal', message: 'INTERNAL' }),
    );
    const { result } = render();

    await act(async () => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith(
      'Check-in Failed',
      "Couldn't check you in. Please try again.",
      [],
    );
    alert.mockRestore();
  });

  it('refuses with no resident to check in', () => {
    mockUseSelectedGuest.mockReturnValue({ guest: null });
    mockUseActivities.mockReturnValue({ activities: [], loading: false, idle: true, error: null });
    const { result } = render();

    act(() => result.current.checkInto(meeting));

    expect(mockNotify).toHaveBeenCalledWith(
      'Check-in Unavailable',
      'No resident is selected to check in.',
      [],
    );
    expect(mockCheckInMutate).not.toHaveBeenCalled();
  });
});

describe('searching by location', () => {
  const permissions = require('../../../../util/permissions');
  const geolocation = require('../../../../util/geolocation');
  const queries = require('../../../../state/queries/meetingQueries');

  it('reads the location once and searches once, however often the screen re-renders', async () => {
    permissions.checkAndRequestLocationPermissions.mockResolvedValue(true);
    geolocation.getCurrentPosition.mockImplementation((success: any) =>
      success({ coords: { latitude: 30.2672, longitude: -97.7431 } }),
    );
    const mutate = jest.fn();
    // Like a real mutation: no data yet, so the hook's meetings list is a new [] each render.
    queries.useSearchMeetings.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false });

    const { rerender } = render();
    await act(async () => {});
    for (let i = 0; i < 5; i++) {
      rerender({});
      await act(async () => {});
    }

    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].location).toEqual({ lat: 30.2672, lng: -97.7431 });
  });

  it('searches once typing pauses, not on every keystroke', async () => {
    jest.useFakeTimers();
    try {
      permissions.checkAndRequestLocationPermissions.mockResolvedValue(true);
      geolocation.getCurrentPosition.mockImplementation((success: any) =>
        success({ coords: { latitude: 30.2672, longitude: -97.7431 } }),
      );
      const mutate = jest.fn();
      queries.useSearchMeetings.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false });

      const { result } = render();
      await act(async () => {});
      expect(mutate).toHaveBeenCalledTimes(1); // the location search

      for (const text of ['s', 'se', 'ser', 'sere']) {
        act(() => result.current.setSearchTerm(text));
        act(() => jest.advanceTimersByTime(SEARCH_TERM_DEBOUNCE_MS - 100));
      }
      expect(mutate).toHaveBeenCalledTimes(1);

      act(() => jest.advanceTimersByTime(SEARCH_TERM_DEBOUNCE_MS));
      expect(mutate).toHaveBeenCalledTimes(2);
      expect(mutate.mock.calls[1][0].criteria).toEqual({ name: 'sere' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('searches at once, with the current text, when a filter changes mid-typing', async () => {
    jest.useFakeTimers();
    try {
      permissions.checkAndRequestLocationPermissions.mockResolvedValue(true);
      geolocation.getCurrentPosition.mockImplementation((success: any) =>
        success({ coords: { latitude: 30.2672, longitude: -97.7431 } }),
      );
      const mutate = jest.fn();
      queries.useSearchMeetings.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false });

      const { result } = render();
      await act(async () => {});
      act(() => result.current.setSearchTerm('hope'));
      act(() => result.current.setSearchFilters({ ...result.current.filters, type: 'AA' } as any));

      expect(mutate).toHaveBeenCalledTimes(2);
      expect(mutate.mock.calls[1][0]).toMatchObject({ criteria: { name: 'hope' } });
      expect(mutate.mock.calls[1][0].filters.type).toBe('AA');
      // The pending keystroke search was cancelled, not run as well.
      act(() => jest.advanceTimersByTime(SEARCH_TERM_DEBOUNCE_MS * 2));
      expect(mutate).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips a search that would repeat the last one (spaces, or text typed then deleted)', async () => {
    jest.useFakeTimers();
    try {
      permissions.checkAndRequestLocationPermissions.mockResolvedValue(true);
      geolocation.getCurrentPosition.mockImplementation((success: any) =>
        success({ coords: { latitude: 30.2672, longitude: -97.7431 } }),
      );
      const mutate = jest.fn();
      queries.useSearchMeetings.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false });

      const { result } = render();
      await act(async () => {});
      act(() => result.current.setSearchTerm('  '));
      act(() => result.current.setSearchTerm('ho'));
      act(() => result.current.setSearchTerm(''));
      act(() => jest.advanceTimersByTime(SEARCH_TERM_DEBOUNCE_MS * 2));

      expect(mutate).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('searches at once when the box is cleared after a search by name', async () => {
    jest.useFakeTimers();
    try {
      permissions.checkAndRequestLocationPermissions.mockResolvedValue(true);
      geolocation.getCurrentPosition.mockImplementation((success: any) =>
        success({ coords: { latitude: 30.2672, longitude: -97.7431 } }),
      );
      const mutate = jest.fn();
      queries.useSearchMeetings.mockReturnValue({ mutate, data: undefined, isPending: false, isError: false });

      const { result } = render();
      await act(async () => {});
      act(() => result.current.setSearchTerm('hope'));
      act(() => jest.advanceTimersByTime(SEARCH_TERM_DEBOUNCE_MS));
      expect(mutate).toHaveBeenCalledTimes(2);

      act(() => result.current.setSearchTerm(''));
      expect(mutate).toHaveBeenCalledTimes(3);
      expect(mutate.mock.calls[2][0].criteria).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("gives the search's hourly-limit message, or the generic one", () => {
    const queries2 = require('../../../../state/queries/meetingQueries');
    const limit =
      "You've searched for meetings many times in the last hour. Please try again in 3 minutes.";
    queries2.useSearchMeetings.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: true,
      error: { code: 'resource-exhausted', message: limit },
    });
    expect(render().result.current.searchErrorMessage).toBe(limit);

    queries2.useSearchMeetings.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      isError: true,
      error: { code: 'unavailable', message: 'UNAVAILABLE' },
    });
    expect(render().result.current.searchErrorMessage).toBe(
      "Couldn't load meetings. Please try again.",
    );
  });
});
