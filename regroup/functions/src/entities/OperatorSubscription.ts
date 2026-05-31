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
}
