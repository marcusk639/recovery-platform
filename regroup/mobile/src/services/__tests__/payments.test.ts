/**
 * Unit tests for src/services/payments.ts
 *
 * Firebase is auto-mocked via __mocks__/firebase-setup.js, which is mapped
 * to every import of `firebase-setup` by jest.config moduleNameMapper.
 *
 * The `functions` export from that mock is a plain object:
 *   { httpsCallable: jest.fn(() => jest.fn(() => Promise.resolve({ data: {} }))) }
 *
 * Tests override `httpsCallable`'s return value per scenario with
 * mockReturnValueOnce so they stay isolated from one another.
 */

import { functions } from '../../../firebase-setup';
import {
  createPaymentIntent,
  listPayments,
  listHousePayments,
  PaymentRecord,
} from '../payments';

// Typed reference to the auto-mock
const mockFunctions = functions as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('payments service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── createPaymentIntent ─────────────────────────────────────────────────────

  describe('createPaymentIntent', () => {
    it('calls the createPaymentIntent Cloud Function with correct args', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'pi_test_secret' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createPaymentIntent(500, 'guest1', 'house1', 'Monthly Rent');

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
        'createPaymentIntent',
      );
      expect(mockCallable).toHaveBeenCalledWith({
        amount: 500,
        guestId: 'guest1',
        houseId: 'house1',
        description: 'Monthly Rent',
      });
    });

    it('returns { clientSecret } from the callable result', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_live_abc123' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createPaymentIntent(750, 'guest2', 'house2');

      expect(result).toEqual({ clientSecret: 'cs_live_abc123' });
    });

    it('passes undefined description when not provided', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_test' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createPaymentIntent(100, 'g1', 'h1');

      expect(mockCallable).toHaveBeenCalledWith({
        amount: 100,
        guestId: 'g1',
        houseId: 'h1',
        description: undefined,
      });
    });

    it('propagates errors from the callable', async () => {
      const failCallable = jest.fn(() =>
        Promise.reject(new Error('functions/internal')),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

      await expect(
        createPaymentIntent(200, 'guest1', 'house1'),
      ).rejects.toThrow('functions/internal');
    });

    it('returns the exact clientSecret value from the response', async () => {
      const expectedSecret = 'pi_3NqXY2LkdIwHu7ix1Rj4Qs8a_secret_abc';
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: expectedSecret } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createPaymentIntent(1000, 'g99', 'h99', 'Deposit');

      expect(result.clientSecret).toBe(expectedSecret);
    });
  });

  // ── listPayments ────────────────────────────────────────────────────────────

  describe('listPayments', () => {
    const mockPayments: PaymentRecord[] = [
      {
        id: 'pay_001',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        description: 'Monthly Rent',
        createdAt: '2026-02-01T10:00:00.000Z',
      },
      {
        id: 'pay_002',
        amount: 25,
        currency: 'usd',
        status: 'pending',
        description: 'Chore Fee',
        createdAt: '2026-02-15T10:00:00.000Z',
        receiptUrl: 'https://stripe.com/receipts/pay_002',
      },
    ];

    it('calls the listPayments Cloud Function with correct args (guestId, houseId, limit)', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: mockPayments } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await listPayments('guest1', 'house1', 10);

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith('listPayments');
      expect(mockCallable).toHaveBeenCalledWith({
        guestId: 'guest1',
        houseId: 'house1',
        limit: 10,
      });
    });

    it('returns the payments array from the callable result', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: mockPayments } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await listPayments('guest1', 'house1', 10);

      expect(result).toEqual(mockPayments);
      expect(result).toHaveLength(2);
    });

    it('uses default limit of 20 when limit is not specified', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: [] } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await listPayments('guest2', 'house2');

      expect(mockCallable).toHaveBeenCalledWith({
        guestId: 'guest2',
        houseId: 'house2',
        limit: 20,
      });
    });

    it('returns empty array when callable returns no payments', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: [] } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await listPayments('guest3', 'house3');

      expect(result).toEqual([]);
    });

    it('returns payment records with all fields intact', async () => {
      const singlePayment: PaymentRecord = {
        id: 'pay_solo',
        amount: 1200,
        currency: 'usd',
        status: 'succeeded',
        description: 'Annual Fee',
        createdAt: '2026-01-01T00:00:00.000Z',
        receiptUrl: 'https://stripe.com/receipts/pay_solo',
      };
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: [singlePayment] } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await listPayments('g1', 'h1');

      expect(result[0]).toEqual(singlePayment);
      expect(result[0].receiptUrl).toBe('https://stripe.com/receipts/pay_solo');
    });

    it('propagates errors from the callable', async () => {
      const failCallable = jest.fn(() =>
        Promise.reject(new Error('functions/permission-denied')),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

      await expect(listPayments('guest1', 'house1')).rejects.toThrow(
        'functions/permission-denied',
      );
    });
  });

  // ── listHousePayments ────────────────────────────────────────────────────────

  describe('listHousePayments', () => {
    const mockHousePayments = [
      {
        id: 'ch_001',
        amount: 500,
        currency: 'usd',
        status: 'succeeded' as const,
        description: 'Rent',
        createdAt: '2026-02-01T10:00:00.000Z',
        guestId: 'guest1',
        houseId: 'house1',
      },
    ];

    it('calls the listHousePayments Cloud Function with houseId and limit', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: mockHousePayments } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await listHousePayments('house1', 100);

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
        'listHousePayments',
      );
      expect(mockCallable).toHaveBeenCalledWith({
        houseId: 'house1',
        limit: 100,
      });
    });

    it('uses default limit of 100 when not specified', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: [] } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await listHousePayments('house1');

      expect(mockCallable).toHaveBeenCalledWith({
        houseId: 'house1',
        limit: 100,
      });
    });

    it('returns the payments array', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { payments: mockHousePayments } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await listHousePayments('house1');
      expect(result).toHaveLength(1);
      expect(result[0].guestId).toBe('guest1');
    });
  });
});
