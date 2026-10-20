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
  return functions.httpsCallable('updateSubscriptionGuests')(params);
};

export const updateSubscriptionHouses = async (params: SubParams) => {
  const result = await functions.httpsCallable('updateSubscriptionHouses')(
    params,
  );
  return result.data;
};

export const applyBundleDiscount = async (userId: string): Promise<void> => {
  await functions.httpsCallable('applyBundleDiscount')({ userId });
};

export type HouseCreatePayload = Record<string, unknown> & {
  id: string;
  name: string;
  lat: number | string;
  lng: number | string;
};

export interface CreateHousesResult {
  houseIds: string[];
  admin: Admin;
  subscriptionMetadata: OperatorSubscription;
}

export const createHouses = async (
  houses: HouseCreatePayload[],
): Promise<CreateHousesResult> => {
  const result = await functions.httpsCallable('createHouses')({ houses });
  return result.data as CreateHousesResult;
};
