/**
 * Notification Queries Tests
 *
 * Tests for React Query hooks that manage user notification data.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  notificationKeys,
} from '../notificationQueries';
import * as notificationService from '../../../services/notifications';
import { Notification } from '../../../entities/Notification';

// Mock the notification service at the module level
jest.mock('../../../services/notifications');

describe('notificationQueries', () => {
  let queryClient: QueryClient;

  const userId = 'user123';

  // Mock data — plain objects that satisfy the Notification shape
  const mockNotification: Notification = Object.assign(new Notification(), {
    id: 'notif001',
    userId,
    houseId: 'house456',
    message: 'You have a new dispute',
    subject: 'Dispute Notice',
    date: '2026-02-20',
    createdAt: '2026-02-20T10:00:00.000Z',
    updatedAt: '2026-02-20T10:00:00.000Z',
    type: 'dispute' as const,
    read: false,
  });

  const mockNotificationRead: Notification = Object.assign(new Notification(), {
    ...mockNotification,
    id: 'notif002',
    date: '2026-02-19',
    createdAt: '2026-02-19T10:00:00.000Z',
    updatedAt: '2026-02-19T10:00:00.000Z',
    read: true,
  });

  const mockNotifications: Notification[] = [
    mockNotification,
    mockNotificationRead,
  ];

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

  // ─── notificationKeys ────────────────────────────────────────────────────────

  describe('notificationKeys', () => {
    it('should produce the correct base key', () => {
      expect(notificationKeys.all).toEqual(['notifications']);
    });

    it('should produce the correct list key for a user', () => {
      expect(notificationKeys.list(userId)).toEqual([
        'notifications',
        'list',
        userId,
      ]);
    });

    it('should produce the correct unread key for a user', () => {
      expect(notificationKeys.unread(userId)).toEqual([
        'notifications',
        'unread',
        userId,
      ]);
    });
  });

  // ─── useNotifications ────────────────────────────────────────────────────────

  describe('useNotifications', () => {
    it('should fetch notifications successfully', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      const { result } = renderHook(
        () => useNotifications(userId),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should sort notifications newest first by date', async () => {
      // notif001 has date 2026-02-20 (newer), notif002 has 2026-02-19 (older)
      // Service returns them in an arbitrary order
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue([
        mockNotificationRead, // older first
        mockNotification,     // newer second
      ]);

      const { result } = renderHook(
        () => useNotifications(userId),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // select() sorts descending so newest (2026-02-20) comes first
      expect(result.current.data![0].id).toBe('notif001');
      expect(result.current.data![1].id).toBe('notif002');
    });

    it('should handle fetch error', async () => {
      const error = new Error('Failed to fetch notifications');
      (notificationService.getUserNotifications as jest.Mock).mockRejectedValue(
        error,
      );

      const { result } = renderHook(
        () => useNotifications(userId),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });

    it('should not fetch when disabled', () => {
      const { result } = renderHook(
        () => useNotifications(userId, false),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(notificationService.getUserNotifications).not.toHaveBeenCalled();
    });

    it('should not fetch when userId is empty', () => {
      const { result } = renderHook(
        () => useNotifications(''),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(notificationService.getUserNotifications).not.toHaveBeenCalled();
    });

    it('should return empty array when user has no notifications', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue(
        [],
      );

      const { result } = renderHook(
        () => useNotifications(userId),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });
  });

  // ─── useMarkNotificationRead ─────────────────────────────────────────────────

  describe('useMarkNotificationRead', () => {
    it('should mark a single notification as read', async () => {
      (
        notificationService.markNotificationAsRead as jest.Mock
      ).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useMarkNotificationRead(userId),
        { wrapper },
      );

      result.current.mutate('notif001');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(notificationService.markNotificationAsRead).toHaveBeenCalledWith(
        'notif001',
      );
    });

    it('should optimistically mark the notification as read in cache', async () => {
      // Pre-populate the cache with unread notifications
      queryClient.setQueryData(
        notificationKeys.list(userId),
        [mockNotification, mockNotificationRead],
      );

      (
        notificationService.markNotificationAsRead as jest.Mock
      ).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(undefined), 100)),
      );

      const { result } = renderHook(
        () => useMarkNotificationRead(userId),
        { wrapper },
      );

      result.current.mutate('notif001');

      // The optimistic update fires synchronously in onMutate after cancelQueries
      await waitFor(() => {
        const cached = queryClient.getQueryData<Notification[]>(
          notificationKeys.list(userId),
        );
        const target = cached?.find(n => n.id === 'notif001');
        expect(target?.read).toBe(true);
      });
    });

    it('should roll back the cache on error', async () => {
      const original = [mockNotification, mockNotificationRead];
      queryClient.setQueryData(notificationKeys.list(userId), original);

      const error = new Error('Mark as read failed');
      (
        notificationService.markNotificationAsRead as jest.Mock
      ).mockRejectedValue(error);

      const { result } = renderHook(
        () => useMarkNotificationRead(userId),
        { wrapper },
      );

      result.current.mutate('notif001');

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Cache should have been restored to the pre-mutation snapshot
      const cached = queryClient.getQueryData<Notification[]>(
        notificationKeys.list(userId),
      );
      expect(cached).toEqual(original);
    });

    it('should invalidate notifications list on settled', async () => {
      (
        notificationService.markNotificationAsRead as jest.Mock
      ).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useMarkNotificationRead(userId),
        { wrapper },
      );

      result.current.mutate('notif001');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notificationKeys.list(userId),
      });
    });

    it('should handle error', async () => {
      const error = new Error('Mark failed');
      (
        notificationService.markNotificationAsRead as jest.Mock
      ).mockRejectedValue(error);

      const { result } = renderHook(
        () => useMarkNotificationRead(userId),
        { wrapper },
      );

      result.current.mutate('notif001');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
    });
  });

  // ─── useMarkAllNotificationsRead ─────────────────────────────────────────────

  describe('useMarkAllNotificationsRead', () => {
    it('should mark all notifications as read', async () => {
      (
        notificationService.markAllNotificationsAsRead as jest.Mock
      ).mockResolvedValue(undefined);

      const { result } = renderHook(
        () => useMarkAllNotificationsRead(userId),
        { wrapper },
      );

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        notificationService.markAllNotificationsAsRead,
      ).toHaveBeenCalledWith(userId);
    });

    it('should optimistically set all notifications to read in cache', async () => {
      queryClient.setQueryData(
        notificationKeys.list(userId),
        [mockNotification, mockNotificationRead],
      );

      (
        notificationService.markAllNotificationsAsRead as jest.Mock
      ).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(undefined), 100)),
      );

      const { result } = renderHook(
        () => useMarkAllNotificationsRead(userId),
        { wrapper },
      );

      result.current.mutate();

      await waitFor(() => {
        const cached = queryClient.getQueryData<Notification[]>(
          notificationKeys.list(userId),
        );
        expect(cached?.every(n => n.read === true)).toBe(true);
      });
    });

    it('should roll back cache on error', async () => {
      const original = [mockNotification, mockNotificationRead];
      queryClient.setQueryData(notificationKeys.list(userId), original);

      const error = new Error('Mark all failed');
      (
        notificationService.markAllNotificationsAsRead as jest.Mock
      ).mockRejectedValue(error);

      const { result } = renderHook(
        () => useMarkAllNotificationsRead(userId),
        { wrapper },
      );

      result.current.mutate();

      await waitFor(() => expect(result.current.isError).toBe(true));

      const cached = queryClient.getQueryData<Notification[]>(
        notificationKeys.list(userId),
      );
      expect(cached).toEqual(original);
    });

    it('should invalidate notifications list on settled', async () => {
      (
        notificationService.markAllNotificationsAsRead as jest.Mock
      ).mockResolvedValue(undefined);

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(
        () => useMarkAllNotificationsRead(userId),
        { wrapper },
      );

      result.current.mutate();

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: notificationKeys.list(userId),
      });
    });
  });

  // ─── Query Key Structure ─────────────────────────────────────────────────────

  describe('Query Key Structure', () => {
    it('should store notifications under the correct cache key', async () => {
      (notificationService.getUserNotifications as jest.Mock).mockResolvedValue(
        mockNotifications,
      );

      const { result } = renderHook(
        () => useNotifications(userId),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      expect(queries.some(q => q.queryKey[0] === 'notifications')).toBe(true);
    });
  });
});
