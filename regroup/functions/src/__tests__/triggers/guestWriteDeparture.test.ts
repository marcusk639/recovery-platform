// onGuestWrite against an in-memory store and the REAL claims helpers:
// departures (active -> departed) revoking like a delete, and docs with no
// createdBy under or without a ticket. (Kept apart from guestWrite.test.ts,
// which is already long.)

const users: Record<string, Record<string, unknown>> = {};
const mockSetClaims = jest.fn(async (uid: string, claims: Record<string, unknown>) => {
  users[uid] = JSON.parse(JSON.stringify(claims));
});
jest.mock('firebase-admin', () => ({
  firestore: () => require('../helpers/memFirestore').memDb,
  auth: () => ({
    getUser: async (uid: string) => {
      if (!(uid in users)) {
        throw Object.assign(new Error('There is no user record'), { code: 'auth/user-not-found' });
      }
      return { uid, customClaims: users[uid] };
    },
    getUsers: async (ids: { uid: string }[]) => ({
      users: ids
        .filter((i) => i.uid in users)
        .map((i) => ({ uid: i.uid, customClaims: users[i.uid] })),
    }),
    setCustomUserClaims: (uid: string, c: Record<string, unknown>) => mockSetClaims(uid, c),
  }),
}));
jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
jest.mock('../../api/firestore', () => require('../helpers/memFirestore').apiFirestore);

import { mem, memDb } from '../helpers/memFirestore';
import { onGuestWrite } from '../../triggers/firestore/guestWrite';

const run = onGuestWrite as unknown as (e: unknown) => Promise<void>;
const H = 'h';
const deleteEvent = (guestId: string, before: Record<string, unknown>, time?: string) => ({
  id: `evt-${guestId}`,
  time,
  params: { guestId },
  data: {
    before: { exists: true, data: () => before },
    after: { exists: false, data: () => undefined },
  },
});
const writeEvent = (guestId: string, after: Record<string, unknown>, time?: string) => ({
  id: `evt-${guestId}`,
  time,
  params: { guestId },
  data: { before: { exists: true, data: () => after }, after: { exists: true, data: () => after } },
});

beforeEach(() => {
  mem.reset();
  for (const k of Object.keys(users)) delete users[k];
  mockSetClaims.mockClear();
});

