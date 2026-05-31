export type NAMeetingResponse = NAMeeting[];

export interface NAMeeting {
  Location: string[];
  Day: string;
  TimeLanguage: string;
  "Closed to Public": string;
  "Wheelchair Accessible": string;
  "Day Time | Closed | Wheelchair": string;
  Language: string;
  Format: string;
  Distance: string;
  Format_2: string;
  Distance_2: string;
}

// interface representing the model from the na meeting sql file retrieved from na world services
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
