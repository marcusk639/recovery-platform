// What account deletion does with every store that holds a user's data. When a
// feature starts writing user-keyed data, add it here as deleted, scrubbed or
// retained-by-policy, so an omission shows up as a missing entry in review.

type Fate = 'deleted' | 'scrubbed' | 'retained-by-policy';
interface Entry {
  /** Example path for one record of user u1 (guest g1, house h1). */
  path: string;
  data: Record<string, unknown>;
  fate: Fate;
  /** Deletion step that handles it (deleted / scrubbed only). */
  step?: 'operator' | 'members' | 'personal' | 'userDoc' | 'auth';
  /** Scrubbed house records (houseRecords.ts): the record after the members step. */
  after?: Record<string, unknown>;
}

const NOW = '2026-10-20T00:00:00.000Z';
const TERM = { role: 'treasurer', termStartDate: '2026-01-01', termEndDate: '2026-07-01' };
const BALLOT = { houseId: 'h1', results: { yes: 1, no: 1 }, passed: false };
const NOTE = { houseId: 'h1', type: 'shift_log', content: 'Quiet night' };

const USER_DATA: Entry[] = [
  // deleted (userDoc): the user's profile.
  { path: 'users/u1', data: {}, fate: 'deleted', step: 'userDoc' },
  // deleted (members): the resident's guest doc, after a scrubbed copy is archived.
  { path: 'guests/g1', data: { userId: 'u1' }, fate: 'deleted', step: 'members' },
  // deleted (members): staff admin doc; the admin id is removed from its houses.
  { path: 'admins/a1', data: { userId: 'u1' }, fate: 'deleted', step: 'members' },
  // scrubbed (members): the house keeps names, dates and rent, without contact/health details.
  { path: 'guest-archive/g1', data: { userId: 'u1' }, fate: 'scrubbed', step: 'members' },
  // scrubbed (operator): owned houses are closed and unlinked from Connect, not deleted.
  { path: 'houses/h1', data: { ownerId: 'u1' }, fate: 'scrubbed', step: 'operator' },
  // deleted (personal): in-app notifications.
  { path: 'notifications/n1', data: { userId: 'u1' }, fate: 'deleted', step: 'personal' },
  // deleted (personal): house applications the user submitted.
  {
    path: 'houses/h1/applications/ap1',
    data: { applicantUid: 'u1' },
    fate: 'deleted',
    step: 'personal',
  },
  // deleted (personal): direct messages the user sent.
  {
    path: 'direct-messages/c1/chat/m1',
    data: { senderId: 'u1' },
    fate: 'deleted',
    step: 'personal',
  },
  // deleted (personal): defensive, no current writer.
  { path: 'guest-weeks/w1', data: { userId: 'u1' }, fate: 'deleted', step: 'personal' },
  // deleted (personal): FCM device tokens.
  { path: 'userDeviceTokens/u1', data: { tokens: ['t'] }, fate: 'deleted', step: 'personal' },
  // deleted (personal): records of documents uploaded to the resident's profile.
  { path: 'documents/d1', data: { guestId: 'g1' }, fate: 'deleted', step: 'personal' },
  // retained-by-policy: house group chat messages stay (the screen says so).
  { path: 'houses/h1/chat/m2', data: { senderId: 'u1' }, fate: 'retained-by-policy' },
  // retained-by-policy: house operational records, keyed by guest id.
  { path: 'activities/x1', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  { path: 'drug-tests/x2', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  { path: 'ees-records/x3', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  { path: 'week-summaries/x4', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  { path: 'payments/x5', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  // retained-by-policy: invitations are the operator's records.
  { path: 'invitations/t1', data: { guestId: 'g1' }, fate: 'retained-by-policy' },
  // deleted (personal): feedback the user sent; `reviewer` is their uid.
  { path: 'feedback/f1', data: { reviewer: 'u1', houseId: 'h1' }, fate: 'deleted', step: 'personal' },
  // deleted (personal): bug reports the user filed; `reporter` is their uid.
  { path: 'bugs/b1', data: { reporter: 'u1', description: 'x' }, fate: 'deleted', step: 'personal' },
  // scrubbed (members): Oxford officer seat is vacated; role and term stay.
  {
    path: 'houses/h1/officers/o1',
    data: { ...TERM, userId: 'u1', name: 'A B', isActive: true },
    fate: 'scrubbed',
    step: 'members',
    after: { ...TERM, isActive: false, vacatedAt: NOW },
  },
  // scrubbed (members): the user's ballot is unlinked (keyed by guest id); tallies stand.
  {
    path: 'houses/h1/votes/v1',
    data: { ...BALLOT, voterIds: ['g1'], individualVotes: { g1: 'yes' } },
    fate: 'scrubbed',
    step: 'members',
    after: { ...BALLOT, voterIds: [], individualVotes: {} },
  },
  // scrubbed (members): notes the user wrote as staff lose the author link and email.
  {
    path: 'staffNotes/s1',
    data: { ...NOTE, authorId: 'u1', authorName: 'u1@example.com' },
    fate: 'scrubbed',
    step: 'members',
    after: { ...NOTE, authorName: 'Former staff member' },
  },
  // scrubbed (members): archived copy of the user's staff admin record, minus contact details.
  {
    path: 'admin-archive/a1',
    data: { userId: 'u1', firstName: 'A', houseIds: ['h1'], email: 'u1@example.com', phoneNumber: '1' },
    fate: 'scrubbed',
    step: 'members',
    after: { userId: null, firstName: 'A', houseIds: ['h1'], accountDeletedAt: NOW },
  },
  // retained-by-policy: staff notes about the resident are house records (guest id + staff text).
  {
    path: 'staffNotes/s2',
    data: { ...NOTE, type: 'resident_note', guestId: 'g1', authorId: 'staff' },
    fate: 'retained-by-policy',
  },
  // retained-by-policy: disputes hold guest ids and names only, no contact details.
  {
    path: 'disputes/x6',
    data: { guestId: 'g1', disputerIds: ['g1'], victimId: 'g1', disputerName: 'A B' },
    fate: 'retained-by-policy',
  },
  // retained-by-policy: rent charge audit trail (guest id, amount, status); no contact details.
  {
    path: 'rent-collection-attempts/x7',
    data: { guestId: 'g1', houseId: 'h1', amountCents: 100, status: 'charged' },
    fate: 'retained-by-policy',
  },
];

/** Storage prefixes, same classification. */
const USER_FILES: Array<{ prefix: string; fate: Fate }> = [
  { prefix: 'users/u1/avatar', fate: 'deleted' },
  { prefix: 'houses/h1/guests/g1/avatar/', fate: 'deleted' },
  { prefix: 'houses/h1/guests/g1/documents/', fate: 'deleted' },
  // retained-by-policy: house-level documents belong to the house.
  { prefix: 'houses/h1/documents/', fate: 'retained-by-policy' },
];

const storageDeletes: string[] = [];

jest.mock('firebase-admin', () => {
  const firestore = () => ({});
  firestore.FieldValue = require('./fakeFirestore').fieldValue;
  return {
    firestore,
    storage: () => ({
      bucket: () => ({
        file: (p: string) => ({ delete: async () => void storageDeletes.push(p) }),
        deleteFiles: async (o: { prefix: string }) => void storageDeletes.push(o.prefix),
      }),
    }),
  };
});
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../api/firestore', () => require('./fakeFirestore').firestoreModule);

import { DELETION_STEPS } from '../../accountDeletion';
import { unlinkHouseRecords } from '../../accountDeletion/houseRecords';
import { deletePersonalData } from '../../accountDeletion/personalData';
import { snapshotTargets } from '../../accountDeletion/targets';
import { Doc, fake } from './fakeFirestore';

/** The same record for a second user (u2, guest g2) that must never be touched. */
const otherUsers = (e: Entry): Doc => ({
  path: e.path.replace(/u1/g, 'u2').replace(/g1/g, 'g2').replace(/(\d)$/, '$1-u2'),
  data: JSON.parse(JSON.stringify(e.data).replace(/u1/g, 'u2').replace(/g1/g, 'g2')),
});

const toDoc = ({ path, data }: Doc): Doc => JSON.parse(JSON.stringify({ path, data }));
const at = (path: string) => fake.store.find((d) => d.path === path)?.data;

beforeEach(() => {
  fake.store = [];
  storageDeletes.length = 0;
});

describe('account deletion data coverage', () => {
  it('names a real deletion step for everything deleted or scrubbed', () => {
    for (const e of USER_DATA) {
      if (e.fate === 'retained-by-policy') expect(e.step).toBeUndefined();
      else expect(DELETION_STEPS).toContain(e.step);
    }
  });

  it('the personal step deletes exactly its entries and leaves retained data alone', async () => {
    const personal = USER_DATA.filter((e) => e.step === 'personal');
    const retained = USER_DATA.filter((e) => e.fate === 'retained-by-policy');
    const others = [...personal, ...retained].map(otherUsers);
    fake.store = [...personal, ...retained].map(toDoc).concat(others);

    await deletePersonalData('u1', ['g1'], { g1: 'h1' });

    const left = fake.store.map((d) => d.path).sort();
    expect(left).toEqual([...retained.map((e) => e.path), ...others.map((d) => d.path)].sort());
  });

  it("the members step unlinks only the user's house records, idempotently", async () => {
    const house = USER_DATA.filter((e) => e.after);
    const retained = USER_DATA.filter((e) => e.fate === 'retained-by-policy');
    const others = [...house, ...retained].map(otherUsers);
    fake.store = [...house, ...retained].map(toDoc).concat(others.map(toDoc));

    await unlinkHouseRecords('u1', ['g1'], { g1: 'h1' }, NOW);
    const afterFirst = JSON.parse(JSON.stringify(fake.store));
    await unlinkHouseRecords('u1', ['g1'], { g1: 'h1' }, '2027-01-01T00:00:00.000Z');

    expect(fake.store).toEqual(afterFirst);
    for (const e of house) expect(at(e.path)).toEqual(e.after);
    for (const d of [...retained, ...others]) expect(at(d.path)).toEqual(d.data);
  });

  it("ignores users/{uid} pointers to another person's unlinked records", async () => {
    // users/{uid}.guestId / .adminId are client-writable; these docs have no userId.
    const theirs: Doc[] = [
      { path: 'guests/gX', data: { houseId: 'h1', email: 'x@example.com' } },
      { path: 'admins/aX', data: { email: 'x@example.com' } },
      { path: 'admin-archive/aX', data: { userId: '', email: 'x@example.com', phoneNumber: '1' } },
      { path: 'houses/h1/votes/vX', data: { voterIds: ['gX'], individualVotes: { gX: 'yes' } } },
      { path: 'documents/dX', data: { guestId: 'gX' } },
    ];
    fake.store = theirs.map(toDoc);
    const user = { id: 'u1', guestId: 'gX', adminId: 'aX' } as { id: string };

    const targets = await snapshotTargets('u1', user);
    expect(targets).toMatchObject({ guestIds: [], adminIds: [], archivedGuestIds: [] });
    await unlinkHouseRecords('u1', targets.guestIds, targets.houseIdsByGuest, NOW);
    await deletePersonalData('u1', targets.guestIds, targets.houseIdsByGuest);

    expect(fake.store.map(toDoc).sort((a, b) => (a.path < b.path ? -1 : 1))).toEqual(
      theirs.map(toDoc).sort((a, b) => (a.path < b.path ? -1 : 1)),
    );
    expect(storageDeletes.some((p) => p.includes('gX'))).toBe(false);
  });

  it('the personal step removes the deleted Storage prefixes only', async () => {
    await deletePersonalData('u1', ['g1'], { g1: 'h1' });
    for (const f of USER_FILES) {
      if (f.fate === 'deleted') expect(storageDeletes).toContain(f.prefix);
      else expect(storageDeletes).not.toContain(f.prefix);
    }
    expect(storageDeletes.every((p) => !p.includes('u2') && !p.includes('g2'))).toBe(true);
  });
});
