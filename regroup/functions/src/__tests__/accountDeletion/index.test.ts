const calls: string[] = [];
const mockCloseOperator = jest.fn();
const mockDischarge = jest.fn();
const mockRemoveStaff = jest.fn();
const mockDeletePersonal = jest.fn();
const mockDeleteUser = jest.fn();
const mockUserDelete = jest.fn();
const mockScrubArchive = jest.fn();
const mockDeleteCustomer = jest.fn();
let failDeletionWrites = false;

type Docs = Record<string, Record<string, unknown>>;
let users: Docs;
let guests: Docs;
let admins: Docs;
let houses: Docs;
let deletions: Docs;
let archive: Docs;

jest.mock('firebase-admin', () => ({
  auth: () => ({ deleteUser: (uid: string) => mockDeleteUser(uid) }),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const snap = (id: string, data?: Record<string, unknown>) => ({
  id,
  exists: data !== undefined,
  data: () => data,
});

const query = (store: () => Docs, field: string, value: unknown) => ({
  get: async () => ({
    docs: Object.entries(store())
      .filter(([, d]) => d[field] === value)
      .map(([id, d]) => snap(id, d)),
    get empty() {
      return !Object.values(store()).some((d) => d[field] === value);
    },
  }),
});

const collection = (store: () => Docs) => ({
  where: (field: string, _op: string, value: unknown) => query(store, field, value),
  doc: (id: string) => ({ get: async () => snap(id, store()[id]) }),
});

jest.mock('../../api/firestore', () => ({
  userCollection: {
    doc: (id: string) => ({
      get: async () => snap(id, users[id]),
      delete: async () => {
        await mockUserDelete(id);
        calls.push('userDoc');
        delete users[id];
      },
    }),
  },
  guestCollection: collection(() => guests),
  adminCollection: collection(() => admins),
  houseCollection: collection(() => houses),
  ratsFirestore: {
    collection: (name: string) =>
      name === 'guest-archive'
        ? collection(() => archive)
        : {
            doc: (id: string) => ({
              get: async () => snap(id, deletions[id]),
              set: async (data: Record<string, unknown>) => {
                if (failDeletionWrites && 'lastError' in data) throw new Error('firestore down');
                deletions[id] = { ...(deletions[id] ?? {}), ...data };
              },
            }),
          },
  },
}));

jest.mock('../../api/stripe', () => ({
  deleteCustomer: (...a: unknown[]) => {
    calls.push(`deleteCustomer:${a[0]}`);
    return mockDeleteCustomer(...a);
  },
}));

jest.mock('../../accountDeletion/operatorRecords', () => ({
  closeOperatorAccount: (...a: unknown[]) => {
    calls.push('operator');
    return mockCloseOperator(...a);
  },
}));
jest.mock('../../accountDeletion/memberRecords', () => ({
  dischargeResident: (...a: unknown[]) => {
    calls.push(`discharge:${a[0]}`);
    return mockDischarge(...a);
  },
  removeStaffAdmin: (...a: unknown[]) => {
    calls.push(`removeStaff:${a[0]}`);
    return mockRemoveStaff(...a);
  },
  scrubArchivedGuest: (...a: unknown[]) => {
    calls.push(`scrubArchive:${a[0]}`);
    return mockScrubArchive(...a);
  },
}));
jest.mock('../../accountDeletion/personalData', () => ({
  deletePersonalData: (...a: unknown[]) => {
    calls.push('personal');
    return mockDeletePersonal(...a);
  },
}));

import { logger } from 'firebase-functions/v2';
import { runAccountDeletion } from '../../accountDeletion';

const NOW = '2026-10-20T00:00:00.000Z';
const ALL = ['operator', 'members', 'personal', 'userDoc', 'auth'];

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  users = { u1: { id: 'u1' } };
  guests = {};
  admins = {};
  houses = {};
  deletions = {};
  archive = {};
  failDeletionWrites = false;
  mockScrubArchive.mockResolvedValue(undefined);
  mockDeleteCustomer.mockResolvedValue(undefined);
  mockCloseOperator.mockResolvedValue({ housesClosed: [] });
  mockDischarge.mockResolvedValue(undefined);
  mockRemoveStaff.mockResolvedValue(undefined);
  mockDeletePersonal.mockResolvedValue(undefined);
  mockDeleteUser.mockImplementation(async () => {
    calls.push('auth');
  });
});

describe('runAccountDeletion', () => {
  it('runs every step in order for a resident', async () => {
    guests = { g1: { userId: 'u1', houseId: 'h1' } };

    const result = await runAccountDeletion('u1', NOW);

    expect(calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
    expect(mockDischarge).toHaveBeenCalledWith('g1', NOW);
    expect(mockDeletePersonal).toHaveBeenCalledWith('u1', ['g1'], { g1: 'h1' });
    expect(mockCloseOperator).not.toHaveBeenCalled();
    expect(result.completed).toEqual(ALL);
    expect(deletions.u1.completed).toEqual(ALL);
  });

  it('runs the operator step only for house owners', async () => {
    houses = { h1: { ownerId: 'u1' } };
    users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };

    await runAccountDeletion('u1', NOW);

    expect(calls[0]).toBe('operator');
    expect(mockCloseOperator).toHaveBeenCalledWith(
      { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } },
      NOW,
    );
    expect(calls).not.toContain('discharge:g1');
  });

  it('runs the operator step for a subscriber who owns no houses', async () => {
    users.u1 = { id: 'u1', subscriptionMetadata: { customerId: 'cus_1' } };

    await runAccountDeletion('u1', NOW);

    expect(mockCloseOperator).toHaveBeenCalledTimes(1);
  });

  it('handles a user who is both resident and staff', async () => {
    guests = { g1: { userId: 'u1', houseId: 'h1' }, g2: { userId: 'u1', houseId: 'h2' } };
    admins = { a1: { userId: 'u1' } };

    await runAccountDeletion('u1', NOW);

    expect(calls).toEqual([
      'discharge:g1',
      'discharge:g2',
      'removeStaff:a1',
      'personal',
      'userDoc',
      'auth',
    ]);
    expect(mockDeletePersonal).toHaveBeenCalledWith('u1', ['g1', 'g2'], { g1: 'h1', g2: 'h2' });
  });

  it('resumes from the recorded step after a failure', async () => {
    guests = { g1: { userId: 'u1', houseId: 'h1' } };
    mockDischarge.mockImplementation(async (id: string) => {
      delete guests[id];
    });
    mockDeletePersonal.mockRejectedValueOnce(new Error('storage down for jane@example.com'));

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('storage down');
    expect(deletions.u1.completed).toEqual(['operator', 'members']);
    expect(deletions.u1.lastError).toBe('personal');
    expect(deletions.u1.failedAt).toBe(NOW);
    expect(JSON.stringify(deletions.u1)).not.toContain('jane@example.com');
    expect(mockDeleteUser).not.toHaveBeenCalled();

    calls.length = 0;
    const later = '2026-10-21T00:00:00.000Z';
    const result = await runAccountDeletion('u1', later);

    expect(calls).toEqual(['personal', 'userDoc', 'auth']);
    expect(mockDischarge).toHaveBeenCalledTimes(1);
    expect(mockDeletePersonal).toHaveBeenLastCalledWith('u1', ['g1'], { g1: 'h1' });
    expect(result.completed).toEqual(ALL);
    expect(deletions.u1.lastError).toBeNull();
  });

  it('deletes the Auth user last', async () => {
    mockUserDelete.mockRejectedValueOnce(new Error('boom'));

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('boom');
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(deletions.u1.lastError).toBe('userDoc');

    await runAccountDeletion('u1', NOW);
    expect(calls[calls.length - 1]).toBe('auth');
    expect(mockDeleteUser).toHaveBeenCalledWith('u1');
  });

  it('treats an already-deleted Auth user as done', async () => {
    mockDeleteUser.mockRejectedValueOnce(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' }),
    );

    const result = await runAccountDeletion('u1', NOW);

    expect(result.completed).toEqual(ALL);
    expect(deletions.u1.lastError).toBeNull();
  });

  it('records and rethrows other Auth failures', async () => {
    mockDeleteUser.mockRejectedValueOnce(
      Object.assign(new Error('quota'), { code: 'auth/internal-error' }),
    );

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('quota');
    expect(deletions.u1.lastError).toBe('auth');
    expect(deletions.u1.completed).toEqual(['operator', 'members', 'personal', 'userDoc']);
  });

  it('scrubs pre-existing guest-archive docs of a former resident', async () => {
    archive = { old1: { userId: 'u1', houseId: 'h9', sobrietyDate: 'x' } };

    await runAccountDeletion('u1', NOW);

    expect(calls).toEqual(['scrubArchive:old1', 'personal', 'userDoc', 'auth']);
    expect(mockScrubArchive).toHaveBeenCalledWith('old1', NOW);
    expect(mockDeletePersonal).toHaveBeenCalledWith('u1', ['old1'], { old1: 'h9' });
    expect(deletions.u1.targets).toMatchObject({ archivedGuestIds: ['old1'] });
  });

  it('does not scrub an archive doc separately when the guest is also current', async () => {
    guests = { g1: { userId: 'u1', houseId: 'h1' } };
    archive = { g1: { userId: 'u1', houseId: 'h1' } };

    await runAccountDeletion('u1', NOW);

    expect(calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
    expect(mockDeletePersonal).toHaveBeenCalledWith('u1', ['g1'], { g1: 'h1' });
  });

  it("deletes the resident's autopay Stripe customers once each", async () => {
    guests = { g1: { userId: 'u1', houseId: 'h1', stripeCustomerId: 'cus_g' } };
    archive = { old1: { userId: 'u1', houseId: 'h9', stripeCustomerId: 'cus_g' } };

    await runAccountDeletion('u1', NOW);

    expect(mockDeleteCustomer).toHaveBeenCalledTimes(1);
    expect(mockDeleteCustomer).toHaveBeenCalledWith('cus_g');
    expect(calls.indexOf('deleteCustomer:cus_g')).toBeLessThan(calls.indexOf('discharge:g1'));
  });

  it('runs the operator step for a superAdminId-only house', async () => {
    houses = { h1: { superAdminId: 'u1' } };

    await runAccountDeletion('u1', NOW);

    expect(mockCloseOperator).toHaveBeenCalledTimes(1);
  });

  it('falls back to users/{uid}.guestId and .adminId for docs without userId', async () => {
    users.u1 = { id: 'u1', guestId: 'gL', adminId: 'aL' };
    guests = { gL: { houseId: 'h1' }, g1: { userId: 'u1', houseId: 'h2' } };
    admins = { aL: {} };

    await runAccountDeletion('u1', NOW);

    expect(calls).toEqual([
      'discharge:g1',
      'discharge:gL',
      'removeStaff:aL',
      'personal',
      'userDoc',
      'auth',
    ]);
  });

  it('ignores a users/{uid} pointer to a doc linked to someone else, and dedupes', async () => {
    users.u1 = { id: 'u1', guestId: 'g1', adminId: 'aX' };
    guests = { g1: { userId: 'u1', houseId: 'h1' } };
    admins = { aX: { userId: 'other' } };

    await runAccountDeletion('u1', NOW);

    expect(calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
  });

  it('logs the failed step with the error code and message, and tags the error', async () => {
    const err = Object.assign(new Error('bucket gone'), { code: 'storage/404' });
    mockDeletePersonal.mockRejectedValueOnce(err);

    await expect(runAccountDeletion('u1', NOW)).rejects.toBe(err);

    expect(logger.error).toHaveBeenCalledWith('accountDeletion: step failed', {
      uid: 'u1',
      step: 'personal',
      code: 'storage/404',
      message: 'bucket gone',
    });
    expect((err as { step?: string }).step).toBe('personal');
  });

  it('rethrows the original error when the failure record cannot be written', async () => {
    const err = new Error('stripe down');
    mockCloseOperator.mockRejectedValueOnce(err);
    users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };
    failDeletionWrites = true;

    await expect(runAccountDeletion('u1', NOW)).rejects.toBe(err);
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion: step failed',
      expect.objectContaining({ step: 'operator' }),
    );
  });
});
