jest.mock('../../../services/staffNotes', () => ({
  addStaffNote: jest.fn().mockResolvedValue('new-id'),
  listResidentNotes: jest.fn().mockResolvedValue([]),
  listShiftLogs: jest.fn().mockResolvedValue([]),
  deleteStaffNote: jest.fn().mockResolvedValue(undefined),
  pinStaffNote: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as staffNotesService from '../../../services/staffNotes';
import { logException } from '../../../util/logging';
import {
  staffNoteKeys,
  useResidentNotes,
  useShiftLogs,
  useAddStaffNote,
  useDeleteStaffNote,
  usePinStaffNote,
} from '../staffNoteQueries';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { wrapper, client };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('staffNoteKeys', () => {
  it('resident key includes houseId and guestId', () => {
    expect(staffNoteKeys.resident('h', 'g')).toEqual([
      'staffNotes',
      'resident',
      'h',
      'g',
    ]);
  });
  it('shiftLog key includes houseId', () => {
    expect(staffNoteKeys.shiftLog('h')).toEqual([
      'staffNotes',
      'shiftLog',
      'h',
    ]);
  });
});

describe('useResidentNotes', () => {
  it('calls listResidentNotes with houseId + guestId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResidentNotes('h', 'g'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staffNotesService.listResidentNotes).toHaveBeenCalledWith('h', 'g');
  });

  it('is disabled when houseId is empty', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResidentNotes('', 'g'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(staffNotesService.listResidentNotes).not.toHaveBeenCalled();
  });
});

describe('useShiftLogs', () => {
  it('calls listShiftLogs with houseId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useShiftLogs('h'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staffNotesService.listShiftLogs).toHaveBeenCalledWith('h');
  });
});

describe('useAddStaffNote', () => {
  it('invalidates the resident feed on resident_note write', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        type: 'resident_note',
        guestId: 'g',
        content: 'note',
      });
    });
    expect(staffNotesService.addStaffNote).toHaveBeenCalledWith({
      houseId: 'h',
      type: 'resident_note',
      guestId: 'g',
      content: 'note',
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.resident('h', 'g'),
    });
  });

  it('invalidates the shift log feed on shift_log write', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ type: 'shift_log', content: 'hi' });
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.shiftLog('h'),
    });
  });

  it('logs exceptions on failure', async () => {
    (staffNotesService.addStaffNote as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ type: 'shift_log', content: 'x' }),
      ).rejects.toThrow('boom');
    });
    expect(logException).toHaveBeenCalled();
  });
});

describe('useDeleteStaffNote', () => {
  it('invalidates resident feed when guestId provided', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ noteId: 'n', guestId: 'g' });
    });
    expect(staffNotesService.deleteStaffNote).toHaveBeenCalledWith('n');
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.resident('h', 'g'),
    });
  });
});

describe('usePinStaffNote', () => {
  it('forwards noteId + pinned to the service', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePinStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ noteId: 'n', pinned: true });
    });
    expect(staffNotesService.pinStaffNote).toHaveBeenCalledWith('n', true);
  });
});
