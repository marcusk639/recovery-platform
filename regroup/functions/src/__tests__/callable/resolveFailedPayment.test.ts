// resolveFailedPaymentOffline: house money staff mark a failed rent payment as
// resolved off-platform (#238). payments is server-written only, so the app's
// own update was always refused and "Mark Resolved" always failed.
jest.mock('firebase-functions/v2/https', () => ({
  onCall: (_optsOrHandler: any, handler?: Function) =>
    typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
  HttpsError: class extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockDocs: Record<string, Record<string, unknown> | undefined> = {};
const mockUpdates: Array<{ path: string; data: Record<string, unknown> }> = [];
const snapOf = (path: string) => {
  const data = mockDocs[path];
  return { exists: !!data, get: (field: string) => data?.[field], data: () => data };
};
jest.mock('firebase-admin', () => {
  const firestore = () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapOf(`${name}/${id}`) }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { path: string }) => snapOf(ref.path),
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          mockUpdates.push({ path: ref.path, data });
          mockDocs[ref.path] = { ...mockDocs[ref.path], ...data };
        },
      }),
  });
  // Like the functions emulator: the namespace's firestore has no FieldValue,
  // so the callable must take it from firebase-admin/firestore.
  return { firestore };
});
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '__serverTimestamp__' },
}));

const mockTiers: Record<string, string | null> = {};
jest.mock('../../util/houseRoleStore', () => ({
  readRoleTier: async (houseId: string, uid: string) => mockTiers[`${houseId}_${uid}`] ?? null,
}));

import { resolveFailedPaymentOffline } from '../../callable/resolveFailedPayment';

const call = (uid: string | null, data: unknown) =>
  (resolveFailedPaymentOffline as any)({ auth: uid ? { uid } : undefined, data });

describe('resolveFailedPaymentOffline', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockDocs)) delete mockDocs[key];
    for (const key of Object.keys(mockTiers)) delete mockTiers[key];
    mockUpdates.length = 0;
    mockDocs['houses/h1'] = { ownerId: 'owner' };
    mockDocs['houses/h2'] = { ownerId: 'otherOwner' };
    mockDocs['payments/pi_1'] = { houseId: 'h1', guestId: 'g1', status: 'failed', amount: 50000 };
    mockTiers.h1_manager = 'manager';
    mockTiers.h1_peer = 'peerLeader';
  });

  it("lets the house's owner mark a failed payment resolved, changing only its status fields", async () => {
    await expect(call('owner', { paymentId: 'pi_1' })).resolves.toEqual({
      status: 'resolved_offline',
    });
    expect(mockUpdates).toEqual([
      {
        path: 'payments/pi_1',
        data: {
          status: 'resolved_offline',
          resolvedAt: '__serverTimestamp__',
          resolvedBy: 'owner',
          updatedAt: '__serverTimestamp__',
        },
      },
    ]);
    expect(mockDocs['payments/pi_1']).toMatchObject({ amount: 50000, guestId: 'g1' });
  });

  it('lets an invited manager resolve it too', async () => {
    await expect(call('manager', { paymentId: 'pi_1' })).resolves.toEqual({
      status: 'resolved_offline',
    });
  });

  it('refuses a signed-out caller', async () => {
    await expect(call(null, { paymentId: 'pi_1' })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(mockUpdates).toEqual([]);
  });

  it("refuses a peer leader, a resident and another house's owner", async () => {
    for (const uid of ['peer', 'resident', 'otherOwner']) {
      await expect(call(uid, { paymentId: 'pi_1' })).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
    expect(mockUpdates).toEqual([]);
  });

  it('answers not-found for an unknown payment or one with no house', async () => {
    mockDocs['payments/pi_orphan'] = { status: 'failed' };
    for (const paymentId of ['pi_missing', 'pi_orphan']) {
      await expect(call('owner', { paymentId })).rejects.toMatchObject({ code: 'not-found' });
    }
    expect(mockUpdates).toEqual([]);
  });

  it('refuses a payment that has since succeeded, so paid rent is never marked otherwise', async () => {
    mockDocs['payments/pi_1'] = { ...mockDocs['payments/pi_1'], status: 'succeeded' };
    await expect(call('owner', { paymentId: 'pi_1' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mockDocs['payments/pi_1']?.status).toBe('succeeded');
  });

  it('refuses a pending payment', async () => {
    mockDocs['payments/pi_1'] = { ...mockDocs['payments/pi_1'], status: 'pending' };
    await expect(call('owner', { paymentId: 'pi_1' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(mockUpdates).toEqual([]);
  });

  it('accepts a repeat for a payment already resolved, writing nothing again', async () => {
    mockDocs['payments/pi_1'] = { ...mockDocs['payments/pi_1'], status: 'resolved_offline' };
    await expect(call('owner', { paymentId: 'pi_1' })).resolves.toEqual({
      status: 'resolved_offline',
    });
    expect(mockUpdates).toEqual([]);
  });

  it('refuses a missing or malformed payment id', async () => {
    for (const data of [{}, { paymentId: '' }, { paymentId: 7 }, { paymentId: 'a/b' }]) {
      await expect(call('owner', data)).rejects.toMatchObject({ code: 'invalid-argument' });
    }
  });
});
