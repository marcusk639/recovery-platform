// src/__tests__/scripts/findGhostGuests.test.ts
//
// Read-only report of guest docs that are not backed by a house claim (the
// "ghost" docs the old guests create rule allowed). Firestore and Auth are
// fakes; scriptBootstrap is stubbed so importing is inert. The fake database
// has no write methods, so any attempted write would throw.

jest.mock('../../scripts/scriptBootstrap', () => ({}));

jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: jest.fn() }),
  auth: () => ({ getUsers: jest.fn() }),
}));

import { emulatorEnvError, findSuspiciousGuests, run } from '../../scripts/findGhostGuests';

const HOUSE = 'house-1';

function makeDb(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    collection: jest.fn(() => ({
      get: jest.fn(async () => ({
        docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
      })),
    })),
  } as unknown as FirebaseFirestore.Firestore;
}

function makeAuth(users: Record<string, Record<string, unknown>>) {
  return {
    getUsers: jest.fn(async (ids: { uid: string }[]) => ({
      users: ids
        .filter((i) => i.uid in users)
        .map((i) => ({ uid: i.uid, customClaims: users[i.uid] })),
    })),
  };
}

const docs = [
  { id: 'real', data: { houseId: HOUSE, userId: 'r1', firstName: 'Pat' } },
  { id: 'intake', data: { houseId: HOUSE } },
  { id: 'ghost', data: { houseId: HOUSE, userId: 'stranger' } },
  { id: 'orphan', data: { houseId: HOUSE, userId: 'gone' } },
  { id: 'dupe', data: { houseId: HOUSE, userId: 'r1' } },
  { id: 'nohouse', data: { userId: 'r1' } },
  { id: 'badid', data: { houseId: HOUSE, userId: 'x/y' } },
];
const users = {
  r1: { guest: { [HOUSE]: true } },
  stranger: { guest: { 'house-2': true } },
};

let logSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => logSpy.mockRestore());

describe('findSuspiciousGuests', () => {
  it('flags ghost, orphaned, duplicate and house-less docs and nothing else', async () => {
    const result = await findSuspiciousGuests(makeDb(docs), makeAuth(users));
    expect(result.scanned).toBe(7);
    expect(result.suspects).toEqual([
      { guestId: 'ghost', houseId: HOUSE, reason: 'no-claim' },
      { guestId: 'orphan', houseId: HOUSE, reason: 'account-missing' },
      { guestId: 'dupe', houseId: HOUSE, reason: 'duplicate-account' },
      { guestId: 'nohouse', houseId: '', reason: 'no-house' },
      { guestId: 'badid', houseId: HOUSE, reason: 'invalid-userid' },
    ]);
  });
});

describe('run', () => {
  it('prints ids and reasons only, never names or uids', async () => {
    await run(makeDb(docs), makeAuth(users));
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('ghost');
    expect(output).toContain('no-claim');
    expect(output).not.toContain('Pat');
    expect(output).not.toContain('stranger');
    expect(output).not.toContain('r1');
  });

  it('warns that a duplicate-account hit may be the real record (deleting it can revoke access)', async () => {
    await run(makeDb([docs[0], docs[4]]), makeAuth(users));
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('the doc listed may be the real record');
  });

  it('prints no duplicate warning when there is no duplicate', async () => {
    await run(makeDb(docs.filter((d) => d.id !== 'dupe')), makeAuth(users));
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('may be the real record');
  });

  it('reports a clean scan', async () => {
    const result = await run(makeDb([docs[0], docs[1]]), makeAuth(users));
    expect(result.suspects).toEqual([]);
    expect(logSpy.mock.calls.flat().join(' ')).toContain('No suspicious guest docs');
  });
});

describe('emulatorEnvError', () => {
  const F = 'FIRESTORE_EMULATOR_HOST';
  const A = 'FIREBASE_AUTH_EMULATOR_HOST';

  it('allows both hosts set (emulator rehearsal) and neither set (production)', () => {
    expect(emulatorEnvError({ [F]: '127.0.0.1:8080', [A]: '127.0.0.1:9099' })).toBeNull();
    expect(emulatorEnvError({})).toBeNull();
  });

  it('refuses Firestore emulated with real Auth', () => {
    expect(emulatorEnvError({ [F]: '127.0.0.1:8080' })).toMatch(/Set both or neither/);
  });

  it('refuses Auth emulated with real Firestore', () => {
    expect(emulatorEnvError({ [A]: '127.0.0.1:9099' })).toMatch(/Set both or neither/);
  });
});
