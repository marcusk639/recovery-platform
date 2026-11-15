/**
 * useAdminsForHouse (#183 item 4): the admins Contacts shows, read by id from
 * the selected house's adminIds so a resident gets them too.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { adminKeys, useAdminsForHouse } from '../adminQueries';
import * as adminService from '../../../services/admin';
import { House } from '../../../entities/House';

jest.mock('../../../services/admin');

const house = { id: 'h1', adminIds: ['a1'] } as unknown as House;

describe('useAdminsForHouse', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    jest.clearAllMocks();
  });

  it("loads the selected house's admins through getAdminsForHouse", async () => {
    const admins = { a1: { id: 'a1', firstName: 'Max' } };
    (adminService.getAdminsForHouse as jest.Mock).mockResolvedValue(admins);

    const { result } = renderHook(() => useAdminsForHouse(house), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(admins);
    expect(adminService.getAdminsForHouse).toHaveBeenCalledWith(house);
  });

  it('sits under the admin list keys, so admin mutations refresh it', () => {
    renderHook(() => useAdminsForHouse(house), { wrapper });

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toHaveLength(1);
    expect(keys[0].slice(0, 2)).toEqual(adminKeys.lists());
  });

  it('does not fetch without a house', () => {
    renderHook(() => useAdminsForHouse(null), { wrapper });

    expect(adminService.getAdminsForHouse).not.toHaveBeenCalled();
  });
});
