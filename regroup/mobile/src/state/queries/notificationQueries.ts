import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Notification } from '../../entities/Notification';
import * as notificationService from '../../services/notifications';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => [...notificationKeys.all, 'list', userId] as const,
  unread: (userId: string) => [...notificationKeys.all, 'unread', userId] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Fetch all notifications for a user.
 *
 * @param userId - The user's UID
 * @param enabled - Whether to enable the query
 */
export const useNotifications = (userId: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: () => notificationService.getUserNotifications(userId),
    enabled: enabled && !!userId,
    staleTime: 30000, // 30 seconds
    select: (data: Notification[]) =>
      [...data].sort((a, b) => {
        // Sort by date descending (newest first)
        const dateA = a.date || a.createdAt || '';
        const dateB = b.date || b.createdAt || '';
        return dateB.localeCompare(dateA);
      }),
  });
};

/**
 * Mark a single notification as read.
 */
export const useMarkNotificationRead = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.markNotificationAsRead(notificationId),

    // Optimistic update
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list(userId) });

      const previous = queryClient.getQueryData<Notification[]>(
        notificationKeys.list(userId),
      );

      queryClient.setQueryData<Notification[]>(notificationKeys.list(userId), old =>
        (old ?? []).map(n =>
          n.id === notificationId ? { ...n, read: true } : n,
        ),
      );

      return { previous };
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.list(userId), context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId) });
    },
  });
};

/**
 * Mark all notifications as read for a user.
 */
export const useMarkAllNotificationsRead = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationService.markAllNotificationsAsRead(userId),

    // Optimistic update — flip every notification to read=true immediately
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.list(userId) });

      const previous = queryClient.getQueryData<Notification[]>(
        notificationKeys.list(userId),
      );

      queryClient.setQueryData<Notification[]>(notificationKeys.list(userId), old =>
        (old ?? []).map(n => ({ ...n, read: true })),
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationKeys.list(userId), context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(userId) });
    },
  });
};
