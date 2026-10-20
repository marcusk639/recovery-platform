// What account deletion does with every store that holds a user's data. When a
// feature starts writing user-keyed data, add it here as deleted or
// retained-by-policy, so an omission shows up as a missing entry in review.

type Fate = 'deleted' | 'scrubbed' | 'retained-by-policy';
interface Entry {
  /** Example path for one record of user u1 (guest g1, house h1). */
  path: string;
  data: Record<string, unknown>;
  fate: Fate;
  /** Deletion step that handles it (deleted / scrubbed only). */
  step?: 'operator' | 'members' | 'personal' | 'userDoc' | 'auth';
}

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
];

/** Storage prefixes, same classification. */
const USER_FILES: Array<{ prefix: string; fate: Fate }> = [
  { prefix: 'users/u1/avatar', fate: 'deleted' },
  { prefix: 'houses/h1/guests/g1/avatar/', fate: 'deleted' },
  { prefix: 'houses/h1/guests/g1/documents/', fate: 'deleted' },
  // retained-by-policy: house-level documents belong to the house.
  { prefix: 'houses/h1/documents/', fate: 'retained-by-policy' },
];

type Doc = { path: string; data: Record<string, unknown> };
let store: Doc[] = [];
const storageDeletes: string[] = [];

jest.mock('firebase-admin', () => ({
  storage: () => ({
    bucket: () => ({
      file: (p: string) => ({ delete: async () => void storageDeletes.push(p) }),
      deleteFiles: async (o: { prefix: string }) => void storageDeletes.push(o.prefix),
    }),
  }),
}));
jest.mock('firebase-functions/v2', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const parentOf = (path: string) => path.split('/').slice(-2)[0];
const refFor = (path: string) => {
  const s = path.split('/');
  return { path, parent: { parent: { parent: { id: s[s.length - 4] } } } };
};
const query = (match: (d: Doc) => boolean, after?: string): unknown => ({
  limit: () => query(match, after),
  startAfter: (s: { ref: { path: string } }) => query(match, s.ref.path),
  get: async () => {
    const docs = store
      .filter(match)
      .filter((d) => after === undefined || d.path > after)
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map((d) => ({ ref: refFor(d.path) }));
    return { empty: docs.length === 0, docs };
  },
});

jest.mock('../../api/firestore', () => ({
  ratsFirestore: {
    collection: (name: string) => ({
      where: (f: string, _op: string, v: unknown) =>
        query(
          (d) => d.path.split('/').length === 2 && parentOf(d.path) === name && d.data[f] === v,
        ),
      doc: (id: string) => ({
        delete: async () => {
          store = store.filter((d) => d.path !== `${name}/${id}`);
        },
      }),
    }),
    collectionGroup: (name: string) => ({
      where: (f: string, _op: string, v: unknown) =>
        query((d) => parentOf(d.path) === name && d.data[f] === v),
    }),
    batch: () => {
      const paths: string[] = [];
      return {
        delete: (r: { path: string }) => paths.push(r.path),
        commit: async () => {
          store = store.filter((d) => !paths.includes(d.path));
        },
      };
    },
  },
}));

import { DELETION_STEPS } from '../../accountDeletion';
import { deletePersonalData } from '../../accountDeletion/personalData';

/** The same record for a second user (u2, guest g2) that must never be touched. */
const otherUsers = (e: Entry): Doc => ({
  path: e.path.replace(/u1/g, 'u2').replace(/g1/g, 'g2').replace(/(\d)$/, '$1-u2'),
  data: JSON.parse(JSON.stringify(e.data).replace(/u1/g, 'u2').replace(/g1/g, 'g2')),
});

beforeEach(() => {
  store = [];
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
    store = [...personal, ...retained].map(({ path, data }) => ({ path, data })).concat(others);

    await deletePersonalData('u1', ['g1'], { g1: 'h1' });

    const left = store.map((d) => d.path).sort();
    expect(left).toEqual([...retained.map((e) => e.path), ...others.map((d) => d.path)].sort());
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
