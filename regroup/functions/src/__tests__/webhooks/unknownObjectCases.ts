/**
 * Event fixtures for unknownObjects.test.ts, split out to keep both files under
 * the 300-line cap. Handlers and the charges.retrieve mock are injected because
 * the test file owns the jest.mock wiring.
 */
export type Handler = (req: unknown, res: unknown) => Promise<void>;

/** Stripe's own answer for an id it has no record of. */
export const resourceMissing = () =>
  Object.assign(new Error('No such charge'), {
    type: 'StripeInvalidRequestError',
    code: 'resource_missing',
  });

export const noTransferCharge = {
  id: 'ch_unknown',
  amount: 5000,
  payment_intent: 'pi_unknown',
  transfer: null,
  metadata: {},
};

export interface Case {
  name: string;
  handler: Handler;
  event: Record<string, unknown>;
  /** Collections the handler is known to write for this event. */
  mayWrite?: string[];
  arrange?: () => void;
  /** The Stripe charge lookup answers resource_missing. */
  missingCharge?: boolean;
}

export const evt = (type: string, object: Record<string, unknown>, extra = {}) => ({
  id: 'evt_unknown_1',
  type,
  data: { object },
  ...extra,
});

const subInvoice = {
  id: 'in_unknown',
  attempt_count: 1,
  parent: {
    type: 'subscription_details',
    subscription_details: { subscription: 'sub_unknown' },
  },
};

export function buildCases(
  platform: Handler,
  connect: Handler,
  mockChargesRetrieve: jest.Mock,
): Case[] {
  return [
    {
      name: 'payment_intent.succeeded with no metadata',
      handler: platform,
      event: evt('payment_intent.succeeded', {
        id: 'pi_unknown',
        amount: 5000,
        currency: 'usd',
        metadata: {},
      }),
      mayWrite: ['payments'],
    },
    {
      name: 'payment_intent.succeeded for a guest that does not exist',
      handler: platform,
      event: evt('payment_intent.succeeded', {
        id: 'pi_unknown',
        amount: 5000,
        currency: 'usd',
        metadata: { guestId: 'g_unknown', houseId: 'h_unknown' },
      }),
      mayWrite: ['payments'],
    },
    {
      name: 'payment_intent.payment_failed for a guest that does not exist',
      handler: platform,
      event: evt('payment_intent.payment_failed', {
        id: 'pi_unknown',
        amount: 5000,
        currency: 'usd',
        metadata: { guestId: 'g_unknown', houseId: 'h_unknown' },
        last_payment_error: { code: 'card_declined', message: 'declined' },
      }),
      mayWrite: ['payments'],
    },
    {
      name: 'payment_intent.payment_failed with no metadata',
      handler: platform,
      event: evt('payment_intent.payment_failed', {
        id: 'pi_unknown',
        amount: 5000,
        currency: 'usd',
        metadata: {},
      }),
      mayWrite: ['payments'],
    },
    {
      name: 'charge.dispute.created for a charge with no house transfer',
      handler: platform,
      event: evt('charge.dispute.created', {
        id: 'dp_unknown',
        charge: 'ch_unknown',
        amount: 5000,
        status: 'needs_response',
      }),
      mayWrite: ['payments'],
      arrange: () => mockChargesRetrieve.mockResolvedValue(noTransferCharge),
    },
    {
      name: 'charge.dispute.created for a charge Stripe cannot find',
      handler: platform,
      event: evt('charge.dispute.created', {
        id: 'dp_unknown',
        charge: 'ch_unknown',
        amount: 5000,
        status: 'needs_response',
      }),
      arrange: () => mockChargesRetrieve.mockRejectedValue(resourceMissing()),
      missingCharge: true,
    },
    {
      name: 'charge.refunded for an unknown payment intent',
      handler: platform,
      event: evt('charge.refunded', { ...noTransferCharge, amount_refunded: 500 }),
      mayWrite: ['payments'],
      arrange: () => mockChargesRetrieve.mockResolvedValue(noTransferCharge),
    },
    {
      name: 'charge.refunded for a charge Stripe cannot find',
      handler: platform,
      event: evt('charge.refunded', { ...noTransferCharge, amount_refunded: 500 }),
      mayWrite: ['payments'],
      arrange: () => mockChargesRetrieve.mockRejectedValue(resourceMissing()),
      missingCharge: true,
    },
    {
      name: 'charge.refund.updated for a charge Stripe cannot find',
      handler: platform,
      event: evt('charge.refund.updated', { id: 're_unknown', charge: 'ch_unknown' }),
      arrange: () => mockChargesRetrieve.mockRejectedValue(resourceMissing()),
      missingCharge: true,
    },
    {
      name: 'charge.dispute.closed (won) for a charge Stripe cannot find',
      handler: platform,
      event: evt('charge.dispute.closed', {
        id: 'dp_unknown',
        charge: 'ch_unknown',
        status: 'won',
      }),
      arrange: () => mockChargesRetrieve.mockRejectedValue(resourceMissing()),
      missingCharge: true,
    },
    {
      name: 'invoice.payment_succeeded for an unknown subscription',
      handler: platform,
      event: evt('invoice.payment_succeeded', subInvoice),
    },
    {
      name: 'invoice.payment_failed for an unknown subscription',
      handler: platform,
      event: evt('invoice.payment_failed', subInvoice),
    },
    {
      name: 'customer.subscription.deleted for an unknown subscription',
      handler: platform,
      event: evt('customer.subscription.deleted', { id: 'sub_unknown' }),
    },
    {
      name: 'customer.subscription.updated for an unknown subscription',
      handler: platform,
      event: evt('customer.subscription.updated', { id: 'sub_unknown' }),
    },
    {
      name: 'account.updated (platform endpoint) for an unknown account',
      handler: platform,
      event: evt('account.updated', { id: 'acct_unknown' }),
    },
    {
      name: 'payout.failed (platform endpoint) for an unknown account',
      handler: platform,
      event: evt('payout.failed', { id: 'po_unknown', amount: 1000 }, { account: 'acct_unknown' }),
    },
    {
      name: 'account.updated (Connect endpoint) for an unknown account',
      handler: connect,
      event: evt('account.updated', { id: 'acct_unknown' }),
    },
    {
      name: 'account.application.deauthorized (Connect) for an unknown account',
      handler: connect,
      event: evt(
        'account.application.deauthorized',
        { id: 'ca_unknown' },
        { account: 'acct_unknown' },
      ),
    },
  ];
}
