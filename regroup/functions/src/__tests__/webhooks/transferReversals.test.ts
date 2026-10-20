// src/__tests__/webhooks/transferReversals.test.ts
//
// Rent is a destination charge: the house's Connect account receives the full
// charge as a transfer and the platform takes its application fee back. A
// refund or a dispute is debited from the PLATFORM, so unless the transfer is
// reversed the house keeps money it didn't earn and the platform eats the loss.
//
// Decisions under test: the house gives back only its net share (charge minus
// the platform fee, pro rata); disputed rent is pulled when the dispute takes
// the money and returned if the dispute is won; every reversal is recorded on
// Stripe (metadata) so a later event can't reverse the same refund twice.

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type Stripe from 'stripe';
import {
  houseNetShare,
  restoreTransferAfterWonDispute,
  reverseTransferForDispute,
  reverseTransfersForRefunds,
} from '../../webhooks/transferReversals';

const CHARGE_AMOUNT = 50000; // $500 rent
const APP_FEE = 1500; // $15 platform fee → the house netted $485

interface FakeState {
  charge: Record<string, unknown>;
  transfer: { id: string; amount: number; amount_reversed: number; destination: string };
  refunds: Array<Record<string, unknown>>;
  reversals: Array<{
    id: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }>;
  restoreTransfers: Array<Record<string, unknown>>;
}

function fakeStripe(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    charge: {
      id: 'ch_1',
      amount: CHARGE_AMOUNT,
      application_fee_amount: APP_FEE,
      transfer: 'tr_1',
      currency: 'usd',
    },
    transfer: { id: 'tr_1', amount: CHARGE_AMOUNT, amount_reversed: 0, destination: 'acct_house' },
    refunds: [],
    reversals: [],
    restoreTransfers: [],
    ...overrides,
  };

  const createReversal = jest.fn(
    async (_tr: string, params: { amount: number; metadata: Record<string, string> }) => {
      const reversal = {
        id: `trr_${state.reversals.length + 1}`,
        amount: params.amount,
        currency: 'usd',
        metadata: params.metadata,
      };
      state.reversals.push(reversal);
      state.transfer.amount_reversed += params.amount;
      return reversal;
    },
  );
  const createTransfer = jest.fn(async (params: Record<string, unknown>) => {
    state.restoreTransfers.push(params);
    return { id: 'tr_restore', ...params };
  });

  const stripe = {
    charges: { retrieve: jest.fn(async () => state.charge) },
    refunds: { list: jest.fn(async () => ({ data: state.refunds })) },
    transfers: {
      retrieve: jest.fn(async () => ({ ...state.transfer })),
      createReversal,
      listReversals: jest.fn(async () => ({ data: state.reversals })),
      create: createTransfer,
      list: jest.fn(async (params: { transfer_group?: string }) => ({
        data: state.restoreTransfers.filter((t) => t.transfer_group === params.transfer_group),
      })),
    },
  } as unknown as Stripe;

  return { stripe, state, createReversal, createTransfer };
}

const refund = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id,
  amount,
  status: 'succeeded',
  transfer_reversal: null,
  ...extra,
});

const dispute = (status: string, amount = CHARGE_AMOUNT) =>
  ({ id: 'dp_1', charge: 'ch_1', amount, status }) as unknown as Stripe.Dispute;

describe('houseNetShare', () => {
  it('is the refunded amount scaled by what the house actually netted', () => {
    expect(
      houseNetShare(CHARGE_AMOUNT, { amount: CHARGE_AMOUNT, application_fee_amount: APP_FEE }),
    ).toBe(48500);
    expect(houseNetShare(10000, { amount: CHARGE_AMOUNT, application_fee_amount: APP_FEE })).toBe(
      9700,
    );
  });

  it('is the whole amount when there was no platform fee', () => {
    expect(houseNetShare(10000, { amount: CHARGE_AMOUNT, application_fee_amount: null })).toBe(
      10000,
    );
  });

  it('is zero for a zero or invalid amount rather than a negative reversal', () => {
    expect(houseNetShare(0, { amount: CHARGE_AMOUNT, application_fee_amount: APP_FEE })).toBe(0);
    expect(houseNetShare(100, { amount: 0, application_fee_amount: 0 })).toBe(0);
  });
});

