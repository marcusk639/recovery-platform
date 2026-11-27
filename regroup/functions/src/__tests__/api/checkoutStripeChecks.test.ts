// The Stripe side of checkout's double-billing guard (launch item M9):
// - initializeTierCustomer marks the errors thrown before any subscription can
//   exist, so createOperatorSubscription frees its lock only for those;
// - findLiveSubscriptionForUser finds a subscription the operator record
//   doesn't show, so a retry can't add a second.

const mockSubscriptionsCreate = jest.fn();
const mockSubscriptionsSearch = jest.fn();
const mockSubscriptionsList = jest.fn();
const mockCustomersList = jest.fn();
const mockCustomersCreate = jest.fn();
const mockCustomersDel = jest.fn();
const mockSetupIntentsCreate = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: (...args: unknown[]) => mockSubscriptionsCreate(...args),
      search: (...args: unknown[]) => mockSubscriptionsSearch(...args),
      list: (...args: unknown[]) => mockSubscriptionsList(...args),
    },
    customers: {
      create: (...args: unknown[]) => mockCustomersCreate(...args),
      del: (...args: unknown[]) => mockCustomersDel(...args),
      list: (...args: unknown[]) => mockCustomersList(...args),
    },
    setupIntents: { create: (...args: unknown[]) => mockSetupIntentsCreate(...args) },
  })),
);

import {
  failedBeforeSubscription,
  findLiveSubscriptionForUser,
  initializeTierCustomer,
} from '../../api/stripe';

const checkout = () =>
  initializeTierCustomer('op@test.com', 'pm_1', 'traditional', 'starter', 'uid_1');
const caught = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  process.env.STRIPE_API_VERSION = '2026-01-28.clover';
  process.env.STRIPE_PRICE_TRAD_STARTER = 'price_starter';
  mockCustomersCreate.mockResolvedValue({ id: 'cus_1' });
  mockCustomersDel.mockResolvedValue({ id: 'cus_1', deleted: true });
  mockSetupIntentsCreate.mockResolvedValue({ status: 'succeeded' });
  mockSubscriptionsCreate.mockResolvedValue({
    id: 'sub_1',
    status: 'trialing',
    items: { data: [{ id: 'si_1' }] },
  });
});
afterEach(() => delete process.env.STRIPE_PRICE_TRAD_STARTER);

describe('initializeTierCustomer marks errors from before the subscription', () => {
  it('a failed customer create is marked: no subscription can exist', async () => {
    mockCustomersCreate.mockRejectedValue(new Error('stripe down'));
    const error = await caught(checkout());
    expect(failedBeforeSubscription(error)).toBe(true);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  it('a card that fails the check is marked', async () => {
    mockSetupIntentsCreate.mockRejectedValue(
      Object.assign(new Error('Your card was declined.'), { type: 'StripeCardError' }),
    );
    const error = await caught(checkout());
    expect(error).toBeTruthy();
    expect(failedBeforeSubscription(error)).toBe(true);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
  });

  // The callable's check that the attempt still holds its checkout lock runs
  // last, just before the create: a refusal there means no subscription.
  it('a refusal from the attempt check is marked, and the subscription is never created', async () => {
    const refusal = new Error('checkout lock lost');
    const error = await caught(
      initializeTierCustomer('op@test.com', 'pm_1', 'traditional', 'starter', 'uid_1', 'month', {
        key: '1700000000000',
        beforeCreate: async () => {
          throw refusal;
        },
      }),
    );
    expect(error).toBe(refusal);
    expect(failedBeforeSubscription(error)).toBe(true);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    // No subscription will be made, so the customer (with the card) it just
    // created is deleted: no record names it.
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('a failed or timed-out subscription create is NOT marked: Stripe may have made it', async () => {
    mockSubscriptionsCreate.mockRejectedValue(new Error('Request timed out'));
    const error = await caught(checkout());
    expect(error).toBeTruthy();
    expect(failedBeforeSubscription(error)).toBe(false);
  });

  it('an error reading a created subscription is NOT marked', async () => {
    mockSubscriptionsCreate.mockResolvedValue({
      id: 'sub_1',
      status: 'trialing',
      items: { data: [] },
    });
    const error = await caught(checkout());
    expect(error).toBeTruthy();
    expect(failedBeforeSubscription(error)).toBe(false);
  });

  it('is false for anything else', () => {
    expect(failedBeforeSubscription(new Error('x'))).toBe(false);
    expect(failedBeforeSubscription(undefined)).toBe(false);
  });
});

describe('findLiveSubscriptionForUser', () => {
  const sub = (id: string, status: string, userId = 'uid_1') => ({ id, status, metadata: { userId } });
  const find = () => findLiveSubscriptionForUser('uid_1', 'op@test.com');
  beforeEach(() => {
    mockCustomersList.mockResolvedValue({ data: [] });
    mockSubscriptionsList.mockResolvedValue({ data: [] });
    mockSubscriptionsSearch.mockResolvedValue({ data: [] });
  });

  it("finds one under the operator's email first: list calls don't lag writes", async () => {
    mockCustomersList.mockResolvedValue({ data: [{ id: 'cus_old' }] });
    mockSubscriptionsList.mockResolvedValue({ data: [sub('sub_orphan', 'trialing')] });
    await expect(find()).resolves.toMatchObject({ id: 'sub_orphan' });
    expect(mockCustomersList).toHaveBeenCalledWith(expect.objectContaining({ email: 'op@test.com' }));
    expect(mockSubscriptionsList).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_old', status: 'all' }),
    );
    expect(mockSubscriptionsSearch).not.toHaveBeenCalled();
  });

  it('then searches by the userId every tier subscription carries, for another email', async () => {
    mockSubscriptionsSearch.mockResolvedValue({ data: [sub('sub_c', 'past_due')] });
    await expect(find()).resolves.toMatchObject({ id: 'sub_c' });
    expect(mockSubscriptionsSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "metadata['userId']:'uid_1'" }),
    );
  });

  it("ignores ended subscriptions and another operator's on the same email", async () => {
    mockCustomersList.mockResolvedValue({ data: [{ id: 'cus_1' }] });
    mockSubscriptionsList.mockResolvedValue({
      data: [sub('sub_a', 'canceled'), sub('sub_b', 'incomplete_expired'), sub('sub_x', 'active', 'uid_2')],
    });
    mockSubscriptionsSearch.mockResolvedValue({ data: [sub('sub_a', 'canceled')] });
    await expect(find()).resolves.toBeNull();
  });

  // Reactivate creates on the stored customer, whose email may not be the one
  // the account stores now; the search that would find it can lag.
  it('lists the stored customer too, without waiting on the search', async () => {
    mockSubscriptionsList.mockImplementation(async ({ customer }: { customer: string }) => ({
      data: customer === 'cus_stored' ? [sub('sub_r', 'active')] : [],
    }));
    await expect(
      findLiveSubscriptionForUser('uid_1', 'op@test.com', 'cus_stored'),
    ).resolves.toMatchObject({ id: 'sub_r' });
    expect(mockSubscriptionsSearch).not.toHaveBeenCalled();
  });

  it('refuses an id that could change the search query', async () => {
    await expect(findLiveSubscriptionForUser("x' OR status:'active", 'a@b.c')).rejects.toThrow(
      /unexpected user id/,
    );
    expect(mockSubscriptionsSearch).not.toHaveBeenCalled();
  });
});
