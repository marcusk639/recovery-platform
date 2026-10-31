/**
 * documents.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Auth and Storage are not part of the
 * log: the signed-in user comes from the auth mock, and the storage path is
 * pinned through the stored storageUrl (https://mock-storage/<path>). The
 * putFile metadata (cacheControl, contentType) is not pinnable: the shared
 * storage mock ignores it.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('@react-native-firebase/storage', () =>
  require('../../../__mocks__/firebase-modular/storage'),
);
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import { deleteDocument, getExpiringDocuments, listDocuments, uploadDocument } from '../documents';
import { logException } from '../../util/logging';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const NOW = '2026-10-07T17:00:00.000Z';

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: 'u1' });
  jest.useFakeTimers({ now: new Date(NOW) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('uploadDocument', () => {
  const input = {
    houseId: 'h1',
    localPath: '/tmp/lease.pdf',
    fileName: 'lease.pdf',
    mimeType: 'application/pdf',
    category: 'lease' as const,
  };

  it('uploads to the house path and sets documents/{auto id} with the metadata', async () => {
    const result = await uploadDocument(input);

    const expected = {
      id: 'auto-1',
      houseId: 'h1',
      fileName: 'lease.pdf',
      storageUrl: 'https://mock-storage/houses/h1/documents/auto-1',
      storagePath: 'houses/h1/documents/auto-1',
      fileType: 'pdf',
      category: 'lease',
      uploadedBy: 'u1',
      createdAt: NOW,
    };
    expect(result).toEqual(expected);
    expect(getOpLog()).toEqual([{ op: 'set', path: 'documents/auto-1', data: expected }]);
  });

  it('uses the resident path and stores guestId and expiresAt when given', async () => {
    await uploadDocument({
      ...input,
      guestId: 'g1',
      mimeType: 'image/png',
      expiresAt: '2027-01-01',
    });

    expect(getOpLog()).toEqual([
      {
        op: 'set',
        path: 'documents/auto-1',
        data: {
          id: 'auto-1',
          houseId: 'h1',
          guestId: 'g1',
          fileName: 'lease.pdf',
          storageUrl: 'https://mock-storage/houses/h1/guests/g1/documents/auto-1',
          storagePath: 'houses/h1/guests/g1/documents/auto-1',
          fileType: 'image',
          category: 'lease',
          uploadedBy: 'u1',
          createdAt: NOW,
          expiresAt: '2027-01-01',
        },
      },
    ]);
  });

  it('refuses without a signed-in user, before any op', async () => {
    setCurrentUser(null);

    await expect(uploadDocument(input)).rejects.toThrow('Must be signed in to manage documents.');
    expect(getOpLog()).toEqual([]);
  });

  it('refuses a missing file name before any op', async () => {
    await expect(uploadDocument({ ...input, fileName: '' })).rejects.toThrow(
      'uploadDocument: fileName is required.',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('logs and rethrows the original error when the metadata write fails', async () => {
    const denied = new Error('permission-denied');
    failNext('set', denied, 'documents/auto-1');

    await expect(uploadDocument(input)).rejects.toBe(denied);
    expect(logException).toHaveBeenCalledWith(denied);
  });
});

describe('listDocuments', () => {
  beforeEach(() => {
    seedQuery('documents', [
      { id: 'd1', houseId: 'h1', fileName: 'a', createdAt: '2026-10-01' },
      { id: 'd2', houseId: 'h1', guestId: 'g1', fileName: 'b', createdAt: '2026-10-03' },
      { id: 'd3', houseId: 'h1', fileName: 'c', createdAt: '2026-10-05' },
    ]);
  });

  it('lists house-level docs newest first, dropping resident docs client-side', async () => {
    const docs = await listDocuments('h1');

    expect(docs.map((d) => d.id)).toEqual(['d3', 'd1']);
    expect(docs[0]).toEqual({
      id: 'd3',
      houseId: 'h1',
      guestId: undefined,
      fileName: 'c',
      storageUrl: '',
      storagePath: '',
      fileType: 'other',
      category: 'other',
      expiresAt: undefined,
      uploadedBy: '',
      createdAt: '2026-10-05',
    });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'documents',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['orderBy', 'createdAt', 'desc'],
        ],
      },
    ]);
  });

  it('lists a resident’s docs with a guestId clause', async () => {
    expect((await listDocuments('h1', 'g1')).map((d) => d.id)).toEqual(['d2']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'documents',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'guestId', '==', 'g1'],
          ['orderBy', 'createdAt', 'desc'],
        ],
      },
    ]);
  });

  it('returns [] without an op for an empty house id', async () => {
    expect(await listDocuments('')).toEqual([]);
    expect(getOpLog()).toEqual([]);
  });
});

describe('deleteDocument', () => {
  it('deletes documents/{id} (the storage object is not in the log)', async () => {
    seedQuery('documents', [{ id: 'd1', houseId: 'h1' }]);

    await deleteDocument('d1', 'houses/h1/documents/d1');

    expect(getOpLog()).toEqual([{ op: 'delete', path: 'documents/d1' }]);
    expect(readDoc('documents/d1')).toBeUndefined();
  });

  it('refuses a missing storage path before any op', async () => {
    await expect(deleteDocument('d1', '')).rejects.toThrow(
      'deleteDocument: storagePath is required.',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('logs and rethrows when the Firestore delete fails', async () => {
    const denied = new Error('permission-denied');
    failNext('delete', denied, 'documents/d1');

    await expect(deleteDocument('d1', 'p')).rejects.toBe(denied);
    expect(logException).toHaveBeenCalledWith(denied);
  });
});

describe('getExpiringDocuments', () => {
  it('queries the house and keeps docs expiring within the window (or expired)', async () => {
    seedQuery('documents', [
      { id: 'd1', houseId: 'h1', expiresAt: '2026-10-20' },
      { id: 'd2', houseId: 'h1', expiresAt: '2027-06-01' },
      { id: 'd3', houseId: 'h1', expiresAt: '2026-01-01' },
      { id: 'd4', houseId: 'h1' },
    ]);

    expect((await getExpiringDocuments('h1')).map((d) => d.id)).toEqual(['d1', 'd3']);
    expect(getOpLog()).toEqual([
      { op: 'getDocs', path: 'documents', constraints: [['where', 'houseId', '==', 'h1']] },
    ]);
  });

  it('rethrows a failed query', async () => {
    failNext('getDocs', new Error('unavailable'), 'documents');
    await expect(getExpiringDocuments('h1')).rejects.toThrow('unavailable');
  });
});
