import { functions } from '../../firebase-setup';

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
