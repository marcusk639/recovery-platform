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
  createRentPaymentIntent,
  rentPaymentIdempotencyKey,
  MAX_PAYMENT_CENTS,
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

  // ── createRentPaymentIntent ─────────────────────────────────────────────────────

  describe('createRentPaymentIntent', () => {
    it('calls the createPaymentIntent Cloud Function with correct args', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'pi_test_secret' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createRentPaymentIntent({ amountInCents: 500, guestId: 'guest1', houseId: 'house1', description: 'Monthly Rent' });

      expect(mockFunctions.httpsCallable).toHaveBeenCalledWith(
        'createPaymentIntent',
      );
      expect(mockCallable).toHaveBeenCalledWith({
        amount: 500,
        guestId: 'guest1',
        houseId: 'house1',
        description: 'Monthly Rent',
        idempotencyKey: expect.any(String),
      });
    });

    it('sends an explicit idempotency key that changes with the amount', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_test' } }),
      );
      mockFunctions.httpsCallable.mockReturnValue(mockCallable);

      await createRentPaymentIntent({ amountInCents: 20000, guestId: 'g1', houseId: 'h1' });
      await createRentPaymentIntent({ amountInCents: 20000, guestId: 'g1', houseId: 'h1' });
      await createRentPaymentIntent({ amountInCents: 30000, guestId: 'g1', houseId: 'h1' });

      const keys = (mockCallable.mock.calls as any[]).map((c) => c[0].idempotencyKey);
      // Same amount, same day: same key, so a repeat tap cannot make a second charge.
      expect(keys[0]).toBe(keys[1]);
      // Different amount: different key, so Stripe does not reject the changed params.
      expect(keys[2]).not.toBe(keys[0]);
      mockFunctions.httpsCallable.mockReset();
    });

    it('lets the caller override the idempotency key', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_test' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createRentPaymentIntent({
        amountInCents: 100,
        guestId: 'g1',
        houseId: 'h1',
        idempotencyKey: 'custom-key',
      });

      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'custom-key' }),
      );
    });

    it('scopes the derived key to guest, house, UTC day and amount', () => {
      const at = new Date('2026-10-16T23:30:00.000Z');
      expect(rentPaymentIdempotencyKey('g1', 'h1', 50000, at)).toBe(
        'g1-h1-2026-10-16-50000',
      );
    });

    it('returns { clientSecret } from the callable result', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_live_abc123' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createRentPaymentIntent({ amountInCents: 750, guestId: 'guest2', houseId: 'house2' });

      expect(result).toEqual({ clientSecret: 'cs_live_abc123' });
    });

    it('passes undefined description when not provided', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: 'cs_test' } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      await createRentPaymentIntent({ amountInCents: 100, guestId: 'g1', houseId: 'h1' });

      expect(mockCallable).toHaveBeenCalledWith({
        amount: 100,
        guestId: 'g1',
        houseId: 'h1',
        description: undefined,
        idempotencyKey: expect.any(String),
      });
    });

    it('rejects an amount above the $100,000 cap without calling the function', async () => {
      // The cap guarded only one of the two merged wrappers. It now covers every
      // resident rent payment, including the arbitrary-amount entry path.
      await expect(
        createRentPaymentIntent({
          amountInCents: MAX_PAYMENT_CENTS + 1,
          guestId: 'g1',
          houseId: 'h1',
        }),
      ).rejects.toThrow(/exceeds maximum/);
      expect(mockFunctions.httpsCallable).not.toHaveBeenCalled();
    });

    it('propagates errors from the callable', async () => {
      const failCallable = jest.fn(() =>
        Promise.reject(new Error('functions/internal')),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(failCallable);

      await expect(
        createRentPaymentIntent({ amountInCents: 200, guestId: 'guest1', houseId: 'house1' }),
      ).rejects.toThrow('functions/internal');
    });

    it('returns the exact clientSecret value from the response', async () => {
      const expectedSecret = 'pi_3NqXY2LkdIwHu7ix1Rj4Qs8a_secret_abc';
      const mockCallable = jest.fn(() =>
        Promise.resolve({ data: { clientSecret: expectedSecret } }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await createRentPaymentIntent({ amountInCents: 1000, guestId: 'g99', houseId: 'h99', description: 'Deposit' });

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

      // The callable reports dollars; the service hands screens cents.
      expect(result).toEqual([
        { ...mockPayments[0], amount: 50000 },
        { ...mockPayments[1], amount: 2500 },
      ]);
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

      expect(result[0]).toEqual({ ...singlePayment, amount: 120000 });
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

    it('converts the callable\'s dollar amounts to cents (a $500.00 charge is 50000)', async () => {
      const mockCallable = jest.fn(() =>
        Promise.resolve({
          data: {
            payments: [
              { ...mockHousePayments[0], amount: 500 },
              { ...mockHousePayments[0], id: 'ch_002', amount: 19.99 },
            ],
          },
        }),
      );
      mockFunctions.httpsCallable.mockReturnValueOnce(mockCallable);

      const result = await listHousePayments('house1');

      expect(result.map((r) => r.amount)).toEqual([50000, 1999]);
    });
  });
});
