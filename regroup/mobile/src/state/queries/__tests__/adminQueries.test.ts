/**
 * Admin Queries Tests
 *
 * Tests for React Query hooks that manage admin/manager data.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useHouseAdmins,
  useAdmin,
  useUpdateAdmin,
  useDeleteAdmin,
  useInviteAdmin,
  adminKeys,
} from '../adminQueries';
import * as adminService from '../../../services/admin';
import Admin from '../../../entities/Admin';

// Mock the admin service at the module level
jest.mock('../../../services/admin');

describe('adminQueries', () => {
  let queryClient: QueryClient;

  // Build mock Admin objects without triggering the real constructor
  // (the real constructor calls createAdminId() which hits Firestore)
  const mockAdmin: Admin = {
    id: 'admin001',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    userId: 'user001',
    superAdmin: [],
    houseIds: ['house001'],
    avatar: undefined,
    phoneNumber: '5550001111',
    uniqueAdminAttribute: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Admin;

  const mockAdmin2: Admin = {
    ...mockAdmin,
    id: 'admin002',
    firstName: 'Bob',
    email: 'bob@example.com',
    userId: 'user002',
  } as Admin;

  const mockAdmins: Admin[] = [mockAdmin, mockAdmin2];

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

  // ─── adminKeys ───────────────────────────────────────────────────────────────

  describe('adminKeys', () => {
    it('should produce the correct base key', () => {
      expect(adminKeys.all).toEqual(['admins']);
    });

    it('should produce the correct lists key', () => {
      expect(adminKeys.lists()).toEqual(['admins', 'list']);
    });

    it('should produce the correct list key for a house', () => {
      expect(adminKeys.list('house001')).toEqual([
        'admins',
        'list',
        'house001',
      ]);
    });

    it('should produce the correct details key', () => {
      expect(adminKeys.details()).toEqual(['admins', 'detail']);
    });

    it('should produce the correct detail key for an admin', () => {
      expect(adminKeys.detail('admin001')).toEqual([
        'admins',
        'detail',
        'admin001',
      ]);
    });
  });

  // ─── useHouseAdmins ──────────────────────────────────────────────────────────

  describe('useHouseAdmins', () => {
    it('should fetch house admins successfully', async () => {
      (adminService.getHouseAdmins as jest.Mock).mockResolvedValue(mockAdmins);

      const { result } = renderHook(() => useHouseAdmins('house001'), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAdmins);
      // The hook passes { id: houseId } as a House to getHouseAdmins
      expect(adminService.getHouseAdmins).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'house001' }),
      );
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch admins');
      (adminService.getHouseAdmins as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useHouseAdmins('house001'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useHouseAdmins('house001', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(adminService.getHouseAdmins).not.toHaveBeenCalled();
    });

    it('should not fetch when houseId is empty', () => {
      const { result } = renderHook(() => useHouseAdmins(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(adminService.getHouseAdmins).not.toHaveBeenCalled();
    });
  });

  // ─── useAdmin ────────────────────────────────────────────────────────────────

  describe('useAdmin', () => {
    it('should fetch a single admin successfully', async () => {
      (adminService.getAdmin as jest.Mock).mockResolvedValue(mockAdmin);

      const { result } = renderHook(() => useAdmin('admin001'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockAdmin);
      expect(adminService.getAdmin).toHaveBeenCalledWith('admin001');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Admin not found');
      (adminService.getAdmin as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useAdmin('admin001'), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useAdmin('admin001', false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(adminService.getAdmin).not.toHaveBeenCalled();
    });

    it('should not fetch when adminId is empty', () => {
      const { result } = renderHook(() => useAdmin(''), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(adminService.getAdmin).not.toHaveBeenCalled();
    });
  });

  // ─── useUpdateAdmin ──────────────────────────────────────────────────────────

  describe('useUpdateAdmin', () => {
    it('should update an admin successfully', async () => {
      const updatedAdmin = { ...mockAdmin, firstName: 'AliceUpdated' };
      (adminService.updateAdmin as jest.Mock).mockResolvedValue(updatedAdmin);

      const { result } = renderHook(() => useUpdateAdmin(), { wrapper });

      result.current.mutate({
        adminId: 'admin001',
        updates: { firstName: 'AliceUpdated' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(adminService.updateAdmin).toHaveBeenCalledWith('admin001', {
        firstName: 'AliceUpdated',
      });
    });

    it('should set the updated admin directly in the detail cache on success', async () => {
      const updatedAdmin = { ...mockAdmin, firstName: 'AliceUpdated' };
      (adminService.updateAdmin as jest.Mock).mockResolvedValue(updatedAdmin);

      const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

      const { result } = renderHook(() => useUpdateAdmin(), { wrapper });

      result.current.mutate({
        adminId: 'admin001',
        updates: { firstName: 'AliceUpdated' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(setDataSpy).toHaveBeenCalledWith(
        adminKeys.detail('admin001'),
        updatedAdmin,
      );
    });

    it('should invalidate the admin lists on success', async () => {
      const updatedAdmin = { ...mockAdmin, firstName: 'AliceUpdated' };
      (adminService.updateAdmin as jest.Mock).mockResolvedValue(updatedAdmin);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateAdmin(), { wrapper });

      result.current.mutate({
        adminId: 'admin001',
        updates: { firstName: 'AliceUpdated' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: adminKeys.lists(),
      });
    });

    it('should handle update error', async () => {
      const error = new Error('Update failed');
      (adminService.updateAdmin as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateAdmin(), { wrapper });

      result.current.mutate({
        adminId: 'admin001',
        updates: { firstName: 'Bad' },
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── useDeleteAdmin ──────────────────────────────────────────────────────────

  describe('useDeleteAdmin', () => {
    it('should delete an admin successfully', async () => {
      // deleteAdmin returns the adminId string
      (adminService.deleteAdmin as jest.Mock).mockResolvedValue('admin001');

      const { result } = renderHook(() => useDeleteAdmin(), { wrapper });

      result.current.mutate({ adminId: 'admin001', houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(adminService.deleteAdmin).toHaveBeenCalledWith('admin001');
    });

    it('should remove the admin detail query from cache on success', async () => {
      (adminService.deleteAdmin as jest.Mock).mockResolvedValue('admin001');

      const removeQueriesSpy = jest.spyOn(queryClient, 'removeQueries');

      const { result } = renderHook(() => useDeleteAdmin(), { wrapper });

      result.current.mutate({ adminId: 'admin001', houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(removeQueriesSpy).toHaveBeenCalledWith({
        queryKey: adminKeys.detail('admin001'),
      });
    });

    it('should invalidate admin lists on success', async () => {
      (adminService.deleteAdmin as jest.Mock).mockResolvedValue('admin001');

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteAdmin(), { wrapper });

      result.current.mutate({ adminId: 'admin001', houseId: 'house1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: adminKeys.lists(),
      });
    });

    it('should handle delete error', async () => {
      const error = new Error('Delete failed');
      (adminService.deleteAdmin as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useDeleteAdmin(), { wrapper });

      result.current.mutate({ adminId: 'admin001', houseId: 'house1' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── useInviteAdmin ──────────────────────────────────────────────────────────

  describe('useInviteAdmin', () => {
    const inviteArgs = {
      email: 'newadmin@example.com',
      houseId: 'house001',
      houseName: 'The Recovery House',
    };

    it('should send an admin invite successfully', async () => {
      (adminService.sendAdminInvite as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() => useInviteAdmin(), { wrapper });

      result.current.mutate(inviteArgs);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(adminService.sendAdminInvite).toHaveBeenCalledWith(
        'newadmin@example.com',
        'house001',
        'The Recovery House',
      );
    });

    it('should invalidate the house admin list on success', async () => {
      (adminService.sendAdminInvite as jest.Mock).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useInviteAdmin(), { wrapper });

      result.current.mutate(inviteArgs);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: adminKeys.list('house001'),
      });
    });

    it('should handle invite error', async () => {
      const error = new Error('Invite failed');
      (adminService.sendAdminInvite as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useInviteAdmin(), { wrapper });

      result.current.mutate(inviteArgs);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── Query Key Structure ─────────────────────────────────────────────────────

  describe('Query Key Structure', () => {
    it('should store admin detail under the correct cache key', async () => {
      (adminService.getAdmin as jest.Mock).mockResolvedValue(mockAdmin);

      const { result } = renderHook(() => useAdmin('admin001'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(adminKeys.detail('admin001'));
      expect(cached).toEqual(mockAdmin);
    });

    it('should use consistent query keys for list and detail caches', async () => {
      (adminService.getHouseAdmins as jest.Mock).mockResolvedValue(mockAdmins);
      (adminService.getAdmin as jest.Mock).mockResolvedValue(mockAdmin);

      const { result: listResult } = renderHook(
        () => useHouseAdmins('house001'),
        { wrapper },
      );
      const { result: detailResult } = renderHook(() => useAdmin('admin001'), {
        wrapper,
      });

      await waitFor(() => {
        expect(listResult.current.isSuccess).toBe(true);
        expect(detailResult.current.isSuccess).toBe(true);
      });

      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      expect(queries.some(q => q.queryKey[0] === 'admins')).toBe(true);
    });
  });
});
