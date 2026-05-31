export default class OperatorSubscription {
  subscriptionId: string = '';
  currentPeriodEnd: number = 0;
  status: string = '';
  customerId: string = '';
  items: {
    houseItemId: string;
    guestItemId: string;
  } = { guestItemId: '', houseItemId: '' };
  houses: {
    [houseId: string]: {
      numberOfGuests: number;
    };
  } = {};
}
