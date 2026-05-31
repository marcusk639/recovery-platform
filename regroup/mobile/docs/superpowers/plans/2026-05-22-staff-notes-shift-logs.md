# Staff Notes + Shift Logs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Add an admin-only system for logging private notes about residents (behavioral observations, incidents) and shift handoff notes (staff-to-staff). Notes are never surfaced to residents. House admins can create, read, pin, and delete notes. Resident notes are scoped to a specific `guestId`; shift logs are scoped to the `houseId` only.

## Architecture

- **Storage:** Top-level flat Firestore collection `staffNotes/{noteId}` (mirrors the `activities/{activityId}` pattern). A `type` field discriminates between `'resident_note'` and `'shift_log'`. Resident notes carry an optional `guestId`.
- **Access control:** `firestore.rules` gates all read/write through `isHouseAdmin(houseId)`. The rules read `houseId` from `resource.data` (for read/update/delete) and `request.resource.data` (for create). Residents and non-admin users are blocked at the rules layer.
- **Service layer:** `src/services/staffNotes.ts` exports a `staffNotesCollection` module-level ref plus pure async functions. All auth lookups go through `auth.currentUser` (never `auth().currentUser`).
- **State layer:** `src/state/queries/staffNoteQueries.ts` wraps the service in React Query hooks. Reads use `useQuery`, writes use `useMutation` with `logException` in `onError` and cache invalidation in `onSettled`.
- **UI:** A single reusable `StaffNotesFeed` screen renders either resident notes or shift logs based on a `type` route param. The screen is registered as a modal in the `RootStack`. Two entry points:
  - **Resident notes:** Touchable in the admin-only section of `GuestHome`, passing `guestId` + `houseId` + `type='resident_note'`.
  - **Shift log:** Menu item in `HouseSettings`, passing `houseId` + `type='shift_log'`.

## Tech Stack

- TypeScript 5.x, React Native, React 18
- `@react-native-firebase/firestore` (compat-style chained API via the project's `firestore` export)
- `@tanstack/react-query` v4+
- `@react-navigation/native-stack`
- Jest with self-contained `jest.mock` factories (see `markPaymentResolved.test.ts`)
- Sentry error reporting via `logException`

## File Structure

```
src/
  entities/
    StaffNote.ts                            # NEW — type + factory
  services/
    staffNotes.ts                           # NEW — CRUD service
    __tests__/
      staffNotes.test.ts                    # NEW — service tests
  state/queries/
    staffNoteQueries.ts                     # NEW — RQ hooks
    __tests__/
      staffNoteQueries.test.ts              # NEW — hook tests
  screens/
    StaffNotes/
      StaffNotesFeed.tsx                    # NEW — main UI
      __tests__/
        StaffNotesFeed.test.tsx             # NEW — UI tests
    Profile/
      GuestHome.tsx                         # MODIFY — add admin row
    HouseSettings/
      HouseSettings.tsx                     # MODIFY — add menu item
  navigation/
    types.ts                                # MODIFY — Routes + param
    navigators.tsx                          # MODIFY — register screen
firebase/
  firestore.rules                           # MODIFY — staffNotes block
```

---

## Task 1: StaffNote entity + service + tests

Build the foundation: a TypeScript entity, a Firestore service module, and unit tests using the project's self-contained `jest.mock` pattern.

### Step 1.1: Create the entity

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/entities/StaffNote.ts` with the following exact content:

```ts
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
```

### Step 1.2: Create the service

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/services/staffNotes.ts` with the following exact content:

```ts
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
```

### Step 1.3: Create service tests

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/services/__tests__/staffNotes.test.ts` with the following exact content:

```ts
jest.mock('../../../firebase-setup', () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: 'note-generated-id' });
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockDelete = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockWhere = jest.fn();
  const mockDoc = jest.fn(() => ({ update: mockUpdate, delete: mockDelete }));
  // Chain: collection().where().where().where().get()
  const chain: any = { add: mockAdd, doc: mockDoc, where: mockWhere, get: mockGet };
  mockWhere.mockReturnValue(chain);
  const mockCollection = jest.fn(() => chain);
  return {
    firestore: {
      collection: mockCollection,
      _mockCollection: mockCollection,
      _mockAdd: mockAdd,
      _mockUpdate: mockUpdate,
      _mockDelete: mockDelete,
      _mockGet: mockGet,
      _mockWhere: mockWhere,
      _mockDoc: mockDoc,
    },
    auth: {
      currentUser: {
        uid: 'admin-uid-1',
        displayName: 'Alice Admin',
        email: 'alice@example.com',
      },
    },
  };
});

jest.mock('../../util/logging', () => ({
  logException: jest.fn(),
}));

import { firestore } from '../../../firebase-setup';
import {
  addStaffNote,
  listResidentNotes,
  listShiftLogs,
  deleteStaffNote,
  pinStaffNote,
  staffNotesCollection,
} from '../staffNotes';

const f = firestore as any;
const getAdd = () => f._mockAdd as jest.Mock;
const getUpdate = () => f._mockUpdate as jest.Mock;
const getDelete = () => f._mockDelete as jest.Mock;
const getGet = () => f._mockGet as jest.Mock;
const getWhere = () => f._mockWhere as jest.Mock;
const getDoc = () => f._mockDoc as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('staffNotesCollection', () => {
  it('targets the "staffNotes" collection', () => {
    expect(f._mockCollection).toHaveBeenCalledWith('staffNotes');
    expect(staffNotesCollection).toBeDefined();
  });
});

