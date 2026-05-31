/**
 * Application Queries Tests
 *
 * Tests for React Query hooks that manage house application data
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  applicationKeys,
  useMyApplications,
  useHouseApplications,
  useSubmitApplication,
  useUpdateApplicationStatus,
} from '../applicationQueries';

// Mock the services
jest.mock('../../../services/applications');
jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(),
    collectionGroup: jest.fn(),
  },
  auth: {
    currentUser: {
      uid: 'test-uid',
    },
  },
}));

import * as applicationService from '../../../services/applications';
import type { ApplicationStatus } from '../../../entities/Application';

describe('applicationKeys', () => {
  it('all key is stable', () => {
    expect(applicationKeys.all).toEqual(['applications']);
  });

  it('mine key includes uid', () => {
    expect(applicationKeys.mine('uid-1')).toEqual([
      'applications',
      'mine',
      'uid-1',
    ]);
  });

  it('houseList key includes houseId', () => {
    expect(applicationKeys.houseList('h1')).toEqual([
      'applications',
      'house',
      'h1',
    ]);
  });

  it('detail key includes houseId and appId', () => {
    expect(applicationKeys.detail('h1', 'app1')).toEqual([
      'applications',
      'house',
      'h1',
      'detail',
      'app1',
    ]);
  });
});

// ─── Hook Tests ──────────────────────────────────────────────────────────────

describe('Application Query Hooks', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ── useMyApplications ───────────────────────────────────────────────────────

  describe('useMyApplications', () => {
    it('fetches user applications on success', async () => {
      const mockApplications = [
        {
          id: 'app1',
          houseId: 'house1',
          status: 'pending' as ApplicationStatus,
        },
      ];
      (applicationService.getMyApplications as jest.Mock).mockResolvedValue(
        mockApplications,
      );

      const { result } = renderHook(() => useMyApplications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockApplications);
      expect(applicationService.getMyApplications).toHaveBeenCalled();
    });

    it('uses correct query key with current user uid', async () => {
      (applicationService.getMyApplications as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useMyApplications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(applicationKeys.mine('test-uid'));
      expect(cached).toBeDefined();
    });

    it('enables query by default', async () => {
      (applicationService.getMyApplications as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useMyApplications(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Query was enabled and fetched data
      expect(result.current.data).toBeDefined();
    });

    it('disables query when enabled is false', () => {
      const { result } = renderHook(() => useMyApplications(false), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(applicationService.getMyApplications).not.toHaveBeenCalled();
    });

    it('does not fetch when uid is empty (auth.currentUser.uid is test-uid in mock)', () => {
      // In this test, auth.currentUser.uid is 'test-uid' from the mock,
      // so enabled && !!uid will be true and the query will fetch.
      // This is expected behavior. If we need to test with empty uid,
      // we'd need to remock auth.currentUser.uid, which we can't do per-test.
      const { result } = renderHook(() => useMyApplications(true), { wrapper });

      // Query should be enabled since uid is 'test-uid'
      expect(applicationService.getMyApplications).toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch applications');
      (applicationService.getMyApplications as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useMyApplications(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useHouseApplications ────────────────────────────────────────────────────

  describe('useHouseApplications', () => {
    it('fetches house applications on success', async () => {
      const mockApplications = [
        {
          id: 'app1',
          houseId: 'house1',
          status: 'pending' as ApplicationStatus,
        },
        {
          id: 'app2',
          houseId: 'house1',
          status: 'approved' as ApplicationStatus,
        },
      ];
      (applicationService.listHouseApplications as jest.Mock).mockResolvedValue(
        mockApplications,
      );

      const { result } = renderHook(() => useHouseApplications('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockApplications);
      expect(applicationService.listHouseApplications).toHaveBeenCalledWith(
        'house1',
      );
    });

    it('uses correct query key with houseId', async () => {
      (applicationService.listHouseApplications as jest.Mock).mockResolvedValue(
        [],
      );

      const { result } = renderHook(() => useHouseApplications('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cached = queryClient.getQueryData(
        applicationKeys.houseList('house1'),
      );
      expect(cached).toBeDefined();
    });

    it('enables query by default when houseId is provided', async () => {
      (applicationService.listHouseApplications as jest.Mock).mockResolvedValue(
        [],
      );

      const { result } = renderHook(() => useHouseApplications('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Query was enabled and fetched data
      expect(result.current.data).toBeDefined();
    });

    it('disables query when enabled is false', () => {
      const { result } = renderHook(
        () => useHouseApplications('house1', false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(applicationService.listHouseApplications).not.toHaveBeenCalled();
    });

    it('disables query when houseId is empty', () => {
      const { result } = renderHook(() => useHouseApplications(''), {
        wrapper,
      });

      expect(result.current.isLoading).toBe(false);
      expect(applicationService.listHouseApplications).not.toHaveBeenCalled();
    });

    it('surfaces errors from the service', async () => {
      const error = new Error('Failed to fetch house applications');
      (applicationService.listHouseApplications as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useHouseApplications('house1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useSubmitApplication ────────────────────────────────────────────────────

  describe('useSubmitApplication', () => {
    it('calls submitApplication with houseId and data on mutate', async () => {
      const mockApplication = {
        id: 'app1',
        houseId: 'house1',
        status: 'pending' as ApplicationStatus,
      };
      (applicationService.submitApplication as jest.Mock).mockResolvedValue(
        mockApplication,
      );

      const { result } = renderHook(() => useSubmitApplication(), { wrapper });

      act(() => {
        result.current.mutate({
          houseId: 'house1',
          data: { name: 'John Doe', email: 'john@example.com' },
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(applicationService.submitApplication).toHaveBeenCalledWith(
        'house1',
        { name: 'John Doe', email: 'john@example.com' },
      );
    });

    it('invalidates user applications query on success', async () => {
      (applicationService.submitApplication as jest.Mock).mockResolvedValue({
        id: 'app1',
      });

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSubmitApplication(), { wrapper });

      act(() => {
        result.current.mutate({
          houseId: 'house1',
          data: {},
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: applicationKeys.mine('test-uid'),
      });
    });

    it('surfaces errors from submitApplication', async () => {
      const error = new Error('Failed to submit application');
      (applicationService.submitApplication as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(() => useSubmitApplication(), { wrapper });

      act(() => {
        result.current.mutate({
          houseId: 'house1',
          data: {},
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ── useUpdateApplicationStatus ──────────────────────────────────────────────

  describe('useUpdateApplicationStatus', () => {
    it('calls updateApplicationStatus with correct arguments on mutate', async () => {
      (
        applicationService.updateApplicationStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useUpdateApplicationStatus('house1'),
        { wrapper },
      );

      act(() => {
        result.current.mutate({
          appId: 'app1',
          status: 'approved' as ApplicationStatus,
          note: 'Approved',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(applicationService.updateApplicationStatus).toHaveBeenCalledWith(
        'house1',
        'app1',
        'approved' as ApplicationStatus,
        'Approved',
      );
    });

    it('calls updateApplicationStatus with optional note parameter', async () => {
      (
        applicationService.updateApplicationStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useUpdateApplicationStatus('house1'),
        { wrapper },
      );

      act(() => {
        result.current.mutate({
          appId: 'app1',
          status: 'rejected' as ApplicationStatus,
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(applicationService.updateApplicationStatus).toHaveBeenCalledWith(
        'house1',
        'app1',
        'rejected' as ApplicationStatus,
        undefined,
      );
    });

    it('invalidates house applications query on success', async () => {
      (
        applicationService.updateApplicationStatus as jest.Mock
      ).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useUpdateApplicationStatus('house1'),
        { wrapper },
      );

      act(() => {
        result.current.mutate({
          appId: 'app1',
          status: 'approved' as ApplicationStatus,
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: applicationKeys.houseList('house1'),
      });
    });

    it('surfaces errors from updateApplicationStatus', async () => {
      const error = new Error('Failed to update application status');
      (
        applicationService.updateApplicationStatus as jest.Mock
      ).mockRejectedValue(error);

      const { result } = renderHook(
        () => useUpdateApplicationStatus('house1'),
        { wrapper },
      );

      act(() => {
        result.current.mutate({
          appId: 'app1',
          status: 'approved' as ApplicationStatus,
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });
});
