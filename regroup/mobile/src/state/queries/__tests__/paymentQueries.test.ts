/**
 * Payment Queries Tests
 *
 * Tests for React Query hooks that manage rent payment operations.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  usePaymentHistory,
  useCreateRentPayment,
  useFailedPayments,
  useMarkPaymentResolved,
  useStalePendingPayments,
  paymentKeys,
} from '../paymentQueries';
import * as paymentService from '../../../services/payments';
import {
  RentPayment,
  CreatePaymentIntentResult,
} from '../../../services/payments';
import * as loggingModule from '../../../util/logging';

// Mock the payment service at the module level
jest.mock('../../../services/payments');
jest.mock('../../../util/logging');

describe('paymentQueries', () => {
  let queryClient: QueryClient;

  // Mock data
  const mockPayment: RentPayment = {
    id: 'payment123',
    guestId: 'guest456',
    houseId: 'house789',
    amount: 500,
    status: 'succeeded',
    createdAt: '2026-02-01T10:00:00.000Z',
    description: 'Monthly Rent',
    stripePaymentIntentId: 'pi_mock123',
  };

  const mockPaymentHistory: RentPayment[] = [
    mockPayment,
    {
      ...mockPayment,
      id: 'payment456',
      status: 'pending',
      createdAt: '2026-01-01T10:00:00.000Z',
    },
  ];

  const mockIntentResult: CreatePaymentIntentResult = {
    clientSecret: 'cs_mock_secret',
    paymentUrl: 'https://stripe.com/pay/mock',
    paymentIntentId: 'pi_mock123',
  };

  // Fresh QueryClient for each test — no shared state between tests
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Wrapper component for hooks
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ─── paymentKeys ────────────────────────────────────────────────────────────

  describe('paymentKeys', () => {
    it('should produce the correct base key', () => {
      expect(paymentKeys.all).toEqual(['payments']);
    });

    it('should produce the correct history key for a guest', () => {
      expect(paymentKeys.history('guest456')).toEqual([
        'payments',
        'history',
        'guest456',
      ]);
    });
  });

  // ─── usePaymentHistory ───────────────────────────────────────────────────────

  describe('usePaymentHistory', () => {
    it('should fetch payment history successfully', async () => {
      (paymentService.getPaymentHistory as jest.Mock).mockResolvedValue(
        mockPaymentHistory,
      );

      const { result } = renderHook(() => usePaymentHistory('guest456'), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockPaymentHistory);
      expect(paymentService.getPaymentHistory).toHaveBeenCalledWith('guest456');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch payment history');
      (paymentService.getPaymentHistory as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => usePaymentHistory('guest456'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => usePaymentHistory('guest456', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(paymentService.getPaymentHistory).not.toHaveBeenCalled();
    });

    it('should not fetch when guestId is empty', () => {
      const { result } = renderHook(() => usePaymentHistory(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(paymentService.getPaymentHistory).not.toHaveBeenCalled();
    });

    it('should cache data and serve from cache', async () => {
      (paymentService.getPaymentHistory as jest.Mock).mockResolvedValue(
        mockPaymentHistory,
      );

      // First render
      const { result: result1 } = renderHook(
        () => usePaymentHistory('guest456'),
        { wrapper },
      );
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      // Second render shares the same queryClient wrapper — should hit cache
      const { result: result2 } = renderHook(
        () => usePaymentHistory('guest456'),
        { wrapper },
      );

      expect(result2.current.data).toEqual(mockPaymentHistory);
      // Service should only have been called once (cache served the second)
      expect(paymentService.getPaymentHistory).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no payments exist', async () => {
      (paymentService.getPaymentHistory as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => usePaymentHistory('guest456'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });
  });

  // ─── useCreateRentPayment ────────────────────────────────────────────────────

  describe('useCreateRentPayment', () => {
    const mutationArgs = {
      guestId: 'guest456',
      houseId: 'house789',
      amount: 500,
      description: 'Monthly Rent',
    };

    it('should call createRentPaymentIntent and recordRentPayment then return intent result', async () => {
      (paymentService.createRentPaymentIntent as jest.Mock).mockResolvedValue(
        mockIntentResult,
      );
      (paymentService.recordRentPayment as jest.Mock).mockResolvedValue(
        mockPayment,
      );

      const { result } = renderHook(() => useCreateRentPayment(), { wrapper });

      result.current.mutate(mutationArgs);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockIntentResult);
      expect(paymentService.createRentPaymentIntent).toHaveBeenCalledWith(
        'guest456',
        'house789',
        500,
      );
      expect(paymentService.recordRentPayment).toHaveBeenCalledWith(
        'guest456',
        'house789',
        500,
        'Monthly Rent',
        'pi_mock123',
      );
    });

    it('should use default description "Rent Payment" when none is provided', async () => {
      (paymentService.createRentPaymentIntent as jest.Mock).mockResolvedValue(
        mockIntentResult,
      );
      (paymentService.recordRentPayment as jest.Mock).mockResolvedValue(
        mockPayment,
      );

      const { result } = renderHook(() => useCreateRentPayment(), { wrapper });

      result.current.mutate({
        guestId: 'guest456',
        houseId: 'house789',
        amount: 500,
        // no description
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(paymentService.recordRentPayment).toHaveBeenCalledWith(
        'guest456',
        'house789',
        500,
        'Rent Payment', // default
        'pi_mock123',
      );
    });

    it('should invalidate payment history on success', async () => {
      (paymentService.createRentPaymentIntent as jest.Mock).mockResolvedValue(
        mockIntentResult,
      );
      (paymentService.recordRentPayment as jest.Mock).mockResolvedValue(
        mockPayment,
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateRentPayment(), { wrapper });

      result.current.mutate(mutationArgs);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: paymentKeys.history('guest456'),
      });
    });

    it('should handle createRentPaymentIntent failure', async () => {
      const error = new Error('Stripe intent creation failed');
      (paymentService.createRentPaymentIntent as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useCreateRentPayment(), { wrapper });

      result.current.mutate(mutationArgs);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
      // recordRentPayment should not have been called if intent creation failed
      expect(paymentService.recordRentPayment).not.toHaveBeenCalled();
    });

    it('should handle recordRentPayment failure', async () => {
      (paymentService.createRentPaymentIntent as jest.Mock).mockResolvedValue(
        mockIntentResult,
      );
      const error = new Error('Firestore write failed');
      (paymentService.recordRentPayment as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCreateRentPayment(), { wrapper });

      result.current.mutate(mutationArgs);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── useFailedPayments ───────────────────────────────────────────────────────

  describe('useFailedPayments', () => {
    it('fetches failed payments for a house', async () => {
      const failedPayment = {
        id: 'pay-1',
        guestId: 'guest-1',
        houseId: 'house-1',
        amount: 500,
        status: 'failed',
        createdAt: new Date().toISOString(),
        description: 'Rent Payment',
        stripePaymentIntentId: 'pi_mock',
      };
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
        failedPayment,
      ]);

      const { result } = renderHook(() => useFailedPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].status).toBe('failed');
    });

    it('returns empty array when no failed payments', async () => {
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([]);
      const { result } = renderHook(() => useFailedPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(0);
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useFailedPayments(''), { wrapper });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ─── Query Key Structure ─────────────────────────────────────────────────────

  describe('Query Key Structure', () => {
    it('should store payment history under the correct cache key', async () => {
      (paymentService.getPaymentHistory as jest.Mock).mockResolvedValue(
        mockPaymentHistory,
      );

      const { result } = renderHook(() => usePaymentHistory('guest456'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(paymentKeys.history('guest456'));
      expect(cached).toEqual(mockPaymentHistory);
    });
  });

  // ─── useStalePendingPayments ─────────────────────────────────────────────────

  describe('useStalePendingPayments', () => {
    const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

    const _mockRecentPending: RentPayment = {
      id: 'pay-recent-pending',
      guestId: 'guest-1',
      houseId: 'house-1',
      amount: 60000,
      status: 'pending',
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago — NOT stale
      description: 'Rent Payment',
    };

    const _mockStalePending: RentPayment = {
      id: 'pay-stale-pending',
      guestId: 'guest-2',
      houseId: 'house-1',
      amount: 70000,
      status: 'pending',
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago — stale
      description: 'Rent Payment',
    };

    const _mockSucceeded: RentPayment = {
      ...mockPayment,
      id: 'pay-succeeded',
      status: 'succeeded',
    };

    it('returns only pending payments older than 24 hours', async () => {
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
        _mockStalePending,
        _mockRecentPending,
        _mockSucceeded,
      ]);

      const { result } = renderHook(() => useStalePendingPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].id).toBe('pay-stale-pending');
    });

    it('returns empty array when all pending payments are recent', async () => {
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
        _mockRecentPending,
      ]);

      const { result } = renderHook(() => useStalePendingPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(0);
    });

    it('returns empty array when there are no payments at all', async () => {
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useStalePendingPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(0);
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useStalePendingPayments(''), {
        wrapper,
      });
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('excludes succeeded and failed payments regardless of age', async () => {
      const _oldSucceeded: RentPayment = {
        ...mockPayment,
        id: 'pay-old-succeeded',
        status: 'succeeded',
        createdAt: new Date(
          Date.now() - STALE_THRESHOLD_MS - 1000,
        ).toISOString(),
      };
      const _oldFailed: RentPayment = {
        ...mockPayment,
        id: 'pay-old-failed',
        status: 'failed',
        createdAt: new Date(
          Date.now() - STALE_THRESHOLD_MS - 1000,
        ).toISOString(),
      };
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([
        _oldSucceeded,
        _oldFailed,
        _mockStalePending,
      ]);

      const { result } = renderHook(() => useStalePendingPayments('house-1'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].id).toBe('pay-stale-pending');
    });

    it('uses the correct query key', async () => {
      (paymentService.listHousePayments as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useStalePendingPayments('house-99'), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData([
        ...paymentKeys.housePayments('house-99'),
        'stale-pending',
      ]);
      expect(cached).toEqual([]);
    });
  });

  // ─── useMarkPaymentResolved ──────────────────────────────────────────────────

  describe('useMarkPaymentResolved', () => {
    it('should call markPaymentResolvedOffline with the given paymentId', async () => {
      (
        paymentService.markPaymentResolvedOffline as jest.Mock
      ).mockResolvedValue(undefined);

      const { result } = renderHook(() => useMarkPaymentResolved('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({ paymentId: 'pay-001' });

      expect(paymentService.markPaymentResolvedOffline).toHaveBeenCalledWith(
        'pay-001',
      );
    });

    it('should invalidate failed payments query on success', async () => {
      (
        paymentService.markPaymentResolvedOffline as jest.Mock
      ).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useMarkPaymentResolved('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({ paymentId: 'pay-001' });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...paymentKeys.housePayments('house-1'), 'failed'],
      });
    });

    it('should handle errors and log them', async () => {
      const error = new Error('Failed to mark payment resolved');
      (
        paymentService.markPaymentResolvedOffline as jest.Mock
      ).mockRejectedValue(error);

      const { result } = renderHook(() => useMarkPaymentResolved('house-1'), {
        wrapper,
      });

      result.current.mutate({ paymentId: 'pay-001' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
      expect(loggingModule.logException).toHaveBeenCalledWith(error);
    });
  });
});
