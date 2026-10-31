/**
 * staffNotes.ts against the normalized Firebase operation log.
 *
 * Characterization for the React Native 0.88 upgrade (plan Task 10 Step 1).
 * This file stays byte-identical through the Task 10 migration (group 10d): a
 * mapping mistake in the rewrite fails here instead of being copied into an
 * edited expectation. Assertions are on outcomes and log entries only, never
 * on mock call chains or snapshot shapes. Auth is not part of the log: the
 * signed-in user comes from the auth mock.
 */
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);
jest.mock('@react-native-firebase/functions', () =>
  require('../../../__mocks__/firebase-modular/functions'),
);
jest.mock('@react-native-firebase/auth', () => require('../../../__mocks__/firebase-modular/auth'));
jest.mock('../../util/logging', () => ({ logException: jest.fn() }));

import {
  failNext,
  getOpLog,
  readDoc,
  resetOpLog,
  seedDoc,
  seedQuery,
} from '../../../__mocks__/firebase-modular/log';
import {
  addStaffNote,
  deleteStaffNote,
  listResidentNotes,
  listShiftLogs,
  pinStaffNote,
} from '../staffNotes';
import { logException } from '../../util/logging';

const { setCurrentUser } = jest.requireMock<{ setCurrentUser: (user: unknown) => void }>(
  '@react-native-firebase/auth',
);

const NOW = '2026-10-07T17:00:00.000Z';

beforeEach(() => {
  resetOpLog();
  setCurrentUser({ uid: 'u1', displayName: 'Admin One' });
  jest.useFakeTimers({ now: new Date(NOW) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('addStaffNote', () => {
  it('adds a resident note with the trimmed content and the author', async () => {
    const id = await addStaffNote({
      houseId: 'h1',
      type: 'resident_note',
      content: '  late curfew  ',
      guestId: 'g1',
    });

    expect(id).toBe('auto-1');
    expect(getOpLog()).toEqual([
      {
        op: 'add',
        path: 'staffNotes',
        data: {
          houseId: 'h1',
          type: 'resident_note',
          content: 'late curfew',
          authorId: 'u1',
          authorName: 'Admin One',
          createdAt: NOW,
          pinned: false,
          guestId: 'g1',
        },
      },
    ]);
    expect(readDoc('staffNotes/auto-1')?.content).toBe('late curfew');
  });

  it('adds a shift log without a guestId and falls back to "Unknown Admin"', async () => {
    setCurrentUser({ uid: 'u1' });

    await addStaffNote({ houseId: 'h1', type: 'shift_log', content: 'quiet', guestId: 'g1' });

    expect(getOpLog()).toEqual([
      {
        op: 'add',
        path: 'staffNotes',
        data: {
          houseId: 'h1',
          type: 'shift_log',
          content: 'quiet',
          authorId: 'u1',
          authorName: 'Unknown Admin',
          createdAt: NOW,
          pinned: false,
        },
      },
    ]);
  });

  it('refuses a resident note without a guest, before any op', async () => {
    await expect(
      addStaffNote({ houseId: 'h1', type: 'resident_note', content: 'x' }),
    ).rejects.toThrow('addStaffNote: guestId is required for resident_note.');
    expect(getOpLog()).toEqual([]);
  });

  it('refuses without a signed-in user, before any op', async () => {
    setCurrentUser(null);

    await expect(addStaffNote({ houseId: 'h1', type: 'shift_log', content: 'x' })).rejects.toThrow(
      'Must be signed in to write staff notes.',
    );
    expect(getOpLog()).toEqual([]);
  });

  it('logs and rethrows when the add fails', async () => {
    const denied = new Error('permission-denied');
    failNext('add', denied, 'staffNotes');

    await expect(addStaffNote({ houseId: 'h1', type: 'shift_log', content: 'x' })).rejects.toBe(
      denied,
    );
    expect(logException).toHaveBeenCalledWith(denied);
  });
});

describe('lists', () => {
  beforeEach(() => {
    seedQuery('staffNotes', [
      { id: 'n1', houseId: 'h1', type: 'resident_note', guestId: 'g1', createdAt: '2026-10-01' },
      {
        id: 'n2',
        houseId: 'h1',
        type: 'resident_note',
        guestId: 'g1',
        createdAt: '2026-10-03',
      },
      {
        id: 'n3',
        houseId: 'h1',
        type: 'resident_note',
        guestId: 'g1',
        createdAt: '2026-09-01',
        pinned: true,
      },
      { id: 's1', houseId: 'h1', type: 'shift_log', createdAt: '2026-10-02' },
    ]);
  });

  it('lists a resident’s notes pinned first, then newest first', async () => {
    const notes = await listResidentNotes('h1', 'g1');

    expect(notes.map((n) => n.id)).toEqual(['n3', 'n2', 'n1']);
    expect(notes[1]).toEqual({
      id: 'n2',
      houseId: 'h1',
      guestId: 'g1',
      type: 'resident_note',
      content: '',
      authorId: '',
      authorName: '',
      createdAt: '2026-10-03',
      pinned: false,
    });
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'staffNotes',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'type', '==', 'resident_note'],
          ['where', 'guestId', '==', 'g1'],
        ],
      },
    ]);
  });

  it('lists shift logs for a house', async () => {
    expect((await listShiftLogs('h1')).map((n) => n.id)).toEqual(['s1']);
    expect(getOpLog()).toEqual([
      {
        op: 'getDocs',
        path: 'staffNotes',
        constraints: [
          ['where', 'houseId', '==', 'h1'],
          ['where', 'type', '==', 'shift_log'],
        ],
      },
    ]);
  });

  it('returns [] without an op when the guest is missing', async () => {
    expect(await listResidentNotes('h1', '')).toEqual([]);
    expect(getOpLog()).toEqual([]);
  });

  it('rethrows a failed query', async () => {
    failNext('getDocs', new Error('unavailable'), 'staffNotes');
    await expect(listShiftLogs('h1')).rejects.toThrow('unavailable');
  });
});

describe('deleteStaffNote / pinStaffNote', () => {
  it('deletes staffNotes/{id}', async () => {
    seedDoc('staffNotes/n1', { houseId: 'h1' });

    await deleteStaffNote('n1');

    expect(getOpLog()).toEqual([{ op: 'delete', path: 'staffNotes/n1' }]);
    expect(readDoc('staffNotes/n1')).toBeUndefined();
  });

  it('succeeds deleting a note that is already gone', async () => {
    await expect(deleteStaffNote('gone')).resolves.toBeUndefined();
  });

  it('updates only the pinned flag', async () => {
    seedDoc('staffNotes/n1', { houseId: 'h1', pinned: false });

    await pinStaffNote('n1', true);

    expect(getOpLog()).toEqual([{ op: 'update', path: 'staffNotes/n1', data: { pinned: true } }]);
  });

  it('logs and rethrows when pinning a missing note', async () => {
    await expect(pinStaffNote('gone', true)).rejects.toThrow('not-found');
    expect(logException).toHaveBeenCalled();
  });

  it('refuses an empty note id before any op', async () => {
    await expect(pinStaffNote('', true)).rejects.toThrow('pinStaffNote: noteId is required.');
    expect(getOpLog()).toEqual([]);
  });
});
