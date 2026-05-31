import { useMutation } from '@tanstack/react-query';
import * as meetingService from '../../services/meeting';
import { logActivity } from '../../services/activity';
import {
  ActivityType,
  ActivityDataFactory,
} from '../../entities/ActivityModel';
import { MeetingSearchInput, RatsMeeting } from '../../entities/Meeting';
import { logException } from '../../util/logging';

export interface CheckInInput {
  checkInInput: any;
  meeting: RatsMeeting;
  guestId: string;
  houseId: string;
  userId: string;
}

export function useSearchMeetings() {
  return useMutation({
    mutationFn: (input: MeetingSearchInput) =>
      meetingService.searchForMeetings(input),
  });
}

export function useCheckIntoMeeting() {
  return useMutation({
    mutationFn: async ({
      checkInInput,
      meeting,
      guestId,
      houseId,
      userId,
    }: CheckInInput) => {
      const result = await meetingService.userIsAtMeeting(checkInInput);
      logActivity(
        guestId,
        houseId,
        ActivityType.MEETING,
        ActivityDataFactory.meeting(
          meeting.name || '',
          meeting.type || 'AA',
          60,
          meeting.id,
          meeting.online
            ? 'online'
            : `${meeting.city || ''}, ${meeting.state || ''}`,
        ),
        userId,
      ).catch(err => logException(err));
      return result;
    },
  });
}

export function useAddMeeting() {
  return useMutation({
    mutationFn: ({ meeting }: { meeting: RatsMeeting; isGuest: boolean }) =>
      meetingService.addMeeting(meeting),
  });
}
