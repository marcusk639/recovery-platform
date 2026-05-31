/**
 * StaffNote entity
 *
 * Private admin-only notes scoped to a house. Two kinds:
 *  - resident_note: tied to a specific guest (behavioral observations, incidents)
 *  - shift_log:    house-wide handoff notes from one shift to the next
 *
 * Residents NEVER see staffNotes. Access is gated at the Firestore rules
 * layer by `isHouseAdmin(houseId)`.
 */

export type StaffNoteType = 'resident_note' | 'shift_log';

export interface StaffNote {
  id: string;
  houseId: string;
  /** Present on resident_note; absent (undefined) on shift_log. */
  guestId?: string;
  type: StaffNoteType;
  /** Free-text body. Trimmed; max 1000 characters. */
  content: string;
  /** auth.currentUser.uid at write time. */
  authorId: string;
  /** Author display name captured at write time (immutable). */
  authorName: string;
  /** ISO 8601 string. */
  createdAt: string;
  /** Admins can pin important notes to the top of the feed. */
  pinned: boolean;
}

export const STAFF_NOTE_MAX_LENGTH = 1000;

/**
 * Validate raw text before writing. Throws a descriptive Error on failure.
 * Returns the trimmed string on success.
 */
export function validateStaffNoteContent(content: string): string {
  const trimmed = (content ?? '').trim();
  if (trimmed.length === 0) {
    throw new Error('Staff note content cannot be empty.');
  }
  if (trimmed.length > STAFF_NOTE_MAX_LENGTH) {
    throw new Error(
      `Staff note content exceeds ${STAFF_NOTE_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}
