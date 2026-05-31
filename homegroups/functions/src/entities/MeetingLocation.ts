/**
 * Location of a meeting retreived from area meeting url
 */
export interface MeetingLocation {
  id: number;
  name: string;
  slug: string;
  notes?: string;
  updated: string;
  location_id: number;
  url: string;
  day: number;
  time: string;
  end_time: string;
  time_formatted: string;
  types: any[];
  location: string;
  location_notes?: string;
  location_url: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  region_id: number;
  region: string;
  group_id?: number;
  group?: string;
  district?: string;
  district_id?: number;
  contact_1_name?: string;
  contact_1_email?: string;
  contact_1_phone?: string;
  website?: string;
  last_contact?: string;
}
