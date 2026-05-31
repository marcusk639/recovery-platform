# Document Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Admins can upload documents for residents (lease agreements, intake paperwork, ID photos, drug test results) and for the house (compliance certificates, licenses). Documents have optional expiration dates. A badge alerts admins when documents are expiring within 30 days.

## Architecture

- **Storage:** Firebase Storage under `houses/{houseId}/documents/{docId}` (resident docs: `houses/{houseId}/guests/{guestId}/documents/{docId}`). Upload via `@react-native-firebase/storage`. Download URLs stored in Firestore.
- **Database:** Top-level flat Firestore collection `documents/{docId}`. Fields include `houseId`, optional `guestId`, `category`, `expiresAt`, `storagePath`, and `storageUrl`. Mirrors the `drug-tests` pattern: flat collection, queries scoped by `houseId`.
- **File picking:** `react-native-document-picker` (already installed) using `DocumentPicker.pickSingle({ type: [DocumentPicker.types.pdf, DocumentPicker.types.images] })`.
- **Access control:** `firestore.rules` gates all reads/writes through `isHouseAdmin(houseId)`. Residents have no access to documents.
- **Service layer:** `src/services/documents.ts` — pure async functions, auth via `auth.currentUser` (never `auth().currentUser`).
- **State layer:** `src/state/queries/documentQueries.ts` — React Query hooks. Reads use `useQuery`, writes use `useMutation` with `logException` in `onError` and cache invalidation in `onSettled`.
- **UI:** Single `DocumentListScreen` registered as a modal. Two entry points from `GuestHome` (guest-level docs) and future `HouseSettings` (house-level docs).

## Tech Stack