describe('addStaffNote', () => {
  it('writes a resident note with guestId and the current user as author', async () => {
    const id = await addStaffNote({
      houseId: 'house-1',
      type: 'resident_note',
      guestId: 'guest-1',
      content: '  Resident skipped meeting  ',
    });
    expect(id).toBe('note-generated-id');
    expect(getAdd()).toHaveBeenCalledTimes(1);
    const payload = getAdd().mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        houseId: 'house-1',
        guestId: 'guest-1',
        type: 'resident_note',
        content: 'Resident skipped meeting',
        authorId: 'admin-uid-1',
        authorName: 'Alice Admin',
        pinned: false,
      }),
    );
    expect(new Date(payload.createdAt).toISOString()).toBe(payload.createdAt);
  });

  it('writes a shift log WITHOUT a guestId', async () => {
    await addStaffNote({
      houseId: 'house-1',
      type: 'shift_log',
      content: 'Quiet shift. No incidents.',
    });
    const payload = getAdd().mock.calls[0][0];
    expect(payload.type).toBe('shift_log');
    expect(payload).not.toHaveProperty('guestId');
  });

  it('rejects empty content', async () => {
    await expect(
      addStaffNote({ houseId: 'h', type: 'shift_log', content: '   ' }),
    ).rejects.toThrow(/empty/i);
    expect(getAdd()).not.toHaveBeenCalled();
  });

  it('rejects content exceeding 1000 characters', async () => {
    await expect(
      addStaffNote({
        houseId: 'h',
        type: 'shift_log',
        content: 'x'.repeat(1001),
      }),
    ).rejects.toThrow(/1000/);
  });

  it('rejects resident notes missing a guestId', async () => {
    await expect(
      addStaffNote({
        houseId: 'h',
        type: 'resident_note',
        content: 'hello',
      }),
    ).rejects.toThrow(/guestId/);
  });

  it('rejects when no user is signed in', async () => {
    (f as any).__originalUser = (require('../../../firebase-setup') as any).auth
      .currentUser;
    (require('../../../firebase-setup') as any).auth.currentUser = null;
    await expect(
      addStaffNote({
        houseId: 'h',
        type: 'shift_log',
        content: 'note',
      }),
    ).rejects.toThrow(/signed in/i);
    (require('../../../firebase-setup') as any).auth.currentUser =
      (f as any).__originalUser;
  });
});

describe('listResidentNotes', () => {
  it('filters by houseId, type=resident_note, and guestId', async () => {
    getGet().mockResolvedValueOnce({
      docs: [
        {
          id: 'n1',
          data: () => ({
            houseId: 'h',
            guestId: 'g',
            type: 'resident_note',
            content: 'a',
            authorId: 'u',
            authorName: 'A',
            createdAt: '2026-05-20T10:00:00.000Z',
            pinned: false,
          }),
        },
      ],
    });
    const notes = await listResidentNotes('h', 'g');
    expect(getWhere()).toHaveBeenCalledWith('houseId', '==', 'h');
    expect(getWhere()).toHaveBeenCalledWith('type', '==', 'resident_note');
    expect(getWhere()).toHaveBeenCalledWith('guestId', '==', 'g');
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('n1');
  });

  it('returns pinned notes before unpinned, then newest first', async () => {
    getGet().mockResolvedValueOnce({
      docs: [
        {
          id: 'old-unpinned',
          data: () => ({
            houseId: 'h',
            guestId: 'g',
            type: 'resident_note',
            content: 'a',
            authorId: 'u',
            authorName: 'A',
            createdAt: '2026-05-18T10:00:00.000Z',
            pinned: false,
          }),
        },
        {
          id: 'new-unpinned',
          data: () => ({
            houseId: 'h',
            guestId: 'g',
            type: 'resident_note',
            content: 'b',
            authorId: 'u',
            authorName: 'A',
            createdAt: '2026-05-20T10:00:00.000Z',
            pinned: false,
          }),
        },
        {
          id: 'old-pinned',
          data: () => ({
            houseId: 'h',
            guestId: 'g',
            type: 'resident_note',
            content: 'c',
            authorId: 'u',
            authorName: 'A',
            createdAt: '2026-05-15T10:00:00.000Z',
            pinned: true,
          }),
        },
      ],
    });
    const notes = await listResidentNotes('h', 'g');
    expect(notes.map(n => n.id)).toEqual([
      'old-pinned',
      'new-unpinned',
      'old-unpinned',
    ]);
  });

  it('returns [] when houseId or guestId missing', async () => {
    expect(await listResidentNotes('', 'g')).toEqual([]);
    expect(await listResidentNotes('h', '')).toEqual([]);
    expect(getGet()).not.toHaveBeenCalled();
  });
});

describe('listShiftLogs', () => {
  it('filters by houseId and type=shift_log', async () => {
    getGet().mockResolvedValueOnce({ docs: [] });
    const notes = await listShiftLogs('h');
    expect(getWhere()).toHaveBeenCalledWith('houseId', '==', 'h');
    expect(getWhere()).toHaveBeenCalledWith('type', '==', 'shift_log');
    expect(notes).toEqual([]);
  });
});

describe('deleteStaffNote', () => {
  it('deletes the doc by id', async () => {
    await deleteStaffNote('note-abc');
    expect(getDoc()).toHaveBeenCalledWith('note-abc');
    expect(getDelete()).toHaveBeenCalledTimes(1);
  });

  it('throws when noteId is empty', async () => {
    await expect(deleteStaffNote('')).rejects.toThrow(/noteId/);
  });
});