describe('reverseTransfersForRefunds', () => {
  it("reverses the house's net share of a full refund", async () => {
    const { stripe, createReversal } = fakeStripe({ refunds: [refund('re_1', CHARGE_AMOUNT)] });

    await reverseTransfersForRefunds(stripe, 'ch_1');

    expect(createReversal).toHaveBeenCalledWith(
      'tr_1',
      expect.objectContaining({
        amount: 48500,
        metadata: expect.objectContaining({ refundId: 're_1' }),
      }),
      { idempotencyKey: 'refund-reversal-re_1' },
    );
  });

  it('reverses a partial refund pro rata', async () => {
    const { stripe, createReversal } = fakeStripe({ refunds: [refund('re_1', 10000)] });

    await reverseTransfersForRefunds(stripe, 'ch_1');

    expect(createReversal).toHaveBeenCalledWith(
      'tr_1',
      expect.objectContaining({ amount: 9700 }),
      expect.anything(),
    );
  });

  it('never reverses the same refund twice, however many refund events arrive', async () => {
    // Stripe idempotency keys expire after 24h; a second refund on the same
    // charge weeks later re-scans the first. The reversal's metadata is the
    // durable record.
    const f = fakeStripe({ refunds: [refund('re_1', 10000)] });
    await reverseTransfersForRefunds(f.stripe, 'ch_1');

    f.state.refunds.push(refund('re_2', 5000));
    await reverseTransfersForRefunds(f.stripe, 'ch_1');

    expect(f.createReversal).toHaveBeenCalledTimes(2);
    expect(f.state.reversals.map((r) => r.metadata.refundId)).toEqual(['re_1', 're_2']);
  });

  it('skips a refund that already reversed its transfer (refunded with reverse_transfer)', async () => {
    const { stripe, createReversal } = fakeStripe({
      refunds: [refund('re_1', 10000, { transfer_reversal: 'trr_from_dashboard' })],
    });

    await reverseTransfersForRefunds(stripe, 'ch_1');

    expect(createReversal).not.toHaveBeenCalled();
  });

  it.each(['pending', 'failed', 'canceled'])('waits for a %s refund to succeed', async (status) => {
    const { stripe, createReversal } = fakeStripe({ refunds: [refund('re_1', 10000, { status })] });

    await reverseTransfersForRefunds(stripe, 'ch_1');

    expect(createReversal).not.toHaveBeenCalled();
  });

  it('does nothing for a charge that was never transferred to a house', async () => {
    const { stripe, createReversal } = fakeStripe({
      charge: { id: 'ch_1', amount: CHARGE_AMOUNT, application_fee_amount: null, transfer: null },
      refunds: [refund('re_1', 10000)],
    });

    await reverseTransfersForRefunds(stripe, 'ch_1');

    expect(createReversal).not.toHaveBeenCalled();
  });

  it('never reverses more than is left on the transfer', async () => {
    const f = fakeStripe({ refunds: [refund('re_1', CHARGE_AMOUNT)] });
    f.state.transfer.amount_reversed = 45000; // e.g. a dispute already pulled most of it

    await reverseTransfersForRefunds(f.stripe, 'ch_1');

    expect(f.createReversal).toHaveBeenCalledWith(
      'tr_1',
      expect.objectContaining({ amount: 5000 }),
      expect.anything(),
    );
  });
});

describe('reverseTransferForDispute', () => {
  it.each(['needs_response', 'under_review', 'lost'])(
    "pulls the house's net share when a dispute (%s) takes the money",
    async (status) => {
      const { stripe, createReversal } = fakeStripe();

      await reverseTransferForDispute(stripe, dispute(status));

      expect(createReversal).toHaveBeenCalledWith(
        'tr_1',
        expect.objectContaining({
          amount: 48500,
          metadata: expect.objectContaining({ disputeId: 'dp_1' }),
        }),
        { idempotencyKey: 'dispute-reversal-dp_1' },
      );
    },
  );

  it.each(['warning_needs_response', 'warning_under_review', 'warning_closed', 'prevented', 'won'])(
    'leaves the house alone for a %s dispute, which takes no money from the platform',
    async (status) => {
      const { stripe, createReversal } = fakeStripe();

      await reverseTransferForDispute(stripe, dispute(status));

      expect(createReversal).not.toHaveBeenCalled();
    },
  );

  it('reverses a dispute only once', async () => {
    const f = fakeStripe();
    await reverseTransferForDispute(f.stripe, dispute('needs_response'));
    await reverseTransferForDispute(f.stripe, dispute('under_review'));

    expect(f.createReversal).toHaveBeenCalledTimes(1);
  });
});

describe('restoreTransferAfterWonDispute', () => {
  it('returns exactly what the dispute reversal took, to the same house', async () => {
    const f = fakeStripe();
    await reverseTransferForDispute(f.stripe, dispute('needs_response'));

    await restoreTransferAfterWonDispute(f.stripe, dispute('won'));

    expect(f.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 48500,
        currency: 'usd',
        destination: 'acct_house',
        transfer_group: 'dispute-restore-dp_1',
      }),
      { idempotencyKey: 'dispute-restore-dp_1' },
    );
  });

  it('restores only once', async () => {
    const f = fakeStripe();
    await reverseTransferForDispute(f.stripe, dispute('needs_response'));

    await restoreTransferAfterWonDispute(f.stripe, dispute('won'));
    await restoreTransferAfterWonDispute(f.stripe, dispute('won'));

    expect(f.createTransfer).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a lost dispute', async () => {
    const f = fakeStripe();
    await reverseTransferForDispute(f.stripe, dispute('needs_response'));

    await restoreTransferAfterWonDispute(f.stripe, dispute('lost'));

    expect(f.createTransfer).not.toHaveBeenCalled();
  });

  it('does nothing when no reversal was ever made for the dispute', async () => {
    const f = fakeStripe();

    await restoreTransferAfterWonDispute(f.stripe, dispute('won'));

    expect(f.createTransfer).not.toHaveBeenCalled();
  });
});
