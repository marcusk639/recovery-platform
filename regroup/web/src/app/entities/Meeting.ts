import * as yup from 'yup';
import { NAMeeting } from './NAMeeting';
import { AAMeeting } from './AAMeeting';

// const defaultTime = moment()
//   .hour(17)
//   .minute(0)
//   .format('HH:mm')
//   .toString();

export class DaysAndTimes {
  sunday: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
}

export class RatsMeeting {
  id?: string = '';
  name: string = '';
  time: string = '';
  street: string = '';
  city?: string;
  state?: string;
  zip?: string;
  types?: string[];
  lat?: number;
  lng?: number;
  locationName?: string; // or the directions, if NA meeting
  type: MeetingType;
  Location?: string[]; // specific to NA meetings
  day: string;
  verified?: boolean = false;
  addedBy?: string;
  daysAndTimes?: DaysAndTimes = new DaysAndTimes();
  forced?: boolean = false;
}

export const meetingHasLocation = (meeting: RatsMeeting) => {
  if ((meeting.lat && meeting.lng) || (meeting.Location && meeting.Location.length)) {
    return true;
  }
  return false;
};

export const meetingSchema = yup.object().shape({
  name: yup.string().required(),
  time: yup.string().required(),
});

export type MeetingType = 'NA' | 'AA' | 'IOP' | 'Religious' | 'Custom';

export const meetingTypeItems = {
  NA: 'NA',
  AA: 'AA',
  IOP: 'IOP',
  Religious: 'Religious',
  Custom: 'Custom',
};

export type CombinedMeetings = (NAMeeting | AAMeeting)[];

export interface Location {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
}

export interface MeetingSearchCriteria {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  time?: string;
  location?: Location;
}

export interface MeetingSearchInput {
  location: Location; // should default to user location, fall back to house location, or use custom input locationB
  // filters: MeetingFilters;
  criteria?: MeetingSearchCriteria;
}

export interface MeetingVerificationInput {
  userLocation?: Location;
  meetingLocation?: Location;
  meetingAddress?: string;
}
