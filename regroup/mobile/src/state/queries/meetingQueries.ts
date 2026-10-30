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
      // The attendance activity is what a check-in records (it feeds phase
      // compliance), so it needs a resident and a house, and a failed write
      // must fail the check-in instead of passing as checked in.
      if (!guestId || !houseId) {
        throw new Error('No resident is selected to check in.');
      }
      const result = await meetingService.userIsAtMeeting(checkInInput);
      await logActivity(
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
      ).catch(err => {
        logException(err, 'useCheckIntoMeeting: logActivity');
        throw Object.assign(
          new Error("Your attendance couldn't be saved. Please check in again."),
          { cause: err },
        );
      });
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
