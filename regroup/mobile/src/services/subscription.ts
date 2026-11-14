import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../firebase-setup';
import { OperatorSubscription } from '../entities/User';
import Admin from '../entities/Admin';

interface SubParams {
  ownerUserId: string;
  houseIds: string[];
  action: 'add' | 'remove';
  amountToAdjust?: number;
}

export const updateSubscriptionGuests = (params: SubParams) => {
  return httpsCallable(functions, 'updateSubscriptionGuests')(params);
};

export const updateSubscriptionHouses = async (params: SubParams) => {
  const result = await httpsCallable(functions, 'updateSubscriptionHouses')(params);
  return result.data;
};

export const applyBundleDiscount = async (userId: string): Promise<void> => {
  await httpsCallable(functions, 'applyBundleDiscount')({ userId });
};

// The client never sends a house id: `requestKey` is an idempotency key (the
// local wizard id) and the server derives the real id from (uid, requestKey).
export type HouseCreatePayload = Record<string, unknown> & {
  requestKey: string;
  id?: never;
  name: string;
  lat: number | string;
  lng: number | string;
};

export interface CreateHousesResult {
  houseIds: string[];
  /** requestKey (local wizard id) → server-derived house id. */
  idMap: Record<string, string>;
  admin: Admin;
  subscriptionMetadata: OperatorSubscription;
}

export const createHouses = async (
  houses: HouseCreatePayload[],
): Promise<CreateHousesResult> => {
  const result = await httpsCallable(functions, 'createHouses')({ houses });
  return result.data as CreateHousesResult;
};
