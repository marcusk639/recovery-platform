/**
 * Regroup-side view of a meeting in the shared recovery-api directory.
 *
 * This is the SHARED slice only — the subset of recovery-api's canonical
 * `DirectoryMeeting` that regroup reads back over the wire. Product-private
 * overlay fields (groupId/houseId/payment links) never cross this boundary.
 * recovery-api owns the authoritative shape (with Firestore Timestamps); this
 * client copy omits server-only fields regroup does not consume.
 */
export type DirectoryProvider = "AA" | "NA" | "CELEBRATE_RECOVERY" | "CUSTOM";

export type DirectorySource = "external" | "app";

export interface DirectoryLocation {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat: number;
  lng: number;
  geohash?: string;
}

export interface DirectoryMeeting {
  id: string;
  source: DirectorySource;
  externalId?: string;
  provider: DirectoryProvider;
  name: string;
  /** Free-form meeting type/category as surfaced by the source. */
  type?: string;
  /** Canonical day-of-week: integer 0–6 (0 = Sunday). */
  day: number;
  /** Canonical local start time: "HH:mm" (24-hour). */
  time: string;
  format?: string;
  location: DirectoryLocation;
  online?: boolean;
  link?: string;
  onlineNotes?: string;
  timezone?: string;
}
