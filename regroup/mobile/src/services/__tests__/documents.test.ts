/**
 * Unit tests for the documents service.
 *
 * firebase-setup and @react-native-firebase/storage are mocked via self-
 * contained jest.mock factories at the top of this file so no native modules
 * are required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(),
  },
  auth: {
    currentUser: { uid: 'admin-uid-1', displayName: 'Test Admin' },
  },
}));

jest.mock('@react-native-firebase/storage', () => {
  const mockRef = {
    putFile: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
    getDownloadURL: jest.fn(() =>
      Promise.resolve('https://storage.example.com/file'),
    ),
  };
  const mockStorageInstance = {
    ref: jest.fn(() => mockRef),
    _mockRef: mockRef,
  };
  const storageFn = jest.fn(() => mockStorageInstance);
  (storageFn as any)._instance = mockStorageInstance;
  return storageFn;
});

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { firestore, auth } from '../../../firebase-setup';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  getExpiringDocuments,
} from '../documents';

// ─── Typed aliases ────────────────────────────────────────────────────────────

const mockFirestore = firestore as any;
const mockAuth = auth as any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStorageMocks() {
  const storage = require('@react-native-firebase/storage');
  const instance = storage();
  return { storageRef: instance._mockRef, refSpy: instance.ref };
}

function makeCollectionMock() {
  const mockDocRef = {
    id: 'mock-doc-id',
    set: jest.fn(() => Promise.resolve()),
    delete: jest.fn(() => Promise.resolve()),
  };
  const col: any = {
    doc: jest.fn(() => mockDocRef),
    add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
    where: jest.fn(function () {
      return col;
    }),
    orderBy: jest.fn(function () {
      return col;
    }),
    get: jest.fn(() => Promise.resolve({ docs: [] })),
    _docRef: mockDocRef,
  };
  return col;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('documents service', () => {
  let mockCol: ReturnType<typeof makeCollectionMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCol = makeCollectionMock();
    mockFirestore.collection.mockReturnValue(mockCol);
    mockAuth.currentUser = { uid: 'admin-uid-1', displayName: 'Test Admin' };

    const { storageRef } = getStorageMocks();
    storageRef.putFile.mockResolvedValue(undefined);
    storageRef.delete.mockResolvedValue(undefined);
    storageRef.getDownloadURL.mockResolvedValue(
      'https://storage.example.com/file',
    );
  });

  // ── uploadDocument ──────────────────────────────────────────────────────────

  describe('uploadDocument', () => {
    const baseInput = {
      houseId: 'house-1',
      localPath: '/tmp/lease.pdf',
      fileName: 'lease.pdf',
      mimeType: 'application/pdf',
      category: 'lease' as const,
    };

    it('calls putFile with the correct storage path for a house-level doc', async () => {
      const { storageRef } = getStorageMocks();
      const result = await uploadDocument(baseInput);

      expect(storageRef.putFile).toHaveBeenCalledWith('/tmp/lease.pdf', {
        cacheControl: 'private, max-age=86400',
        contentType: 'application/pdf',
      });
      expect(result.houseId).toBe('house-1');
      expect(result.fileType).toBe('pdf');
      expect(result.category).toBe('lease');
      expect(result.uploadedBy).toBe('admin-uid-1');
      expect(result.guestId).toBeUndefined();
    });

    it('includes guestId in storagePath and record for resident docs', async () => {
      const { refSpy } = getStorageMocks();

      await uploadDocument({ ...baseInput, guestId: 'guest-1' });

      // The storagePath for a resident doc should include the guestId segment.
      const calledPath: string = refSpy.mock.calls.find((c: any) =>
        c[0]?.includes('guest-1'),
      )?.[0];
      expect(calledPath).toContain('guests/guest-1');
    });

    it('saves expiresAt when provided', async () => {
      const result = await uploadDocument({
        ...baseInput,
        expiresAt: '2027-12-31',
      });
      expect(result.expiresAt).toBe('2027-12-31');
      const written = (mockCol._docRef.set.mock.calls[0] as any)[0];
      expect(written.expiresAt).toBe('2027-12-31');
    });

    it('throws when houseId is missing', async () => {
      await expect(
        uploadDocument({ ...baseInput, houseId: '' }),
      ).rejects.toThrow('houseId is required');
    });

    it('throws when not signed in', async () => {
      mockAuth.currentUser = null;
      await expect(uploadDocument(baseInput)).rejects.toThrow('signed in');
    });

    it('infers fileType as image for image/* mime types', async () => {
      const result = await uploadDocument({
        ...baseInput,
        mimeType: 'image/jpeg',
        fileName: 'id.jpg',
        category: 'id',
      });
      expect(result.fileType).toBe('image');
    });
  });

  // ── listDocuments ───────────────────────────────────────────────────────────

  describe('listDocuments', () => {
    it('returns an empty array when no docs exist', async () => {
      mockCol.get.mockResolvedValueOnce({ docs: [] });
      const result = await listDocuments('house-1');
      expect(result).toEqual([]);
    });

    it('filters out resident docs when listing house-level docs', async () => {
      mockCol.get.mockResolvedValueOnce({
        docs: [
          {
            id: 'doc-1',
            data: () => ({
              houseId: 'house-1',
              fileName: 'compliance.pdf',
              storageUrl: 'https://x.com/1',
              storagePath: 'houses/house-1/documents/doc-1',
              fileType: 'pdf',
              category: 'compliance',
              uploadedBy: 'uid-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            }),
          },
          {
            id: 'doc-2',
            data: () => ({
              houseId: 'house-1',
              guestId: 'guest-1',
              fileName: 'lease.pdf',
              storageUrl: 'https://x.com/2',
              storagePath: 'houses/house-1/guests/guest-1/documents/doc-2',
              fileType: 'pdf',
              category: 'lease',
              uploadedBy: 'uid-1',
              createdAt: '2026-01-02T00:00:00.000Z',
            }),
          },
        ],
      });

      const result = await listDocuments('house-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-1');
    });

    it('returns resident docs when guestId is provided', async () => {
      mockCol.get.mockResolvedValueOnce({
        docs: [
          {
            id: 'doc-2',
            data: () => ({
              houseId: 'house-1',
              guestId: 'guest-1',
              fileName: 'lease.pdf',
              storageUrl: 'https://x.com/2',
              storagePath: 'houses/house-1/guests/guest-1/documents/doc-2',
              fileType: 'pdf',
              category: 'lease',
              uploadedBy: 'uid-1',
              createdAt: '2026-01-02T00:00:00.000Z',
            }),
          },
        ],
      });
      const result = await listDocuments('house-1', 'guest-1');
      expect(result).toHaveLength(1);
      expect(result[0].guestId).toBe('guest-1');
    });

    it('returns empty array when houseId is blank', async () => {
      const result = await listDocuments('');
      expect(result).toEqual([]);
    });
  });

  // ── deleteDocument ──────────────────────────────────────────────────────────

  describe('deleteDocument', () => {
    it('deletes the Firestore document', async () => {
      await deleteDocument('doc-1', 'houses/house-1/documents/doc-1');
      expect(mockCol._docRef.delete).toHaveBeenCalledTimes(1);
    });

    it('deletes the Storage object', async () => {
      const { storageRef } = getStorageMocks();
      await deleteDocument('doc-1', 'houses/house-1/documents/doc-1');
      expect(storageRef.delete).toHaveBeenCalledTimes(1);
    });

    it('throws when docId is empty', async () => {
      await expect(
        deleteDocument('', 'houses/house-1/documents/doc-1'),
      ).rejects.toThrow('docId is required');
    });
  });

  // ── getExpiringDocuments ────────────────────────────────────────────────────

  describe('getExpiringDocuments', () => {
    const now = new Date('2026-05-22T00:00:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers({ now });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns only docs expiring within 30 days', async () => {
      mockCol.get.mockResolvedValueOnce({
        docs: [
          {
            id: 'doc-expiring',
            data: () => ({
              houseId: 'house-1',
              fileName: 'cert.pdf',
              storageUrl: 'https://x.com/cert',
              storagePath: 'houses/house-1/documents/doc-expiring',
              fileType: 'pdf',
              category: 'compliance',
              expiresAt: '2026-06-01T00:00:00.000Z', // 10 days away
              uploadedBy: 'uid-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            }),
          },
          {
            id: 'doc-ok',
            data: () => ({
              houseId: 'house-1',
              fileName: 'license.pdf',
              storageUrl: 'https://x.com/lic',
              storagePath: 'houses/house-1/documents/doc-ok',
              fileType: 'pdf',
              category: 'compliance',
              expiresAt: '2027-01-01T00:00:00.000Z', // > 30 days away
              uploadedBy: 'uid-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            }),
          },
          {
            id: 'doc-no-expiry',
            data: () => ({
              houseId: 'house-1',
              fileName: 'misc.pdf',
              storageUrl: 'https://x.com/misc',
              storagePath: 'houses/house-1/documents/doc-no-expiry',
              fileType: 'pdf',
              category: 'other',
              uploadedBy: 'uid-1',
              createdAt: '2026-01-01T00:00:00.000Z',
            }),
          },
        ],
      });

      const result = await getExpiringDocuments('house-1', 30);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-expiring');
    });

    it('returns empty array when houseId is blank', async () => {
      const result = await getExpiringDocuments('');
      expect(result).toEqual([]);
    });
  });
});
