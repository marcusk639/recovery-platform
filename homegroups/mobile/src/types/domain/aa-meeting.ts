/**
 * Types specific to AA meetings
 */
export interface AAMeeting {
  id: string;
  name: string;
  day: string;
  time: string;
  location: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  region: string;
  timezone: string;
  latitude: number;
  longitude: number;
  email: string;
  phone: string;
  website: string;
  updated: string; // ISO date string
  types: string[]; // Meeting codes like "O" (Open), "C" (Closed), etc.
  notes: string;
  is_online: boolean;
  online_meeting_url?: string;
  online_meeting_phone?: string;
  online_meeting_id?: string;
  online_meeting_password?: string;
  online_meeting_notes?: string;
  group_id?: string;
  group_name?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  group_notes?: string;
  district?: string;
  district_name?: string;
  area?: string;
  area_name?: string;
}
