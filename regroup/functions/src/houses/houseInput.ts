import { encode } from 'ngeohash';
import { z } from 'zod';

/**
 * Client-supplied house fields for createHouses. This is a WHITELIST: unknown
 * keys are stripped (zod default, made explicit with .strip()), so server-owned
 * fields (ownerId, adminIds, superAdminIds, subscriptionStatus, guestGraceEndsAt,
 * stripe*, isDemoHouse, oxfordEnabled, ...) can never come from the client.
 * `certified` is client-supplied: the wizard asks the operator, and the
 * operator (superAdmin) can already set it via a house update. Nested wizard
 * structures are intentionally permissive. The house id is never client input
 * (see requestKey below).
 */
// Numeric (or numeric string), range-checked after coercion.
const coordinate = (min: number, max: number) =>
  z
    .union([
      z.number().finite(),
      z
        .string()
        .trim()
        .min(1)
        .refine((s) => Number.isFinite(Number(s)), 'must be numeric'),
    ])
    .refine((v) => Number(v) >= min && Number(v) <= max, `must be between ${min} and ${max}`);

const looseRecord = z.record(z.string(), z.unknown());
const emails = z.array(z.string().max(320)).max(200);

export const createHouseInputSchema = z
  .object({
    // Idempotency key, not an id: the house id is derived server-side from
    // (uid, requestKey) in houseId.ts. A client-sent `id` is stripped.
    requestKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().min(1).max(120),
    lat: coordinate(-90, 90),
    lng: coordinate(-180, 180),
    street: z.string().max(300).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    zip: z.string().max(20).optional(),
    country: z.string().max(120).optional(),
    timezone: z.string().max(100).optional(),
    phoneNumber: z.string().max(30).optional(),
    monthlyRent: z.number().finite().min(0).optional(),
    weeklyRent: z.number().finite().min(0).optional(),
    maximumCapacity: z.number().int().min(0).max(5000).optional(),
    depositsAndFees: z.union([z.string().max(100), z.number().finite()]).optional(),
    rentFrequency: z.enum(['weekly', 'monthly', 'both']).optional(),
    gender: z.string().max(30).nullable().optional(),
    baths: z.number().finite().min(0).optional(),
    wifi: z.boolean().optional(),
    certified: z.boolean().optional(),
    managerSetupType: z
      .enum(['senior-peer', 'operator-only', 'external-managers', 'democratic'])
      .optional(),
    houseType: z.enum(['traditional', 'oxford']).optional(),
    phases: looseRecord.optional(),
    chores: looseRecord.optional(),
    rooms: looseRecord.optional(),
    pendingAdminInvites: emails.optional(),
    pendingGuestInvites: emails.optional(),
    seniorPeerEmails: emails.optional(),
  })
  .strip();

export type CreateHouseInput = z.infer<typeof createHouseInputSchema>;

export interface BuildHouseContext {
  /** Server-derived (deriveHouseId); stored as the doc's `id` field. */
  houseId: string;
  ownerUid: string;
  adminId: string;
  subscriptionStatus: 'active' | 'trialing';
  now: string;
}

export function buildHouseDoc(
  input: CreateHouseInput,
  ctx: BuildHouseContext,
): Record<string, unknown> {
  // requestKey is request metadata, not a house field.
  const { lat, lng, requestKey: _requestKey, ...rest } = input;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  return {
    // Defaults matching the shape of legacy client-created houses; client input
    // may override only the whitelisted ones (certified).
    certified: false,
    issues: {},
    complaints: {},
    disputes: {},
    applications: {},
    health: {},
    awaitingVerification: [],
    ...rest,
    id: ctx.houseId,
    lat: latNum,
    lng: lngNum,
    geohash: encode(latNum, lngNum),
    ownerId: ctx.ownerUid,
    // A uid, not an admin id: callable/oxford.ts and callable/analytics.ts
    // authorize on house.superAdminId === request.auth.uid, and
    // setHouseSubscriptionStatusOnCreate reads it as the operator's uid.
    superAdminId: ctx.ownerUid,
    adminIds: [ctx.adminId],
    superAdminIds: [ctx.adminId],
    subscriptionStatus: ctx.subscriptionStatus,
    currentCapacity: 0,
    stripeStatus: 'not_connected',
    isDemoHouse: false,
    imageUrl: '',
    avatar: '',
    createdAt: ctx.now,
  };
}
