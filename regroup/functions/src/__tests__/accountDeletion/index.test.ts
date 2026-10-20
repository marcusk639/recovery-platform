const calls: string[] = [];
const mockCloseOperator = jest.fn();
const mockDischarge = jest.fn();
const mockRemoveStaff = jest.fn();
const mockDeletePersonal = jest.fn();
const mockDeleteUser = jest.fn();
const mockUserDelete = jest.fn();

type Docs = Record<string, Record<string, unknown>>;
let users: Docs;
let guests: Docs;
let admins: Docs;
let houses: Docs;
let deletions: Docs;

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
    collection: () => ({
      doc: (id: string) => ({
        get: async () => snap(id, deletions[id]),
        set: async (data: Record<string, unknown>) => {
          deletions[id] = { ...(deletions[id] ?? {}), ...data };
        },
      }),
    }),
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
}));
jest.mock('../../accountDeletion/personalData', () => ({
  deletePersonalData: (...a: unknown[]) => {
    calls.push('personal');
    return mockDeletePersonal(...a);
  },
}));

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
});