describe('pinStaffNote', () => {
  it('writes { pinned: true } to the doc', async () => {
    await pinStaffNote('note-abc', true);
    expect(getDoc()).toHaveBeenCalledWith('note-abc');
    expect(getUpdate()).toHaveBeenCalledWith({ pinned: true });
  });

  it('writes { pinned: false } when unpinning', async () => {
    await pinStaffNote('note-abc', false);
    expect(getUpdate()).toHaveBeenCalledWith({ pinned: false });
  });
});
```

### Step 1.4: Run the tests

- [ ] Run:
  ```bash
  yarn test src/services/__tests__/staffNotes.test.ts --no-coverage
  ```
  Expected output (abbreviated):
  ```
  PASS  src/services/__tests__/staffNotes.test.ts
    staffNotesCollection
      ✓ targets the "staffNotes" collection
    addStaffNote
      ✓ writes a resident note with guestId and the current user as author
      ✓ writes a shift log WITHOUT a guestId
      ✓ rejects empty content
      ✓ rejects content exceeding 1000 characters
      ✓ rejects resident notes missing a guestId
      ✓ rejects when no user is signed in
    listResidentNotes
      ✓ filters by houseId, type=resident_note, and guestId
      ✓ returns pinned notes before unpinned, then newest first
      ✓ returns [] when houseId or guestId missing
    listShiftLogs
      ✓ filters by houseId and type=shift_log
    deleteStaffNote
      ✓ deletes the doc by id
      ✓ throws when noteId is empty
    pinStaffNote
      ✓ writes { pinned: true } to the doc
      ✓ writes { pinned: false } when unpinning

  Tests:       15 passed, 15 total
  ```

### Step 1.5: Commit

- [ ] Stage and commit:
  ```bash
  git add src/entities/StaffNote.ts src/services/staffNotes.ts src/services/__tests__/staffNotes.test.ts
  git commit -m "feat(staffNotes): add StaffNote entity and Firestore service

  - New top-level collection 'staffNotes' mirrors the activities pattern
  - Supports resident_note (per-guest) and shift_log (house-wide) types
  - Service validates content (non-empty, max 1000 chars) and captures
    author identity from auth.currentUser at write time
  - Client-side sort surfaces pinned notes first, then newest
  - 15 unit tests cover happy paths, validation, and edge cases"
  ```

---

## Task 2: staffNoteQueries hooks + tests

Wrap the service in React Query hooks. Follow the `paymentQueries.ts` pattern: a `queryKey` factory, `useQuery` reads, `useMutation` writes with `logException` in `onError` and `invalidateQueries` in `onSettled`.

### Step 2.1: Create the hooks

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/state/queries/staffNoteQueries.ts` with the following exact content:

```ts
/**
 * Staff Notes Query Hooks
 *
 * React Query hooks for admin-only staff notes (resident notes + shift logs).
 * Reads use useQuery; writes use useMutation with logException + cache
 * invalidation in onSettled (mirrors paymentQueries.ts).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as staffNotesService from '../../services/staffNotes';
import { StaffNote, StaffNoteType } from '../../entities/StaffNote';
import { logException } from '../../util/logging';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const staffNoteKeys = {
  all: ['staffNotes'] as const,
  resident: (houseId: string, guestId: string) =>
    [...staffNoteKeys.all, 'resident', houseId, guestId] as const,
  shiftLog: (houseId: string) =>
    [...staffNoteKeys.all, 'shiftLog', houseId] as const,
};

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Fetch all resident notes for a specific guest in a house. */
export const useResidentNotes = (
  houseId: string,
  guestId: string,
  enabled: boolean = true,
) =>
  useQuery({
    queryKey: staffNoteKeys.resident(houseId, guestId),
    queryFn: () => staffNotesService.listResidentNotes(houseId, guestId),
    enabled: enabled && !!houseId && !!guestId,
    staleTime: 30_000,
  });

/** Fetch all shift-log notes for a house. */
export const useShiftLogs = (houseId: string, enabled: boolean = true) =>
  useQuery({
    queryKey: staffNoteKeys.shiftLog(houseId),
    queryFn: () => staffNotesService.listShiftLogs(houseId),
    enabled: enabled && !!houseId,
    staleTime: 30_000,
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

interface AddNoteVariables {
  type: StaffNoteType;
  content: string;
  guestId?: string;
}

/**
 * Add a staff note. Invalidates both possible caches (resident + shiftLog)
 * for the given houseId on settle so whichever feed is mounted refreshes.
 */
export const useAddStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: AddNoteVariables) =>
      staffNotesService.addStaffNote({
        houseId,
        type: vars.type,
        content: vars.content,
        guestId: vars.guestId,
      }),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars.type === 'resident_note' && vars.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.shiftLog(houseId),
        });
      }
    },
  });
};

interface DeleteNoteVariables {
  noteId: string;
  /** Provide to invalidate the resident feed; omit for shift_log. */
  guestId?: string;
}

export const useDeleteStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: DeleteNoteVariables) =>
      staffNotesService.deleteStaffNote(vars.noteId),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: staffNoteKeys.shiftLog(houseId),
      });
    },
  });
};

interface PinNoteVariables {
  noteId: string;
  pinned: boolean;
  guestId?: string;
}

export const usePinStaffNote = (houseId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: PinNoteVariables) =>
      staffNotesService.pinStaffNote(vars.noteId, vars.pinned),
    onError: error => {
      logException(error);
    },
    onSettled: (_data, _err, vars) => {
      if (vars?.guestId) {
        queryClient.invalidateQueries({
          queryKey: staffNoteKeys.resident(houseId, vars.guestId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: staffNoteKeys.shiftLog(houseId),
      });
    },
  });
};

// Re-export the StaffNote type for convenience.
export type { StaffNote };
```

