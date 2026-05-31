/**
 * Types specific to NA meetings
 */
export interface NAMeeting {
  id: string;
  name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  venue_type: 'in_person' | 'virtual' | 'hybrid';
  location_name?: string;
  location_street?: string;
  location_city_subsection?: string;
  location_municipality?: string;
  location_sub_province?: string;
  location_province?: string;
  location_postal_code_1?: string;
  location_nation?: string;
  latitude?: number;
  longitude?: number;
  virtual_meeting_link?: string;
  virtual_meeting_additional_info?: string;
  phone_meeting_number?: string;
  formats: string[]; // Format codes like "BT" (Basic Text), "D" (Discussion), etc.
  service_body_id: number;
  service_body_name: string;
  weekday_id: number; // 1-7 for Sunday-Saturday
  worldid_mixed: string; // NA World Services ID
  root_server_id: number;
  comments?: string;
  duration: string; // Duration in hours:minutes format
  time_zone: string;
  is_published: boolean;
}
