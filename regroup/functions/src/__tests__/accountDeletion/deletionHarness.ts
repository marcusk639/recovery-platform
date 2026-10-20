// Shared in-memory mocks for runAccountDeletion suites. Test files wire these in
// with `jest.mock(path, () => require('./deletionHarness').<module>)`.
// Not a suite itself: jest only matches `*.test.ts`.

type Docs = Record<string, Record<string, unknown>>;

export const h = {
  calls: [] as string[],
  users: {} as Docs,
  guests: {} as Docs,
  admins: {} as Docs,
  houses: {} as Docs,
  deletions: {} as Docs,
  archive: {} as Docs,
  failDeletionWrites: false,
  /** When set, an accountDeletions write whose data matches throws. */
  failWriteWhen: null as null | ((data: Record<string, unknown>) => boolean),
  closeOperator: jest.fn(),
  discharge: jest.fn(),
  removeStaff: jest.fn(),
  scrubArchive: jest.fn(),
  deletePersonal: jest.fn(),
  deleteCustomer: jest.fn(),
  deleteUser: jest.fn(),
  userDelete: jest.fn(),
};

export function resetHarness(): void {
  jest.clearAllMocks();
  h.calls.length = 0;
  h.users = { u1: { id: 'u1' } };
  h.guests = {};
  h.admins = {};
  h.houses = {};
  h.deletions = {};
  h.archive = {};
  h.failDeletionWrites = false;
  h.failWriteWhen = null;
  h.closeOperator.mockResolvedValue({ housesClosed: [] });
  h.discharge.mockResolvedValue(undefined);
  h.removeStaff.mockResolvedValue(undefined);
  h.scrubArchive.mockResolvedValue(undefined);
  h.deletePersonal.mockResolvedValue(undefined);
  h.deleteCustomer.mockResolvedValue(undefined);
  h.deleteUser.mockImplementation(async () => {
    h.calls.push('auth');
  });
}

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

const recorded =
  (label: (a: unknown[]) => string, fn: jest.Mock) =>
  (...a: unknown[]) => {
    h.calls.push(label(a));
    return fn(...a);
  };

export const adminModule = {
  auth: () => ({ deleteUser: (uid: string) => h.deleteUser(uid) }),
};

export const functionsModule = {
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
};

export const firestoreModule = {
  userCollection: {
    doc: (id: string) => ({
      get: async () => snap(id, h.users[id]),
      delete: async () => {
        await h.userDelete(id);
        h.calls.push('userDoc');
        delete h.users[id];
      },
    }),
  },
  guestCollection: collection(() => h.guests),
  adminCollection: collection(() => h.admins),
  houseCollection: collection(() => h.houses),
  ratsFirestore: {
    collection: (name: string) =>
      name === 'guest-archive'
        ? collection(() => h.archive)
        : {
            doc: (id: string) => ({
              get: async () => snap(id, h.deletions[id]),
              set: async (data: Record<string, unknown>) => {
                if (h.failDeletionWrites && 'lastError' in data) throw new Error('firestore down');
                if (h.failWriteWhen?.(data)) throw new Error('progress write failed');
                h.deletions[id] = { ...(h.deletions[id] ?? {}), ...data };
              },
            }),
          },
  },
};

export const stripeModule = {
  deleteCustomer: recorded((a) => `deleteCustomer:${a[0]}`, h.deleteCustomer),
};

export const operatorModule = {
  closeOperatorAccount: recorded(() => 'operator', h.closeOperator),
};

export const memberModule = {
  dischargeResident: recorded((a) => `discharge:${a[0]}`, h.discharge),
  removeStaffAdmin: recorded((a) => `removeStaff:${a[0]}`, h.removeStaff),
  scrubArchivedGuest: recorded((a) => `scrubArchive:${a[0]}`, h.scrubArchive),
};

export const personalModule = {
  deletePersonalData: recorded(() => 'personal', h.deletePersonal),
};