### Step 2.2: Create the hook tests

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/state/queries/__tests__/staffNoteQueries.test.ts` with the following exact content:

```ts
jest.mock('../../../services/staffNotes', () => ({
  addStaffNote: jest.fn().mockResolvedValue('new-id'),
  listResidentNotes: jest.fn().mockResolvedValue([]),
  listShiftLogs: jest.fn().mockResolvedValue([]),
  deleteStaffNote: jest.fn().mockResolvedValue(undefined),
  pinStaffNote: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as staffNotesService from '../../../services/staffNotes';
import { logException } from '../../../util/logging';
import {
  staffNoteKeys,
  useResidentNotes,
  useShiftLogs,
  useAddStaffNote,
  useDeleteStaffNote,
  usePinStaffNote,
} from '../staffNoteQueries';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { wrapper, client };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('staffNoteKeys', () => {
  it('resident key includes houseId and guestId', () => {
    expect(staffNoteKeys.resident('h', 'g')).toEqual([
      'staffNotes',
      'resident',
      'h',
      'g',
    ]);
  });
  it('shiftLog key includes houseId', () => {
    expect(staffNoteKeys.shiftLog('h')).toEqual(['staffNotes', 'shiftLog', 'h']);
  });
});

describe('useResidentNotes', () => {
  it('calls listResidentNotes with houseId + guestId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResidentNotes('h', 'g'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staffNotesService.listResidentNotes).toHaveBeenCalledWith('h', 'g');
  });

  it('is disabled when houseId is empty', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useResidentNotes('', 'g'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(staffNotesService.listResidentNotes).not.toHaveBeenCalled();
  });
});

describe('useShiftLogs', () => {
  it('calls listShiftLogs with houseId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useShiftLogs('h'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staffNotesService.listShiftLogs).toHaveBeenCalledWith('h');
  });
});

describe('useAddStaffNote', () => {
  it('invalidates the resident feed on resident_note write', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        type: 'resident_note',
        guestId: 'g',
        content: 'note',
      });
    });
    expect(staffNotesService.addStaffNote).toHaveBeenCalledWith({
      houseId: 'h',
      type: 'resident_note',
      guestId: 'g',
      content: 'note',
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.resident('h', 'g'),
    });
  });

  it('invalidates the shift log feed on shift_log write', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ type: 'shift_log', content: 'hi' });
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.shiftLog('h'),
    });
  });

  it('logs exceptions on failure', async () => {
    (staffNotesService.addStaffNote as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAddStaffNote('h'), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ type: 'shift_log', content: 'x' }),
      ).rejects.toThrow('boom');
    });
    expect(logException).toHaveBeenCalled();
  });
});

describe('useDeleteStaffNote', () => {
  it('invalidates resident feed when guestId provided', async () => {
    const { wrapper, client } = makeWrapper();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ noteId: 'n', guestId: 'g' });
    });
    expect(staffNotesService.deleteStaffNote).toHaveBeenCalledWith('n');
    expect(spy).toHaveBeenCalledWith({
      queryKey: staffNoteKeys.resident('h', 'g'),
    });
  });
});

describe('usePinStaffNote', () => {
  it('forwards noteId + pinned to the service', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => usePinStaffNote('h'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ noteId: 'n', pinned: true });
    });
    expect(staffNotesService.pinStaffNote).toHaveBeenCalledWith('n', true);
  });
});
```

### Step 2.3: Run the tests

- [ ] Run:
  ```bash
  yarn test src/state/queries/__tests__/staffNoteQueries.test.ts --no-coverage
  ```
  Expected output (abbreviated):
  ```
  PASS  src/state/queries/__tests__/staffNoteQueries.test.ts
    staffNoteKeys
      ✓ resident key includes houseId and guestId
      ✓ shiftLog key includes houseId
    useResidentNotes
      ✓ calls listResidentNotes with houseId + guestId
      ✓ is disabled when houseId is empty
    useShiftLogs
      ✓ calls listShiftLogs with houseId
    useAddStaffNote
      ✓ invalidates the resident feed on resident_note write
      ✓ invalidates the shift log feed on shift_log write
      ✓ logs exceptions on failure
    useDeleteStaffNote
      ✓ invalidates resident feed when guestId provided
    usePinStaffNote
      ✓ forwards noteId + pinned to the service

  Tests:       10 passed, 10 total
  ```

### Step 2.4: Commit

- [ ] Stage and commit:
  ```bash
  git add src/state/queries/staffNoteQueries.ts src/state/queries/__tests__/staffNoteQueries.test.ts
  git commit -m "feat(staffNotes): add React Query hooks for staff notes

  - useResidentNotes / useShiftLogs for reads (30s stale)
  - useAddStaffNote / useDeleteStaffNote / usePinStaffNote for writes
  - Cache invalidation in onSettled, logException in onError
  - 10 unit tests cover key factory, enablement, and cache invalidation"
  ```

---

## Task 3: StaffNotesFeed screen + tests

Build a single screen reused for both resident notes and shift logs. The route param `type` selects which hook to use and the screen header.

### Step 3.1: Create the screen

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/screens/StaffNotes/StaffNotesFeed.tsx` with the following exact content:

