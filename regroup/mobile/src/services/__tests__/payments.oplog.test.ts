/**
 * payments.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration: a mapping mistake in the rewrite fails here instead of being
 * copied into an edited expectation. Assertions are on outcomes and log
 * entries only, never on mock call chains or snapshot shapes.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  getPaymentHistory,
  markPaymentResolvedOffline,
  recordManualPayment,
  recordRentPayment,
} from '../payments';

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

beforeEach(() => {
  resetOpLog();
});

describe('recordRentPayment', () => {
  it('leaves a record the webhook already moved past pending untouched', async () => {
    const settled = {
      id: 'pi_1',
      guestId: 'g1',
      houseId: 'h1',
      amount: 50000,
      status: 'succeeded',
      createdAt: '2026-01-01T00:00:00.000Z',
      receiptUrl: 'https://receipt',
    };
    seedDoc('payments/pi_1', settled);

    const result = await recordRentPayment('g1', 'h1', 50000, 'Rent Payment', 'pi_1');

    expect(result).toEqual(settled);
    expect(getOpLog()).toEqual([{ op: 'tx.get', path: 'payments/pi_1' }]);
    expect(readDoc('payments/pi_1')).toEqual(settled);
  });

  it('writes a new pending record at payments/{paymentIntentId} with merge', async () => {
    const result = await recordRentPayment('g1', 'h1', 50000, 'Monthly Rent', 'pi_2');

    const payment = {
      id: 'pi_2',
      guestId: 'g1',
      houseId: 'h1',
      amount: 50000,
      status: 'pending',
      createdAt: ISO,
      description: 'Monthly Rent',
      stripePaymentIntentId: 'pi_2',
    };
    expect(result).toEqual(payment);
    expect(getOpLog()).toEqual([
      { op: 'tx.get', path: 'payments/pi_2' },
      { op: 'tx.set', path: 'payments/pi_2', data: payment, options: { merge: true } },
    ]);
  });

  it('keeps createdAt of an existing pending record and keeps its other fields', async () => {
    seedDoc('payments/pi_3', {
      status: 'pending',
      createdAt: '2026-02-02T00:00:00.000Z',
      receiptUrl: 'https://receipt',
    });

    const result = await recordRentPayment('g1', 'h1', 25000, 'Rent Payment', 'pi_3');

    expect(result.createdAt).toBe('2026-02-02T00:00:00.000Z');
    const [, write] = getOpLog();
    expect(write).toEqual({
      op: 'tx.set',
      path: 'payments/pi_3',
      data: expect.objectContaining({ createdAt: '2026-02-02T00:00:00.000Z', amount: 25000 }),
      options: { merge: true },
    });
    expect(readDoc('payments/pi_3')).toEqual(
      expect.objectContaining({ receiptUrl: 'https://receipt', status: 'pending', amount: 25000 }),
    );
  });

  it('uses a generated id when there is no payment intent id', async () => {
    const result = await recordRentPayment('g1', 'h1', 50000);

    expect(result.id).toBe('auto-1');
    expect(result.description).toBe('Rent Payment');
    expect(getOpLog().map((e) => [e.op, e.path])).toEqual([
      ['tx.get', 'payments/auto-1'],
      ['tx.set', 'payments/auto-1'],
    ]);
  });
});

describe('recordManualPayment', () => {
  it('writes the payment and decrements rentOwed in one batch', async () => {
    seedDoc('guests/g1', { rentOwed: 120000 });

    const result = await recordManualPayment('g1', 'h1', 50000, 'Cash', 'paid at the house');

    const record = {
      id: 'auto-1',
      guestId: 'g1',
      houseId: 'h1',
      amount: 50000,
      currency: 'usd',
      status: 'succeeded',
      description: 'Manual Payment — Cash: paid at the house',
      createdAt: ISO,
    };
    expect(result).toEqual(record);
    expect(getOpLog()).toEqual([
      { op: 'batch.set', path: 'payments/auto-1', data: record },
      {
        op: 'batch.update',
        path: 'guests/g1',
        data: { rentOwed: { __fv: 'increment', n: -50000 } },
      },
      { op: 'batch.commit', path: '' },
    ]);
    expect(readDoc('guests/g1')).toEqual({ rentOwed: 70000 });
  });

  it('omits the notes suffix when there are no notes', async () => {
    seedDoc('guests/g1', { rentOwed: 0 });

    const result = await recordManualPayment('g1', 'h1', 100, 'Zelle');

    expect(result.description).toBe('Manual Payment — Zelle');
  });

  it('writes nothing when the batch fails', async () => {
    seedDoc('guests/g1', { rentOwed: 120000 });
    failNext('batch.commit', new Error('unavailable'));

    await expect(recordManualPayment('g1', 'h1', 50000, 'Check')).rejects.toThrow('unavailable');

    expect(readDoc('payments/auto-1')).toBeUndefined();
    expect(readDoc('guests/g1')).toEqual({ rentOwed: 120000 });
  });

  it('refuses a non-integer or non-positive amount without touching Firestore', async () => {
    await expect(recordManualPayment('g1', 'h1', 10.5, 'Cash')).rejects.toThrow(
      'Invalid payment amount',
    );
    await expect(recordManualPayment('g1', 'h1', 0, 'Cash')).rejects.toThrow(
      'Invalid payment amount',
    );

    expect(getOpLog()).toEqual([]);
  });
});

describe('markPaymentResolvedOffline', () => {
  it('updates only status and resolvedAt', async () => {
    seedDoc('payments/p1', { status: 'failed', amount: 50000 });

    await markPaymentResolvedOffline('p1');

    expect(getOpLog()).toEqual([
      { op: 'update', path: 'payments/p1', data: { status: 'resolved_offline', resolvedAt: ISO } },
    ]);
    expect(readDoc('payments/p1')).toEqual(
      expect.objectContaining({ status: 'resolved_offline', amount: 50000 }),
    );
  });
});

describe('getPaymentHistory', () => {
  it("queries the guest's payments newest first with the limit", async () => {
    seedQuery('payments', [
      { id: 'a', guestId: 'g1', createdAt: '2026-01-01T00:00:00.000Z', amount: 1 },
      { id: 'b', guestId: 'g1', createdAt: '2026-03-01T00:00:00.000Z', amount: 2 },
      { id: 'c', guestId: 'g2', createdAt: '2026-04-01T00:00:00.000Z', amount: 3 },
    ]);

    const history = await getPaymentHistory('g1', 5);

    expect(history.map((p) => p.amount)).toEqual([2, 1]);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'payments',
        constraints: [
          ['where', 'guestId', '==', 'g1'],
          ['orderBy', 'createdAt', 'desc'],
          ['limit', 5],
        ],
      },
    ]);
  });

  it('returns an empty list when there are none', async () => {
    expect(await getPaymentHistory('nobody')).toEqual([]);
    expect(getOpLog()[0].constraints).toEqual([
      ['where', 'guestId', '==', 'nobody'],
      ['orderBy', 'createdAt', 'desc'],
      ['limit', 100],
    ]);
  });
});