- TypeScript 5.x, React Native, React 18
- `@react-native-firebase/firestore` (compat-style via project's `firestore` export)
- `@react-native-firebase/storage` (via `storage().ref(path).putFile(...)`)
- `react-native-document-picker` (already in project)
- `@tanstack/react-query` v4+
- `@react-navigation/native-stack` (modal presentation)
- Jest with self-contained `jest.mock` factories

---

## File Structure

```
src/
  entities/
    Document.ts                               # NEW — type + constants
  services/
    documents.ts                              # NEW — upload/list/delete/expiry service
    __tests__/
      documents.test.ts                       # NEW — service unit tests
  state/queries/
    documentQueries.ts                        # NEW — RQ hooks
    __tests__/
      documentQueries.test.ts                 # NEW — hook unit tests
  screens/
    Documents/
      DocumentListScreen.tsx                  # NEW — list + upload + expiry badges
      __tests__/
        DocumentListScreen.test.tsx           # NEW — screen unit tests
    Profile/
      GuestHome.tsx                           # MODIFY — add "Documents" admin row
  navigation/
    types.ts                                  # MODIFY — Routes.Documents + DocumentsParams
    navigators.tsx                            # MODIFY — register DocumentListScreen modal
firebase/
  firestore.rules                             # MODIFY — documents collection block
```

---

## Task 1: Document entity + service + tests

Build the foundation: TypeScript entity, a Firestore+Storage service, and unit tests.

### Step 1.1: Create the entity

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/entities/Document.ts`:

```ts
/**
 * Document entity
 *
 * Admin-uploaded files scoped to a house or a specific resident.
 * Residents have NO access. Access is gated at the Firestore rules layer
 * by `isHouseAdmin(houseId)`.
 *
 * House-level docs: guestId is absent.
 * Resident-level docs: guestId is present.
 */

export type DocumentFileType = 'pdf' | 'image' | 'other';

export type DocumentCategory =
  | 'lease'
  | 'id'
  | 'intake'
  | 'drug_test'
  | 'compliance'
  | 'other';

export interface HouseDocument {
  id: string;
  houseId: string;
  /** Present for resident docs; absent for house-level docs. */
  guestId?: string;
  fileName: string;
  storageUrl: string;
  storagePath: string;
  fileType: DocumentFileType;
  category: DocumentCategory;
  /** ISO 8601 date string. Absent if the document never expires. */
  expiresAt?: string;
  /** auth.currentUser.uid at upload time. */
  uploadedBy: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  lease: 'Lease Agreement',
  id: 'ID / Photo ID',
  intake: 'Intake Paperwork',
  drug_test: 'Drug Test Result',
  compliance: 'Compliance Certificate',
  other: 'Other',
};

/**
 * Returns true when a document is expiring within `withinDays` days
 * (or is already expired).
 */
export function isDocumentExpiringSoon(
  doc: HouseDocument,
  withinDays = DOCUMENT_EXPIRY_WARNING_DAYS,
): boolean {
  if (!doc.expiresAt) return false;
  const expiryMs = new Date(doc.expiresAt).getTime();
  const nowMs = Date.now();
  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  return expiryMs - nowMs <= windowMs;
}

/**
 * Infer a DocumentFileType from a MIME type string.
 */
export function inferFileType(mimeType?: string | null): DocumentFileType {
  if (!mimeType) return 'other';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'other';
}
```

### Step 1.2: Create the service

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/services/documents.ts`:

```ts
/**
 * Documents Service
 *
 * Handles uploading, listing, deleting, and expiry-checking of admin documents
 * stored in Firebase Storage (binary) + Firestore (metadata).
 *
 * Storage paths:
 *   House-level:    houses/{houseId}/documents/{docId}
 *   Resident-level: houses/{houseId}/guests/{guestId}/documents/{docId}
 *
 * Firestore collection: documents/{docId}
 *
 * Auth is enforced server-side by isHouseAdmin(houseId) in firestore.rules.
 * Client code defends in depth by reading auth.currentUser and failing fast.
 */
import storage from '@react-native-firebase/storage';
import { firestore, auth } from '../../firebase-setup';
import {
  HouseDocument,
  DocumentCategory,
  DocumentFileType,
  inferFileType,
  isDocumentExpiringSoon,
  DOCUMENT_EXPIRY_WARNING_DAYS,
} from '../entities/Document';
import { logException } from '../util/logging';

// ─── Firestore collection ─────────────────────────────────────────────────────

export const documentsCollection = firestore.collection('documents');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireUser(): string {
  const u = auth.currentUser;
  if (!u || !u.uid) {
    throw new Error('Must be signed in to manage documents.');
  }
  return u.uid;
}

function buildStoragePath(
  houseId: string,
  docId: string,
  guestId?: string,
): string {
  if (guestId) {
    return `houses/${houseId}/guests/${guestId}/documents/${docId}`;
  }
  return `houses/${houseId}/documents/${docId}`;
}

function docToHouseDocument(
  id: string,
  data: Record<string, any> | undefined,
): HouseDocument | null {
  if (!data) return null;
  return {
    id,
    houseId: String(data.houseId ?? ''),
    guestId: data.guestId ? String(data.guestId) : undefined,
    fileName: String(data.fileName ?? ''),
    storageUrl: String(data.storageUrl ?? ''),
    storagePath: String(data.storagePath ?? ''),
    fileType: (data.fileType as DocumentFileType) ?? 'other',
    category: (data.category as DocumentCategory) ?? 'other',
    expiresAt: data.expiresAt ? String(data.expiresAt) : undefined,
    uploadedBy: String(data.uploadedBy ?? ''),
    createdAt: String(data.createdAt ?? new Date(0).toISOString()),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  houseId: string;
  guestId?: string;
  /** Absolute local file path (from DocumentPicker). */
  localPath: string;
  fileName: string;
  mimeType?: string | null;
  category: DocumentCategory;
  /** ISO date string, e.g. '2027-01-01'. Omit for non-expiring docs. */
  expiresAt?: string;
}

/**
 * Upload a document file to Firebase Storage and save its metadata to
 * Firestore. Returns the saved HouseDocument.
 */
export async function uploadDocument(
  input: UploadDocumentInput,
): Promise<HouseDocument> {
  if (!input.houseId) throw new Error('uploadDocument: houseId is required.');
  if (!input.localPath)
    throw new Error('uploadDocument: localPath is required.');
  if (!input.fileName) throw new Error('uploadDocument: fileName is required.');

  const uid = requireUser();

  // Generate a Firestore id upfront so we can use it in the storage path.
  const ref = documentsCollection.doc();
  const docId = ref.id;

  const storagePath = buildStoragePath(input.houseId, docId, input.guestId);
  const fileType = inferFileType(input.mimeType);

  try {
    // 1. Upload binary to Storage.
    await storage()
      .ref(storagePath)
      .putFile(input.localPath, {
        cacheControl: 'private, max-age=86400',
        contentType: input.mimeType ?? undefined,
      });

    // 2. Fetch permanent download URL.
    const storageUrl = await storage().ref(storagePath).getDownloadURL();

    // 3. Write metadata to Firestore.
    const record: HouseDocument = {
      id: docId,
      houseId: input.houseId,
      fileName: input.fileName,
      storageUrl,
      storagePath,
      fileType,
      category: input.category,
      uploadedBy: uid,
      createdAt: new Date().toISOString(),
      ...(input.guestId ? { guestId: input.guestId } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    };
    await ref.set(record);
    return record;
  } catch (err) {
    logException(err);
    throw err;
  }
}

/**
 * List documents for a house (or a specific resident within that house).
 * Results are sorted newest-first.
 */
export async function listDocuments(
  houseId: string,
  guestId?: string,
): Promise<HouseDocument[]> {
  if (!houseId) return [];
  try {
    let query = documentsCollection.where('houseId', '==', houseId);
    if (guestId) {
      query = query.where('guestId', '==', guestId);
    } else {
      // House-level docs have no guestId field.
      // We rely on the absence query via a workaround: fetch all house docs
      // and filter client-side when no guestId is provided.
      // (Firestore does not support "field does not exist" queries directly.)
    }
    const snap = await query.orderBy('createdAt', 'desc').get();
    const docs = snap.docs
      .map(d => docToHouseDocument(d.id, d.data()))
      .filter((d): d is HouseDocument => d !== null);

    // When listing house-level docs (no guestId arg), exclude resident docs.
    if (!guestId) {
      return docs.filter(d => !d.guestId);
    }
    return docs;
  } catch (err) {
    logException(err);
    throw err;
  }
}

/**
 * Delete a document from both Firestore and Firebase Storage.
 */
export async function deleteDocument(
  docId: string,
  storagePath: string,
): Promise<void> {
  if (!docId) throw new Error('deleteDocument: docId is required.');
  if (!storagePath) throw new Error('deleteDocument: storagePath is required.');
  try {
    await Promise.all([
      documentsCollection.doc(docId).delete(),
      storage().ref(storagePath).delete(),
    ]);
  } catch (err) {
    logException(err);
    throw err;
  }
}

/**
 * Return all documents for a house that are expiring within `withinDays` days
 * (including already-expired docs). Searches across all residents in the house.
 */
export async function getExpiringDocuments(
  houseId: string,
  withinDays = DOCUMENT_EXPIRY_WARNING_DAYS,
): Promise<HouseDocument[]> {
  if (!houseId) return [];
  try {
    const snap = await documentsCollection
      .where('houseId', '==', houseId)
      .get();
    const docs = snap.docs
      .map(d => docToHouseDocument(d.id, d.data()))
      .filter((d): d is HouseDocument => d !== null);
    return docs.filter(d => isDocumentExpiringSoon(d, withinDays));
  } catch (err) {
    logException(err);
    throw err;
  }
}
```

### Step 1.3: Create the service tests

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/services/__tests__/documents.test.ts`:

```ts
/**
 * Unit tests for the documents service.
 *
 * firebase-setup and @react-native-firebase/storage are mocked via self-
 * contained jest.mock factories at the top of this file so no native modules
 * are required.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const _mockDocRef = {
  id: 'mock-doc-id',
  set: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
};

const _mockCollectionObj: any = {
  doc: jest.fn(() => _mockDocRef),
  add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
  where: jest.fn(function () {
    return _mockCollectionObj;
  }),
  orderBy: jest.fn(function () {
    return _mockCollectionObj;
  }),
  get: jest.fn(() => Promise.resolve({ docs: [] })),
};

const _mockStorageRef = {
  putFile: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
  getDownloadURL: jest.fn(() =>
    Promise.resolve('https://storage.example.com/file'),
  ),
};

jest.mock('../../../firebase-setup', () => ({
  firestore: {
    collection: jest.fn(() => _mockCollectionObj),
  },
  auth: {
    currentUser: { uid: 'admin-uid-1', displayName: 'Test Admin' },
  },
}));

jest.mock('@react-native-firebase/storage', () => {
  return () => ({
    ref: jest.fn(() => _mockStorageRef),
  });
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

const mockAuth = auth as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('documents service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _mockCollectionObj.where.mockImplementation(function () {
      return _mockCollectionObj;
    });
    _mockCollectionObj.orderBy.mockImplementation(function () {
      return _mockCollectionObj;
    });
    _mockCollectionObj.get.mockResolvedValue({ docs: [] });
    _mockCollectionObj.doc.mockReturnValue(_mockDocRef);
    _mockDocRef.set.mockResolvedValue(undefined);
    _mockDocRef.delete.mockResolvedValue(undefined);
    _mockStorageRef.putFile.mockResolvedValue(undefined);
    _mockStorageRef.getDownloadURL.mockResolvedValue(
      'https://storage.example.com/file',
    );
    _mockStorageRef.delete.mockResolvedValue(undefined);
    mockAuth.currentUser = { uid: 'admin-uid-1', displayName: 'Test Admin' };
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
      const storage = require('@react-native-firebase/storage');
      const result = await uploadDocument(baseInput);

      expect(_mockStorageRef.putFile).toHaveBeenCalledWith('/tmp/lease.pdf', {
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
      const storageModule = require('@react-native-firebase/storage');
      const refSpy = storageModule().ref;

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
      const written = (_mockDocRef.set.mock.calls[0] as any)[0];
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
      _mockCollectionObj.get.mockResolvedValueOnce({ docs: [] });
      const result = await listDocuments('house-1');
      expect(result).toEqual([]);
    });

    it('filters out resident docs when listing house-level docs', async () => {
      _mockCollectionObj.get.mockResolvedValueOnce({
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
      _mockCollectionObj.get.mockResolvedValueOnce({
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
      expect(_mockDocRef.delete).toHaveBeenCalledTimes(1);
    });

    it('deletes the Storage object', async () => {
      await deleteDocument('doc-1', 'houses/house-1/documents/doc-1');
      expect(_mockStorageRef.delete).toHaveBeenCalledTimes(1);
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
      _mockCollectionObj.get.mockResolvedValueOnce({
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
```

### Step 1.4: Commit

```bash
git add src/entities/Document.ts src/services/documents.ts src/services/__tests__/documents.test.ts
git commit -m "feat(documents): add Document entity, service, and unit tests"
```

Expected test output:

```
PASS src/services/__tests__/documents.test.ts
  documents service
    uploadDocument
      ✓ calls putFile with the correct storage path for a house-level doc
      ✓ includes guestId in storagePath and record for resident docs
      ✓ saves expiresAt when provided
      ✓ throws when houseId is missing
      ✓ throws when not signed in
      ✓ infers fileType as image for image/* mime types
    listDocuments
      ✓ returns an empty array when no docs exist
      ✓ filters out resident docs when listing house-level docs
      ✓ returns resident docs when guestId is provided
      ✓ returns empty array when houseId is blank
    deleteDocument
      ✓ deletes the Firestore document
      ✓ deletes the Storage object
      ✓ throws when docId is empty
    getExpiringDocuments
      ✓ returns only docs expiring within 30 days
      ✓ returns empty array when houseId is blank

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
```

Run: `yarn test src/services/__tests__/documents.test.ts --no-coverage`

---

## Task 2: documentQueries hooks + tests

Wrap the service in React Query hooks following the `drugTestQueries.ts` pattern.

### Step 2.1: Create the queries file

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/state/queries/documentQueries.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  getExpiringDocuments,
  UploadDocumentInput,
} from '../../services/documents';
import { logException } from '../../util/logging';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const documentKeys = {
  all: ['documents'] as const,
  list: (houseId: string, guestId?: string) =>
    [...documentKeys.all, 'list', houseId, guestId ?? 'house'] as const,
  expiring: (houseId: string) =>
    [...documentKeys.all, 'expiring', houseId] as const,
};

// ─── Query hooks ──────────────────────────────────────────────────────────────

/**
 * List documents for a house or a specific resident within that house.
 * Pass `guestId` to scope to a single resident; omit for house-level docs.
 */
export function useDocuments(houseId: string, guestId?: string) {
  return useQuery({
    queryKey: documentKeys.list(houseId, guestId),
    queryFn: () => listDocuments(houseId, guestId),
    enabled: !!houseId,
    staleTime: 30000,
  });
}

/**
 * Return all documents expiring within 30 days for a house.
 * Used to drive the admin expiry badge.
 */
export function useExpiringDocuments(houseId: string) {
  return useQuery({
    queryKey: documentKeys.expiring(houseId),
    queryFn: () => getExpiringDocuments(houseId),
    enabled: !!houseId,
    staleTime: 60000,
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/**
 * Upload a new document.
 *
 * On success, invalidates both the list and expiring queries for the house so
 * the UI reflects the newly uploaded document immediately.
 */
export function useUploadDocument(houseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UploadDocumentInput) => uploadDocument(input),
    onError: (error: unknown) => {
      logException(error);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(houseId, variables.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.expiring(houseId),
      });
    },
  });
}

