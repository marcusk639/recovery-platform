import {
  RatsMeeting,
  MeetingVerificationInput,
  Location,
} from '../entities/Meeting';
import { Alert } from 'react-native';
import { WeekDay } from '../screens/StatUpdates/MeetingSearch';
import { getDayOfWeek, getTodaysDate } from './display';

export const getNAMeetingAddress = (meeting: RatsMeeting): string => {
  if (!meeting.Location || meeting.Location.length === 0) {
    return '';
  }
  // geocoding NA meetings requires a pretty exact query, so get just the address and the city, state, zip
  const cityStateZip = /([A-Z][a-z]+\s?)+,\s[A-Z]{2}\s\d{5}-?\d{4}?/;
  const indexOfCityStateZip = meeting.Location.findIndex(location =>
    cityStateZip.test(location),
  );
  if (indexOfCityStateZip === -1) {
    return meeting.Location.join(', ');
  }
  const location = meeting.Location.slice(
    indexOfCityStateZip - 1,
    indexOfCityStateZip + 1,
  );
  return location.toString();
};

export const getCheckinInput = (
  meeting: RatsMeeting,
  userLocation: Location | null,
): MeetingVerificationInput | undefined => {
  try {
    return {
      meetingLocation: {
        lat: meeting.lat ?? 0,
        lng: meeting.lng ?? 0,
      },
      userLocation: userLocation ?? undefined,
      meetingAddress:
        meeting.type === 'NA' ? getNAMeetingAddress(meeting) : undefined,
    };
  } catch (error) {
    Alert.alert('Unable to check into this meeting.');
    return undefined;
  }
};

export const getMeetingTime = (meeting: RatsMeeting, day?: WeekDay): string | undefined => {
  if (meeting.daysAndTimes) {
    const meetingDay = day ? day : getDayOfWeek(getTodaysDate(), true);
    if (meetingDay === 'all') {
      return meeting.time;
    }
    return meeting.daysAndTimes[meetingDay as keyof typeof meeting.daysAndTimes];
  }
  if (meeting.time) {
    return meeting.time;
  }
  return undefined;
};
