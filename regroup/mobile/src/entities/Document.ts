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