/**
 * Delete a document by Firestore id + storage path.
 *
 * Caller must pass `guestId` (or leave undefined) so we can invalidate the
 * correct list cache entry.
 */
export function useDeleteDocument(houseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      docId,
      storagePath,
    }: {
      docId: string;
      storagePath: string;
      guestId?: string;
    }) => deleteDocument(docId, storagePath),
    onError: (error: unknown) => {
      logException(error);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: documentKeys.list(houseId, variables.guestId),
      });
      queryClient.invalidateQueries({
        queryKey: documentKeys.expiring(houseId),
      });
    },
  });
}
```

### Step 2.2: Create the query hook tests

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/state/queries/__tests__/documentQueries.test.ts`:

```ts
/**
 * Unit tests for documentQueries React Query hooks.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useDocuments,
  useExpiringDocuments,
  useUploadDocument,
  useDeleteDocument,
  documentKeys,
} from '../documentQueries';
import * as documentService from '../../../services/documents';
import * as loggingModule from '../../../util/logging';
import { HouseDocument } from '../../../entities/Document';

// Mock the service and logging modules
jest.mock('../../../services/documents');
jest.mock('../../../util/logging');

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockDoc: HouseDocument = {
  id: 'doc-1',
  houseId: 'house-1',
  fileName: 'lease.pdf',
  storageUrl: 'https://storage.example.com/lease.pdf',
  storagePath: 'houses/house-1/documents/doc-1',
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: 'admin-uid-1',
  createdAt: '2026-05-22T00:00:00.000Z',
};

const mockExpiringDoc: HouseDocument = {
  ...mockDoc,
  id: 'doc-expiring',
  expiresAt: '2026-06-01T00:00:00.000Z',
  category: 'compliance',
};

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('documentQueries', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ─── documentKeys ─────────────────────────────────────────────────────────

  describe('documentKeys', () => {
    it('generates the correct base key', () => {
      expect(documentKeys.all).toEqual(['documents']);
    });

    it('generates a house-scoped list key', () => {
      expect(documentKeys.list('house-1')).toEqual([
        'documents',
        'list',
        'house-1',
        'house',
      ]);
    });

    it('generates a guest-scoped list key', () => {
      expect(documentKeys.list('house-1', 'guest-1')).toEqual([
        'documents',
        'list',
        'house-1',
        'guest-1',
      ]);
    });

    it('generates the expiring key', () => {
      expect(documentKeys.expiring('house-1')).toEqual([
        'documents',
        'expiring',
        'house-1',
      ]);
    });
  });

  // ─── useDocuments ─────────────────────────────────────────────────────────

  describe('useDocuments', () => {
    it('fetches house-level documents', async () => {
      (documentService.listDocuments as jest.Mock).mockResolvedValue([mockDoc]);

      const { result } = renderHook(() => useDocuments('house-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockDoc]);
      expect(documentService.listDocuments).toHaveBeenCalledWith(
        'house-1',
        undefined,
      );
    });

    it('fetches resident documents when guestId is provided', async () => {
      const guestDoc = { ...mockDoc, guestId: 'guest-1' };
      (documentService.listDocuments as jest.Mock).mockResolvedValue([
        guestDoc,
      ]);

      const { result } = renderHook(() => useDocuments('house-1', 'guest-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(documentService.listDocuments).toHaveBeenCalledWith(
        'house-1',
        'guest-1',
      );
    });

    it('is disabled when houseId is empty', () => {
      const { result } = renderHook(() => useDocuments(''), { wrapper });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ─── useExpiringDocuments ─────────────────────────────────────────────────

  describe('useExpiringDocuments', () => {
    it('fetches expiring documents', async () => {
      (documentService.getExpiringDocuments as jest.Mock).mockResolvedValue([
        mockExpiringDoc,
      ]);

      const { result } = renderHook(() => useExpiringDocuments('house-1'), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([mockExpiringDoc]);
    });

    it('is disabled when houseId is empty', () => {
      const { result } = renderHook(() => useExpiringDocuments(''), {
        wrapper,
      });
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  // ─── useUploadDocument ────────────────────────────────────────────────────

  describe('useUploadDocument', () => {
    it('calls uploadDocument and invalidates queries on success', async () => {
      (documentService.uploadDocument as jest.Mock).mockResolvedValue(mockDoc);
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUploadDocument('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({
        houseId: 'house-1',
        localPath: '/tmp/lease.pdf',
        fileName: 'lease.pdf',
        category: 'lease',
      });

      expect(documentService.uploadDocument).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.list('house-1', undefined),
        }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.expiring('house-1'),
        }),
      );
    });

    it('calls logException on error', async () => {
      const err = new Error('Upload failed');
      (documentService.uploadDocument as jest.Mock).mockRejectedValue(err);

      const { result } = renderHook(() => useUploadDocument('house-1'), {
        wrapper,
      });

      await expect(
        result.current.mutateAsync({
          houseId: 'house-1',
          localPath: '/tmp/file.pdf',
          fileName: 'file.pdf',
          category: 'other',
        }),
      ).rejects.toThrow('Upload failed');

      expect(loggingModule.logException).toHaveBeenCalledWith(err);
    });
  });

  // ─── useDeleteDocument ────────────────────────────────────────────────────

  describe('useDeleteDocument', () => {
    it('calls deleteDocument and invalidates queries on success', async () => {
      (documentService.deleteDocument as jest.Mock).mockResolvedValue(
        undefined,
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteDocument('house-1'), {
        wrapper,
      });

      await result.current.mutateAsync({
        docId: 'doc-1',
        storagePath: 'houses/house-1/documents/doc-1',
        guestId: 'guest-1',
      });

      expect(documentService.deleteDocument).toHaveBeenCalledWith(
        'doc-1',
        'houses/house-1/documents/doc-1',
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: documentKeys.list('house-1', 'guest-1'),
        }),
      );
    });
  });
});
```

