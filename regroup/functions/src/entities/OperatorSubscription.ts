import type { BillingInterval } from "../util/tierPricing";

export default class OperatorSubscription {
  subscriptionId: string = "";
  currentPeriodEnd: number = 0;
  customerId: string = "";
  status: string = "";
  items: {
    houseItemId: string;
    guestItemId: string;
  } = { guestItemId: "", houseItemId: "" };
  houses: {
    [houseId: string]: {
      numberOfGuests: number;
    };
  } = {};

  // Fields added to align with mobile app entity
  plan: string = "";
  oxfordEnabled: boolean = false;

  // W11: always record when subscription state was last written
  lastUpdatedAt?: string;

  // Tier-based pricing fields (Task 13)
  houseType?: string;
  tier?: string;
  maxResidents?: number | null;
  maxProperties?: number | null;
  // Written at checkout and by syncOperatorTier; Reactivate restarts on it.
  billingInterval?: BillingInterval;

  // Tier model uses a single flat-fee line item rather than house/guest items.
  subscriptionItemId?: string;
}
