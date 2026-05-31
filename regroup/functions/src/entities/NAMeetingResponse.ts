// NAMeeting represents the model from the NA meeting SQL file retrieved from NA World Services.
// This is the shape used when processing NA meeting data in the application.
export interface NAMeeting {
  format5: string;
  format4: string;
  format3: string;
  format2: string;
  format1: string;
  lang3: string;
  lang2: string;
  language: string;
  wchair: number;
  closed: number;
  room: string;
  mtg_time: number;
  mtg_day: number;
  latitude: number;
  longitude: number;
  country: string;
  zip: string;
  state: string;
  borough: string;
  city: string;
  address: string;
  place: string;
  com_name: string;
  committee: string;
  directions: string;
  groupid: string;
  id: number;
  online: string;
  link: string;
  password: string;
}

export type NAMeetingResponse = NAMeeting[];
