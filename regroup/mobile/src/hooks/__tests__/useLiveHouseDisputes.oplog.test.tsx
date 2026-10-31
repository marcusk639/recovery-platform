/**
 * useLiveHouseDisputes against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 2). This file
 * stays byte-identical from Task 2 to the end of Task 10, the modular Firebase
 * migration. The `exists` read is pinned both ways.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { failNext, getOpLog, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import { useLiveHouseDisputes } from '../useLiveHouseDisputes';
import { logException } from '../../util/logging';

beforeEach(() => {
  resetOpLog();
});

describe('useLiveHouseDisputes', () => {
  it('listens to house-disputes/{houseId} and returns its disputes', async () => {
    seedDoc('house-disputes/h1', { disputes: { a1: { id: 'a1', activityId: 'a1' } } });

    const { result } = renderHook(() => useLiveHouseDisputes('h1'));

    await waitFor(() =>
      expect(result.current.disputes).toEqual({ a1: { id: 'a1', activityId: 'a1' } }),
    );
    expect(result.current.error).toBeNull();
    expect(getOpLog()).toEqual([{ op: 'listen', path: 'house-disputes/h1' }]);
  });

  it('returns no disputes when the doc does not exist', async () => {
    const { result } = renderHook(() => useLiveHouseDisputes('h1'));

    await waitFor(() => expect(getOpLog()).toHaveLength(1));
    await act(async () => {});
    expect(result.current.disputes).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('does not listen without a house', async () => {
    renderHook(() => useLiveHouseDisputes(undefined));
    await act(async () => {});
    expect(getOpLog()).toEqual([]);
  });

  it('reports a listener error, logs it, and listens again on retry', async () => {
    const denied = new Error('denied');
    failNext('listen', denied, 'house-disputes/h1');
    seedDoc('house-disputes/h1', { disputes: { a1: { id: 'a1' } } });

    const { result } = renderHook(() => useLiveHouseDisputes('h1'));

    await waitFor(() => expect(result.current.error).toBe(denied));
    expect(result.current.disputes).toEqual({});
    expect(logException).toHaveBeenCalledWith(denied);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.disputes).toEqual({ a1: { id: 'a1' } }));
    expect(result.current.error).toBeNull();
    expect(getOpLog()).toEqual([
      { op: 'listen', path: 'house-disputes/h1' },
      { op: 'listen', path: 'house-disputes/h1' },
    ]);
  });
});
