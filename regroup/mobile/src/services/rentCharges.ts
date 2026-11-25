import { collection, getDocs, query, where } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { firestore, functions } from '../../firebase-setup';
import { asCents, Cents, Dollars } from '../util/money';

/** Server-written charge records (functions src/rent/chargeResident.ts); clients only read. */
export const rentChargeCollection = collection(firestore, 'rentCharges');

export type RentFrequency = 'weekly' | 'monthly';

/**
 * One resident in the turn-on preview (functions/src/rent/preview.ts). Every
 * amount is integer CENTS; days are house-local YYYY-MM-DD.
 */
export interface RentPreviewRow {
  guestId: string;
  label: string;
  /** Added to the balance the moment the setting is saved; 0 when the first charge is later. */
  nowCents: Cents;
  firstDay: string;
  /** The first charge, prorated over daysCovered of daysInPeriod. */
  amountCents: Cents;
  daysCovered: number;
  daysInPeriod: number;
  rateSource: 'house' | 'custom';
}

export interface RentPreview {
  residents: RentPreviewRow[];
}

/**
 * What saving this schedule and price would charge each current resident, from
 * the previewRentCharges callable (managers and owners only; it writes nothing).
 * `price` is DOLLARS, the unit house.weeklyRent / house.monthlyRent store.
 */
export async function previewRentCharges(input: {
  houseId: string;
  frequency: RentFrequency;
  price: Dollars;
}): Promise<RentPreview> {
  const result = await httpsCallable(functions, 'previewRentCharges')(input);
  const data = result.data as Partial<RentPreview> | null;
  return { residents: data?.residents ?? [] };
}

/**
 * One rent charge: what raised the balance, and for which days (rent spec §4.5).
 * `amountCents` is integer CENTS; days are house-local YYYY-MM-DD, inclusive.
 */
export interface RentCharge {
  id: string;
  guestId: string;
  houseId: string;
  amountCents: Cents;
  daysCovered: number;
  daysInPeriod: number;
  firstDay: string;
  lastDay: string;
  rateSource: 'house' | 'custom';
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function toRentCharge(id: string, d: Record<string, unknown>): RentCharge | null {
  const amount = d.amountCents;
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return null;
  if (typeof d.from !== 'string' || !DAY.test(d.from)) return null;
  if (typeof d.through !== 'string' || !DAY.test(d.through)) return null;
  return {
    id,
    guestId: String(d.guestId ?? ''),
    houseId: String(d.houseId ?? ''),
    amountCents: asCents(amount),
    daysCovered: Number(d.daysCovered ?? 0),
    daysInPeriod: Number(d.daysInPeriod ?? 0),
    firstDay: d.from,
    lastDay: d.through,
    rateSource: d.rateSource === 'custom' ? 'custom' : 'house',
  };
}

/**
 * A resident's rent charges, newest first. The rentCharges rule lets a resident
 * read a record only when its guestUserId is theirs, and rules are not filters,
 * so a resident asks by { houseId, guestUserId }; staff ask by { houseId,
 * guestId }, which also finds charges made before an account linked. Sorted here:
 * two equality filters need no composite index, a server sort would.
 */
export async function listGuestCharges(scope: {
  houseId: string;
  guestUserId?: string;
  guestId?: string;
}): Promise<RentCharge[]> {
  const { houseId, guestUserId, guestId } = scope;
  if (!houseId || (!guestUserId && !guestId)) {
    throw new Error('listGuestCharges: houseId and a guestUserId or guestId are required');
  }
  const byField = guestUserId
    ? where('guestUserId', '==', guestUserId)
    : where('guestId', '==', guestId);
  const snapshot = await getDocs(
    query(rentChargeCollection, where('houseId', '==', houseId), byField),
  );
  return snapshot.docs
    .map((d) => toRentCharge(d.id, d.data()))
    .filter((c): c is RentCharge => c !== null)
    .sort((a, b) => b.firstDay.localeCompare(a.firstDay));
}