```tsx
/**
 * StaffNotesFeed
 *
 * Admin-only feed for either:
 *  - resident_note: notes about a specific guest (route param guestId required)
 *  - shift_log:    house-wide shift-handoff notes
 *
 * Renders a header, an "Add Note" composer, and a scrollable list with
 * pin/delete affordances per note. The screen NEVER appears for non-admins
 * (Firestore rules also block reads, so a non-admin who reaches this screen
 * sees an empty feed).
 */
import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../../components/screen-header';
import { RatsText } from '../../components/rats-text';
import { RatsIcon } from '../../components/rats-icon';
import EmptyScreen from '../../components/empty-screen';
import {
  color,
  fontSize,
  normalize,
  CARD_STYLE,
  ROW,
} from '../../styles/theme';
import { logException } from '../../util/logging';
import { Routes, RootStackParamList } from '../../navigation/types';
import { StaffNote, STAFF_NOTE_MAX_LENGTH } from '../../entities/StaffNote';
import {
  useResidentNotes,
  useShiftLogs,
  useAddStaffNote,
  useDeleteStaffNote,
  usePinStaffNote,
} from '../../state/queries/staffNoteQueries';

type Props = NativeStackScreenProps<RootStackParamList, Routes.StaffNotes>;

const formatTimestamp = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const StaffNotesFeed: React.FC<Props> = ({ route, navigation }) => {
  const { houseId, type, guestId, guestName } = route.params;

  const headerTitle =
    type === 'shift_log' ? 'Shift Log' : `Notes${guestName ? ` — ${guestName}` : ''}`;

  // Reads — exactly one hook is enabled at a time.
  const residentQuery = useResidentNotes(
    houseId,
    guestId ?? '',
    type === 'resident_note',
  );
  const shiftLogQuery = useShiftLogs(houseId, type === 'shift_log');

  const notes: StaffNote[] = useMemo(() => {
    return type === 'resident_note'
      ? residentQuery.data ?? []
      : shiftLogQuery.data ?? [];
  }, [type, residentQuery.data, shiftLogQuery.data]);

  const isLoading =
    type === 'resident_note' ? residentQuery.isLoading : shiftLogQuery.isLoading;

  // Writes
  const addNote = useAddStaffNote(houseId);
  const deleteNote = useDeleteStaffNote(houseId);
  const pinNote = usePinStaffNote(houseId);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await addNote.mutateAsync({
        type,
        content: trimmed,
        guestId: type === 'resident_note' ? guestId : undefined,
      });
      setDraft('');
    } catch (err) {
      logException(err);
      Alert.alert('Could not save note', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [draft, addNote, type, guestId]);

  const onDelete = useCallback(
    (note: StaffNote) => {
      Alert.alert('Delete note?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote.mutateAsync({
                noteId: note.id,
                guestId: note.guestId,
              });
            } catch (err) {
              logException(err);
              Alert.alert('Could not delete note', 'Please try again.');
            }
          },
        },
      ]);
    },
    [deleteNote],
  );

  const onTogglePin = useCallback(
    async (note: StaffNote) => {
      try {
        await pinNote.mutateAsync({
          noteId: note.id,
          pinned: !note.pinned,
          guestId: note.guestId,
        });
      } catch (err) {
        logException(err);
      }
    },
    [pinNote],
  );

  const renderItem = useCallback(
    ({ item }: { item: StaffNote }) => (
      <View
        testID={`staff-note-row-${item.id}`}
        style={[
          CARD_STYLE,
          {
            marginHorizontal: normalize(12),
            marginVertical: normalize(4),
            padding: normalize(12),
            backgroundColor: item.pinned ? color.light_yellow : color.white,
          },
        ]}>
        <View style={[ROW, { justifyContent: 'space-between' }]}>
          <RatsText
            style={{ fontSize: fontSize.medium, fontWeight: '600' }}
            text={item.authorName}
          />
          <RatsText
            style={{ fontSize: fontSize.small, color: color.medium_grey }}
            text={formatTimestamp(item.createdAt)}
          />
        </View>
        <RatsText
          style={{
            fontSize: fontSize.medium,
            marginTop: normalize(8),
            color: color.dark_grey,
          }}
          text={item.content}
        />
        <View
          style={[
            ROW,
            { justifyContent: 'flex-end', marginTop: normalize(8) },
          ]}>
          <TouchableOpacity
            testID={`staff-note-pin-${item.id}`}
            onPress={() => onTogglePin(item)}
            style={{ marginRight: normalize(16) }}>
            <RatsIcon
              name={item.pinned ? 'thumbtack' : 'thumbtack'}
              color={item.pinned ? color.primary : color.medium_grey}
              size={normalize(16)}
            />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`staff-note-delete-${item.id}`}
            onPress={() => onDelete(item)}>
            <RatsIcon
              name="trash"
              color={color.medium_grey}
              size={normalize(16)}
            />
          </TouchableOpacity>
        </View>
      </View>
    ),
    [onDelete, onTogglePin],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: color.light_grey }}
      testID="staff-notes-feed-screen">
      <ScreenHeader header={headerTitle} />

      {/* Composer */}
      <View
        style={[
          CARD_STYLE,
          {
            margin: normalize(12),
            padding: normalize(12),
            backgroundColor: color.white,
          },
        ]}>
        <TextInput
          testID="staff-note-input"
          placeholder={
            type === 'shift_log'
              ? 'Log notes for the next shift…'
              : 'Add a private note about this resident…'
          }
          placeholderTextColor={color.medium_grey}
          value={draft}
          onChangeText={setDraft}
          maxLength={STAFF_NOTE_MAX_LENGTH}
          multiline
          style={{
            minHeight: normalize(80),
            fontSize: fontSize.medium,
            color: color.dark_grey,
            textAlignVertical: 'top',
          }}
        />
        <View
          style={[
            ROW,
            { justifyContent: 'space-between', marginTop: normalize(8) },
          ]}>
          <RatsText
            style={{ fontSize: fontSize.small, color: color.medium_grey }}
            text={`${draft.length}/${STAFF_NOTE_MAX_LENGTH}`}
          />
          <TouchableOpacity
            testID="staff-note-submit"
            disabled={!draft.trim() || submitting}
            onPress={onSubmit}
            style={{
              opacity: !draft.trim() || submitting ? 0.4 : 1,
              backgroundColor: color.primary,
              paddingHorizontal: normalize(16),
              paddingVertical: normalize(8),
              borderRadius: normalize(4),
            }}>
            {submitting ? (
              <ActivityIndicator color={color.white} />
            ) : (
              <RatsText
                style={{ color: color.white, fontWeight: '600' }}
                text="Add Note"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View
          testID="staff-notes-loading"
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : notes.length === 0 ? (
        <EmptyScreen
          message={
            type === 'shift_log'
              ? 'No shift logs yet. Add the first one above.'
              : 'No notes for this resident yet.'
          }
        />
      ) : (
        <FlatList
          testID="staff-notes-list"
          data={notes}
          keyExtractor={n => n.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: normalize(24) }}
        />
      )}
    </SafeAreaView>
  );
};

export default StaffNotesFeed;
```

### Step 3.2: Create the screen tests

