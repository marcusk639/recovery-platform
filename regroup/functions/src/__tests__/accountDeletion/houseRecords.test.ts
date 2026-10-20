jest.mock('firebase-admin', () => {
  const firestore = () => ({});
  firestore.FieldValue = require('./fakeFirestore').fieldValue;
  return { firestore };
});
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../api/firestore', () => require('./fakeFirestore').firestoreModule);

import { logger } from 'firebase-functions/v2';
import {
  FORMER_STAFF_NAME,
  scrubArchivedAdmins,
  unlinkCastVotes,
  unlinkHouseRecords,
  unlinkStaffNoteAuthor,
  vacateOfficerSeats,
} from '../../accountDeletion/houseRecords';
import { Doc, fake } from './fakeFirestore';

const NOW = '2026-10-20T00:00:00.000Z';
const at = (path: string) => fake.store.find((d) => d.path === path)?.data;
const clone = (docs: Doc[]) => JSON.parse(JSON.stringify(docs)) as Doc[];

beforeEach(() => {
  fake.store = [];
  jest.clearAllMocks();
});

describe('vacateOfficerSeats', () => {
  const seat = {
    houseId: 'h1',
    role: 'treasurer',
    termStartDate: '2026-01-01',
    termEndDate: '2026-07-01',
  };

  it("vacates the user's seats, keeping role and term", async () => {
    fake.store = [
      {
        path: 'houses/h1/officers/o1',
        data: { ...seat, userId: 'u1', name: 'A B', isActive: true },
      },
      {
        path: 'houses/h2/officers/o2',
        data: { ...seat, role: 'president', userId: 'u1', isActive: false },
      },
    ];
    expect(await vacateOfficerSeats('u1', NOW)).toBe(2);
    expect(at('houses/h1/officers/o1')).toEqual({ ...seat, isActive: false, vacatedAt: NOW });
    expect(at('houses/h2/officers/o2')).toEqual({
      ...seat,
      role: 'president',
      isActive: false,
      vacatedAt: NOW,
    });
  });

  it("leaves other users' seats and name-only onboarding seats alone, and is idempotent", async () => {
    const others: Doc[] = [
      {
        path: 'houses/h1/officers/o3',
        data: { ...seat, userId: 'u2', name: 'C D', isActive: true },
      },
      {
        path: 'houses/h1/officers/secretary',
        data: { role: 'secretary', name: 'A B', isActive: true },
      },
    ];
    fake.store = [
      ...clone(others),
      { path: 'houses/h1/officers/o1', data: { ...seat, userId: 'u1', isActive: true } },
    ];
    await vacateOfficerSeats('u1', NOW);
    const afterFirst = clone(fake.store);
    expect(await vacateOfficerSeats('u1', '2027-01-01T00:00:00.000Z')).toBe(0);
    expect(fake.store).toEqual(afterFirst);
    for (const d of others) expect(at(d.path)).toEqual(d.data);
  });
});

describe('unlinkCastVotes', () => {
  const vote = (extra: Record<string, unknown>) => ({
    houseId: 'h1',
    topic: 'T',
    results: { yes: 2, no: 1 },
    passed: true,
    ...extra,
  });

  it("removes every one of the user's guest ids; tallies and outcome are unchanged", async () => {
    fake.store = [
      {
        path: 'houses/h1/votes/v1',
        data: vote({
          voterIds: ['g1', 'x', 'y'],
          individualVotes: { g1: 'yes', x: 'yes', y: 'no' },
        }),
      },
      // Anonymous: voterIds only.
      { path: 'houses/h1/votes/v2', data: vote({ isAnonymous: true, voterIds: ['x', 'g1'] }) },
      // Legacy, from before voterIds existed; and the user's archived guest id.
      { path: 'houses/h9/votes/v3', data: vote({ individualVotes: { old1: 'no', x: 'yes' } }) },
    ];
    expect(await unlinkCastVotes(['g1', 'old1'], ['h1', 'h9'])).toBe(3);
    expect(at('houses/h1/votes/v1')).toEqual(
      vote({ voterIds: ['x', 'y'], individualVotes: { x: 'yes', y: 'no' } }),
    );
    expect(at('houses/h1/votes/v2')).toEqual(vote({ isAnonymous: true, voterIds: ['x'] }));
    expect(at('houses/h9/votes/v3')).toEqual(vote({ individualVotes: { x: 'yes' } }));
  });

  it("leaves other users' ballots and other houses alone, and is idempotent", async () => {
    const others: Doc[] = [
      {
        path: 'houses/h1/votes/v4',
        data: vote({ voterIds: ['g2'], individualVotes: { g2: 'no' } }),
      },
      // A house the user never lived in, even if it somehow names g1.
      {
        path: 'houses/h5/votes/v5',
        data: vote({ voterIds: ['g1'], individualVotes: { g1: 'no' } }),
      },
    ];
    fake.store = [
      ...clone(others),
      {
        path: 'houses/h1/votes/v1',
        data: vote({ voterIds: ['g1'], individualVotes: { g1: 'yes' } }),
      },
    ];
    await unlinkCastVotes(['g1'], ['h1']);
    const afterFirst = clone(fake.store);
    expect(await unlinkCastVotes(['g1'], ['h1'])).toBe(0);
    expect(fake.store).toEqual(afterFirst);
    for (const d of others) expect(at(d.path)).toEqual(d.data);
  });

  it('does nothing without guest ids', async () => {
    fake.store = [{ path: 'houses/h1/votes/v1', data: vote({ voterIds: ['x'] }) }];
    expect(await unlinkCastVotes([], ['h1'])).toBe(0);
  });
});

