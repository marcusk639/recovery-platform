import { encode } from 'ngeohash';
import { z } from 'zod';

/**
 * Client-supplied house fields for createHouses. This is a WHITELIST: unknown
 * keys are stripped (zod default, made explicit with .strip()), so server-owned
 * fields (ownerId, adminIds, superAdminIds, subscriptionStatus, guestGraceEndsAt,
 * stripe*, isDemoHouse, certified, oxfordEnabled, ...) can never come from the
 * client. Nested wizard structures are intentionally permissive.
 */
const coordinate = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => Number.isFinite(Number(s)), 'must be numeric'),
]);

const looseRecord = z.record(z.string(), z.unknown());
const emails = z.array(z.string().max(320)).max(200);

export const createHouseInputSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9]{20}$/),
    name: z.string().min(1).max(120),
    lat: coordinate,
    lng: coordinate,
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
  ownerUid: string;
  adminId: string;
  subscriptionStatus: 'active' | 'trialing';
  now: string;
}

export function buildHouseDoc(
  input: CreateHouseInput,
  ctx: BuildHouseContext,
): Record<string, unknown> {
  const { lat, lng, ...rest } = input;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  return {
    ...rest,
    lat: latNum,
    lng: lngNum,
    geohash: encode(latNum, lngNum),
    ownerId: ctx.ownerUid,
    adminIds: [ctx.adminId],
    superAdminIds: [ctx.adminId],
    subscriptionStatus: ctx.subscriptionStatus,
    currentCapacity: 0,
    stripeStatus: 'not_connected',
    isDemoHouse: false,
    certified: false,
    imageUrl: '',
    avatar: '',
    createdAt: ctx.now,
  };
}
