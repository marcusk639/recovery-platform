/**
 * markPaymentResolvedOffline (#238): staff mark a failed payment as handled off
 * the app. The payments rules refuse every client update, so the phone's old
 * direct write always failed. It changes the record's status only, never money.
 */
jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) => ({
      run: typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
    }),
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockReadRoleTier = jest.fn((..._args: any[]): Promise<string | null> =>
  Promise.resolve(null),
);
jest.mock('../../util/houseRoleStore', () => ({
  readRoleTier: (...args: any[]) => mockReadRoleTier(...args),
}));

const docs = new Map<string, Record<string, unknown>>();
const updates: { path: string; data: Record<string, unknown> }[] = [];
const ref = (path: string) => ({
  path,
  get: async () => snap(path),
});
const snap = (path: string) => ({
  exists: docs.has(path),
  data: () => docs.get(path),
  get: (field: string) => docs.get(path)?.[field],
});

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (fn: (txn: any) => Promise<unknown>) =>
        fn({
          get: async (r: { path: string }) => snap(r.path),
          update: (r: { path: string }, data: Record<string, unknown>) =>
            updates.push({ path: r.path, data }),
        }),
    })),
    { FieldValue: { serverTimestamp: () => 'SERVER_TIME' } },
  ),
}));

import { markPaymentResolvedOffline } from '../../callable/resolveFailedPayment';

const run = (data: unknown, uid: string | null = 'owner1') =>
  (markPaymentResolvedOffline as any).run({
    auth: uid ? { uid, token: {} } : undefined,
    data,
  });

const failedPayment = {
  houseId: 'house1',
  guestId: 'guest1',
  status: 'failed',
  amount: 50000,
};

beforeEach(() => {
  docs.clear();
  updates.length = 0;
  mockReadRoleTier.mockReset();
  mockReadRoleTier.mockResolvedValue(null);
  docs.set('houses/house1', { ownerId: 'owner1' });
  docs.set('payments/pi_1', { ...failedPayment });
});

it('marks a failed payment resolved offline, changing its status and nothing else', async () => {
  await expect(run({ houseId: 'house1', paymentId: 'pi_1' })).resolves.toEqual({
    status: 'resolved_offline',
  });
  expect(updates).toEqual([
    {
      path: 'payments/pi_1',
      data: {
        status: 'resolved_offline',
        resolvedAt: 'SERVER_TIME',
        resolvedBy: 'owner1',
        updatedAt: 'SERVER_TIME',
      },
    },
  ]);
});

it('lets an invited manager resolve it', async () => {
  mockReadRoleTier.mockResolvedValue('manager');
  await run({ houseId: 'house1', paymentId: 'pi_1' }, 'manager1');
  expect(updates).toHaveLength(1);
  expect(mockReadRoleTier).toHaveBeenCalledWith('house1', 'manager1');
});

it("refuses a peer leader, who can't act on the house's money", async () => {
  mockReadRoleTier.mockResolvedValue('peer_leader');
  await expect(run({ houseId: 'house1', paymentId: 'pi_1' }, 'leader1')).rejects.toMatchObject({
    code: 'permission-denied',
  });
  expect(updates).toEqual([]);
});

it('refuses a signed-out caller', async () => {
  await expect(run({ houseId: 'house1', paymentId: 'pi_1' }, null)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(updates).toEqual([]);
});

it('refuses a call without a payment id', async () => {
  await expect(run({ houseId: 'house1' })).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(updates).toEqual([]);
});

it('refuses an unknown house', async () => {
  await expect(run({ houseId: 'nope', paymentId: 'pi_1' })).rejects.toMatchObject({
    code: 'not-found',
  });
  expect(updates).toEqual([]);
});

it('refuses an unknown payment', async () => {
  await expect(run({ houseId: 'house1', paymentId: 'pi_missing' })).rejects.toMatchObject({
    code: 'not-found',
  });
  expect(updates).toEqual([]);
});

it("treats another house's payment as unknown, so its staff can't touch it", async () => {
  docs.set('houses/house2', { ownerId: 'owner1' });
  await expect(run({ houseId: 'house2', paymentId: 'pi_1' })).rejects.toMatchObject({
    code: 'not-found',
  });
  expect(updates).toEqual([]);
});

it.each(['succeeded', 'pending', 'resolved_offline'])(
  'refuses a payment whose status is %s',
  async (status) => {
    docs.set('payments/pi_1', { ...failedPayment, status });
    await expect(run({ houseId: 'house1', paymentId: 'pi_1' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(updates).toEqual([]);
  },
);
