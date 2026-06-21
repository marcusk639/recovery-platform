import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { z } from 'zod';
import { requireServiceAuth, ServiceAuthContext } from '../middleware/auth';
import { RECOVERY_PLATFORM_API_KEY } from '../config';
import { normalizeDay } from '../lib/meetings/identity';
import { hashUid } from '../lib/hash';
import type { DirectoryMeeting } from '../entities/DirectoryMeeting';

/**
 * Cross-product PUBLIC READ for the shared meeting directory.
 *
 * PURE FIRESTORE ONLY: this is a geohash-bounded read of the `directoryMeetings`
 * collection (the system of record). It deliberately imports nothing from
 * lib/meetings/sources/ and never touches an external API or GOOGLE_MAPS_API_KEY
 * — ingestion is a separate write path; this is the read interface.
 *
 * Query shape ported from homegroups scripts/findMeetingsByLocation.ts: bound the
 * search with geofire-common geohashQueryBounds, run one range query per bound on
 * `location.geohash`, then filter the union by true distanceBetween. day/type are
 * applied in-memory after the geo filter.
 */

// Default search radius. homegroups' read path filters on a maxDistance in km;
// 5km is a sensible neighborhood default, expressed in meters here.
const DEFAULT_RADIUS_METERS = 5000;
const MAX_RADIUS_METERS = 100000;

const FindMeetingsSchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  day: z.number().int().min(0).max(6).optional(),
  type: z.string().min(1).max(64).optional(),
  radiusMeters: z.number().positive().max(MAX_RADIUS_METERS).optional(),
});

export interface FindMeetingsDeps {
  db: FirebaseFirestore.Firestore;
}

export async function handleFindMeetings(
  data: unknown,
  context: ServiceAuthContext,
  deps: FindMeetingsDeps,
): Promise<{ meetings: DirectoryMeeting[] }> {
  let parsed: z.infer<typeof FindMeetingsSchema>;
  try {
    parsed = FindMeetingsSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Log issue paths/codes only — never the raw payload (location is user data).
      logger.warn('findMeetings: invalid payload', { issues: err.issues });
      throw new HttpsError('invalid-argument', 'Invalid findMeetings payload');
    }
    throw err;
  }

  const { db } = deps;
  const center: [number, number] = [parsed.location.lat, parsed.location.lng];
  const radiusMeters = parsed.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const dayFilter = parsed.day !== undefined ? normalizeDay(parsed.day) : undefined;

  // geohashQueryBounds → one range query per bound on location.geohash. Mirrors
  // findMeetingsByLocation.ts' >= / <= geohash range, but using the canonical
  // geofire-common bounds (precise across cell edges) rather than a single cell.
  const bounds = geohashQueryBounds(center, radiusMeters);
  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      db
        .collection('directoryMeetings')
        .orderBy('location.geohash')
        .startAt(start)
        .endAt(end)
        .get(),
    ),
  );

  // Collect, dedupe by doc id, then apply the true-distance filter (the geohash
  // bounds are a superset — distanceBetween prunes false positives).
  const seen = new Set<string>();
  const meetings: DirectoryMeeting[] = [];
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);

      const meeting = doc.data() as DirectoryMeeting;
      const lat = meeting.location?.lat;
      const lng = meeting.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const distanceKm = distanceBetween([lat, lng], center);
      if (distanceKm * 1000 > radiusMeters) continue;

      if (dayFilter !== undefined && meeting.day !== dayFilter) continue;
      if (parsed.type !== undefined && meeting.type !== parsed.type) continue;

      meetings.push(meeting);
    }
  }

  // Per-request attribution audit row. Best-effort: a write failure must NOT
  // block returning results. Stores ONLY a hashed uid + coarsened coordinates —
  // never email, names, or the raw uid.
  await writeAuditRow(db, context, parsed);

  return { meetings };
}

/** Coarsen a coordinate to ~2 decimals (~1km) so the audit row isn't a precise fix. */
function coarsen(value: number): number {
  return Math.round(value * 100) / 100;
}

async function writeAuditRow(
  db: FirebaseFirestore.Firestore,
  context: ServiceAuthContext,
  parsed: z.infer<typeof FindMeetingsSchema>,
): Promise<void> {
  try {
    await db.collection('directoryMeetingRequests').add({
      appId: context.appId,
      uidHash: hashUid(context.uid),
      day: parsed.day ?? null,
      type: parsed.type ?? null,
      lat: coarsen(parsed.location.lat),
      lng: coarsen(parsed.location.lng),
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Attribution is non-critical — log and continue so the read still returns.
    logger.warn('findMeetings: audit write failed', err);
  }
}

export const findMeetings = onCall(
  { secrets: [RECOVERY_PLATFORM_API_KEY] },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleFindMeetings(request.data, context, { db: getFirestore() });
  },
);
