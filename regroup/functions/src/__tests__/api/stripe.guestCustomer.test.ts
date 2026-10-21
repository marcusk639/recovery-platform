// Account deletion acts on Stripe billing ids read from client-writable docs
// (guest docs; a user doc its owner can delete and recreate). Without an
// ownership check a user could plant a co-resident's or operator's ids and have
// deleteAccount delete their customer and saved card, or cancel their
// subscription. The only proof accepted is metadata.userId === the deleting
// uid; email is not proof (verifyUserEmail self-verifies without an inbox check).

const mockCustomersRetrieve = jest.fn();
const mockCustomersDel = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockSubscriptionsCancel = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    customers: {
      retrieve: (...args: unknown[]) => mockCustomersRetrieve(...args),
      del: (...args: unknown[]) => mockCustomersDel(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args),
      cancel: (...args: unknown[]) => mockSubscriptionsCancel(...args),
    },
  })),
);

import { logger } from 'firebase-functions';
import {
  BillingNotVerifiedError,
  closeOperatorBilling,
  deleteGuestCustomer,
} from '../../api/stripeDeletion';

const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

const UID = 'resident-uid';
const missing = () =>
  Object.assign(new Error('No such resource'), {
    type: 'StripeInvalidRequestError',
    code: 'resource_missing',
  });
const notOwned = (kind: string, id: string, reason: string) =>
  expect(error).toHaveBeenCalledWith('accountDeletion.stripe_not_owned', {
    kind,
    uid: UID,
    id,
    reason,
  });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  mockCustomersDel.mockResolvedValue({ deleted: true });
  mockSubscriptionsCancel.mockResolvedValue({ status: 'canceled' });
});

describe('deleteGuestCustomer', () => {
  it("deletes a customer whose metadata.userId is the account's uid", async () => {
    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_1', metadata: { userId: UID } });
    await deleteGuestCustomer(UID, 'cus_1');
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it.each([
    [
      'belongs to another user',
      { email: 'victim@example.com', metadata: { userId: 'victim-uid' } },
    ],
    ['has a matching email but no metadata', { email: 'res@example.com', metadata: {} }],
    ['has no metadata at all', { metadata: null }],
  ])('skips a customer that %s and logs it as an error with ids only', async (_label, customer) => {
    mockCustomersRetrieve.mockResolvedValue({ id: 'cus_victim', ...customer });
    await expect(deleteGuestCustomer(UID, 'cus_victim')).resolves.toBeUndefined();
    expect(mockCustomersDel).not.toHaveBeenCalled();
    notOwned('guest-customer', 'cus_victim', 'metadata-mismatch');
    expect(JSON.stringify(error.mock.calls)).not.toContain('example.com');
  });

  it('treats an already-deleted or missing customer as done', async () => {
    mockCustomersRetrieve.mockResolvedValueOnce({ id: 'cus_1', deleted: true });
    await deleteGuestCustomer(UID, 'cus_1');
    mockCustomersRetrieve.mockRejectedValueOnce(missing());
    await expect(deleteGuestCustomer(UID, 'cus_gone')).resolves.toBeUndefined();
    expect(mockCustomersDel).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('rethrows other retrieve failures so the step is retried', async () => {
    mockCustomersRetrieve.mockRejectedValueOnce(new Error('stripe down'));
    await expect(deleteGuestCustomer(UID, 'cus_1')).rejects.toThrow('stripe down');
    expect(mockCustomersDel).not.toHaveBeenCalled();
  });
});

describe('closeOperatorBilling', () => {
  const ownSub = (customer: unknown = 'cus_1') => ({
    id: 'sub_1',
    metadata: { userId: UID },
    customer,
  });

  it('cancels an owned subscription and deletes the customer it bills', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue(ownSub());
    await closeOperatorBilling(UID, 'sub_1', 'cus_1');
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_1');
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('accepts an expanded customer object on the subscription', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue(ownSub({ id: 'cus_1' }));
    await closeOperatorBilling(UID, 'sub_1', 'cus_1');
    expect(mockCustomersDel).toHaveBeenCalledWith('cus_1');
  });

  it('stops, neither cancelling nor deleting, for a subscription tied to someone else', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_victim',
      metadata: { userId: 'victim-uid' },
      customer: 'cus_victim',
    });
    await expect(closeOperatorBilling(UID, 'sub_victim', 'cus_victim')).rejects.toMatchObject({
      name: 'BillingNotVerifiedError',
      reason: 'metadata-mismatch',
      subscriptionId: 'sub_victim',
    });
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    expect(mockCustomersDel).not.toHaveBeenCalled();
    notOwned('operator-subscription', 'sub_victim', 'metadata-mismatch');
  });

  it('cancels the owned subscription but keeps a planted customer it does not bill', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue(ownSub('cus_1'));
    await closeOperatorBilling(UID, 'sub_1', 'cus_victim');
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_1');
    expect(mockCustomersDel).not.toHaveBeenCalled();
    notOwned('operator-customer', 'cus_victim', 'not-subscription-customer');
  });

  it('skips a customer stored with no subscription id', async () => {
    await closeOperatorBilling(UID, undefined, 'cus_1');
    expect(mockCustomersDel).not.toHaveBeenCalled();
    notOwned('operator-customer', 'cus_1', 'no-subscription');
  });

  it('stops for a stored subscription Stripe does not have (it may still bill elsewhere)', async () => {
    // A wrong or test-mode key also answers resource_missing for a live subscription.
    mockSubscriptionsRetrieve.mockRejectedValue(missing());
    const err = await closeOperatorBilling(UID, 'sub_gone', 'cus_1').catch((e) => e);
    expect(err).toBeInstanceOf(BillingNotVerifiedError);
    expect(err).toMatchObject({ reason: 'subscription-missing', subscriptionId: 'sub_gone' });
    expect(mockCustomersDel).not.toHaveBeenCalled();
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    notOwned('operator-subscription', 'sub_gone', 'subscription-missing');
  });

  it('does nothing when no billing ids are stored', async () => {
    await closeOperatorBilling(UID, undefined, undefined);
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('rethrows other retrieve failures so the step is retried', async () => {
    mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error('stripe down'));
    await expect(closeOperatorBilling(UID, 'sub_1', 'cus_1')).rejects.toThrow('stripe down');
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });
});