- [ ] Create file `/Users/marcusklein/dev/rats-v2/src/screens/StaffNotes/__tests__/StaffNotesFeed.test.tsx` with the following exact content:

```tsx
jest.mock('../../../state/queries/staffNoteQueries', () => {
  const useResidentNotes = jest.fn();
  const useShiftLogs = jest.fn();
  const mutateAsyncAdd = jest.fn().mockResolvedValue('new-id');
  const mutateAsyncDelete = jest.fn().mockResolvedValue(undefined);
  const mutateAsyncPin = jest.fn().mockResolvedValue(undefined);
  return {
    staffNoteKeys: {},
    useResidentNotes,
    useShiftLogs,
    useAddStaffNote: () => ({ mutateAsync: mutateAsyncAdd }),
    useDeleteStaffNote: () => ({ mutateAsync: mutateAsyncDelete }),
    usePinStaffNote: () => ({ mutateAsync: mutateAsyncPin }),
    _mutateAsyncAdd: mutateAsyncAdd,
    _mutateAsyncDelete: mutateAsyncDelete,
    _mutateAsyncPin: mutateAsyncPin,
  };
});

jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));
jest.mock('../../../components/screen-header', () => 'ScreenHeader');
jest.mock('../../../components/empty-screen', () => 'EmptyScreen');
jest.mock('../../../components/rats-icon', () => ({
  RatsIcon: 'RatsIcon',
  ClickableIcon: 'ClickableIcon',
}));
jest.mock('../../../components/rats-text', () => ({
  RatsText: ({ text, ...rest }: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, rest, text);
  },
}));
jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
  (_title: string, _msg?: string, buttons?: any[]) => {
    // Auto-confirm destructive prompts by invoking the second button's onPress.
    if (Array.isArray(buttons) && buttons[1]?.onPress) buttons[1].onPress();
  },
);

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import StaffNotesFeed from '../StaffNotesFeed';
import {
  useResidentNotes,
  useShiftLogs,
} from '../../../state/queries/staffNoteQueries';
const queries = require('../../../state/queries/staffNoteQueries') as any;

const makeProps = (overrides: Partial<any> = {}) => ({
  route: {
    params: {
      houseId: 'h',
      type: 'resident_note' as const,
      guestId: 'g',
      guestName: 'Bob',
      ...overrides,
    },
  },
  navigation: { goBack: jest.fn(), navigate: jest.fn() },
});

beforeEach(() => {
  jest.clearAllMocks();
  (useResidentNotes as jest.Mock).mockReturnValue({
    data: [],
    isLoading: false,
  });
  (useShiftLogs as jest.Mock).mockReturnValue({ data: [], isLoading: false });
});

describe('StaffNotesFeed — resident_note', () => {
  it('renders the empty state when no notes exist', () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    expect(getByTestId('staff-notes-feed-screen')).toBeTruthy();
  });

  it('renders the list when notes are present', () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'observation',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    expect(getByTestId('staff-note-row-n1')).toBeTruthy();
  });

  it('disables submit when the draft is empty', () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    const submit = getByTestId('staff-note-submit');
    expect(submit.props.accessibilityState?.disabled || submit.props.disabled).toBeTruthy();
  });

  it('submits a new note with guestId on type=resident_note', async () => {
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.changeText(getByTestId('staff-note-input'), 'New observation');
    fireEvent.press(getByTestId('staff-note-submit'));
    await waitFor(() => {
      expect(queries._mutateAsyncAdd).toHaveBeenCalledWith({
        type: 'resident_note',
        content: 'New observation',
        guestId: 'g',
      });
    });
  });

  it('confirms before deletion and forwards noteId + guestId', async () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'x',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.press(getByTestId('staff-note-delete-n1'));
    await waitFor(() =>
      expect(queries._mutateAsyncDelete).toHaveBeenCalledWith({
        noteId: 'n1',
        guestId: 'g',
      }),
    );
  });

  it('toggles pin state', async () => {
    (useResidentNotes as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'n1',
          houseId: 'h',
          guestId: 'g',
          type: 'resident_note',
          content: 'x',
          authorId: 'a',
          authorName: 'Alice',
          createdAt: '2026-05-20T10:00:00.000Z',
          pinned: false,
        },
      ],
      isLoading: false,
    });
    const { getByTestId } = render(
      <StaffNotesFeed {...(makeProps() as any)} />,
    );
    fireEvent.press(getByTestId('staff-note-pin-n1'));
    await waitFor(() =>
      expect(queries._mutateAsyncPin).toHaveBeenCalledWith({
        noteId: 'n1',
        pinned: true,
        guestId: 'g',
      }),
    );
  });
});

describe('StaffNotesFeed — shift_log', () => {
  it('reads from useShiftLogs and submits without guestId', async () => {
    const { getByTestId } = render(
      <StaffNotesFeed
        {...(makeProps({
          type: 'shift_log',
          guestId: undefined,
          guestName: undefined,
        }) as any)}
      />,
    );
    expect(useShiftLogs).toHaveBeenCalledWith('h', true);
    fireEvent.changeText(getByTestId('staff-note-input'), 'Quiet shift');
    fireEvent.press(getByTestId('staff-note-submit'));
    await waitFor(() =>
      expect(queries._mutateAsyncAdd).toHaveBeenCalledWith({
        type: 'shift_log',
        content: 'Quiet shift',
        guestId: undefined,
      }),
    );
  });

  it('shows the loading indicator while fetching', () => {
    (useShiftLogs as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const { getByTestId } = render(
      <StaffNotesFeed
        {...(makeProps({ type: 'shift_log', guestId: undefined }) as any)}
      />,
    );
    expect(getByTestId('staff-notes-loading')).toBeTruthy();
  });
});
```

### Step 3.3: Run the tests

