import type { Timestamp } from 'firebase-admin/firestore';
import type { DayName } from '../lib/meetings/identity';

/**
 * Canonical shape for a meeting in the shared public directory
 * (recovery-api `directoryMeetings` collection — the system of record).
 *
 * Reconciles regroup's `RatsMeeting` and homegroups' `SerializedMeeting` down to
 * the SHARED slice only. Product-private overlay fields (groupId/houseId/venmo/
 * square/paypal/verified/addedBy) NEVER live here — each product attaches those
 * on its own side, keyed by `id`.
 *
 * `day` is canonicalized to a lowercase weekday name and `time` to "HH:mm".
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
  /** Deterministic hashed id — see directoryMeetingId(), or bmltMeetingId() for NA rows from BMLT. */
  id: string;
  /** Provenance: 'external' = ingested from a public source; 'app' = user-created via a product. */
  source: DirectorySource;
  /** Upstream id when the record came from an external provider. */
  externalId?: string;
  provider: DirectoryProvider;
  name: string;
  /** Free-form meeting type/category as surfaced by the source (e.g. "AA", "Open"). */
  type?: string;
  /**
   * Day of the week as a lowercase name, e.g. "tuesday". Rows written before
   * 2026-11-09 may still hold an integer 0–6 (0 = Sunday) until migrated, so a
   * reader of stored data should go through toDayName().
   */
  day: DayName;
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
  /** BMLT region `sourceId` that listed this row; decides whether the row may be deleted. */
  sourceRegion?: string;
  /**
   * "YYYY-MM-DD" the source last confirmed this row. Clients show it so a person
   * can tell an old listing from a current one. Null once a live sweep has re-seen
   * a snapshot row. NA rows keep a date, because they update only when run by hand.
   */
  dataAsOf?: string | null;
  /** Last time the refresh job re-ingested/updated this record. */
  lastRefreshedAt: Timestamp;
  /** Last time this record was seen in a source sweep (drives stale-prune). */
  lastSeenAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
