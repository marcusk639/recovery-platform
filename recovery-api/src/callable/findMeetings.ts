import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { z } from 'zod';
import { requireServiceAuth, ServiceAuthContext } from '../middleware/auth';
import { RECOVERY_PLATFORM_API_KEY } from '../config';
import { toDayName, type DayName } from '../lib/meetings/identity';
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

/**
 * Rows read per request while paging through a geohash bound. It isn't a cap: every
 * bound is read to its end, because geohash order is not distance order, so stopping
 * early would drop meetings inside the radius. The radius limit above bounds the cost.
 */
const READ_PAGE_SIZE = 500;

const FindMeetingsSchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  // A day name, or the older integer 0–6 (0 = Sunday) that deployed clients still send.
  day: z
    .union([z.number(), z.string()])
    .optional()
    .refine((day) => day === undefined || storedDay(day) !== null, 'Unrecognized day'),
  type: z.string().min(1).max(64).optional(),
  radiusMeters: z.number().positive().max(MAX_RADIUS_METERS).optional(),
});

/** A day in either stored form as a name, or null when it isn't a day at all. */
function storedDay(day: unknown): DayName | null {
  if (typeof day !== 'number' && typeof day !== 'string') return null;
  try {
    return toDayName(day);
  } catch {
    return null;
  }
}

export interface FindMeetingsDeps {
  db: FirebaseFirestore.Firestore;
}

/**
 * Reads one bound to its end. A page continues from the last document, not its geohash:
 * meetings on one coordinate share a geohash, so a value cursor would skip the rest of them.
 */
async function readBound(
  db: FirebaseFirestore.Firestore,
  start: string,
  end: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const ordered = db.collection('directoryMeetings').orderBy('location.geohash');
    const page = (last ? ordered.startAfter(last) : ordered.startAt(start))
      .endAt(end)
      .limit(READ_PAGE_SIZE);
    const snap = await page.get();
    docs.push(...snap.docs);
    if (snap.docs.length < READ_PAGE_SIZE) return docs;
    last = snap.docs[snap.docs.length - 1];
  }
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
  const dayFilter = parsed.day !== undefined ? storedDay(parsed.day) : undefined;

  // geohashQueryBounds → one range query per bound on location.geohash. Mirrors
  // findMeetingsByLocation.ts' >= / <= geohash range, but using the canonical
  // geofire-common bounds (precise across cell edges) rather than a single cell.
  const bounds = geohashQueryBounds(center, radiusMeters);
  const pages = await Promise.all(bounds.map(([start, end]) => readBound(db, start, end)));

  // Collect, dedupe by doc id, then apply the true-distance filter (the geohash
  // bounds are a superset — distanceBetween prunes false positives).
  const seen = new Set<string>();
  const meetings: DirectoryMeeting[] = [];
  for (const docs of pages) {
    for (const doc of docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);

      // Writers keep the id only as the document key, and clients need it to open a meeting.
      const meeting = { ...doc.data(), id: doc.id } as DirectoryMeeting;
      const lat = meeting.location?.lat;
      const lng = meeting.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;

      const distanceKm = distanceBetween([lat, lng], center);
      if (distanceKm * 1000 > radiusMeters) continue;

      // Compared as names, but returned as stored: deployed product code reads only
      // an integer, and rewriting it would strip the day from unmigrated rows.
      if (dayFilter !== undefined && storedDay(meeting.day) !== dayFilter) continue;
      if (parsed.type !== undefined && meeting.type !== parsed.type) continue;

      meetings.push(meeting);
    }
  }

  // Per-request attribution audit row. FIRE-AND-FORGET: the write must NOT add
  // its latency to the read hot path, and a write failure must NOT block (or
  // reject) returning results. We deliberately do NOT await it. Stores ONLY a
  // hashed uid + coarsened coordinates — never email, names, or the raw uid.
  void writeAuditRow(db, context, parsed).catch((err) =>
    logger.warn('findMeetings: audit write failed', err),
  );

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
  // No try/catch here: the caller invokes this fire-and-forget and attaches a
  // .catch() that logs failures, so a rejection never reaches the read path.
  await db.collection('directoryMeetingRequests').add({
    appId: context.appId,
    uidHash: hashUid(context.uid),
    day: parsed.day === undefined ? null : storedDay(parsed.day),
    type: parsed.type ?? null,
    lat: coarsen(parsed.location.lat),
    lng: coarsen(parsed.location.lng),
    at: FieldValue.serverTimestamp(),
  });
}

export const findMeetings = onCall(
  // A wide search in a dense city holds tens of thousands of documents before filtering.
  { secrets: [RECOVERY_PLATFORM_API_KEY], memory: '1GiB' },
  async (request: CallableRequest) => {
    const context = requireServiceAuth(request);
    return handleFindMeetings(request.data, context, { db: getFirestore() });
  },
);
