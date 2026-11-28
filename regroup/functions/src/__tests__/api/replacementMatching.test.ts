// The pure helpers behind Reactivate adopting a replacement an earlier attempt
// left live: which subscription it is (isUnrecordedReplacement), and how the
// record holds it (replacementMetadataFrom). Main cases: reactivate.test.ts.

jest.mock('stripe', () => jest.fn().mockImplementation(() => ({})));

import { isUnrecordedReplacement, replacementMetadataFrom } from '../../api/stripe';
import OperatorSubscription from '../../entities/OperatorSubscription';

const stored = () =>
  Object.assign(new OperatorSubscription(), {
    tier: 'standard',
    houseType: 'oxford',
    customerId: 'cus_9',
    status: 'canceled',
    maxResidents: 20,
    maxProperties: 3,
    houses: {},
  });
const subscription = (over: Record<string, unknown> = {}) =>
  ({
    id: 'sub_9',
    status: 'active',
    customer: 'cus_9',
    cancel_at_period_end: false,
    billing_cycle_anchor: 1893456000,
    trial_end: null,
    metadata: { userId: 'uid_9' },
    items: { data: [{ id: 'si_9', price: { id: 'price_std' }, current_period_end: 1893456000 }] },
    ...over,
  }) as never;

beforeEach(() => {
  process.env.STRIPE_PRICE_OXFORD_STANDARD = 'price_std';
});

describe('isUnrecordedReplacement', () => {
  it('reads an expanded customer object', () => {
    expect(isUnrecordedReplacement(subscription({ customer: { id: 'cus_9' } }), stored())).toBe(
      true,
    );
  });

  it("falls back to the item's plan id when it has no price", () => {
    const items = { data: [{ id: 'si_9', plan: { id: 'price_std' } }] };
    expect(isUnrecordedReplacement(subscription({ items }), stored())).toBe(true);
  });

  it('is false with no stored customer, or no items', () => {
    const noCustomer = Object.assign(stored(), { customerId: undefined });
    expect(isUnrecordedReplacement(subscription(), noCustomer)).toBe(false);
    expect(isUnrecordedReplacement(subscription({ items: undefined }), stored())).toBe(false);
  });
});

describe('replacementMetadataFrom', () => {
  // Cancelled at period end from the billing portal while unrecorded: recorded
  // as active it would hide Resume, and the plan would end unannounced.
  it('records a replacement set to cancel at period end as cancelling', () => {
    const meta = replacementMetadataFrom(
      subscription({ cancel_at_period_end: true }),
      stored(),
      'cus_9',
    );
    expect(meta.status).toBe('cancelling');
  });

  it("records the stored plan on the subscription's ids", () => {
    const meta = replacementMetadataFrom(subscription(), stored(), 'cus_9');
    expect(meta).toMatchObject({
      subscriptionId: 'sub_9',
      customerId: 'cus_9',
      subscriptionItemId: 'si_9',
      status: 'active',
      houseType: 'oxford',
      tier: 'standard',
      oxfordEnabled: true,
      maxResidents: 20,
    });
  });
});
