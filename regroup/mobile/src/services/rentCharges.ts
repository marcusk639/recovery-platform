import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../firebase-setup';
import { Cents, Dollars } from '../util/money';

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
