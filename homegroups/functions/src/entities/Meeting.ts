import { Timestamp } from "firebase-admin/firestore";
import { Location } from "./GeocodeResponse";

export class Meeting {
  name = "";
  time = "";
  address?: string; // Using address for the full string from API
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
  formattedAddress?: string;
  types?: string;
  lat?: number;
  lng?: number;
  geohash?: string; // Added for geohashing
  country?: string;
  locationName?: string; // Building Name / Location details from API
  type?: MeetingType; // Hardcoding for this script
  day?: string; // Store as string "0"-"6"
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  format: string = ""; // Comma-separated string of types
  id?: string; // Our generated hash ID
  apiId?: string; // Store the original API ID for reference
  notes?: string; // Meeting notes
  locationNotes?: string; // Location-specific notes
  groupName?: string; // Group name associated with meeting
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  groupId?: string; // Group ID if meeting is associated with a group
  // Fields set by script
  verified?: boolean;
  addedBy?: string;
  createdAt?: Date;
  updatedAt?: Date; // Corresponds to API 'updated' field
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
  maxDistance?: number; // Maximum distance in kilometers
}

/**
 * Meeting Instance Document (Firestore Schema)
 */
export interface MeetingInstanceDocument {
  meetingId: string;
  groupId: string;
  scheduledAt: Timestamp; // Specific date and time as Firestore Timestamp
  name: string;
  type: string; // Store MeetingType as string
  format?: string | null;
  location?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationName?: string | null;
  isOnline?: boolean;
  link?: string | null;
  onlineNotes?: string | null;
  isCancelled: boolean;
  instanceNotice?: string | null;
  templateUpdatedAt: Timestamp; // Timestamp of the template
  // Chairperson fields
  chairpersonId?: string | null;
  chairpersonName?: string | null;
  // Override tracking - fields that have been modified from template
  overriddenFields?: {
    scheduledAt?: boolean; // Date/time changed
    location?: boolean; // Location fields changed
    address?: boolean;
    city?: boolean;
    state?: boolean;
    zip?: boolean;
    lat?: boolean;
    lng?: boolean;
    locationName?: boolean;
    isOnline?: boolean; // Online status changed
    link?: boolean; // Online link changed
    onlineNotes?: boolean; // Online notes changed
  };
  // Timestamp of last instance-specific modification
  instanceModifiedAt?: Timestamp;
  // Optional future fields
  // speakerId?: string;
  // topic?: string;
}

export interface MeetingDocument {
  name: string;
  id?: string; // Add this line
  type: string; // AA, NA, etc.
  day: string;
  country?: string;
  time: string;
  street?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  location?: string;
  isOnline: boolean;
  onlineLink?: string;
  onlineNotes?: string;
  verified: boolean;
  addedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  groupId: string;
  format?: string;
  locationName?: string;
  geohash?: string;
  temporaryNotice?: string | null;
  isCancelledTemporarily?: boolean;
}

export interface MeetingGuideMeeting {
  id: number;
  name: string;
  notes: string | null;
  day: number;
  time: string; // Format: "HH:MM:SS"
  end_time: string | null;
  time_periods: string[];
  url: string;
  types: string;
  type_codes: string;
  updated_at: string; // Format: "YYYY-MM-DD HH:MM:SS"
  group: string;
  group_notes: string | null;
  venmo: string | null;
  paypal: string | null;
  square: string | null;
  conference_provider: string | null;
  conference_url: string | null;
  conference_url_notes: string | null;
  conference_phone: string | null;
  conference_phone_notes: string | null;
  organization_id: number;
  organization: string;
  contacts: any[]; // Can be made more specific if contact structure is known
  distance: number;
  location_id: number;
  location: string;
  location_notes: string;
  latitude: string;
  longitude: string;
  formatted_address: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  approximate: number;
  county: string | null;
  country: string;
  timezone: string;
}
