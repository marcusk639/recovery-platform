import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Canonical shape for a meeting in the shared public directory
 * (recovery-api `directoryMeetings` collection — the system of record).
 *
 * Reconciles regroup's `RatsMeeting` and homegroups' `SerializedMeeting` down to
 * the SHARED slice only. Product-private overlay fields (groupId/houseId/venmo/
 * square/paypal/verified/addedBy) NEVER live here — each product attaches those
 * on its own side, keyed by `id`.
 *
 * `day` is canonicalized to an integer 0–6 (0 = Sunday) and `time` to "HH:mm".
 * See `lib/meetings/identity.ts` for the frozen id/geohash/normalization scheme.
 */
export type DirectoryProvider = 'AA' | 'NA' | 'CELEBRATE_RECOVERY' | 'CUSTOM';

export type DirectorySource = 'external' | 'app';

export interface DirectoryLocation {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat: number;
  lng: number;
  /** geofire-common geohash at the frozen GEOHASH_PRECISION. */
  geohash: string;
}

export interface DirectoryMeeting {
  /** Deterministic hashed id — see directoryMeetingId(). */
  id: string;
  /** Provenance: 'external' = ingested from a public source; 'app' = user-created via a product. */
  source: DirectorySource;
  /** Upstream id when the record came from an external provider. */
  externalId?: string;
  provider: DirectoryProvider;
  name: string;
  /** Free-form meeting type/category as surfaced by the source (e.g. "AA", "Open"). */
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
  /** Canonical app-id of the product that created an `app`-sourced meeting. */
  createdByApp?: string;
  /** uid of the creating user for an `app`-sourced meeting. */
  createdByUid?: string;
  /** Last time the refresh job re-ingested/updated this record. */
  lastRefreshedAt: Timestamp;
  /** Last time this record was seen in a source sweep (drives stale-prune). */
  lastSeenAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
