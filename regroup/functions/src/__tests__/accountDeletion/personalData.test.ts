type Doc = { path: string; data: Record<string, unknown> };
let store: Doc[] = [];
const mockFileDelete = jest.fn();
const mockDeleteFiles = jest.fn();
const mockBatchCommit = jest.fn();
const batchSizes: number[] = [];

jest.mock('firebase-admin', () => ({
  firestore: () => ({}),
  storage: () => ({
    bucket: () => ({
      file: (p: string) => ({ delete: (o: unknown) => mockFileDelete(p, o) }),
      deleteFiles: (o: unknown) => mockDeleteFiles(o),
    }),
  }),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Match "col" as the direct parent collection of the doc (collection or group).
const inCollection = (d: Doc, name: string, group: boolean) => {
  const parts = d.path.split('/');
  const parent = parts[parts.length - 2];
  return group ? parent === name : parts.length === 2 && parent === name;
};

const refFor = (path: string) => {
  const seg = path.split('/');
  // doc -> collection -> parent doc -> parent collection
  return {
    path,
    parent: { id: seg[seg.length - 2], parent: { parent: { id: seg[seg.length - 4] } } },
  };
};

const query = (
  name: string,
  group: boolean,
  field: string,
  value: string,
  max = Infinity,
  after?: string,
): {
  limit: (n: number) => unknown;
  startAfter: (s: { path: string }) => unknown;
  get: () => Promise<unknown>;
} => ({
  limit: (n: number) => query(name, group, field, value, n, after),
  startAfter: (s: { path: string }) => query(name, group, field, value, max, s.path),
  get: async () => {
    const docs = store
      .filter((d) => inCollection(d, name, group) && d.data[field] === value)
      .sort((x, y) => (x.path < y.path ? -1 : 1))
      .filter((d) => after === undefined || d.path > after)
      .slice(0, max)
      .map((d) => ({ path: d.path, ref: refFor(d.path) }));
    return { empty: docs.length === 0, size: docs.length, docs };
  },
});

jest.mock('../../api/firestore', () => ({
  ratsFirestore: {
    collection: (name: string) => ({
      where: (f: string, _op: string, v: string) => query(name, false, f, v),
      doc: (id: string) => ({
        delete: async () => {
          store = store.filter((d) => d.path !== `${name}/${id}`);
        },
      }),
    }),
    collectionGroup: (name: string) => ({
      where: (f: string, _op: string, v: string) => query(name, true, f, v),
    }),
    batch: () => {
      const paths: string[] = [];
      return {
        delete: (r: { path: string }) => paths.push(r.path),
        commit: async () => {
          mockBatchCommit();
          batchSizes.push(paths.length);
          store = store.filter((d) => !paths.includes(d.path));
        },
      };
    },
  },
}));

import { logger } from 'firebase-functions/v2';
import { deletePersonalData } from '../../accountDeletion/personalData';

const UID = 'u1';
const paths = () => store.map((d) => d.path).sort();

beforeEach(() => {
  store = [];
  batchSizes.length = 0;
  jest.clearAllMocks();
  mockFileDelete.mockResolvedValue(undefined);
  mockDeleteFiles.mockResolvedValue(undefined);
});

describe('deletePersonalData', () => {
  it("deletes the user's notifications, applications and guest-weeks", async () => {
    store = [
      { path: 'notifications/n1', data: { userId: UID } },
      { path: 'notifications/n2', data: { userId: 'other' } },
      { path: 'houses/h1/applications/a1', data: { applicantUid: UID } },
      { path: 'houses/h2/applications/a2', data: { applicantUid: 'other' } },
      { path: 'guest-weeks/w1', data: { userId: UID } },
      { path: 'guest-weeks/w2', data: { userId: 'other' } },
    ];
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['guest-weeks/w2', 'houses/h2/applications/a2', 'notifications/n2']);
  });

  it("deletes the user's feedback only, and a re-run is a no-op", async () => {
    store = [
      { path: 'feedback/f1', data: { reviewer: UID, type: 'house', houseId: 'h1' } },
      { path: 'feedback/f2', data: { reviewer: UID, type: 'app', houseId: '' } },
      { path: 'feedback/f3', data: { reviewer: 'other', type: 'house', houseId: 'h1' } },
    ];
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['feedback/f3']);
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['feedback/f3']);
  });

  it('deletes only messages the user sent', async () => {
    store = [
      { path: 'direct-messages/c1/chat/m1', data: { senderId: UID, recipientId: 'x' } },
      { path: 'direct-messages/c1/chat/m2', data: { senderId: 'x', recipientId: UID } },
      { path: 'direct-messages/c2/chat/m3', data: { senderId: 'y', recipientId: 'z' } },
    ];
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['direct-messages/c1/chat/m2', 'direct-messages/c2/chat/m3']);
  });

  it('keeps house group chat messages the user sent', async () => {
    store = [
      { path: 'houses/h1/chat/m1', data: { senderId: UID } },
      { path: 'direct-messages/c1/chat/m2', data: { senderId: UID } },
    ];
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['houses/h1/chat/m1']);
  });

  it('pages past a full page of skipped house chat docs without looping', async () => {
    store = [
      ...Array.from({ length: 450 }, (_, i) => ({
        path: `houses/h1/chat/a${String(i).padStart(4, '0')}`,
        data: { senderId: UID },
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        path: `direct-messages/c1/chat/z${i}`,
        data: { senderId: UID },
      })),
    ];
    await deletePersonalData(UID, [], {});
    expect(store).toHaveLength(450);
    expect(store.every((d) => d.path.startsWith('houses/'))).toBe(true);
  });

  it('deletes avatars and tolerates missing files', async () => {
    await deletePersonalData(UID, ['g1', 'g2'], { g1: 'h1', g2: 'h2' });
    expect(mockFileDelete).toHaveBeenCalledWith(`users/${UID}/avatar`, { ignoreNotFound: true });
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: 'houses/h1/guests/g1/avatar/' });
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: 'houses/h2/guests/g2/avatar/' });
  });

  it('skips guests with no known house', async () => {
    await deletePersonalData(UID, ['g1'], {});
    expect(mockDeleteFiles).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'accountDeletion: guest has no house; Storage files not removed',
      { guestIds: ['g1'], count: 1 },
    );
  });

  it('does not warn when every guest has a house', async () => {
    await deletePersonalData(UID, ['g1'], { g1: 'h1' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("deletes the user's FCM device tokens doc and nobody else's", async () => {
    store = [
      { path: `userDeviceTokens/${UID}`, data: { tokens: ['t1'] } },
      { path: 'userDeviceTokens/other', data: { tokens: ['t2'] } },
    ];
    await deletePersonalData(UID, [], {});
    expect(paths()).toEqual(['userDeviceTokens/other']);
  });

  it("deletes the resident's uploaded document records and files", async () => {
    store = [
      { path: 'documents/d1', data: { houseId: 'h1', guestId: 'g1', uploadedBy: 'admin' } },
      { path: 'documents/d2', data: { houseId: 'h9', guestId: 'old1', uploadedBy: 'admin' } },
      { path: 'documents/d3', data: { houseId: 'h1', guestId: 'gOther', uploadedBy: 'admin' } },
      { path: 'documents/d4', data: { houseId: 'h1', uploadedBy: 'admin' } },
    ];
    await deletePersonalData(UID, ['g1', 'old1'], { g1: 'h1', old1: 'h9' });
    // House-level docs (no guestId) and other residents' docs stay.
    expect(paths()).toEqual(['documents/d3', 'documents/d4']);
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: 'houses/h1/guests/g1/documents/' });
    expect(mockDeleteFiles).toHaveBeenCalledWith({ prefix: 'houses/h9/guests/old1/documents/' });
    expect(mockDeleteFiles).not.toHaveBeenCalledWith({ prefix: 'houses/h1/documents/' });
    expect(logger.info).toHaveBeenCalledWith(
      'accountDeletion: personal data deleted',
      expect.objectContaining({ documents: 2, guests: 2 }),
    );
  });

  it("still deletes a houseless resident's document records", async () => {
    store = [{ path: 'documents/d1', data: { houseId: 'h1', guestId: 'g1' } }];
    await deletePersonalData(UID, ['g1'], {});
    expect(store).toHaveLength(0);
  });

  it('pages through more than 400 documents', async () => {
    store = Array.from({ length: 950 }, (_, i) => ({
      path: `notifications/n${i}`,
      data: { userId: UID },
    }));
    await deletePersonalData(UID, [], {});
    expect(store).toHaveLength(0);
    expect(Math.max(...batchSizes)).toBeLessThanOrEqual(400);
    expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(950);
  });

  it('is idempotent when there is nothing to delete', async () => {
    await expect(deletePersonalData(UID, [], {})).resolves.toBeUndefined();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
