/**
 * payments.ts callables against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration: a mapping mistake in the rewrite fails here instead of being
 * copied into an edited expectation. Pins the Cloud Function names and payloads,
 * Stripe amounts in cents.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import { failNext, getOpLog, resetOpLog, seedCall } from '../../../__mocks__/firebase-modular/log';
import { createRentPaymentIntent, listHousePayments, listPayments } from '../payments';

beforeEach(() => {
  resetOpLog();
});

describe('createRentPaymentIntent', () => {
  it('calls createPaymentIntent with the amount in cents and the given key', async () => {
    seedCall('createPaymentIntent', { clientSecret: 'pi_9_secret_x' });

    const result = await createRentPaymentIntent({
      guestId: 'g1',
      houseId: 'h1',
      amountInCents: 50000,
      description: 'Rent',
      idempotencyKey: 'key-1',
    });

    expect(result).toEqual({ clientSecret: 'pi_9_secret_x' });
    expect(getOpLog()).toEqual([
      {
        op: 'call',
        path: 'createPaymentIntent',
        data: {
          amount: 50000,
          guestId: 'g1',
          houseId: 'h1',
          description: 'Rent',
          idempotencyKey: 'key-1',
        },
      },
    ]);
  });

  it('derives the idempotency key from guest, house, UTC day and amount', async () => {
    await createRentPaymentIntent({ guestId: 'g1', houseId: 'h1', amountInCents: 12345 });

    expect(getOpLog()[0].data).toEqual(
      expect.objectContaining({
        amount: 12345,
        idempotencyKey: expect.stringMatching(/^g1-h1-\d{4}-\d{2}-\d{2}-12345$/),
      }),
    );
  });

  it('refuses an amount above the maximum without calling the server', async () => {
    await expect(
      createRentPaymentIntent({ guestId: 'g1', houseId: 'h1', amountInCents: 10000001 }),
    ).rejects.toThrow('exceeds maximum');

    expect(getOpLog()).toEqual([]);
  });

  it('passes a server failure through', async () => {
    failNext('call', new Error('internal'), 'createPaymentIntent');

    await expect(
      createRentPaymentIntent({ guestId: 'g1', houseId: 'h1', amountInCents: 100 }),
    ).rejects.toThrow('internal');
  });
});

describe('listPayments / listHousePayments', () => {
  it('converts the callable dollars to cents for the guest list', async () => {
    seedCall('listPayments', { payments: [{ id: 'x', amount: 500, status: 'succeeded' }] });

    const payments = await listPayments('g1', 'h1');

    expect(payments).toEqual([{ id: 'x', amount: 50000, status: 'succeeded' }]);
    expect(getOpLog()).toEqual([
      { op: 'call', path: 'listPayments', data: { guestId: 'g1', houseId: 'h1', limit: 20 } },
    ]);
  });

  it('converts the callable dollars to cents for the house list', async () => {
    seedCall('listHousePayments', { payments: [{ id: 'y', amount: 12.34, guestId: 'g1' }] });

    const payments = await listHousePayments('h1', 50);

    expect(payments).toEqual([{ id: 'y', amount: 1234, guestId: 'g1' }]);
    expect(getOpLog()).toEqual([
      { op: 'call', path: 'listHousePayments', data: { houseId: 'h1', limit: 50 } },
    ]);
  });
});
