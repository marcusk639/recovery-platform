import { SubscriptionStatus, User } from '../entities/User';
import { dayIsAfter, getTodaysDate } from './display';

export const subscriptionStatus = (
  user: User,
): SubscriptionStatus | 'expired' | undefined => {
  const { subscriptionMetadata } = user;
  if (subscriptionMetadata) {
    const { currentPeriodEnd, status } = subscriptionMetadata;
    if (status) {
      return status;
    }
    if (dayIsAfter(getTodaysDate(), currentPeriodEnd)) {
      return 'expired';
    }
  }
};

export const subscriptionIsActive = (user: User): boolean => {
  const status = subscriptionStatus(user);
  return status === 'active' || status === 'trialing';
};

// Statuses that indicate the subscription exists but access should be blocked
export const INACTIVE_STATUSES: ReadonlyArray<SubscriptionStatus | 'expired'> =
  ['past_due', 'canceled', 'unpaid', 'pending', 'expired'];
