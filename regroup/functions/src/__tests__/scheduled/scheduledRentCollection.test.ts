import { runRentCollection } from '../../scheduled/scheduledRentCollection';

const mockCreatePaymentIntent = jest.fn();
const mockPaymentMethodsRetrieve = jest.fn();

// Houses by id. Autopay sends each guest's rent to their house's Connect
// account, read from the house document — never from the guest.
const mockHouses: Record<string, Record<string, unknown> | undefined> = {};
const mockHouseGet = jest.fn(async (id: string) => ({
  exists: mockHouses[id] !== undefined,
  data: () => mockHouses[id],
}));

jest.mock('../../api/firestore', () => ({
  guestCollection: {
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: false,
      size: 2,
      docs: [
        {
          id: 'guest-1',
          data: () => ({
            houseId: 'house-1',
            stripeCustomerId: 'cus_test1',
            defaultPaymentMethodId: 'pm_test1',
            autoPayEnabled: true,
            rentOwed: 500,
          }),
        },
        {
          id: 'guest-2',
          data: () => ({
            houseId: 'house-1',
            stripeCustomerId: 'cus_test2',
            defaultPaymentMethodId: 'pm_test2',
            autoPayEnabled: true,
            rentOwed: 750,
          }),
        },
      ],
    }),
  },
  // Stateless stub: no prior attempt exists, and claiming a period always
  // succeeds. The repeat-charge guard itself is covered in
  // rentCollectionRepeatCharge.test.ts with a stateful store.
  rentCollectionAttemptCollection: {
    where: () => {
      const empty = { empty: true, size: 0, docs: [] };
      // Mirrors the Query surface runRentCollection uses: get(),
      // count().get(), and select(...).limit(n).get().
      const q: any = {
        get: jest.fn().mockResolvedValue(empty),
        select: () => q,
        limit: () => q,
        count: () => ({
          get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
        }),
      };
      return q;
    },
    doc: (id?: string) => ({
      id: id ?? 'auto-id',
      create: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    }),
  },
  // Required lazily: this factory runs while the module under test is still
  // importing, before a top-level import of the helper has initialized.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  paymentsCollection: require('./helpers/fakeApiFirestore').fakeEmptyCollection(),
  houseCollection: {
    doc: (id: string) => ({ get: () => mockHouseGet(id) }),
  },
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: { create: mockCreatePaymentIntent },
    paymentMethods: { retrieve: mockPaymentMethodsRetrieve },
  }));
});

// Mock config to provide secret name + the rent-fee model used by the helper.
jest.mock('../../config', () => ({
  STRIPE_SECRET_KEY: { name: 'STRIPE_SECRET_KEY' },
  LEGACY_RENT_FEE_HOUSE_IDS: [],
  RENT_FEE: {
    achFlatCents: 200,
    achRate: 0,
    achCapCents: 300,
    cardPlatformRate: 0.0075,
    legacyRate: 0.02,
    // Mirrors the production defaults; the fee is margin + recovered Stripe cost.
    stripeCardRate: 0.029,
    stripeCardFixedCents: 30,
    stripeAchRate: 0.008,
    stripeAchCapCents: 500,
  },
}));