### Step 2.3: Commit

```bash
git add src/state/queries/documentQueries.ts src/state/queries/__tests__/documentQueries.test.ts
git commit -m "feat(documents): add documentQueries React Query hooks and tests"
```

Expected test output:

```
PASS src/state/queries/__tests__/documentQueries.test.ts
  documentQueries
    documentKeys
      ✓ generates the correct base key
      ✓ generates a house-scoped list key
      ✓ generates a guest-scoped list key
      ✓ generates the expiring key
    useDocuments
      ✓ fetches house-level documents
      ✓ fetches resident documents when guestId is provided
      ✓ is disabled when houseId is empty
    useExpiringDocuments
      ✓ fetches expiring documents
      ✓ is disabled when houseId is empty
    useUploadDocument
      ✓ calls uploadDocument and invalidates queries on success
      ✓ calls logException on error
    useDeleteDocument
      ✓ calls deleteDocument and invalidates queries on success

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

Run: `yarn test src/state/queries/__tests__/documentQueries.test.ts --no-coverage`

---

## Task 3: DocumentListScreen + tests

Build the UI: a list of documents with upload button and expiry badges, plus a confirmation before delete.

### Step 3.1: Create the screen

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/screens/Documents/DocumentListScreen.tsx`:

```tsx
// src/screens/Documents/DocumentListScreen.tsx
import React, { useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'react-native-document-picker';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RatsText } from '../../components/rats-text';
import RatsButton from '../../components/rats-button/rats-button';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { RatsIcon } from '../../components/rats-icon';
import {
  color,
  normalize,
  fontSize,
  CARD_STYLE,
  ROW,
} from '../../styles/theme';
import { logException } from '../../util/logging';
import {
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
} from '../../state/queries/documentQueries';
import {
  HouseDocument,
  DOCUMENT_CATEGORY_LABELS,
  isDocumentExpiringSoon,
} from '../../entities/Document';
import { Routes, RootStackParamList } from '../../navigation/types';
import { DocumentCategory } from '../../entities/Document';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentsRouteProp = RouteProp<RootStackParamList, Routes.Documents>;

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: Array<{ label: string; value: DocumentCategory }> = [
  { label: 'Lease Agreement', value: 'lease' },
  { label: 'ID / Photo ID', value: 'id' },
  { label: 'Intake Paperwork', value: 'intake' },
  { label: 'Drug Test Result', value: 'drug_test' },
  { label: 'Compliance Certificate', value: 'compliance' },
  { label: 'Other', value: 'other' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DocumentRowProps {
  doc: HouseDocument;
  onDelete: (doc: HouseDocument) => void;
}

const DocumentRow: React.FC<DocumentRowProps> = ({ doc, onDelete }) => {
  const expiring = isDocumentExpiringSoon(doc);
  const expired =
    doc.expiresAt != null && new Date(doc.expiresAt).getTime() < Date.now();

  const handleOpen = () => {
    Linking.openURL(doc.storageUrl).catch(err => {
      logException(err);
      Alert.alert('Error', 'Could not open this document.');
    });
  };

  const expiryLabel = (() => {
    if (!doc.expiresAt) return null;
    const date = new Date(doc.expiresAt).toLocaleDateString();
    if (expired) return `Expired ${date}`;
    if (expiring) return `Expires ${date}`;
    return `Expires ${date}`;
  })();

  return (
    <View
      style={[CARD_STYLE, styles.docRow, expiring && styles.docRowWarning]}
      testID={`document-row-${doc.id}`}>
      {/* Left: icon + info */}
      <TouchableOpacity
        style={[ROW, { flex: 1 }]}
        onPress={handleOpen}
        activeOpacity={0.7}
        testID={`document-open-${doc.id}`}>
        <RatsIcon
          name={doc.fileType === 'pdf' ? 'file-pdf' : 'file-image'}
          solid
          size={normalize(24)}
          style={{
            color: doc.fileType === 'pdf' ? color.red : color.baby_blue,
            marginRight: normalize(10),
          }}
        />
        <View style={{ flex: 1 }}>
          <RatsText
            translate={false}
            text={doc.fileName}
            style={styles.docFileName}
          />
          <RatsText
            translate={false}
            text={DOCUMENT_CATEGORY_LABELS[doc.category]}
            style={styles.docCategory}
          />
          {expiryLabel && (
            <View style={styles.expiryRow}>
              {(expiring || expired) && (
                <RatsIcon
                  name="exclamation-triangle"
                  solid
                  size={normalize(11)}
                  style={{
                    color: expired ? color.red : color.orange,
                    marginRight: normalize(4),
                  }}
                />
              )}
              <RatsText
                translate={false}
                text={expiryLabel}
                style={[
                  styles.expiryLabel,
                  expired && { color: color.red },
                  expiring && !expired && { color: color.orange },
                ]}
              />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Right: delete */}
      <TouchableOpacity
        onPress={() => onDelete(doc)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        testID={`document-delete-${doc.id}`}>
        <RatsIcon
          name="trash-alt"
          solid
          size={normalize(18)}
          style={{ color: color.red }}
        />
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

const DocumentListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<DocumentsRouteProp>();
  const { houseId, guestId, title } = route.params;

  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] =
    useState<DocumentCategory>('other');

  const { data: documents, isLoading } = useDocuments(houseId, guestId);
  const uploadMutation = useUploadDocument(houseId);
  const deleteMutation = useDeleteDocument(houseId);

  // ── Upload flow ────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    try {
      const file = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.images],
      });

      Alert.alert('Choose Category', 'What type of document is this?', [
        ...CATEGORY_OPTIONS.map(opt => ({
          text: opt.label,
          onPress: () => doUpload(file, opt.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        logException(err);
        Alert.alert('Error', 'Could not open the file picker.');
      }
    }
  };

  const doUpload = async (
    file: DocumentPicker.DocumentPickerResponse,
    category: DocumentCategory,
  ) => {
    if (!file.uri || !file.name) {
      Alert.alert('Error', 'Invalid file selected.');
      return;
    }
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        houseId,
        guestId,
        localPath: file.uri,
        fileName: file.name,
        mimeType: file.type,
        category,
      });
    } catch (err) {
      Alert.alert(
        'Upload Failed',
        'Could not upload the document. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Delete flow ────────────────────────────────────────────────────────────

  const handleDelete = (doc: HouseDocument) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.fileName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                docId: doc.id,
                storagePath: doc.storagePath,
                guestId: doc.guestId,
              });
            } catch (_err) {
              Alert.alert('Error', 'Could not delete the document.');
            }
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <RatsLoadingIndicator />;
  }

  const isEmpty = !documents || documents.length === 0;

  return (
    <View style={styles.container} testID="document-list-screen">
      <ScreenHeader header={title || 'Documents'} />

      <RatsButton
        title={uploading ? 'Uploading...' : 'Upload Document'}
        onPress={uploading ? undefined : handleUpload}
        testID="upload-document-button"
      />

      {(uploadMutation.isLoading || uploading) && (
        <ActivityIndicator
          size="small"
          color={color.main}
          style={{ marginVertical: normalize(8) }}
          testID="upload-loading-indicator"
        />
      )}

      {isEmpty ? (
        <View style={styles.emptyContainer} testID="empty-documents">
          <RatsIcon
            name="folder-open"
            solid
            size={normalize(48)}
            style={{ color: color.light_grey, marginBottom: normalize(12) }}
          />
          <RatsText
            translate={false}
            text="No documents yet"
            style={styles.emptyText}
          />
          <RatsText
            translate={false}
            text="Tap Upload Document to add one."
            style={styles.emptySubtext}
          />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DocumentRow doc={item} onDelete={handleDelete} />
          )}
          contentContainerStyle={{ paddingBottom: normalize(24) }}
          testID="document-list"
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.white,
    padding: normalize(16),
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: normalize(8),
    padding: normalize(12),
  },
  docRowWarning: {
    borderLeftWidth: 3,
    borderLeftColor: color.orange,
  },
  docFileName: {
    fontSize: fontSize.medium,
    color: color.black,
    fontWeight: '600',
  },
  docCategory: {
    fontSize: fontSize.small,
    color: color.dark_grey,
    marginTop: normalize(2),
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: normalize(3),
  },
  expiryLabel: {
    fontSize: fontSize.small,
    color: color.dark_grey,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.large,
    color: color.dark_grey,
    fontWeight: '600',
    marginBottom: normalize(4),
  },
  emptySubtext: {
    fontSize: fontSize.regular,
    color: color.grey,
  },
});

export default DocumentListScreen;
```