- [ ] Run:
  ```bash
  yarn test src/screens/StaffNotes/__tests__/StaffNotesFeed.test.tsx --no-coverage
  ```
  Expected output (abbreviated):
  ```
  PASS  src/screens/StaffNotes/__tests__/StaffNotesFeed.test.tsx
    StaffNotesFeed — resident_note
      ✓ renders the empty state when no notes exist
      ✓ renders the list when notes are present
      ✓ disables submit when the draft is empty
      ✓ submits a new note with guestId on type=resident_note
      ✓ confirms before deletion and forwards noteId + guestId
      ✓ toggles pin state
    StaffNotesFeed — shift_log
      ✓ reads from useShiftLogs and submits without guestId
      ✓ shows the loading indicator while fetching

  Tests:       8 passed, 8 total
  ```

### Step 3.4: Commit

- [ ] Stage and commit:
  ```bash
  git add src/screens/StaffNotes/StaffNotesFeed.tsx src/screens/StaffNotes/__tests__/StaffNotesFeed.test.tsx
  git commit -m "feat(staffNotes): add StaffNotesFeed screen

  - Single screen serves both resident_note and shift_log types
  - Inline composer with 1000-char limit and live counter
  - Pin/delete affordances per note row; delete confirms via Alert
  - Empty state + loading indicator
  - 8 component tests cover both types and all mutations"
  ```

---

## Task 4: Navigation wiring + GuestHome + HouseSettings integration

Register the new screen in the modal stack and add the two entry points.

### Step 4.1: Add the Route enum value and param list

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/navigation/types.ts`:

  **Change 1** — inside `enum Routes` add `StaffNotes` to the Modal Routes block (right after `SendInvites = 'sendInvites',` on line ~114, before the closing brace):

  ```ts
  StaffNotes = 'staffNotes',
  ```

  **Change 2** — inside `RootStackParamList` add the param shape next to other modal routes (e.g. right after the `[Routes.SendInvites]: undefined;` entry, near line ~197):

  ```ts
  [Routes.StaffNotes]: {
    houseId: string;
    type: 'resident_note' | 'shift_log';
    guestId?: string;
    guestName?: string;
  };
  ```

### Step 4.2: Register the screen in the navigator

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/navigation/navigators.tsx`:

  **Change 1** — add an import alongside the other screen imports (place near the `HouseSettings` import, around line ~56):

  ```ts
  import StaffNotesFeed from '../screens/StaffNotes/StaffNotesFeed';
  ```

  **Change 2** — inside the modal `<RootStack.Group>` (the block starting near line ~311), add a screen registration right after the `<RootStack.Screen name={Routes.SendInvites} ... />` entry:

  ```tsx
  <RootStack.Screen name={Routes.StaffNotes} component={StaffNotesFeed} />
  ```

### Step 4.3: Add the entry point in GuestHome (admin section)

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/screens/Profile/GuestHome.tsx`:

  Locate the admin-gated rendering block (the existing usage of `isAdmin(token, house!.id)` near lines 508/526/546). Add a new `StatSection` inside an `isAdmin(token, house!.id)` branch. The exact insertion uses the file's existing `StatSection` component and the navigation prop already in scope. Add the following JSX inside the admin section (place it adjacent to the existing admin-only rows; the surrounding code already controls the conditional):

  ```tsx
  {isAdmin(token, house!.id) ? (
    <StatSection
      testID="staff-notes-section"
      name="Staff Notes"
      description="Private admin-only notes about this resident"
      boxedIconName="clipboard-list"
      iconBackgroundColor={color.medium_grey}
      iconName="chevron-right"
      iconColor={color.medium_grey}
      onPress={() =>
        navigation.navigate(Routes.StaffNotes, {
          houseId: house!.id,
          type: 'resident_note',
          guestId: guest?.id ?? selectedGuest?.id ?? '',
          guestName:
            guest?.displayName ??
            `${guest?.firstName ?? ''} ${guest?.lastName ?? ''}`.trim() ??
            undefined,
        })
      }
    />
  ) : null}
  ```

  Notes:
  - The existing file already has `// @ts-nocheck` or similar relaxations in places — keep TypeScript strictness consistent with surrounding code.
  - `token`, `house`, `guest`, `selectedGuest`, and `navigation` are already in scope at the admin-section depth; do not re-import them.
  - If `Routes` and `RootStackParamList` are not already imported in this file, they are (line 59) — no new imports required.

### Step 4.4: Add the menu item in HouseSettings

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/screens/HouseSettings/HouseSettings.tsx`:

  Inside the `SETTINGS` `useMemo` (starting near line 176), add a new key after `paymentDashboard`:

  ```ts
  shiftLog: {
    action: () =>
      navigation.navigate(Routes.StaffNotes, {
        houseId: house!.id,
        type: 'shift_log',
      }),
    label: 'Shift Log',
    description: 'Private notes between staff shifts',
    iconName: 'clipboard-list',
    color: color.medium_grey,
  },
  ```

  No new imports are required — `Routes` and `navigation` are already in scope. The `houseId` source is `house!.id` consistent with surrounding code (the file has `// @ts-nocheck` at line 1 so the non-null assertion will pass).

### Step 4.5: Verify the existing test suites still pass

- [ ] Run:
  ```bash
  yarn test src/services/__tests__/staffNotes.test.ts src/state/queries/__tests__/staffNoteQueries.test.ts src/screens/StaffNotes/__tests__/StaffNotesFeed.test.tsx --no-coverage
  ```
  Expected: 33 tests pass (15 + 10 + 8).

- [ ] Run a TypeScript check on the files touched in this task:
  ```bash
  yarn tsc --noEmit
  ```
  Expected: no new errors introduced in `src/navigation/types.ts`, `src/navigation/navigators.tsx`, `src/screens/Profile/GuestHome.tsx`, or `src/screens/HouseSettings/HouseSettings.tsx`. (Pre-existing errors elsewhere are not blocking.)

