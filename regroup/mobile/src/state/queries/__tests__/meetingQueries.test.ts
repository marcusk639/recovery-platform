import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSearchMeetings,
  useCheckIntoMeeting,
  useAddMeeting,
} from '../meetingQueries';
import * as meetingService from '../../../services/meeting';
import * as activityService from '../../../services/activity';

jest.mock('../../../services/meeting');
jest.mock('../../../services/activity');

const makeMeeting = (overrides = {}) =>
  ({
    id: 'mtg-1',
    name: 'AA Monday',
    type: 'AA',
    online: false,
    city: 'Denver',
    state: 'CO',
    ...overrides,
  } as any);

describe('meetingQueries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    (activityService.logActivity as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── useSearchMeetings ───────────────────────────────────────────────────────

  describe('useSearchMeetings', () => {
    it('calls searchForMeetings with the input', async () => {
      const meetings = [makeMeeting()];
      (meetingService.searchForMeetings as jest.Mock).mockResolvedValue(
        meetings,
      );

      const { result } = renderHook(() => useSearchMeetings(), { wrapper });

      result.current.mutate({ lat: 39.7, lng: -104.9, radius: 5 } as any);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(meetingService.searchForMeetings).toHaveBeenCalledWith({
        lat: 39.7,
        lng: -104.9,
        radius: 5,
      });
      expect(result.current.data).toEqual(meetings);
    });

    it('surfaces errors from searchForMeetings', async () => {
      const error = new Error('Search failed');
      (meetingService.searchForMeetings as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useSearchMeetings(), { wrapper });
      result.current.mutate({} as any);

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toEqual(error);
    });
  });

  // ── useCheckIntoMeeting ─────────────────────────────────────────────────────

  describe('useCheckIntoMeeting', () => {
    const checkInParams = {
      checkInInput: { lat: 39.7, lng: -104.9 },
      meeting: makeMeeting(),
      guestId: 'guest-1',
      houseId: 'house-1',
      userId: 'user-1',
    };

    it('calls userIsAtMeeting and logActivity on success', async () => {
      (meetingService.userIsAtMeeting as jest.Mock).mockResolvedValue({
        data: { isAtMeeting: true },
      });

      const { result } = renderHook(() => useCheckIntoMeeting(), { wrapper });
      result.current.mutate(checkInParams);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(meetingService.userIsAtMeeting).toHaveBeenCalledWith(
        checkInParams.checkInInput,
      );
      expect(activityService.logActivity).toHaveBeenCalledWith(
        'guest-1',
        'house-1',
        'meeting',
        expect.objectContaining({ type: 'meeting', meetingName: 'AA Monday' }),
        'user-1',
      );
    });

    it('resolves with the userIsAtMeeting result', async () => {
      const response = { data: { isAtMeeting: true } };
      (meetingService.userIsAtMeeting as jest.Mock).mockResolvedValue(response);

      const { result } = renderHook(() => useCheckIntoMeeting(), { wrapper });
      result.current.mutate(checkInParams);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(response);
    });

    it('surfaces errors when userIsAtMeeting fails', async () => {
      const error = new Error('Check-in failed');
      (meetingService.userIsAtMeeting as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCheckIntoMeeting(), { wrapper });
      result.current.mutate(checkInParams);

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toEqual(error);
    });

    it('uses online location string when meeting.online is true', async () => {
      (meetingService.userIsAtMeeting as jest.Mock).mockResolvedValue({});

      const onlineMeeting = makeMeeting({ online: true });
      const { result } = renderHook(() => useCheckIntoMeeting(), { wrapper });
      result.current.mutate({ ...checkInParams, meeting: onlineMeeting });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(activityService.logActivity).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'meeting',
        expect.objectContaining({ location: 'online' }),
        expect.any(String),
      );
    });
  });

  // ── useAddMeeting ───────────────────────────────────────────────────────────

  describe('useAddMeeting', () => {
    it('calls addMeeting with the meeting object', async () => {
      const meeting = makeMeeting();
      (meetingService.addMeeting as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useAddMeeting(), { wrapper });
      result.current.mutate({ meeting, isGuest: false });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(meetingService.addMeeting).toHaveBeenCalledWith(meeting);
    });

    it('surfaces errors from addMeeting', async () => {
      const error = new Error('Add failed');
      (meetingService.addMeeting as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAddMeeting(), { wrapper });
      result.current.mutate({ meeting: makeMeeting(), isGuest: false });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toEqual(error);
    });
  });
});
