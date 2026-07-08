/**
 * Tests for the shared model helpers extracted in Task 3:
 * getRequiredDoc, withModelErrorHandling, scheduleTokenRefresh.
 *
 * `@react-native-firebase/firestore` is mocked globally in `jest.setup.js`.
 * That mock returns the *same* `mockFirestore` object on every call to
 * `firestore()`, and `mockFirestore.collection` is itself a `jest.fn()`
 * (called `mockCollection` inside the factory) — so per-test overrides are
 * done via `(firestore().collection as jest.Mock).mockReturnValueOnce(...)`
 * rather than `firestore.mockImplementationOnce`, since `firestore` itself
 * is a plain arrow function, not a jest.fn(), and therefore has no
 * `mockImplementationOnce` method.
 *
 * `../../services/firebase/auth` is NOT mocked globally, so
 * `refreshAuthToken` is mocked locally here.
 */

import firestore from '@react-native-firebase/firestore';

jest.mock('../../services/firebase/auth', () => ({
  refreshAuthToken: jest.fn().mockResolvedValue(undefined),
}));

import {
  getRequiredDoc,
  withModelErrorHandling,
  scheduleTokenRefresh,
} from '../modelHelpers';

describe('getRequiredDoc', () => {
  it('returns the snapshot when the document exists', async () => {
    const fakeSnap = {
      exists: true,
      id: 'doc-1',
      data: () => ({foo: 'bar'}),
    };
    const doc = jest
      .fn()
      .mockReturnValue({get: jest.fn().mockResolvedValue(fakeSnap)});
    (firestore().collection as jest.Mock).mockReturnValueOnce({doc});

    const snap = await getRequiredDoc(
      'members',
      'group-1_user-1',
      'Member not found in this group',
    );
    expect(snap).toBe(fakeSnap);
    expect(doc).toHaveBeenCalledWith('group-1_user-1');
  });

  it('throws with the given message when the document does not exist', async () => {
    const fakeSnap = {exists: false};
    const doc = jest
      .fn()
      .mockReturnValue({get: jest.fn().mockResolvedValue(fakeSnap)});
    (firestore().collection as jest.Mock).mockReturnValueOnce({doc});

    await expect(
      getRequiredDoc(
        'members',
        'group-1_missing',
        'Member not found in this group',
      ),
    ).rejects.toThrow('Member not found in this group');
  });
});

describe('withModelErrorHandling', () => {
  it('returns the wrapped function result on success', async () => {
    const result = await withModelErrorHandling('Test op', async () => 42);
    expect(result).toBe(42);
  });

  it('logs and rethrows on failure', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const err = new Error('boom');
    await expect(
      withModelErrorHandling('Test op', async () => {
        throw err;
      }),
    ).rejects.toThrow('boom');
    expect(consoleSpy).toHaveBeenCalledWith('Test op:', err);
    consoleSpy.mockRestore();
  });
});

describe('scheduleTokenRefresh', () => {
  it('schedules a refresh when currentUserId matches userId', () => {
    jest.useFakeTimers();
    const refreshAuthToken = require('../../services/firebase/auth')
      .refreshAuthToken as jest.Mock;
    refreshAuthToken.mockClear();

    scheduleTokenRefresh('user-1', 'user-1', 'Token refresh after test');
    jest.advanceTimersByTime(2000);

    expect(refreshAuthToken).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('does nothing when currentUserId does not match userId', () => {
    jest.useFakeTimers();
    const refreshAuthToken = require('../../services/firebase/auth')
      .refreshAuthToken as jest.Mock;
    refreshAuthToken.mockClear();

    scheduleTokenRefresh('user-1', 'user-2', 'Token refresh after test');
    jest.advanceTimersByTime(2000);

    expect(refreshAuthToken).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does nothing when currentUserId is undefined', () => {
    jest.useFakeTimers();
    const refreshAuthToken = require('../../services/firebase/auth')
      .refreshAuthToken as jest.Mock;
    refreshAuthToken.mockClear();

    scheduleTokenRefresh('user-1', undefined, 'Token refresh after test');
    jest.advanceTimersByTime(2000);

    expect(refreshAuthToken).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
