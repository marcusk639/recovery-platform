/**
 * Staff Notes Service
 *
 * Firestore CRUD for the `staffNotes` top-level collection. Mirrors the
 * `activities` pattern: flat collection, queries scoped by houseId + type.
 *
 * Auth is enforced server-side by `isHouseAdmin(houseId)` in firestore.rules.
 * Client code still defends in depth by reading `auth.currentUser` and
 * failing fast if no user is present.
 */
import { firestore, auth } from '../../firebase-setup';
import {
  StaffNote,
  StaffNoteType,
  validateStaffNoteContent,
} from '../entities/StaffNote';
import { logException } from '../util/logging';

// ─── Firestore collection ─────────────────────────────────────────────────────

export const staffNotesCollection = firestore.collection('staffNotes');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireUser(): { uid: string; displayName: string } {
  const u = auth.currentUser;
  if (!u || !u.uid) {
    throw new Error('Must be signed in to write staff notes.');
  }
  return {
    uid: u.uid,
    displayName: u.displayName || u.email || 'Unknown Admin',
  };
}

function docToStaffNote(
  id: string,
  data: FirebaseFirestoreTypes.DocumentData | undefined,
): StaffNote | null {
  if (!data) return null;
  return {
    id,
    houseId: String(data.houseId ?? ''),
    guestId: data.guestId ? String(data.guestId) : undefined,
    type: (data.type as StaffNoteType) ?? 'resident_note',
    content: String(data.content ?? ''),
    authorId: String(data.authorId ?? ''),
    authorName: String(data.authorName ?? ''),
    createdAt: String(data.createdAt ?? new Date(0).toISOString()),
    pinned: Boolean(data.pinned ?? false),
  };
}

// Local type alias for compat with @react-native-firebase typings without
// importing the namespace (the project's firestore export is the compat shape).
type FirebaseFirestoreTypes = {
  DocumentData: Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace FirebaseFirestoreTypes {
  export type DocumentData = Record<string, unknown>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AddStaffNoteInput {
  houseId: string;
  type: StaffNoteType;
  content: string;
  /** Required when type === 'resident_note'; ignored for shift_log. */
  guestId?: string;
}

/**
 * Add a new staff note. Validates content, attaches the current user as
 * author, and returns the new document id.
 */
export async function addStaffNote(input: AddStaffNoteInput): Promise<string> {
  if (!input.houseId) {
    throw new Error('addStaffNote: houseId is required.');
  }
  if (input.type === 'resident_note' && !input.guestId) {
    throw new Error('addStaffNote: guestId is required for resident_note.');
  }

  const content = validateStaffNoteContent(input.content);
  const { uid, displayName } = requireUser();

  const payload: Omit<StaffNote, 'id'> = {
    houseId: input.houseId,
    type: input.type,
    content,
    authorId: uid,
    authorName: displayName,
    createdAt: new Date().toISOString(),
    pinned: false,
    ...(input.type === 'resident_note' ? { guestId: input.guestId } : {}),
  };

  try {
    const ref = await staffNotesCollection.add(payload);
    return ref.id;
  } catch (err) {
    logException(err);
    throw err;
  }
}

/**
 * List resident notes for a specific guest in a house, newest first.
 * Pinned notes are surfaced ahead of unpinned (client-side sort to avoid a
 * composite index requirement).
 */
export async function listResidentNotes(
  houseId: string,
  guestId: string,
): Promise<StaffNote[]> {
  if (!houseId || !guestId) return [];
  try {
    const snap = await staffNotesCollection
      .where('houseId', '==', houseId)
      .where('type', '==', 'resident_note')
      .where('guestId', '==', guestId)
      .get();
    const notes = snap.docs
      .map(d => docToStaffNote(d.id, d.data()))
      .filter((n): n is StaffNote => n !== null);
    return sortNotes(notes);
  } catch (err) {
    logException(err);
    throw err;
  }
}

/**
 * List shift-log notes for a house, newest first. Pinned-first ordering
 * applied client-side.
 */
export async function listShiftLogs(houseId: string): Promise<StaffNote[]> {
  if (!houseId) return [];
  try {
    const snap = await staffNotesCollection
      .where('houseId', '==', houseId)
      .where('type', '==', 'shift_log')
      .get();
    const notes = snap.docs
      .map(d => docToStaffNote(d.id, d.data()))
      .filter((n): n is StaffNote => n !== null);
    return sortNotes(notes);
  } catch (err) {
    logException(err);
    throw err;
  }
}

/** Delete a staff note. Idempotent — succeeds if the note is already gone. */
export async function deleteStaffNote(noteId: string): Promise<void> {
  if (!noteId) throw new Error('deleteStaffNote: noteId is required.');
  try {
    await staffNotesCollection.doc(noteId).delete();
  } catch (err) {
    logException(err);
    throw err;
  }
}

/** Toggle the pinned flag on a staff note. */
export async function pinStaffNote(
  noteId: string,
  pinned: boolean,
): Promise<void> {
  if (!noteId) throw new Error('pinStaffNote: noteId is required.');
  try {
    await staffNotesCollection.doc(noteId).update({ pinned });
  } catch (err) {
    logException(err);
    throw err;
  }
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

function sortNotes(notes: StaffNote[]): StaffNote[] {
  // Pinned first, then by createdAt desc. Returns a new array (immutable).
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}
