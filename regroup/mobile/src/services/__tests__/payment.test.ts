/**
 * Unit tests for the payment service.
 *
 * Firebase modules are mocked via the automatic module mock provided by
 * __mocks__/firebase-setup.js (mapped by jest.config moduleNameMapper).
 *
 * Design notes:
 * - `paymentsCollection` is created once at module load time.  Tests that
 *   need to inspect or override the collection's query chain access the mocked
 *   methods through the imported `firestore` reference.
 * - Because `firestore.collection()` returns a fixed mock object (the same
 *   reference each time), we configure its child mocks (where, orderBy, get)
 *   per test using mockImplementation / mockResolvedValueOnce.
 */

// No jest.mock needed here — firebase-setup is auto-mocked via moduleNameMapper

// ─── Imports ──────────────────────────────────────────────────────────────────

import { firestore, functions } from '../../../firebase-setup';
import {
  createRentPaymentIntent,
  recordRentPayment,
  getPaymentHistory,
  RentPayment,
} from '../payments';

// ─── Typed helpers ────────────────────────────────────────────────────────────

const mockFirestore = firestore as any;
const mockFunctions = functions as any;

// The payment service uses `firestore.collection('payments')` at module load.
// The auto-mock returns the same collection object each time, so we grab it.
const collectionMock =
  mockFirestore.collection.mock?.results?.[0]?.value ??
  mockFirestore.collection('payments');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('payment service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore chaining behaviour after clearAllMocks clears implementations
    if (collectionMock.where) {
      collectionMock.where.mockImplementation(function (this: any) {
        return collectionMock;
      });
    }
    if (collectionMock.orderBy) {
      collectionMock.orderBy.mockImplementation(function (this: any) {
        return collectionMock;
      });
    }
    if (collectionMock.get) {
      collectionMock.get.mockResolvedValue({ docs: [] });
    }
  });

  // ── createRentPaymentIntent ───────────────────────────────────────────────

  describe('createRentPaymentIntent', () => {
    it('calls the createPaymentIntent Cloud Function (not createRentPaymentIntent)', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({
          data: {
            clientSecret: 'pi_abc_secret',
            paymentUrl: 'https://stripe.com/pay/abc',
            paymentIntentId: 'pi_abc',
          },
        }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createRentPaymentIntent('guest1', 'house1', 150);

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
        'createPaymentIntent',
      );
    });

    it('propagates errors from the Cloud Function', async () => {
      const failCallable = jest.fn(() =>
        Promise.reject(new Error('functions/not-found')),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

      await expect(
        createRentPaymentIntent('guest1', 'house1', 150),
      ).rejects.toThrow('functions/not-found');
    });

    it('returns the correct shape for a successful response', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({
          data: {
            clientSecret: 'cs_test',
            paymentUrl: 'https://stripe.com/pay/test',
            paymentIntentId: 'pi_test',
          },
        }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createRentPaymentIntent('g1', 'h1', 200);
      expect(result).toEqual({
        clientSecret: 'cs_test',
        paymentUrl: 'https://stripe.com/pay/test',
        paymentIntentId: 'pi_test',
      });
    });
  });

  // ── recordRentPayment ─────────────────────────────────────────────────────

  describe('recordRentPayment', () => {
    it('writes a pending payment document to Firestore', async () => {
      const mockSetFn = jest.fn(() => Promise.resolve());
      const mockDocRef = { id: 'new-payment-id', set: mockSetFn };
      collectionMock.doc = jest.fn(() => mockDocRef);

      const result = await recordRentPayment(
        'guest1',
        'house1',
        150,
        'Monthly Rent',
        'pi_test_123',
      );

      expect(mockSetFn).toHaveBeenCalledTimes(1);
      const written = (
        mockSetFn.mock.calls[0] as any
      )[0] as unknown as RentPayment;
      expect(written.guestId).toBe('guest1');
      expect(written.houseId).toBe('house1');
      expect(written.amount).toBe(150);
      expect(written.status).toBe('pending');
      expect(written.description).toBe('Monthly Rent');
      expect(written.stripePaymentIntentId).toBe('pi_test_123');
      expect(result.id).toBe('new-payment-id');
    });

    it('uses "Rent Payment" as default description when none provided', async () => {
      const mockSetFn = jest.fn(() => Promise.resolve());
      collectionMock.doc = jest.fn(() => ({ id: 'pay-id', set: mockSetFn }));

      await recordRentPayment('g1', 'h1', 100);

      const written = (
        mockSetFn.mock.calls[0] as any
      )[0] as unknown as RentPayment;
      expect(written.description).toBe('Rent Payment');
    });

    it('returns the full RentPayment object', async () => {
      const mockSetFn = jest.fn(() => Promise.resolve());
      collectionMock.doc = jest.fn(() => ({ id: 'pay-xyz', set: mockSetFn }));

      const result = await recordRentPayment('g1', 'h1', 75, 'Chore Fee');
      expect(result).toMatchObject({
        id: 'pay-xyz',
        guestId: 'g1',
        houseId: 'h1',
        amount: 75,
        status: 'pending',
        description: 'Chore Fee',
      });
    });

    it('includes a createdAt ISO timestamp', async () => {
      const mockSetFn = jest.fn(() => Promise.resolve());
      collectionMock.doc = jest.fn(() => ({ id: 'ts-id', set: mockSetFn }));

      const result = await recordRentPayment('g1', 'h1', 200);
      expect(typeof result.createdAt).toBe('string');
      expect(() => new Date(result.createdAt)).not.toThrow();
    });
  });

  // ── getPaymentHistory ─────────────────────────────────────────────────────

  describe('getPaymentHistory', () => {
    it('returns an empty array when no payment documents exist', async () => {
      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() => Promise.resolve({ docs: [] }));

      const result = await getPaymentHistory('guest1');
      expect(result).toEqual([]);
    });

    it('returns mapped payment objects from Firestore docs', async () => {
      const mockPayments: RentPayment[] = [
        {
          id: 'p1',
          guestId: 'guest1',
          houseId: 'house1',
          amount: 150,
          status: 'succeeded',
          createdAt: '2026-02-01T00:00:00.000Z',
          description: 'Monthly Rent',
        },
        {
          id: 'p2',
          guestId: 'guest1',
          houseId: 'house1',
          amount: 25,
          status: 'pending',
          createdAt: '2026-02-15T00:00:00.000Z',
          description: 'Chore Fee',
        },
      ];

      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({
          docs: mockPayments.map(p => ({ data: () => p })),
        }),
      );

      const result = await getPaymentHistory('guest1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('p1');
      expect(result[0].status).toBe('succeeded');
      expect(result[1].id).toBe('p2');
      expect(result[1].description).toBe('Chore Fee');
    });

    it('queries by guestId and orders by createdAt desc', async () => {
      const whereMock = jest.fn(() => collectionMock);
      const orderByMock = jest.fn(() => collectionMock);
      collectionMock.where = whereMock;
      collectionMock.orderBy = orderByMock;
      collectionMock.get = jest.fn(() => Promise.resolve({ docs: [] }));

      await getPaymentHistory('guest42');

      expect(whereMock).toHaveBeenCalledWith('guestId', '==', 'guest42');
      expect(orderByMock).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('returns payment with correct shape including optional fields', async () => {
      const mockPayment: RentPayment = {
        id: 'p3',
        guestId: 'guest1',
        houseId: 'house1',
        amount: 500,
        status: 'failed',
        createdAt: '2026-01-20T00:00:00.000Z',
        stripePaymentIntentId: 'pi_failed_123',
      };

      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({ docs: [{ data: () => mockPayment }] }),
      );

      const result = await getPaymentHistory('guest1');
      expect(result[0].stripePaymentIntentId).toBe('pi_failed_123');
      expect(result[0].status).toBe('failed');
    });

    it('handles a single payment document correctly', async () => {
      const payment: RentPayment = {
        id: 'solo',
        guestId: 'g1',
        houseId: 'h1',
        amount: 300,
        status: 'succeeded',
        createdAt: '2026-01-10T00:00:00.000Z',
      };
      collectionMock.where = jest.fn(() => collectionMock);
      collectionMock.orderBy = jest.fn(() => collectionMock);
      collectionMock.get = jest.fn(() =>
        Promise.resolve({ docs: [{ data: () => payment }] }),
      );

      const result = await getPaymentHistory('g1');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(300);
    });
  });
});
