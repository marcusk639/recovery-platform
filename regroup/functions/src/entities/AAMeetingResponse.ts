export interface AAMeetingResponse {
  areas: Area[];
  meetings: AAMeeting[];
}

export interface Area {
  name: string;
  url: string;
  phone: string | null;
  email: string | null;
  location: string;
  published_at: string;
  inside: number;
  distance: number | null;
}

export interface AAMeeting {
  id: number;
  area: string;
  name: string;
  notes: string | null;
  day: number;
  time: string;
  url: string;
  types: string;
  updated_at: string;
  group: string | null;
  group_notes: string | null;
  location_name: string;
  location_notes: string;
  latitude: string;
  longitude: string;
  formatted_address: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  region: string;
  distance: number;
  conference_provider: string;
  conference_url: string;
  conference_url_notes: string;
  conference_phone: string;
  conference_phone_notes: string;
}