### Step 4.6: Commit

- [ ] Stage and commit:
  ```bash
  git add src/navigation/types.ts src/navigation/navigators.tsx src/screens/Profile/GuestHome.tsx src/screens/HouseSettings/HouseSettings.tsx
  git commit -m "feat(staffNotes): wire StaffNotes screen into navigation + entry points

  - Register Routes.StaffNotes with typed params (houseId, type, guestId?)
  - Add StaffNotesFeed to the modal RootStack group
  - GuestHome: add admin-gated 'Staff Notes' row in the resident profile
  - HouseSettings: add 'Shift Log' menu item under house management"
  ```

---

## Task 5: Firestore rules

Lock down the new collection at the rules layer. Reads, updates, and deletes use `resource.data.houseId`; creates use `request.resource.data.houseId` because there is no pre-existing document yet.

### Step 5.1: Add the rules block

- [ ] Edit `/Users/marcusklein/dev/rats-v2/firebase/firestore.rules`:

  Add the following block at the top level (sibling of other top-level `match /collection/{id}` blocks like `houses` and `bugs`, e.g. immediately before the closing `}` of `match /databases/{database}/documents`):

  ```
  // Staff notes — admin-only private notes (resident notes + shift logs)
  match /staffNotes/{noteId} {
    allow read: if isHouseAdmin(resource.data.houseId);
    allow update, delete: if isHouseAdmin(resource.data.houseId);
    allow create: if isHouseAdmin(request.resource.data.houseId);
  }
  ```

  Notes:
  - `isHouseAdmin(houseId)` is defined at line 16 of the rules file. Do not duplicate it.
  - We split `read, write` into explicit `read`, `update`, `delete`, and `create` because `write` on a non-existent doc evaluates `resource.data` to `null` and would deny legitimate creates.

### Step 5.2: Deploy and smoke-test

- [ ] Deploy the rules to the Firebase project (the project uses Firebase CLI; from repo root):
  ```bash
  yarn firebase deploy --only firestore:rules
  ```
  Expected output ends with `Deploy complete!` and lists `firestore: released rules firestore.rules`.

- [ ] Manual smoke test (one-time, in a dev/staging house):
  1. Sign in as a house admin in the app, open a resident profile, tap "Staff Notes," and add a note. Expected: the note appears in the feed within ~1s.
  2. Sign in as a guest (non-admin) for the same house. From the Firebase console (or a debug screen), attempt to list `staffNotes` where `houseId == <house>`. Expected: `permission-denied`.
  3. Open HouseSettings → Shift Log → add a note. Expected: success.
  4. Sign in as an admin of a *different* house; from the console attempt to read the same `staffNotes` doc. Expected: `permission-denied`.

### Step 5.3: Commit

- [ ] Stage and commit:
  ```bash
  git add firebase/firestore.rules
  git commit -m "feat(staffNotes): add Firestore rules for staffNotes collection

  - Reads/updates/deletes gated by isHouseAdmin(resource.data.houseId)
  - Creates gated by isHouseAdmin(request.resource.data.houseId)
  - Split from 'read, write' shorthand because writes on create have no
    resource.data to read houseId from"
  ```

---

## Testing Strategy

- **Unit tests:** 15 (service) + 10 (hooks) = 25 tests covering all branches of validation, sorting, query keys, cache invalidation, and error handling.
- **Integration tests:** 8 component tests on `StaffNotesFeed` covering both `type` modes, the composer, pin, delete (with confirmation), loading, and empty states.
- **Rules tests:** Manual smoke test (Step 5.2.4). If the project has a Firestore rules unit-test harness (check `firebase/__tests__/` or similar), add four tests: admin read OK, admin write OK, non-admin read deny, cross-house admin deny.
- **E2E:** Optional follow-up. The screen is reachable from two entry points; an E2E happy-path test would (1) sign in as admin, (2) open a resident profile, (3) tap Staff Notes, (4) add a note, (5) verify it appears.

## Risks & Mitigations

- **Risk:** Firestore composite-index requirement on `(houseId, type, guestId)` for resident notes triggers a runtime error on first query.
  - **Mitigation:** Firestore auto-suggests an index via console URL on the first failing query in dev. The plan deliberately sorts client-side (no `orderBy`) to keep the index simple. If the equality-only triple still requires an index, create it via the console link before the first prod query.

- **Risk:** A non-admin user reaches the `StaffNotes` screen via deep link or navigation bug and sees the composer.
  - **Mitigation:** Firestore rules block reads and writes server-side, so the worst case is an empty feed and a failed write that surfaces via `Alert`. A future hardening step is an `isAdmin(token, houseId)` gate inside `StaffNotesFeed` that redirects on mount.

- **Risk:** Pin/delete race conditions cause stale UI.
  - **Mitigation:** Both mutations invalidate the relevant query key in `onSettled`, forcing a refetch on settle.

- **Risk:** Author name captured at write time goes stale when the admin changes their display name.
  - **Mitigation:** Acceptable — staff notes are an audit log; capturing the historical name is desirable for accountability. Documented in the entity comment.

- **Risk:** A resident's `guestId` is reused after discharge and re-admission.
  - **Mitigation:** Out of scope. If this becomes a problem, switch the resident-notes index to include an `admissionId`.

## Success Criteria

- [ ] House admins can add a private note from the resident profile and see it in the feed.
- [ ] House admins can add a shift log from House Settings and see it in the feed.
- [ ] Pinned notes appear above unpinned, newest first within each group.
- [ ] Deleting a note prompts for confirmation and removes it from the feed.
- [ ] Non-admins (guests, admins of other houses) cannot read or write `staffNotes` — verified via rules deny in Step 5.2.
- [ ] All 33 unit/component tests pass.
- [ ] No new TypeScript errors introduced.
- [ ] `yarn firebase deploy --only firestore:rules` succeeds.
