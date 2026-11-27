/**
 * useResidentCharges asks only by the resident's own uid (the rentCharges rule lets a
 * resident list nothing else), and waits until both ids are known.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listGuestCharges } from '../../../services/rentCharges';
import { useResidentCharges } from '../rentChargeQueries';

jest.mock('../../../services/rentCharges', () => ({
  listGuestCharges: jest.fn(),
  previewRentCharges: jest.fn(),
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

const mockList = listGuestCharges as jest.MockedFunction<typeof listGuestCharges>;

const renderFor = (scope: { houseId?: string; guestUserId?: string }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useResidentCharges(scope), { wrapper });
};

beforeEach(() => mockList.mockReset().mockResolvedValue([]));

describe('useResidentCharges', () => {
  it("lists by house and the resident's own uid", async () => {
    const { result } = renderFor({ houseId: 'h1', guestUserId: 'u1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockList).toHaveBeenCalledWith({ houseId: 'h1', guestUserId: 'u1' });
  });

  it('asks nothing until both the house and the uid are known', () => {
    renderFor({ houseId: 'h1', guestUserId: undefined });
    renderFor({ houseId: undefined, guestUserId: 'u1' });
    expect(mockList).not.toHaveBeenCalled();
  });
});
