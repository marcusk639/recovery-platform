import * as admin from "firebase-admin";

// Shared Meeting interface for consistency across scripts
export interface Meeting {
  // Required fields
  id: string;
  name: string;
  time: string;
  format: string;
  type: string;
  verified: boolean;
  addedBy: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;

  // Optional fields
  address?: string;
  city?: string;
  state?: string;
  street?: string;
  zip?: string;
  formattedAddress?: string;
  types?: string;
  lat?: number;
  lng?: number;
  geohash?: string;
  country?: string;
  locationName?: string;
  day?: string;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  apiId?: string;
  notes?: string;
  locationNotes?: string;
  groupName?: string;
  district?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
  groupId?: string; // Added for group association
}

// API Meeting interface from Meeting Guide API
export interface ApiMeeting {
  id: string;
  name: string;
  slug?: string;
  notes?: string;
  formatted_address?: string;
  updated?: string;
  url?: string;
  time?: string;
  end_time?: string;
  day?: string;
  types?: string;
  location?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
  approximate?: boolean;
  location_notes?: string;
  group?: string;
  district?: string;
  conference_url?: string;
  conference_url_notes?: string;
  conference_phone?: string;
  conference_phone_notes?: string;
  timezone?: string;
  venmo?: string;
  square?: string;
  paypal?: string;
}

// Group interface
export interface Group {
  id: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  geohash?: string;
  lng?: number;
  online?: boolean;
  link?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  foundedDate?: admin.firestore.Timestamp;
  memberCount: number;
  admins: string[];
  isClaimed: boolean;
  pendingAdminRequests: {
    uid: string;
    requestedAt: admin.firestore.Timestamp;
    message?: string;
  }[];
  placeName?: string;
  type: "AA";
  treasurers: string[];
  treasury: {
    balance: number;
    prudentReserve: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    transactions: [];
    summary: {
      balance: number;
      prudentReserve: number;
      monthlyIncome: number;
      monthlyExpenses: number;
      lastUpdated: Date;
    };
  };
  meetingCount?: number;
}

// Configuration constants
export const CONFIG = {
  SERVICE_ACCOUNT_PATH: "./recovery-connect.json",
  MEETINGS_COLLECTION: "meetings",
  GROUPS_COLLECTION: "groups",
  BATCH_SIZE: 500, // Standardized batch size
  GEOHASH_PRECISION: 5, // Standardized precision
  COORDINATE_PRECISION: 5,
  RETRY_LIMIT: 3,
  RETRY_DELAY_MS: 1000,
  CONCURRENT_REQUESTS: 5,
  STEP: 0.5,
  DELAY_MS: 100,
  PAGE_SIZE: 100, // Number of meetings to fetch per pagination batch
  BATCH_DELAY_MS: 100, // Delay between processing batches of meetings
  MAX_CACHE_SIZE: 10000, // Maximum number of items in the group cache

  // Continental US Bounding Box
  LAT_MIN: 24.0,
  LAT_MAX: 49.0,
  LON_MIN: -125.0,
  LON_MAX: -67.0,

  // Fuzzy matching thresholds
  FUZZY_MATCH_THRESHOLD: 85,
  FUZZY_PARTIAL_THRESHOLD: 75,
  VERY_CLOSE_DISTANCE_M: 20,
  CLOSE_DISTANCE_M: 100,
  MAX_MATCH_DISTANCE_M: 50,
} as const;

// Days of week array
export const daysOfWeek = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
