// src/services/__tests__/subscription.test.ts
//
// Unit tests for the subscription service.
//
// Both functions call firebase-setup's `functions.httpsCallable`, which is
// automatically remapped to __mocks__/firebase-setup.js by the jest
// moduleNameMapper. We obtain the mock callable factory via the imported
// `functions` object and control its return values per-test.

// ─── Imports (firebase-setup is auto-mocked via moduleNameMapper) ────────────

import { functions } from '../../../firebase-setup';
import {
  applyBundleDiscount,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
} from '../subscription';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the jest.Mock that `functions.httpsCallable` itself is. */
const getHttpsCallable = () => functions.httpsCallable as jest.Mock;

/** Returns the inner callable mock that httpsCallable returns. */
const getInnerCallable = () =>
  getHttpsCallable().mock.results[0]?.value as jest.Mock;

const makeSubParams = (overrides = {}) => ({
  ownerUserId: 'owner-1',
  houseIds: ['house-1', 'house-2'],
  action: 'add' as const,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('subscription service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore the default mock implementation after clearAllMocks.
    // httpsCallable returns a callable that resolves with { data: {} }.
    getHttpsCallable().mockReturnValue(
      jest.fn(() => Promise.resolve({ data: { success: true } })),
    );
  });

  // ── updateSubscriptionGuests ──────────────────────────────────────────────

  describe('updateSubscriptionGuests', () => {
    it('calls functions.httpsCallable with the correct function name', async () => {
      const params = makeSubParams();

      await updateSubscriptionGuests(params);

      expect(getHttpsCallable()).toHaveBeenCalledWith(
        'updateSubscriptionGuests',
      );
    });

    it('invokes the returned callable with the provided params', async () => {
      const params = makeSubParams();

      await updateSubscriptionGuests(params);

      expect(getInnerCallable()).toHaveBeenCalledWith(params);
    });

    it('returns the raw promise from the callable (does not unwrap .data)', async () => {
      const params = makeSubParams();
      const expected = { data: { invoiceId: 'inv-123' } };
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve(expected)),
      );

      const result = await updateSubscriptionGuests(params);

      // updateSubscriptionGuests returns the callable's result directly
      expect(result).toEqual(expected);
    });

    it('works with action remove', async () => {
      const params = makeSubParams({ action: 'remove', amountToAdjust: 2 });

      await updateSubscriptionGuests(params);

      expect(getInnerCallable()).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'remove', amountToAdjust: 2 }),
      );
    });

    it('propagates errors thrown by the callable', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.reject(new Error('Functions error'))),
      );

      await expect(updateSubscriptionGuests(makeSubParams())).rejects.toThrow(
        'Functions error',
      );
    });

    it('propagates errors thrown by httpsCallable itself', async () => {
      getHttpsCallable().mockImplementation(() => {
        throw new Error('httpsCallable setup error');
      });

      expect(() => updateSubscriptionGuests(makeSubParams())).toThrow(
        'httpsCallable setup error',
      );
    });
  });

  // ── updateSubscriptionHouses ──────────────────────────────────────────────

  describe('updateSubscriptionHouses', () => {
    it('calls functions.httpsCallable with the correct function name', async () => {
      const params = makeSubParams();

      await updateSubscriptionHouses(params);

      expect(getHttpsCallable()).toHaveBeenCalledWith(
        'updateSubscriptionHouses',
      );
    });

    it('invokes the returned callable with the provided params', async () => {
      const params = makeSubParams();

      await updateSubscriptionHouses(params);

      expect(getInnerCallable()).toHaveBeenCalledWith(params);
    });

    it('returns result.data (unwraps the envelope unlike updateSubscriptionGuests)', async () => {
      const params = makeSubParams();
      const responseData = { subscriptionId: 'sub-abc', status: 'active' };
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve({ data: responseData })),
      );

      const result = await updateSubscriptionHouses(params);

      expect(result).toEqual(responseData);
    });

    it('returns undefined when the callable resolves with { data: undefined }', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve({ data: undefined })),
      );

      const result = await updateSubscriptionHouses(makeSubParams());

      expect(result).toBeUndefined();
    });

    it('works with action remove and amountToAdjust', async () => {
      const params = makeSubParams({ action: 'remove', amountToAdjust: 5 });

      await updateSubscriptionHouses(params);

      expect(getInnerCallable()).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'remove', amountToAdjust: 5 }),
      );
    });

    it('propagates errors thrown by the callable', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.reject(new Error('Cloud function failed'))),
      );

      await expect(updateSubscriptionHouses(makeSubParams())).rejects.toThrow(
        'Cloud function failed',
      );
    });

    it('passes a single houseId correctly', async () => {
      const params = makeSubParams({ houseIds: ['single-house'] });

      await updateSubscriptionHouses(params);

      expect(getInnerCallable()).toHaveBeenCalledWith(
        expect.objectContaining({ houseIds: ['single-house'] }),
      );
    });
  });

  // ── applyBundleDiscount ───────────────────────────────────────────────────

  describe('applyBundleDiscount', () => {
    it('calls functions.httpsCallable with the correct function name and the inner callable with { userId }', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve({ data: undefined })),
      );

      await applyBundleDiscount('uid-123');

      expect(getHttpsCallable()).toHaveBeenCalledWith('applyBundleDiscount');
      expect(getInnerCallable()).toHaveBeenCalledTimes(1);
      expect(getInnerCallable()).toHaveBeenCalledWith({ userId: 'uid-123' });
    });

    it('resolves to undefined (does not return the callable result)', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve({ data: { shouldBeIgnored: true } })),
      );

      const result = await applyBundleDiscount('uid-123');

      expect(result).toBeUndefined();
    });

    it('propagates errors thrown by the callable', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.reject(new Error('quota exceeded'))),
      );

      await expect(applyBundleDiscount('uid-x')).rejects.toThrow(
        'quota exceeded',
      );
    });

    it('still calls the callable when userId is empty (no client-side validation)', async () => {
      getHttpsCallable().mockReturnValue(
        jest.fn(() => Promise.resolve({ data: undefined })),
      );

      await applyBundleDiscount('');

      expect(getHttpsCallable()).toHaveBeenCalledWith('applyBundleDiscount');
      expect(getInnerCallable()).toHaveBeenCalledWith({ userId: '' });
    });
  });
});
