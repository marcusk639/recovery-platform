/**
 * useLiveHouseDisputes reads house-disputes/{houseId}, the server-owned live
 * list of open disputes (houses/{id}.disputes is an untrusted legacy mirror).
 */
import { renderHook, act } from '@testing-library/react-native';

let onNext: ((snap: any) => void) | null = null;
let onError: ((err: Error) => void) | null = null;
const mockDoc = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn((name: string) => ({
      doc: (id: string) => {
        mockDoc(name, id);
        return {
          onSnapshot: (next: any, error: any) => {
            onNext = next;
            onError = error;
            return mockUnsubscribe;
          },
        };
      },
    })),
  },
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { useLiveHouseDisputes } from '../useLiveHouseDisputes';

beforeEach(() => {
  jest.clearAllMocks();
  onNext = null;
  onError = null;
});

describe('useLiveHouseDisputes', () => {
  it('subscribes to house-disputes/{houseId} and returns its disputes', () => {
    const { result, unmount } = renderHook(() => useLiveHouseDisputes('h1'));
    expect(mockDoc).toHaveBeenCalledWith('house-disputes', 'h1');
    act(() => onNext!({ exists: true, data: () => ({ disputes: { a1: { status: 'pending' } } }) }));
    expect(result.current).toMatchObject({ disputes: { a1: { status: 'pending' } }, error: null });
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('is empty with no house or a missing doc, and reports a read error (S2)', () => {
    expect(renderHook(() => useLiveHouseDisputes(undefined)).result.current).toMatchObject({ disputes: {}, error: null });
    expect(mockDoc).not.toHaveBeenCalled();
    const { result } = renderHook(() => useLiveHouseDisputes('h1'));
    act(() => onNext!({ exists: false, data: () => undefined }));
    expect(result.current).toMatchObject({ disputes: {}, error: null });
    act(() => onError!(new Error('denied')));
    expect(result.current.disputes).toEqual({});
    expect(result.current.error?.message).toBe('denied');
    // 6: retry subscribes again and clears the error.
    const calls = mockDoc.mock.calls.length;
    act(() => result.current.retry());
    expect(mockDoc.mock.calls.length).toBe(calls + 1);
    expect(result.current.error).toBeNull();
  });
});
