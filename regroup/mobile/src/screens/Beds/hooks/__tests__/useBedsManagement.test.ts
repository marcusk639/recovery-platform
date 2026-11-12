// A refused or failed beds write must be visible: the operator is told, and an
// assignment that didn't save never reports "Bed Assigned".
import { act, renderHook } from '@testing-library/react-native';

const mockMutateAsync = jest.fn();
const mockNotify = jest.fn();
const mockDismissFormModal = jest.fn();
const mockHouse = {
  id: 'house-1',
  rooms: {
    '2A': {
      id: '2A',
      beds: { b1: { id: 'b1', guestId: 'guest-a' }, b2: { id: 'b2', guestId: null } },
    },
  },
};

jest.mock('../../../../state/store', () => ({
  useAppSelector: () => undefined,
  useAppDispatch: () => jest.fn(),
}));
jest.mock('../../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: mockHouse }),
}));
jest.mock('../../../../state/queries/guestQueries', () => ({
  useGuests: () => ({ data: { 'guest-b': { id: 'guest-b', firstName: 'B', lastName: 'Guest' } } }),
}));
jest.mock('../../../../context', () => ({
  useModal: () => ({ showFormModal: jest.fn(), dismissFormModal: mockDismissFormModal }),
  useNotification: () => ({ notify: mockNotify }),
}));
jest.mock('../../../../state/queries/houseQueries', () => ({
  useUpdateHouse: () => ({ mutateAsync: mockMutateAsync, isPending: false, isSuccess: false }),
}));
jest.mock('../../../../util/display', () => ({ getCurrentTime: () => '2026-11-11T00:00:00Z' }));
jest.mock('../../../../util/house', () => ({ findGuestBed: () => null }));

import { useBedsManagement } from '../useBedsManagement';

const bed = (id: string, guestId: string | null) => ({ roomId: '2A', bed: { id, guestId } as any });
const failed = () => mockNotify.mock.calls.filter((c) => c[3] === 'fail');

beforeEach(() => {
  jest.clearAllMocks();
  mockMutateAsync.mockRejectedValue(new Error('permission-denied'));
});

describe('useBedsManagement when a write fails', () => {
  it('assignGuest rejects, so the form reports the failure instead of "Bed Assigned"', async () => {
    const { result } = renderHook(() => useBedsManagement());
    await expect(
      act(() =>
        result.current.assignGuest({ id: 'guest-b', firstName: 'B' } as any, bed('b2', null)),
      ),
    ).rejects.toThrow('permission-denied');
    expect(mockNotify).not.toHaveBeenCalledWith('Assigned Guest', expect.anything(), [], 'succeed');
  });

  it('removing a resident from a bed tells the operator', async () => {
    const { result } = renderHook(() => useBedsManagement());
    await act(() => result.current.removeGuest(bed('b1', 'guest-a')));
    expect(failed()).toHaveLength(1);
  });

  it('adding a bed tells the operator', async () => {
    const { result } = renderHook(() => useBedsManagement());
    await act(() => result.current.handleBedSubmission({ id: 'b3', roomId: '2A' }));
    expect(failed()).toHaveLength(1);
  });

  it('removing a room tells the operator', async () => {
    const { result } = renderHook(() => useBedsManagement());
    await act(() =>
      result.current.handleRoomSubmission({ room: mockHouse.rooms['2A'] as any }, true),
    );
    expect(failed()).toHaveLength(1);
    expect(mockNotify).not.toHaveBeenCalledWith('Removed Room', expect.anything(), [], 'succeed');
  });

  it('saving a room tells the operator', async () => {
    const { result } = renderHook(() => useBedsManagement());
    await act(() => result.current.handleRoomSubmission({ room: { id: '3A', beds: {} } as any }));
    expect(failed()).toHaveLength(1);
  });
});

describe('useBedsManagement when a write succeeds', () => {
  it('reports no failure', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBedsManagement());
    await act(() =>
      result.current.assignGuest({ id: 'guest-b', firstName: 'B' } as any, bed('b2', null)),
    );
    await act(() => result.current.removeGuest(bed('b1', 'guest-a')));
    expect(failed()).toHaveLength(0);
  });
});
