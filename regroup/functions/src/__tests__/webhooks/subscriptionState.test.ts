const mockTxGet = jest.fn();
const mockTxUpdate = jest.fn();
const mockDoc = jest.fn((id: string) => ({ path: `users/${id}` }));

jest.mock('firebase-admin', () => ({
  firestore: () => ({
    collection: () => ({ doc: mockDoc }),
    runTransaction: (fn: (tx: unknown) => unknown) => fn({ get: mockTxGet, update: mockTxUpdate }),
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn() },
}));

import type Stripe from 'stripe';
import { operatorStatusFromStripe, syncOperatorStatus } from '../../webhooks/subscriptionState';

const sub = (fields: Record<string, unknown>) =>
  ({ id: 'sub_1', items: { data: [] }, ...fields }) as unknown as Stripe.Subscription;

const operatorOn = (subscriptionId: string) =>
  mockTxGet.mockResolvedValue({ data: () => ({ subscriptionMetadata: { subscriptionId } }) });

describe('operatorStatusFromStripe', () => {
  it('a trial set to cancel at period end is cancelling', () => {
    expect(operatorStatusFromStripe(sub({ status: 'trialing', cancel_at_period_end: true }))).toBe(
      'cancelling',
    );
  });

  it('an active subscription not set to cancel is active', () => {
    expect(operatorStatusFromStripe(sub({ status: 'active', cancel_at_period_end: false }))).toBe(
      'active',
    );
  });

  it('a past-due subscription set to cancel stays past_due', () => {
    expect(operatorStatusFromStripe(sub({ status: 'past_due', cancel_at_period_end: true }))).toBe(
      'past_due',
    );
  });

  it("a status houses don't know is recorded as Stripe has it", () => {
    expect(operatorStatusFromStripe(sub({ status: 'incomplete' }))).toBe('incomplete');
  });
});

describe('syncOperatorStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it("writes Stripe's status and the period end to the operator's record", async () => {
    operatorOn('sub_1');
    const fresh = sub({
      status: 'canceled',
      items: { data: [{ id: 'si_1', current_period_end: 1767225600 }] },
    });

    await expect(syncOperatorStatus('uid_1', fresh)).resolves.toBe('updated');

    expect(mockTxUpdate).toHaveBeenCalledWith(
      { path: 'users/uid_1' },
      expect.objectContaining({
        'subscriptionMetadata.status': 'canceled',
        'subscriptionMetadata.currentPeriodEnd': 1767225600000,
        'subscriptionMetadata.lastUpdatedAt': expect.any(String),
      }),
    );
  });

  it('leaves the operator alone when the event is for another subscription', async () => {
    operatorOn('sub_2');

    await expect(syncOperatorStatus('uid_1', sub({ status: 'canceled' }))).resolves.toBe(
      'other subscription',
    );

    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it('leaves the stored period end alone when Stripe gives none', async () => {
    operatorOn('sub_1');

    await syncOperatorStatus('uid_1', sub({ status: 'active', items: { data: [{ id: 'si_1' }] } }));

    expect(mockTxUpdate.mock.calls[0][1]).not.toHaveProperty(
      'subscriptionMetadata.currentPeriodEnd',
    );
  });
});