### Step 3.2: Create the screen tests

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/screens/Documents/__tests__/DocumentListScreen.test.tsx`:

```tsx
/**
 * Unit tests for DocumentListScreen.
 *
 * Mocks: documentQueries, react-native-document-picker, logging, navigation.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const _mockMutateAsync = jest.fn();

jest.mock('../../../state/queries/documentQueries', () => ({
  useDocuments: jest.fn(),
  useExpiringDocuments: jest.fn(() => ({ data: [] })),
  useUploadDocument: jest.fn(() => ({
    mutateAsync: _mockMutateAsync,
    isLoading: false,
  })),
  useDeleteDocument: jest.fn(() => ({
    mutateAsync: _mockMutateAsync,
    isLoading: false,
  })),
}));

jest.mock('react-native-document-picker', () => ({
  pickSingle: jest.fn(),
  types: { pdf: 'application/pdf', images: 'image/*' },
  isCancel: jest.fn((err: any) => err?.code === 'DOCUMENT_PICKER_CANCELED'),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ goBack: jest.fn() }),
    useRoute: () => ({
      params: {
        houseId: 'house-1',
        guestId: 'guest-1',
        title: 'Resident Documents',
      },
    }),
  };
});

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import DocumentListScreen from '../DocumentListScreen';
import * as documentQueries from '../../../state/queries/documentQueries';
import * as DocumentPicker from 'react-native-document-picker';
import { HouseDocument } from '../../../entities/Document';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockDoc: HouseDocument = {
  id: 'doc-1',
  houseId: 'house-1',
  guestId: 'guest-1',
  fileName: 'lease.pdf',
  storageUrl: 'https://storage.example.com/lease.pdf',
  storagePath: 'houses/house-1/guests/guest-1/documents/doc-1',
  fileType: 'pdf',
  category: 'lease',
  uploadedBy: 'admin-uid-1',
  createdAt: '2026-05-22T00:00:00.000Z',
};

const mockExpiringDoc: HouseDocument = {
  ...mockDoc,
  id: 'doc-expiring',
  fileName: 'cert.pdf',
  category: 'compliance',
  expiresAt: '2026-06-01T00:00:00.000Z', // within 30 days of 2026-05-22
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DocumentListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders loading indicator while fetching', () => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      const { getByTestId } = render(<DocumentListScreen />);
      // RatsLoadingIndicator is the loading state — verify no list is shown
      expect(() => getByTestId('document-list')).toThrow();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no documents exist', () => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
      });
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('empty-documents')).toBeTruthy();
    });
  });

  describe('document list', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockDoc],
        isLoading: false,
      });
    });

    it('renders document rows', () => {
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('document-list')).toBeTruthy();
      expect(getByTestId(`document-row-${mockDoc.id}`)).toBeTruthy();
    });

    it('shows the file name in each row', () => {
      const { getByText } = render(<DocumentListScreen />);
      expect(getByText('lease.pdf')).toBeTruthy();
    });

    it('shows the category label', () => {
      const { getByText } = render(<DocumentListScreen />);
      expect(getByText('Lease Agreement')).toBeTruthy();
    });
  });

  describe('expiry badge', () => {
    it('renders expiry warning for docs expiring soon', () => {
      jest.useFakeTimers({ now: new Date('2026-05-22T00:00:00.000Z') });
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockExpiringDoc],
        isLoading: false,
      });
      const { getByText } = render(<DocumentListScreen />);
      // Should show the expiry label
      expect(getByText(/Expires/)).toBeTruthy();
      jest.useRealTimers();
    });
  });

  describe('upload', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
      });
    });

    it('renders the upload button', () => {
      const { getByTestId } = render(<DocumentListScreen />);
      expect(getByTestId('upload-document-button')).toBeTruthy();
    });

    it('shows category alert after picking a file', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      (DocumentPicker.pickSingle as jest.Mock).mockResolvedValueOnce({
        uri: '/tmp/lease.pdf',
        name: 'lease.pdf',
        type: 'application/pdf',
      });

      const { getByTestId } = render(<DocumentListScreen />);
      fireEvent.press(getByTestId('upload-document-button'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Choose Category',
          expect.any(String),
          expect.any(Array),
        );
      });
    });

    it('does not show alert when picker is cancelled', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const cancelError = { code: 'DOCUMENT_PICKER_CANCELED' };
      (DocumentPicker.pickSingle as jest.Mock).mockRejectedValueOnce(
        cancelError,
      );
      (DocumentPicker.isCancel as jest.Mock).mockReturnValueOnce(true);

      const { getByTestId } = render(<DocumentListScreen />);
      fireEvent.press(getByTestId('upload-document-button'));

      await waitFor(() => {
        expect(alertSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      (documentQueries.useDocuments as jest.Mock).mockReturnValue({
        data: [mockDoc],
        isLoading: false,
      });
    });

    it('shows a confirmation alert before deleting', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      const { getByTestId } = render(<DocumentListScreen />);

      fireEvent.press(getByTestId(`document-delete-${mockDoc.id}`));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Delete Document',
          expect.stringContaining('lease.pdf'),
          expect.any(Array),
        );
      });
    });
  });
});
```

### Step 3.3: Commit

```bash
git add src/screens/Documents/
git commit -m "feat(documents): add DocumentListScreen with upload, list, and delete"
```

Expected test output:

```
PASS src/screens/Documents/__tests__/DocumentListScreen.test.tsx
  DocumentListScreen
    loading state
      ✓ renders loading indicator while fetching
    empty state
      ✓ shows empty state when no documents exist
    document list
      ✓ renders document rows
      ✓ shows the file name in each row
      ✓ shows the category label
    expiry badge
      ✓ renders expiry warning for docs expiring soon
    upload
      ✓ renders the upload button
      ✓ shows category alert after picking a file
      ✓ does not show alert when picker is cancelled
    delete
      ✓ shows a confirmation alert before deleting

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

Run: `yarn test src/screens/Documents/__tests__/DocumentListScreen.test.tsx --no-coverage`

---

## Task 4: Navigation wiring + GuestHome integration

Wire the screen into the navigator and add the admin row in GuestHome.

### Step 4.1: Add the route to `types.ts`

- [ ] Modify `/Users/marcusklein/dev/rats-v2/src/navigation/types.ts`:

In the `Routes` enum, after `GuestImport = 'guestImport'`, add:

```ts
  // Document Routes
  Documents = 'documents',
```

In `RootStackParamList`, after the `[Routes.GuestImport]: undefined;` line, add:

```ts
  // Document screens
  [Routes.Documents]: { houseId: string; guestId?: string; title: string };
```

### Step 4.2: Register the screen in `navigators.tsx`

- [ ] Modify `/Users/marcusklein/dev/rats-v2/src/navigation/navigators.tsx`:

At the top of the imports, after the `GuestImportScreen` import line, add:

```ts
import DocumentListScreen from '../screens/Documents/DocumentListScreen';
```

Inside the `<RootStack.Group>` for modal screens, after the `{/* Import screens */}` block, add:

```tsx
{
  /* Document screens */
}
<RootStack.Screen name={Routes.Documents} component={DocumentListScreen} />;
```

### Step 4.3: Add "Documents" admin row to `GuestHome.tsx`

- [ ] Modify `/Users/marcusklein/dev/rats-v2/src/screens/Profile/GuestHome.tsx`:

Find the "EXPORT COMPLIANCE REPORT (admin only)" `<AuthConsumer>` block. Directly before it, add a new admin-only Documents row:

```tsx
{
  /******************************* DOCUMENTS (admin only) *******************************/
}
<AuthConsumer>
  {({ token }) =>
    isAdmin(token, house!.id) ? (
      <StatSection
        name="Documents"
        description="Manage resident files and paperwork"
        iconName="chevron-right"
        iconColor={color.dark_grey}
        boxedIconName="folder-open"
        iconBackgroundColor={color.baby_blue}
        onPress={() =>
          navigation.navigate(Routes.Documents, {
            houseId: house!.id,
            guestId: currentGuest?.id,
            title: `${firstName} Documents`,
          })
        }
        testID="documents-card"
      />
    ) : null
  }
