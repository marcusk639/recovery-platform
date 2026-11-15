import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../services/rentRoi', () => ({ getRentRoiMetrics: jest.fn() }));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

import { useRentRoiMetrics } from '../rentRoiQueries';
import { getRentRoiMetrics } from '../../../services/rentRoi';
import { logException } from '../../../util/logging';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

beforeEach(() => jest.clearAllMocks());

describe('useRentRoiMetrics', () => {
  it('fetches the house from the start date', async () => {
    (getRentRoiMetrics as jest.Mock).mockResolvedValue({ available: true });
    const { result } = renderHook(() => useRentRoiMetrics('h1', '2026-11-01'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getRentRoiMetrics).toHaveBeenCalledWith('h1', '2026-11-01');
  });

  it('logs a failure', async () => {
    const error = Object.assign(new Error('unavailable'), { code: 'functions/unavailable' });
    (getRentRoiMetrics as jest.Mock).mockRejectedValue(error);
    const { result } = renderHook(() => useRentRoiMetrics('h1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(logException).toHaveBeenCalledWith(error);
  });

  it("doesn't log the owner-only refusal staff get by design", async () => {
    const error = Object.assign(new Error('denied'), { code: 'functions/permission-denied' });
    (getRentRoiMetrics as jest.Mock).mockRejectedValue(error);
    const { result } = renderHook(() => useRentRoiMetrics('h1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(logException).not.toHaveBeenCalled();
  });

  it('does nothing without a house', () => {
    const { result } = renderHook(() => useRentRoiMetrics(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getRentRoiMetrics).not.toHaveBeenCalled();
  });
});
