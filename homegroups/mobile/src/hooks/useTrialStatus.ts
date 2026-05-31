import {useMemo} from 'react';
import {useAppSelector} from '../store';
import {selectGroupById} from '../store/slices/groupsSlice';

export interface TrialStatus {
  isInTrial: boolean;
  daysRemaining: number;
  trialEndDate: Date | null;
  isExpired: boolean;
  isActive: boolean;
}

export function useTrialStatus(groupId: string): TrialStatus {
  const group = useAppSelector(state => selectGroupById(state, groupId));

  return useMemo(() => {
    const subscriptionStatus = group?.subscriptionStatus;
    const expiresAt = group?.subscriptionExpiresAt;

    if (subscriptionStatus !== 'trialing' || !expiresAt) {
      return {
        isInTrial: false,
        daysRemaining: -1,
        trialEndDate: null,
        isExpired:
          subscriptionStatus === 'canceled' ||
          subscriptionStatus === 'past_due',
        isActive: subscriptionStatus === 'active',
      };
    }

    const now = new Date();
    const msRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    return {
      isInTrial: true,
      daysRemaining: Math.max(0, daysRemaining),
      trialEndDate: expiresAt,
      isExpired: daysRemaining < 0,
      isActive: false,
    };
  }, [group?.subscriptionStatus, group?.subscriptionExpiresAt]);
}

export default useTrialStatus;
