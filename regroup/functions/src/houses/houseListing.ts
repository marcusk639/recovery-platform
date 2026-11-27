/**
 * A house's public listing: house-listings/{houseId}, the only house data a
 * signed-out visitor (the app's anonymous session) may read. House search and
 * the house summary a prospective resident sees read it; houses/{houseId}
 * stays readable to the house's own members only (EMU-009, owner decision
 * 2026-11-27).
 *
 * Firestore rules can't limit a read to some fields of a document, so the
 * public fields live in their own server-written document. Only the fields
 * below are copied, each only with its expected type. Left out on purpose:
 * the street address and exact coordinates (a sober living house's residents
 * may not want it findable; the geohash is cut to ~1 km), rooms and beds
 * (they name residents), health, chores, phases, disputes, complaints,
 * issues, applications, the house code, staff and owner ids, and all
 * subscription and Stripe fields.
 *
 * Listed: a house that isn't a demo house, has a name and a location, and
 * whose subscription is entitled (util/entitlement.ts): active or trialing, or
 * past_due while the app's guest grace runs (guestGraceEndsAt; owner,
 * 2026-11-27). Canceled, unpaid, a past-due house whose grace has ended, or any
 * other status has no listing: a lapsed operator can't act on an application.
 * No house write happens when the grace ends, so the hourly
 * houseListingGraceSweep re-plans past-due houses (scheduled/houseListingGrace.ts).
 * The house phone is public on purpose (owner, 2026-11-27), for applicants to call.
 */
import { evaluateEntitlement } from '../util/entitlement';

export const LISTING_GEOHASH_PRECISION = 6;
/** Free text an operator typed is public here, so each string is capped. */
const STRING_CAP: Record<string, number> = {
  name: 200,
  phoneNumber: 30,
  depositsAndFees: 500,
  avatar: 2048,
  imageUrl: 2048,
};
const DEFAULT_STRING_CAP = 100;
const capped = (k: string, v: string) => v.slice(0, STRING_CAP[k] ?? DEFAULT_STRING_CAP);

type Data = Record<string, unknown>;

/** Listed only while entitled: the same ladder as the paywall, grace included. */
function isListedSubscription(house: Data, now: number): boolean {
  const deadline = house.guestGraceEndsAt;
  return evaluateEntitlement(
    {
      subscriptionStatus: String(house.subscriptionStatus ?? ''),
      guestGraceEndsAt: typeof deadline === 'string' ? deadline : null,
    },
    now,
  ).entitled;
}

export interface HouseListing {
  id: string;
  name: string;
  geohash: string;
  city?: string;
  state?: string;
  zip?: string;
  gender?: string;
  houseType?: string;
  certified?: boolean;
  rating?: number;
  baths?: number;
  wifi?: boolean;
  avatar?: string;
  imageUrl?: string;
  phoneNumber?: string;
  maximumCapacity?: number;
  currentCapacity?: number;
  openBeds?: number;
  monthlyRent?: number;
  weeklyRent?: number;
  rentFrequency?: string;
  depositsAndFees?: string;
  phaseCount: number;
  roomCount: number;
  bedCount: number;
}

const STRING_FIELDS = [
  'city',
  'state',
  'zip',
  'gender',
  'houseType',
  'avatar',
  'imageUrl',
  'phoneNumber',
  'rentFrequency',
  'depositsAndFees',
] as const;
const NUMBER_FIELDS = [
  'rating',
  'baths',
  'maximumCapacity',
  'currentCapacity',
  'monthlyRent',
  'weeklyRent',
] as const;
const BOOLEAN_FIELDS = ['certified', 'wifi'] as const;

/** Every house field a listing is made from: the backfill reads only these. */
export const LISTING_SOURCE_FIELDS: string[] = [
  'isDemoHouse',
  'subscriptionStatus',
  'guestGraceEndsAt',
  'name',
  'geohash',
  'phases',
  'rooms',
  ...STRING_FIELDS,
  ...NUMBER_FIELDS,
  ...BOOLEAN_FIELDS,
];

const isObject = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const countOf = (v: unknown): number =>
  Array.isArray(v) ? v.length : isObject(v) ? Object.keys(v).length : 0;

/** The house's public listing, or null when it shouldn't be listed. */
export function toHouseListing(
  houseId: string,
  house: Data | undefined,
  now: number = Date.now(),
): HouseListing | null {
  if (!house) return null;
  if (house.isDemoHouse === true) return null;
  if (!isListedSubscription(house, now)) return null;
  const name = typeof house.name === 'string' ? capped('name', house.name.trim()) : '';
  const geohash = typeof house.geohash === 'string' ? house.geohash : '';
  if (!name || geohash.length < LISTING_GEOHASH_PRECISION || geohash === 'unknown') return null;

  const rooms = isObject(house.rooms) ? Object.values(house.rooms) : [];
  const listing: HouseListing = {
    id: houseId,
    name,
    geohash: geohash.slice(0, LISTING_GEOHASH_PRECISION),
    phaseCount: countOf(house.phases),
    roomCount: rooms.length,
    bedCount: rooms.reduce<number>((n, room) => n + (isObject(room) ? countOf(room.beds) : 0), 0),
  };
  const out = listing as unknown as Data;
  for (const k of STRING_FIELDS) {
    const v = house[k];
    if (typeof v === 'string') out[k] = capped(k, v);
  }
  for (const k of NUMBER_FIELDS) {
    if (typeof house[k] === 'number' && Number.isFinite(house[k])) out[k] = house[k];
  }
  for (const k of BOOLEAN_FIELDS) if (typeof house[k] === 'boolean') out[k] = house[k];
  if (typeof listing.maximumCapacity === 'number' && typeof listing.currentCapacity === 'number') {
    listing.openBeds = Math.max(0, listing.maximumCapacity - listing.currentCapacity);
  }
  return listing;
}

export type ListingPlan =
  { kind: 'write'; listing: HouseListing } | { kind: 'delete' } | { kind: 'unchanged' };

/** What the listing document should become, given the house and the current listing. */
export function planHouseListing(
  houseId: string,
  house: Data | undefined,
  existing: Data | undefined,
  now: number = Date.now(),
): ListingPlan {
  const listing = toHouseListing(houseId, house, now);
  if (!listing) return existing ? { kind: 'delete' } : { kind: 'unchanged' };
  if (existing && sameListing(listing, existing)) return { kind: 'unchanged' };
  return { kind: 'write', listing };
}

/** Field-by-field equality, ignoring the server's updatedAt. */
function sameListing(listing: HouseListing, existing: Data): boolean {
  const a = listing as unknown as Data;
  const keys = new Set(
    [...Object.keys(a), ...Object.keys(existing)].filter((k) => k !== 'updatedAt'),
  );
  for (const k of keys) if (a[k] !== existing[k]) return false;
  return true;
}
