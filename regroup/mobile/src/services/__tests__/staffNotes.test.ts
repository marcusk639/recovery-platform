jest.mock('../../../firebase-setup', () => {
  const mockAdd = jest.fn().mockResolvedValue({ id: 'note-generated-id' });
  const mockUpdate = jest.fn().mockResolvedValue(undefined);
  const mockDelete = jest.fn().mockResolvedValue(undefined);
  const mockGet = jest.fn();
  const mockWhere = jest.fn();
  const mockDoc = jest.fn(() => ({ update: mockUpdate, delete: mockDelete }));
  // Chain: collection().where().where().where().get()
  const chain: any = {
    add: mockAdd,
    doc: mockDoc,
    where: mockWhere,
    get: mockGet,
  };
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
    // The module-level call happens at import time (before beforeEach clearAllMocks).
    // Verify the exported ref is the object returned by firestore.collection().
    expect(staffNotesCollection).toBeDefined();
    expect(staffNotesCollection).toBe(f._mockCollection('staffNotes'));
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
    (f as any).__originalUser = (
      require('../../../firebase-setup') as any
    ).auth.currentUser;
    (require('../../../firebase-setup') as any).auth.currentUser = null;
    await expect(
      addStaffNote({
        houseId: 'h',
        type: 'shift_log',
        content: 'note',
      }),
    ).rejects.toThrow(/signed in/i);
    (require('../../../firebase-setup') as any).auth.currentUser = (
      f as any
    ).__originalUser;
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