describe('a departure (active -> departed) revokes like a delete (verifier V4)', () => {
  const updated = (
    guestId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => ({
    id: `evt-${guestId}`,
    params: { guestId },
    data: {
      before: { exists: true, data: () => before },
      after: { exists: true, data: () => after },
    },
  });
  const active = (userId: string) => ({ houseId: H, userId, status: 'active' });
  const discharge = async (userId: string) => {
    const after = { ...active(userId), status: 'discharged' };
    mem.seed(`guests/${userId}-doc`, after);
    await run(updated(`${userId}-doc`, active(userId), after));
  };

  it('a discharged peer leader loses the admin claim and the peer-leader tier', async () => {
    users.p = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_p`, { tier: 'peerLeader', via: 'invitation' });

    await discharge('p');

    expect(users.p).toEqual({ admin: {}, guest: {}, superAdmin: {} });
    expect(mem.get(`house-roles/${H}_p`)).toBeUndefined();
  });

  it('a discharged manager who was also a resident keeps the admin claim and tier', async () => {
    users.m = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_m`, { tier: 'manager', via: 'invitation' });

    await discharge('m');

    expect(users.m).toEqual({ admin: { [H]: true }, guest: {}, superAdmin: {} });
    expect(mem.get(`house-roles/${H}_m`)).toMatchObject({ tier: 'manager' });
  });

  it('a redelivery after re-admission revokes nothing (current state decides)', async () => {
    users.p = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_p`, { tier: 'peerLeader', via: 'invitation' });
    // The doc was discharged, then re-admitted before the event was redelivered.
    mem.seed('guests/p-doc', active('p'));

    await run(updated('p-doc', active('p'), { ...active('p'), status: 'discharged' }));

    expect(users.p).toEqual({ admin: { [H]: true }, guest: { [H]: true } });
    expect(mem.get(`house-roles/${H}_p`)).toMatchObject({ tier: 'peerLeader' });
  });

  it('an update that does not depart (a field change on an active doc) revokes nothing', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/r-doc', { ...active('r'), firstName: 'X' });
    await run(updated('r-doc', active('r'), { ...active('r'), firstName: 'X' }));
    expect(mockSetClaims).not.toHaveBeenCalled();
  });
});

describe('docs with no createdBy (older builds): flagged only under a ticket', () => {
  const created = (guestId: string, data: Record<string, unknown>) => ({
    id: `evt-${guestId}`,
    params: { guestId },
    data: {
      before: { exists: false, data: () => undefined },
      after: { exists: true, data: () => data },
    },
  });

  it('with no ticket for the account and house: never flagged, and it keeps the claims', async () => {
    users.r = { guest: { [H]: true } };
    const a = { houseId: H, userId: 'r', status: 'active' };
    mem.seed('guests/a', a);
    mem.seed('guests/b', a);
    await run(created('a', a));
    await run(created('b', a));
    expect(mem.get('guest-flags/a')).toBeUndefined();
    expect(mem.get('guest-flags/b')).toBeUndefined();

    await memDb.doc('guests/a').delete();
    await run(deleteEvent('a', a));
    expect(users.r.guest).toEqual({ [H]: true });
  });

  it('with a ticket: the doc that is not the bound one is flagged', async () => {
    mem.seed(`admission-tickets/r_${H}`, {
      invitationId: 'T',
      role: 'guest',
      initialPhase: '',
      used: false,
    });
    const a = { houseId: H, userId: 'r', status: 'active' };
    mem.seed('guests/a', a);
    mem.seed('guests/b', a);
    await run(created('b', a));
    expect(mem.get('guest-flags/b')).toMatchObject({ reason: 'extra-self-create' });
    expect(mem.get('guest-flags/a')).toBeUndefined();
  });
});

describe('a move to another house is a departure from the old house', () => {
  const H2 = 'h2';
  const time = '2026-10-28T12:00:00Z';
  // Pin the clock just after the fixed event time: guestWrite skips the
  // re-split for events older than RETRY_CUTOFF_MS (6h) against Date.now().
  let nowSpy: jest.SpyInstance;
  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(time) + 60_000);
  });
  afterEach(() => nowSpy.mockRestore());
  const week = '2026-10-26';
  const moveEvent = (
    guestId: string,
    from: Record<string, unknown>,
    to: Record<string, unknown>,
  ) => ({
    id: `evt-move-${guestId}`,
    time,
    params: { guestId },
    data: { before: { exists: true, data: () => from }, after: { exists: true, data: () => to } },
  });
  const move = async (userId: string) => {
    const from = { houseId: H, userId, status: 'active' };
    const to = { houseId: H2, userId, status: 'active' };
    mem.seed(`guests/${userId}-doc`, to);
    await run(moveEvent(`${userId}-doc`, from, to));
  };

  it("revokes the old house's guest claim and never grants the new house's", async () => {
    users.r = { guest: { [H]: true } };
    await move('r');
    expect(users.r.guest).toEqual({});
  });

  it("revokes a peer leader's admin claim for the old house, and removes the record", async () => {
    users.p = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_p`, { tier: 'peerLeader', via: 'invitation' });
    await move('p');
    expect(users.p).toEqual({ admin: {}, guest: {}, superAdmin: {} });
    expect(mem.get(`house-roles/${H}_p`)).toBeUndefined();
  });

  it("keeps a manager's admin claim for the old house", async () => {
    users.m = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed(`house-roles/${H}_m`, { tier: 'manager', via: 'invitation' });
    await move('m');
    expect(users.m.admin).toEqual({ [H]: true });
  });

  it('another entitling doc in the old house keeps the claims', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/r-other', { houseId: H, userId: 'r', status: 'active' });
    await move('r');
    expect(users.r.guest).toEqual({ [H]: true });
  });

  it("re-splits the old house's EES week over the residents left there", async () => {
    users.a = { guest: { [H]: true } };
    users.b = { guest: { [H]: true } };
    users.r = { guest: { [H]: true } };
    mem.seed('guests/a', { houseId: H, userId: 'a', status: 'active' });
    mem.seed('guests/b', { houseId: H, userId: 'b', status: 'active' });
    const rec = { houseId: H, weekStart: week, paid: false, totalExpenses: 300, amount: 100 };
    mem.seed('ees-records/ea', { ...rec, guestId: 'a' });
    mem.seed('ees-records/eb', { ...rec, guestId: 'b' });
    mem.seed('ees-records/er', { ...rec, guestId: 'r-doc' });

    await move('r');

    expect(mem.get('ees-records/ea')?.amount).toBe(150);
    expect(mem.get('ees-records/eb')?.amount).toBe(150);
    expect(mem.get('ees-records/er')?.amount).toBe(100); // the mover's record is left alone
  });

  it('a redelivered move is a no-op', async () => {
    users.r = { guest: { [H]: true } };
    await move('r');
    mockSetClaims.mockClear();
    await move('r');
    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(users.r.guest).toEqual({});
  });
});