describe('runRentCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    for (const id of Object.keys(mockHouses)) delete mockHouses[id];
    mockHouses['house-1'] = { stripeAccountId: 'acct_house1', stripeStatus: 'active' };
  });

  describe('where the rent goes', () => {
    // The default guests carry no stripeConnectId, exactly like production:
    // nothing in the app writes that field. Autopay used to read the
    // destination from it, so every charge settled in the platform balance
    // and no house was ever paid.
    it("sends every autopay charge to the house's Connect account with the platform fee", async () => {
      mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
      mockPaymentMethodsRetrieve.mockResolvedValue({ type: 'card' });

      await runRentCollection();

      expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
      for (const [params] of mockCreatePaymentIntent.mock.calls) {
        expect(params.transfer_data).toEqual({ destination: 'acct_house1' });
        expect(params.application_fee_amount).toEqual(expect.any(Number));
      }
    });

    it('ignores a destination stored on the guest and uses the house', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { guestCollection } = require('../../api/firestore');
      guestCollection.get.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [
          {
            id: 'guest-stray',
            data: () => ({
              houseId: 'house-1',
              stripeCustomerId: 'cus_s',
              defaultPaymentMethodId: 'pm_s',
              stripeConnectId: 'acct_somewhere_else',
              autoPayEnabled: true,
              rentOwed: 500,
            }),
          },
        ],
      });
      mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_s', status: 'succeeded' });

      await runRentCollection();

      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ transfer_data: { destination: 'acct_house1' } }),
        expect.anything(),
      );
    });

    it.each([
      ['is still onboarding', { stripeAccountId: 'acct_house1', stripeStatus: 'pending' }],
      ['is restricted', { stripeAccountId: 'acct_house1', stripeStatus: 'restricted' }],
      ['is disconnected', { stripeStatus: 'disconnected' }],
      ['has no Stripe account', { stripeStatus: 'not_connected' }],
      ['does not exist', undefined],
      ['is marked active but has no account id', { stripeStatus: 'active' }],
    ])('does not charge when the house %s', async (_label, house) => {
      // Charging without a destination would keep the resident's rent in the
      // platform balance. Skipping leaves the balance owed and visible, and the
      // next run charges it once the house can receive transfers.
      mockHouses['house-1'] = house as Record<string, unknown> | undefined;

      const summary = await runRentCollection();

      expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
      expect(summary.notChargedHouseNotReadyCount).toBe(2);
      expect(summary.failureCount).toBe(0);
    });

    it('reads each house once per run, however many of its guests are due', async () => {
      mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });

      await runRentCollection();

      expect(mockHouseGet).toHaveBeenCalledTimes(1);
      expect(mockHouseGet).toHaveBeenCalledWith('house-1');
    });

    it('fails the charge, without charging, when the house cannot be read', async () => {
      // A transient read failure is not "house not ready": it must surface as
      // a failure so Cloud Scheduler records it, rather than look like a skip.
      mockHouseGet.mockRejectedValueOnce(new Error('UNAVAILABLE'));

      const summary = await runRentCollection();

      expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
      expect(summary.failureCount).toBe(2);
      expect(summary.notChargedHouseNotReadyCount).toBe(0);
    });
  });

  it('creates a PaymentIntent for each auto-pay guest with balance', async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_test',
      status: 'succeeded',
    });

    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: expect.any(Number),
        currency: 'usd',
        confirm: true,
        off_session: true,
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('auto-rent-guest-1'),
      }),
    );
  });

  it('continues processing when one payment fails', async () => {
    mockCreatePaymentIntent
      .mockRejectedValueOnce(new Error('card_declined'))
      .mockResolvedValueOnce({ id: 'pi_test2', status: 'succeeded' });

    await expect(runRentCollection()).resolves.not.toThrow();
    expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
  });

  it('rounds a non-integer rentOwed before charging (H-fns-1)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { guestCollection } = require('../../api/firestore');
    guestCollection.get.mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [
        {
          id: 'guest-float',
          data: () => ({
            houseId: 'house-1',
            stripeCustomerId: 'cus_float',
            defaultPaymentMethodId: 'pm_float',
            autoPayEnabled: true,
            rentOwed: 149.5, // stray non-integer cents — Stripe would reject as-is
          }),
        },
      ],
    });
    mockCreatePaymentIntent.mockResolvedValue({ id: 'pi_f', status: 'succeeded' });

    await runRentCollection();

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 150 }),
      expect.anything(),
    );
  });

  describe('method-aware Connect application fee', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { guestCollection } = require('../../api/firestore');

    const seedConnectGuest = (overrides: Record<string, unknown>) => {
      guestCollection.get.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [
          {
            id: 'guest-c',
            data: () => ({
              houseId: 'house-1',
              stripeCustomerId: 'cus_c',
              defaultPaymentMethodId: 'pm_c',
              autoPayEnabled: true,
              rentOwed: 10000, // $100.00
              ...overrides,
            }),
          },
        ],
      });
    };

    it('charges the card margin plus recovered Stripe cost when the default method is a card', async () => {
      seedConnectGuest({});
      mockPaymentMethodsRetrieve.mockResolvedValue({ type: 'card' });
      mockCreatePaymentIntent.mockResolvedValue({
        id: 'pi_c',
        status: 'succeeded',
      });

      await runRentCollection();

      expect(mockPaymentMethodsRetrieve).toHaveBeenCalledWith('pm_c');
      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          application_fee_amount: 395, // margin 75 + Stripe (290 + 30)
          transfer_data: { destination: 'acct_house1' },
        }),
        expect.anything(),
      );
    });

    it('charges the ACH margin plus recovered Stripe cost when the default method is a bank account', async () => {
      seedConnectGuest({});
      mockPaymentMethodsRetrieve.mockResolvedValue({ type: 'us_bank_account' });
      mockCreatePaymentIntent.mockResolvedValue({
        id: 'pi_c',
        status: 'succeeded',
      });

      await runRentCollection();

      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ application_fee_amount: 280 }), // margin 200 + Stripe 80
        expect.anything(),
      );
    });
  });
});