describe('unlinkStaffNoteAuthor', () => {
  const note = {
    houseId: 'h1',
    type: 'resident_note',
    guestId: 'g7',
    content: 'Late again',
    pinned: false,
  };

  it('drops the author link, keeps a name and replaces an email author name', async () => {
    fake.store = [
      { path: 'staffNotes/s1', data: { ...note, authorId: 'u1', authorName: 'A B' } },
      { path: 'staffNotes/s2', data: { ...note, authorId: 'u1', authorName: 'a@example.com' } },
    ];
    expect(await unlinkStaffNoteAuthor('u1')).toBe(2);
    expect(at('staffNotes/s1')).toEqual({ ...note, authorName: 'A B' });
    expect(at('staffNotes/s2')).toEqual({ ...note, authorName: FORMER_STAFF_NAME });
  });

  it("keeps notes about the user and other authors' notes unchanged, and is idempotent", async () => {
    const others: Doc[] = [
      {
        path: 'staffNotes/s3',
        data: { ...note, guestId: 'g1', authorId: 'u2', authorName: 'C D' },
      },
      { path: 'staffNotes/s4', data: { ...note, authorId: 'u2', authorName: 'c@example.com' } },
    ];
    fake.store = [
      ...clone(others),
      { path: 'staffNotes/s1', data: { ...note, authorId: 'u1', authorName: 'A' } },
    ];
    await unlinkStaffNoteAuthor('u1');
    const afterFirst = clone(fake.store);
    expect(await unlinkStaffNoteAuthor('u1')).toBe(0);
    expect(fake.store).toEqual(afterFirst);
    for (const d of others) expect(at(d.path)).toEqual(d.data);
  });
});

describe('scrubArchivedAdmins', () => {
  const adminDoc = { firstName: 'A', lastName: 'B', houseIds: ['h1'], superAdmin: [] };
  const contact = { email: 'a@example.com', phoneNumber: '555', avatar: 'x.png' };

  it("removes contact details from the user's archived admin records, keeping names", async () => {
    fake.store = [
      { path: 'admin-archive/a1', data: { ...adminDoc, ...contact, userId: 'u1' } },
      // Legacy copy without userId, matched by the user's admin id.
      { path: 'admin-archive/a0', data: { ...adminDoc, ...contact, userId: '' } },
    ];
    expect(await scrubArchivedAdmins('u1', ['a0'], NOW)).toBe(2);
    const scrubbed = { ...adminDoc, userId: null, accountDeletedAt: NOW };
    expect(at('admin-archive/a1')).toEqual(scrubbed);
    expect(at('admin-archive/a0')).toEqual(scrubbed);
  });

  it("never touches another user's archived admin, even by id, and is idempotent", async () => {
    const others: Doc[] = [
      { path: 'admin-archive/a2', data: { ...adminDoc, ...contact, userId: 'u2' } },
    ];
    fake.store = [
      ...clone(others),
      { path: 'admin-archive/a1', data: { ...contact, userId: 'u1' } },
    ];
    await scrubArchivedAdmins('u1', ['a1', 'a2', 'missing'], NOW);
    const afterFirst = clone(fake.store);
    expect(await scrubArchivedAdmins('u1', ['a1', 'a2'], '2027-01-01T00:00:00.000Z')).toBe(0);
    expect(fake.store).toEqual(afterFirst);
    expect(at('admin-archive/a2')).toEqual(others[0].data);
  });
});

describe('unlinkHouseRecords', () => {
  it("runs every unlink for the user's houses and logs counts only", async () => {
    fake.store = [
      { path: 'houses/h1/officers/o1', data: { role: 'treasurer', userId: 'u1', isActive: true } },
      { path: 'houses/h1/votes/v1', data: { voterIds: ['g1'], results: { yes: 1 } } },
      { path: 'staffNotes/s1', data: { authorId: 'u1', authorName: 'A' } },
      { path: 'admin-archive/a1', data: { userId: 'u1', email: 'a@example.com' } },
    ];
    await unlinkHouseRecords('u1', ['g1', 'nohouse'], { g1: 'h1' }, ['a1'], NOW);
    expect(at('houses/h1/votes/v1')).toEqual({ voterIds: [], results: { yes: 1 } });
    expect(logger.info).toHaveBeenCalledWith('accountDeletion: house records unlinked', {
      officerSeats: 1,
      votes: 1,
      staffNotes: 1,
      archivedAdmins: 1,
    });
  });
});
