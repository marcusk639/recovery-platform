/**
 * House Queries Tests
 *
 * Tests for React Query hooks that manage house data from Firestore.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useHouse,
  useHouses,
  useHousesByAdmin,
  useNearbyHouses,
  useUpdateHouse,
  useCreateHouse,
  useUpdateHouseAdmins,
  houseKeys,
} from '../houseQueries';
import * as houseService from '../../../services/house';
import { House } from '../../../entities/House';
import { Houses } from '../../../types';

// Mock the house service at the module level
jest.mock('../../../services/house');

describe('houseQueries', () => {
  let queryClient: QueryClient;

  // Build a plain mock House without triggering the House constructor
  // (the House class constructor calls createHouseId() which hits Firestore)
  const mockHouse: House = {
    id: 'house001',
    timezone: 'America/New_York',
    ownerId: 'owner001',
    lat: 40.7128,
    lng: -74.006,
    geohash: 'dr5r',
    adminId: 'admin001',
    adminIds: ['admin001'],
    superAdminIds: [],
    street: '123 Main St',
    city: 'New York',
    country: 'US',
    health: {},
    name: 'The Recovery House',
    monthlyRent: 1200,
    weeklyRent: 300,
    currentCapacity: 4,
    maximumCapacity: 8,
    state: 'NY',
    zip: '10001',
    code: 'H001',
    avatar: '',
    imageUrl: '',
    depositsAndFees: 500,
    certified: true,
    phoneNumber: '5551234567',
    rentFrequency: 'monthly',
    pendingAdminInvites: [],
    pendingGuestInvites: [],
    subscriptionStatus: 'active',
    isDemoHouse: false,
    houseType: 'traditional',
    seniorPeerEmails: [],
    managerSetupType: 'operator-only',
    awaitingVerification: [],
    chores: {},
    phases: {},
    gender: '',
    disputes: {},
    issues: {},
    applications: {},
    complaints: {},
    rooms: {},
    baths: 2,
    wifi: true,
    rating: 4,
    stripeAccountId: undefined,
    stripeStatus: 'not_connected' as any,
    stripeConnectedAt: undefined,
    stripeLastSyncAt: undefined,
    stripeError: undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as House;

  const mockHouse2: House = {
    ...mockHouse,
    id: 'house002',
    name: 'Serenity House',
    street: '456 Oak Ave',
  } as House;

  const mockHouses: Houses = {
    house001: mockHouse,
    house002: mockHouse2,
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

  // ─── houseKeys ───────────────────────────────────────────────────────────────

  describe('houseKeys', () => {
    it('should produce the correct base key', () => {
      expect(houseKeys.all).toEqual(['houses']);
    });

    it('should produce the correct lists key', () => {
      expect(houseKeys.lists()).toEqual(['houses', 'list']);
    });

    it('should produce the correct list key with filters', () => {
      expect(
        houseKeys.list({ attribute: 'adminIds', value: 'admin001' }),
      ).toEqual(['houses', 'list', { attribute: 'adminIds', value: 'admin001' }]);
    });

    it('should produce the correct details key', () => {
      expect(houseKeys.details()).toEqual(['houses', 'detail']);
    });

    it('should produce the correct detail key for a house', () => {
      expect(houseKeys.detail('house001')).toEqual([
        'houses',
        'detail',
        'house001',
      ]);
    });

    it('should produce the correct nearby key', () => {
      expect(houseKeys.nearby(40.71, -74.0, 25)).toEqual([
        'houses',
        'nearby',
        { lat: 40.71, lng: -74.0, distance: 25 },
      ]);
    });
  });

  // ─── useHouse ────────────────────────────────────────────────────────────────

  describe('useHouse', () => {
    it('should fetch a single house successfully', async () => {
      (houseService.getHouse as jest.Mock).mockResolvedValue(mockHouse);

      const { result } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHouse);
      expect(houseService.getHouse).toHaveBeenCalledWith('house001');
    });

    it('should handle fetch error', async () => {
      const error = new Error('House not found');
      (houseService.getHouse as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useHouse('house001', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouse).not.toHaveBeenCalled();
    });

    it('should not fetch when houseId is empty', () => {
      const { result } = renderHook(
        () => useHouse(''),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouse).not.toHaveBeenCalled();
    });

    it('should cache data and serve from cache on second render', async () => {
      (houseService.getHouse as jest.Mock).mockResolvedValue(mockHouse);

      const { result: result1 } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      const { result: result2 } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );

      expect(result2.current.data).toEqual(mockHouse);
      expect(houseService.getHouse).toHaveBeenCalledTimes(1);
    });
  });

  // ─── useHouses ───────────────────────────────────────────────────────────────

  describe('useHouses', () => {
    it('should fetch houses by attribute successfully', async () => {
      (houseService.getHouses as jest.Mock).mockResolvedValue(mockHouses);

      const { result } = renderHook(
        () => useHouses('adminIds', 'array-contains', 'admin001'),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHouses);
      expect(houseService.getHouses).toHaveBeenCalledWith(
        'adminIds',
        'array-contains',
        'admin001',
      );
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch houses');
      (houseService.getHouses as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useHouses('adminIds', 'array-contains', 'admin001'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useHouses('adminIds', 'array-contains', 'admin001', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouses).not.toHaveBeenCalled();
    });

    it('should not fetch when attribute is empty', () => {
      const { result } = renderHook(
        () => useHouses('', 'array-contains', 'admin001'),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouses).not.toHaveBeenCalled();
    });

    it('should not fetch when value is empty', () => {
      const { result } = renderHook(
        () => useHouses('adminIds', 'array-contains', ''),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouses).not.toHaveBeenCalled();
    });
  });

  // ─── useHousesByAdmin ────────────────────────────────────────────────────────

  describe('useHousesByAdmin', () => {
    it('should fetch houses for a given admin using array-contains', async () => {
      (houseService.getHouses as jest.Mock).mockResolvedValue(mockHouses);

      const { result } = renderHook(
        () => useHousesByAdmin('admin001'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHouses);
      // useHousesByAdmin delegates to useHouses with fixed 'adminIds'/'array-contains'
      expect(houseService.getHouses).toHaveBeenCalledWith(
        'adminIds',
        'array-contains',
        'admin001',
      );
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useHousesByAdmin('admin001', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getHouses).not.toHaveBeenCalled();
    });
  });

  // ─── useNearbyHouses ─────────────────────────────────────────────────────────

  describe('useNearbyHouses', () => {
    it('should fetch nearby houses successfully', async () => {
      (houseService.getNearbyHouses as jest.Mock).mockResolvedValue(mockHouses);

      const { result } = renderHook(
        () => useNearbyHouses(40.71, -74.0, 25),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockHouses);
      expect(houseService.getNearbyHouses).toHaveBeenCalledWith(
        40.71,
        -74.0,
        25,
      );
    });

    it('should handle fetch error', async () => {
      const error = new Error('Location fetch failed');
      (houseService.getNearbyHouses as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(
        () => useNearbyHouses(40.71, -74.0, 25),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useNearbyHouses(40.71, -74.0, 25, false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getNearbyHouses).not.toHaveBeenCalled();
    });

    it('should not fetch when lat is 0 (falsy)', () => {
      const { result } = renderHook(
        () => useNearbyHouses(0, -74.0, 25),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getNearbyHouses).not.toHaveBeenCalled();
    });

    it('should not fetch when lng is 0 (falsy)', () => {
      const { result } = renderHook(
        () => useNearbyHouses(40.71, 0, 25),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(houseService.getNearbyHouses).not.toHaveBeenCalled();
    });
  });

  // ─── useUpdateHouse ──────────────────────────────────────────────────────────

  describe('useUpdateHouse', () => {
    it('should update a house successfully', async () => {
      (houseService.updateHouse as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateHouse(), { wrapper });

      result.current.mutate({
        houseId: 'house001',
        values: { name: 'Renamed House' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(houseService.updateHouse).toHaveBeenCalledWith('house001', {
        name: 'Renamed House',
      });
    });

    it('should optimistically update the house in cache', async () => {
      // Pre-populate the cache
      queryClient.setQueryData(houseKeys.detail('house001'), mockHouse);

      (houseService.updateHouse as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(undefined), 100)),
      );

      const { result } = renderHook(() => useUpdateHouse(), { wrapper });

      result.current.mutate({
        houseId: 'house001',
        values: { name: 'Optimistic Name' },
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<House>(
          houseKeys.detail('house001'),
        );
        expect(cached?.name).toBe('Optimistic Name');
      });
    });

    it('should roll back the cache on error', async () => {
      queryClient.setQueryData(houseKeys.detail('house001'), mockHouse);

      const error = new Error('Update failed');
      (houseService.updateHouse as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateHouse(), { wrapper });

      result.current.mutate({
        houseId: 'house001',
        values: { name: 'Bad Name' },
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      const cached = queryClient.getQueryData<House>(
        houseKeys.detail('house001'),
      );
      expect(cached?.name).toBe('The Recovery House');
    });

    it('should invalidate the house detail and lists on settled', async () => {
      (houseService.updateHouse as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateHouse(), { wrapper });

      result.current.mutate({
        houseId: 'house001',
        values: { name: 'Renamed House' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: houseKeys.detail('house001'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: houseKeys.lists(),
      });
    });
  });

  // ─── useCreateHouse ──────────────────────────────────────────────────────────

  describe('useCreateHouse', () => {
    it('should create a house successfully', async () => {
      (houseService.createHouse as jest.Mock).mockResolvedValue(mockHouse);

      const { result } = renderHook(() => useCreateHouse(), { wrapper });

      result.current.mutate(mockHouse);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(houseService.createHouse).toHaveBeenCalledWith(mockHouse);
    });

    it('should invalidate all house lists on success', async () => {
      (houseService.createHouse as jest.Mock).mockResolvedValue(mockHouse);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateHouse(), { wrapper });

      result.current.mutate(mockHouse);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: houseKeys.lists(),
      });
    });

    it('should handle create error', async () => {
      const error = new Error('Create failed');
      (houseService.createHouse as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useCreateHouse(), { wrapper });

      result.current.mutate(mockHouse);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── useUpdateHouseAdmins ────────────────────────────────────────────────────

  describe('useUpdateHouseAdmins', () => {
    it('should update house admins successfully', async () => {
      (houseService.updateHouseAdmins as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useUpdateHouseAdmins(), { wrapper });

      result.current.mutate({ houseId: 'house001', adminId: 'admin002' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(houseService.updateHouseAdmins).toHaveBeenCalledWith(
        'house001',
        'admin002',
      );
    });

    it('should invalidate the house detail on success', async () => {
      (houseService.updateHouseAdmins as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateHouseAdmins(), { wrapper });

      result.current.mutate({ houseId: 'house001', adminId: 'admin002' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: houseKeys.detail('house001'),
      });
    });

    it('should handle update admins error', async () => {
      const error = new Error('Admin update failed');
      (houseService.updateHouseAdmins as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateHouseAdmins(), { wrapper });

      result.current.mutate({ houseId: 'house001', adminId: 'admin002' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── Query Key Structure ─────────────────────────────────────────────────────

  describe('Query Key Structure', () => {
    it('should store house detail under the correct cache key', async () => {
      (houseService.getHouse as jest.Mock).mockResolvedValue(mockHouse);

      const { result } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(houseKeys.detail('house001'));
      expect(cached).toEqual(mockHouse);
    });

    it('should use consistent query keys for list and detail caches', async () => {
      (houseService.getHouse as jest.Mock).mockResolvedValue(mockHouse);
      (houseService.getHouses as jest.Mock).mockResolvedValue(mockHouses);

      const { result: houseResult } = renderHook(
        () => useHouse('house001'),
        { wrapper },
      );
      const { result: housesResult } = renderHook(
        () => useHouses('adminIds', '==', 'admin001'),
        { wrapper },
      );

      await waitFor(() => {
        expect(houseResult.current.isSuccess).toBe(true);
        expect(housesResult.current.isSuccess).toBe(true);
      });

      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      expect(queries.some(q => q.queryKey[0] === 'houses')).toBe(true);
    });
  });
});
