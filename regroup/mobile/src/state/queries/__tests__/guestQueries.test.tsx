/**
 * Guest Queries Tests
 *
 * Tests for React Query hooks that manage guest data
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useGuests,
  useGuest,
  useUpdateGuest,
  useCreateGuest,
  useDeleteGuest,
} from '../guestQueries';
import * as guestService from '../../../services/guest';
import { Guest } from '../../../entities/Guest';
import { Guests } from '../../../types';

// Mock the guest service
jest.mock('../../../services/guest');

describe('guestQueries', () => {
  let queryClient: QueryClient;

  // Mock data
  const mockGuest = {
    id: 'guest123',
    houseId: 'house456',
    userId: 'user789',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    avatar: null,
    createdDate: new Date(),
  } as unknown as Guest;

  const mockGuests: Guests = {
    guest123: mockGuest,
    guest456: {
      ...mockGuest,
      id: 'guest456',
      firstName: 'Jane',
    } as Guest,
  };

  // Create a fresh QueryClient for each test
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
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('useGuests', () => {
    it('should fetch guests successfully', async () => {
      (guestService.getGuests as jest.Mock).mockResolvedValue(mockGuests);

      const { result } = renderHook(() => useGuests('house456'), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockGuests);
      expect(guestService.getGuests).toHaveBeenCalledWith(
        'houseId',
        'house456',
      );
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch guests');
      (guestService.getGuests as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useGuests('house456'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', async () => {
      const { result } = renderHook(() => useGuests('house456', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(guestService.getGuests).not.toHaveBeenCalled();
    });

    it('should not fetch when houseId is empty', async () => {
      const { result } = renderHook(() => useGuests(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(guestService.getGuests).not.toHaveBeenCalled();
    });

    it('should cache data and serve from cache', async () => {
      (guestService.getGuests as jest.Mock).mockResolvedValue(mockGuests);

      // First render
      const { result: result1 } = renderHook(() => useGuests('house456'), {
        wrapper,
      });
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      // Second render should use cached data
      const { result: result2 } = renderHook(() => useGuests('house456'), {
        wrapper,
      });

      // Should immediately have data from cache
      expect(result2.current.data).toEqual(mockGuests);
      // Should only have called the service once
      expect(guestService.getGuests).toHaveBeenCalledTimes(1);
    });
  });

  describe('useGuest', () => {
    it('should fetch single guest successfully', async () => {
      (guestService.getGuest as jest.Mock).mockResolvedValue(mockGuest);

      const { result } = renderHook(() => useGuest('guest123'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockGuest);
      expect(guestService.getGuest).toHaveBeenCalledWith('guest123');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Guest not found');
      (guestService.getGuest as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useGuest('guest123'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  describe('useUpdateGuest', () => {
    it('should update guest successfully', async () => {
      const updatedGuest = { ...mockGuest, firstName: 'Updated' };
      (guestService.updateGuest as jest.Mock).mockResolvedValue(updatedGuest);

      const { result } = renderHook(() => useUpdateGuest(), { wrapper });

      result.current.mutate({
        guest: mockGuest,
        updatedGuest,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(guestService.updateGuest).toHaveBeenCalledWith(
        mockGuest,
        updatedGuest,
        3,
      );
    });

    it('should handle update error', async () => {
      const error = new Error('Update failed');
      (guestService.updateGuest as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateGuest(), { wrapper });

      result.current.mutate({
        guest: mockGuest,
        updatedGuest: mockGuest,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should optimistically update the cache', async () => {
      // Pre-populate cache
      queryClient.setQueryData(['guests', 'detail', 'guest123'], mockGuest);

      (guestService.updateGuest as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockGuest), 100)),
      );

      const { result } = renderHook(() => useUpdateGuest(), { wrapper });

      const updatedGuest = { ...mockGuest, firstName: 'Optimistic' };

      result.current.mutate({
        guest: mockGuest,
        updatedGuest,
      });

      // Wait for onMutate to complete (it's async due to cancelQueries)
      await waitFor(() => {
        const cachedData = queryClient.getQueryData([
          'guests',
          'detail',
          'guest123',
        ]);
        expect((cachedData as Guest).firstName).toBe('Optimistic');
      });
    });
  });

  describe('useCreateGuest', () => {
    it('should create guest successfully', async () => {
      (guestService.createGuest as jest.Mock).mockResolvedValue(mockGuest);

      const { result } = renderHook(() => useCreateGuest(), { wrapper });

      result.current.mutate(mockGuest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(guestService.createGuest).toHaveBeenCalledWith(mockGuest);
    });

    it('should invalidate queries on success', async () => {
      (guestService.createGuest as jest.Mock).mockResolvedValue(mockGuest);

      // Spy on invalidateQueries
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateGuest(), { wrapper });

      result.current.mutate(mockGuest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['guests', 'list', 'house456'],
      });
    });
  });

  describe('useDeleteGuest', () => {
    it('should delete guest successfully', async () => {
      const house = { id: 'house456' } as any;
      (guestService.deleteGuest as jest.Mock).mockResolvedValue({
        guest: mockGuest,
        house,
      });

      const { result } = renderHook(() => useDeleteGuest(), { wrapper });

      result.current.mutate({ guest: mockGuest, house });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(guestService.deleteGuest).toHaveBeenCalledWith(mockGuest, house);
    });

    it('should invalidate queries on success', async () => {
      const house = { id: 'house456' } as any;
      (guestService.deleteGuest as jest.Mock).mockResolvedValue({
        guest: mockGuest,
        house,
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteGuest(), { wrapper });

      result.current.mutate({ guest: mockGuest, house });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['guests'] });
    });
  });

  describe('Query Key Structure', () => {
    it('should use consistent query keys for caching', async () => {
      (guestService.getGuests as jest.Mock).mockResolvedValue(mockGuests);
      (guestService.getGuest as jest.Mock).mockResolvedValue(mockGuest);

      // Render multiple hooks
      const { result: guestsResult } = renderHook(
        () => useGuests('house456'),
        { wrapper },
      );
      const { result: guestResult } = renderHook(() => useGuest('guest123'), {
        wrapper,
      });

      await waitFor(() => {
        expect(guestsResult.current.isSuccess).toBe(true);
        expect(guestResult.current.isSuccess).toBe(true);
      });

      // Check cache keys
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();

      expect(queries.some((q) => q.queryKey[0] === 'guests')).toBe(true);
    });
  });
});
