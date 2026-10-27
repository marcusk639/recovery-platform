// src/state/queries/__tests__/disputeQueries.test.ts
//
// Unit tests for the useUpdateDispute React Query mutation hook.

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateDispute } from '../disputeQueries';
import * as disputeService from '../../../services/dispute';
import { ActivityType } from '../../../entities/ActivityModel';

// Mock the dispute service
jest.mock('../../../services/dispute');

// ─── Types / helpers ─────────────────────────────────────────────────────────

const makeGuest = () =>
  ({
    id: 'guest1',
    houseId: 'house1',
    firstName: 'John',
    lastName: 'Doe',
  } as any);

const makeHouse = () =>
  ({
    id: 'house1',
    name: 'Test House',
  } as any);

const makeNotification = () =>
  ({
    id: 'notif1',
    message: 'Dispute updated',
    userId: 'user1',
  } as any);

const makeDispute = () =>
  ({
    id: 'dispute1',
    guestId: 'guest1',
    houseId: 'house1',
    activityId: 'activity1',
    type: ActivityType.CHORE,
    message: 'Dispute message',
    status: 'pending' as const,
    createdDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('disputeQueries', () => {
  let queryClient: QueryClient;

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

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── useUpdateDispute ──────────────────────────────────────────────────────

  describe('useUpdateDispute', () => {
    it('calls updateDispute with the correct arguments', async () => {
      (disputeService.updateDispute as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(disputeService.updateDispute).toHaveBeenCalledWith(
        makeHouse(),
        undefined,
      );
    });

    it('passes resolvedDispute when provided', async () => {
      const resolvedDispute = makeDispute();
      (disputeService.updateDispute as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
        resolvedDispute,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(disputeService.updateDispute).toHaveBeenCalledWith(
        makeHouse(),
        resolvedDispute,
      );
    });

    it('sends no notifications from the client (the server sends them)', async () => {
      (disputeService.updateDispute as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const args = (disputeService.updateDispute as jest.Mock).mock.calls[0];
      expect(args).toHaveLength(2);
      expect(args.some((a: unknown) => Array.isArray(a))).toBe(false);
    });

    it('never passes the disputed guest (no guest-doc write a peer could not make)', async () => {
      (disputeService.updateDispute as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
        resolvedDispute: makeDispute(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const [house, archived] = (disputeService.updateDispute as jest.Mock).mock.calls[0];
      expect(house).toEqual(makeHouse());
      expect(archived).toEqual(makeDispute());
    });

    it('invalidates guests, houses, and disputes queries on success', async () => {
      (disputeService.updateDispute as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['guests'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['houses'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['disputes'] });
    });

    it('surfaces errors when the service call fails', async () => {
      const error = new Error('Batch commit failed');
      (disputeService.updateDispute as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('does not invalidate queries when the mutation fails', async () => {
      (disputeService.updateDispute as jest.Mock).mockRejectedValue(
        new Error('Failure'),
      );

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      result.current.mutate({
        house: makeHouse(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('starts in idle state', () => {
      const { result } = renderHook(() => useUpdateDispute(), { wrapper });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isPending).toBe(false);
    });
  });
});
