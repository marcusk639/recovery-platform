// src/state/queries/__tests__/choreRotationQueries.test.ts

jest.mock('../../../services/choreRotation');
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as choreRotationService from '../../../services/choreRotation';
import {
  choreRotationKeys,
  useChoreRotation,
  useAdvanceRotation,
  useSetRotationOrder,
} from '../choreRotationQueries';
import type { ChoreRotation } from '../../../entities/Chore';

const makeRotation = (
  overrides: Partial<ChoreRotation> = {},
): ChoreRotation => ({
  choreName: 'Kitchen',
  guestIds: ['guest1', 'guest2'],
  currentIndex: 0,
  lastRotatedAt: '2026-05-17',
  ...overrides,
});

describe('choreRotationQueries', () => {
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
    queryClient.clear();
    queryClient.unmount();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── choreRotationKeys ───────────────────────────────────────────────────────

  describe('choreRotationKeys', () => {
    it('all is ["choreRotations"]', () => {
      expect(choreRotationKeys.all).toEqual(['choreRotations']);
    });

    it('rotation key includes houseId', () => {
      expect(choreRotationKeys.rotation('house1')).toContain('house1');
    });
  });

  // ── useChoreRotation ────────────────────────────────────────────────────────

  describe('useChoreRotation', () => {
    it('fetches and returns the rotation', async () => {
      const rotation = makeRotation();
      (choreRotationService.getRotation as jest.Mock).mockResolvedValue(
        rotation,
      );

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(rotation);
      expect(choreRotationService.getRotation).toHaveBeenCalledWith('house1');
    });

    it('returns null when no rotation exists', async () => {
      (choreRotationService.getRotation as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it('does not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useChoreRotation(''), { wrapper });
      expect(result.current.isPending).toBe(true);
      expect(choreRotationService.getRotation).not.toHaveBeenCalled();
    });

    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useChoreRotation('house1', false), {
        wrapper,
      });
      expect(result.current.isPending).toBe(true);
      expect(choreRotationService.getRotation).not.toHaveBeenCalled();
    });

    it('surfaces service errors', async () => {
      (choreRotationService.getRotation as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch chore rotation'),
      );

      const { result } = renderHook(() => useChoreRotation('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ── useAdvanceRotation ──────────────────────────────────────────────────────

  describe('useAdvanceRotation', () => {
    it('calls advanceRotation and invalidates the cache', async () => {
      (choreRotationService.advanceRotation as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useAdvanceRotation('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(choreRotationService.advanceRotation).toHaveBeenCalledWith(
        'house1',
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: choreRotationKeys.rotation('house1'),
      });
    });

    it('surfaces errors', async () => {
      (choreRotationService.advanceRotation as jest.Mock).mockRejectedValue(
        new Error('Failed to advance chore rotation'),
      );

      const { result } = renderHook(() => useAdvanceRotation('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate();
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  // ── useSetRotationOrder ─────────────────────────────────────────────────────

  describe('useSetRotationOrder', () => {
    it('calls setRotationOrder and invalidates the cache', async () => {
      (choreRotationService.setRotationOrder as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSetRotationOrder('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate({ choreName: 'Kitchen', guestIds: ['g1', 'g2'] });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(choreRotationService.setRotationOrder).toHaveBeenCalledWith(
        'house1',
        'Kitchen',
        ['g1', 'g2'],
      );
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: choreRotationKeys.rotation('house1'),
      });
    });

    it('surfaces errors', async () => {
      (choreRotationService.setRotationOrder as jest.Mock).mockRejectedValue(
        new Error('Failed to set rotation order'),
      );

      const { result } = renderHook(() => useSetRotationOrder('house1'), {
        wrapper,
      });

      act(() => {
        result.current.mutate({ choreName: 'Bathroom', guestIds: ['g1'] });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
