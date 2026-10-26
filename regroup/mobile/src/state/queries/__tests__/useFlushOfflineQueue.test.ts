/**
 * useFlushOfflineQueue replays only the signed-in user's queued activities.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let mockCurrentUser: { uid: string } | null = { uid: 'u1' };
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ currentUser: mockCurrentUser }),
}));

const mockFlushOfflineActivities = jest.fn();
jest.mock('../../../services/activity', () => ({
  flushOfflineActivities: (...args: unknown[]) => mockFlushOfflineActivities(...args),
}));

import { useFlushOfflineQueue } from '../useFlushOfflineQueue';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

describe('useFlushOfflineQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { uid: 'u1' };
    mockFlushOfflineActivities.mockResolvedValue({ synced: 2, failed: 0 });
  });

  it("flushes with the signed-in user's uid", async () => {
    const { result } = renderHook(() => useFlushOfflineQueue(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFlushOfflineActivities).toHaveBeenCalledWith('u1');
    expect(result.current.data).toEqual({ synced: 2, failed: 0 });
  });

  it('resolves { synced: 0, failed: 0 } without flushing when signed out', async () => {
    mockCurrentUser = null;
    const { result } = renderHook(() => useFlushOfflineQueue(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFlushOfflineActivities).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ synced: 0, failed: 0 });
  });
});
