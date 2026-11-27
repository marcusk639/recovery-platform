/**
 * claims-updates listener (S5, REV-A5): the app force-refreshes its ID token
 * when the server stamps a claims change newer than the token it holds.
 */
type Next = (snapshot: { exists: () => boolean; data: () => unknown }) => void;
type Fail = (error: Error) => void;

const mockListeners: Array<{ path: string; next: Next; fail: Fail }> = [];
const mockUnsubscribe = jest.fn();
jest.mock('@react-native-firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ path: name }),
  doc: (parent: { path: string }, id: string) => ({ path: `${parent.path}/${id}` }),
  onSnapshot: (ref: { path: string }, next: Next, fail: Fail) => {
    mockListeners.push({ path: ref.path, next, fail });
    return mockUnsubscribe;
  },
}));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import { logException } from '../../util/logging';
import { stampMillis, watchClaimsUpdates } from '../claimsUpdates';

const TOKEN_ISSUED = Date.UTC(2026, 10, 27, 12, 0, 0);
const stamp = (ms: number) => ({
  exists: () => true,
  data: () => ({ updatedAt: { toMillis: () => ms } }),
});
const noDoc = { exists: () => false, data: () => undefined };
const settle = () => new Promise((resolve) => setImmediate(resolve));

let refresh: jest.Mock;
let tokenIssuedAtMs: jest.Mock;

beforeEach(() => {
  mockListeners.length = 0;
  jest.clearAllMocks();
  refresh = jest.fn(() => Promise.resolve());
  tokenIssuedAtMs = jest.fn(() => Promise.resolve(TOKEN_ISSUED));
});

const start = (uid = 'u1') => {
  const unsubscribe = watchClaimsUpdates(uid, { refresh, tokenIssuedAtMs });
  return { unsubscribe, emit: mockListeners[mockListeners.length - 1].next };
};

describe('watchClaimsUpdates', () => {
  it("listens to the signed-in account's own marker doc", () => {
    start('u42');
    expect(mockListeners.map((l) => l.path)).toEqual(['claims-updates/u42']);
  });

  it('does not refresh while there is no marker', async () => {
    const { emit } = start();
    emit(noDoc);
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not refresh for a change the current token already carries', async () => {
    const { emit } = start();
    emit(stamp(TOKEN_ISSUED - 5000));
    emit(stamp(TOKEN_ISSUED));
    await settle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes once for a change made after the token was issued', async () => {
    const { emit } = start();
    emit(stamp(TOKEN_ISSUED + 1000));
    emit(stamp(TOKEN_ISSUED + 1000)); // the same stamp redelivered
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again for each later change (promotion, then removal)', async () => {
    const { emit } = start();
    emit(stamp(TOKEN_ISSUED - 1));
    await settle();
    emit(stamp(TOKEN_ISSUED + 60_000));
    await settle();
    emit(stamp(TOKEN_ISSUED + 120_000));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('runs refreshes one at a time', async () => {
    let release: () => void = () => {};
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const { emit } = start();
    emit(stamp(TOKEN_ISSUED + 1));
    emit(stamp(TOKEN_ISSUED + 2));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes for any stamp when the token time is unknown', async () => {
    tokenIssuedAtMs.mockResolvedValue(undefined);
    const { emit } = start();
    emit(stamp(1));
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('logs a failed refresh and keeps listening', async () => {
    const error = new Error('offline');
    refresh.mockRejectedValueOnce(error);
    const { emit } = start();
    emit(stamp(TOKEN_ISSUED + 1));
    await settle();
    emit(stamp(TOKEN_ISSUED + 2));
    await settle();
    expect(logException).toHaveBeenCalledWith(error);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('logs a listener error (it never signs the user out)', () => {
    start();
    const error = new Error('permission-denied');
    mockListeners[0].fail(error);
    expect(logException).toHaveBeenCalledWith(error);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns the unsubscribe function', () => {
    const { unsubscribe } = start();
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('stampMillis', () => {
  it('reads every timestamp shape the SDK returns', () => {
    expect(stampMillis({ toMillis: () => 5 })).toBe(5);
    expect(stampMillis({ seconds: 2 })).toBe(2000);
    expect(stampMillis({ _seconds: 3 })).toBe(3000);
    expect(stampMillis(new Date(7))).toBe(7);
    expect(stampMillis(null)).toBeUndefined();
    expect(stampMillis({})).toBeUndefined();
  });
});