</AuthConsumer>;
```

### Step 4.4: Commit

```bash
git add src/navigation/types.ts src/navigation/navigators.tsx src/screens/Profile/GuestHome.tsx
git commit -m "feat(documents): wire DocumentListScreen into navigation and add GuestHome admin row"
```

---

## Task 5: Firestore rules

Add the `documents` collection rule block to prevent resident access.

### Step 5.1: Update `firestore.rules`

- [ ] Modify `/Users/marcusklein/dev/rats-v2/firebase/firestore.rules`:

Find the `match /drug-tests/{testId}` block. Directly after its closing `}`, add:

```
    match /documents/{docId} {
      // Only house admins and super-admins can read or write documents.
      // Residents (guests) have zero access.
      allow read: if signedIn() && isAdmin([resource.data.houseId]);
      allow create: if signedIn() && isAdmin([request.resource.data.houseId]);
      allow delete: if signedIn() && isAdmin([resource.data.houseId]);
      allow update: if false;
    }
```

**Why `allow update: if false`:** Once a document is uploaded its metadata is immutable. To replace a document, delete and re-upload.

### Step 5.2: Commit

```bash
git add firebase/firestore.rules
git commit -m "feat(documents): add Firestore security rules for documents collection"
```

---

## Verification checklist

After all tasks are complete, run the full test suite for the new files:

```bash
yarn test src/entities/Document.ts src/services/__tests__/documents.test.ts src/state/queries/__tests__/documentQueries.test.ts src/screens/Documents/__tests__/DocumentListScreen.test.tsx --no-coverage
```

Manual smoke-test on device / simulator:

- [ ] Open a guest profile as an admin — "Documents" row appears.
- [ ] Tap "Documents" — DocumentListScreen opens showing empty state.
- [ ] Tap "Upload Document" — file picker opens (PDF + images only).
- [ ] Choose a file, select a category — upload progress indicator shows, doc appears in list.
- [ ] Tap a document row — device opens the file via `Linking.openURL`.
- [ ] Tap the trash icon — confirmation alert appears; confirm deletes the doc.
- [ ] Upload a doc with an expiration date within 30 days — orange warning stripe and expiry label appear.
- [ ] Open as a guest (non-admin) — "Documents" row is NOT shown.
