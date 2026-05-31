import { Location } from "./GeocodeResponse";

export class RatsMeeting {
  name: string = "";
  time: string = "";
  street: string = "";
  city?: string;
  state?: string;
  zip?: string;
  types?: string[];
  lat?: number;
  lng?: number;
  locationName?: string; // or the directions, if NA meeting
  type: MeetingType = "AA";
  Location?: string[]; // specific to NA meetings
  day: string = "";
  online?: boolean;
  link?: string;
  onlineNotes: string = "";
}

export type MeetingType =
  | "AA"
  | "NA"
  | "IOP"
  | "Religious"
  | "Celebrate Recovery"
  | "CUSTOM";

export interface MeetingSearchCriteria {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  time?: string;
  location?: Location;
  street?: string;
}
