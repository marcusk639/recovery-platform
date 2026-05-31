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

/** Returns the Firestore documents collection reference. Lazy so tests can
 * configure the firestore mock before the reference is resolved. */
export const getDocumentsCollection = () => firestore.collection('documents');

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
  const ref = getDocumentsCollection().doc();
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
    let query = getDocumentsCollection().where('houseId', '==', houseId);
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
      getDocumentsCollection().doc(docId).delete(),
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
    const snap = await getDocumentsCollection()
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
