// onGuestWrite against an in-memory store and the REAL claims helpers
// (util/claims is not mocked here): claim cleanup on delete, redelivery
// safety, and which EES records the re-split may touch.

const users: Record<string, Record<string, unknown>> = {};
const mockSetClaims = jest.fn(async (uid: string, claims: Record<string, unknown>) => {
  users[uid] = JSON.parse(JSON.stringify(claims));
});
jest.mock('firebase-admin', () => ({
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

import { logger } from 'firebase-functions';
import { mem } from '../helpers/memFirestore';
import { isoWeekStartUtc, onGuestWrite } from '../../triggers/firestore/guestWrite';

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

describe('delete: claim cleanup', () => {
  it('removes the house from guest and admin in one write and keeps potentialSuperAdmin', async () => {
    users.r = { admin: { [H]: true }, guest: { [H]: true, o: true }, potentialSuperAdmin: true };

    await run(deleteEvent('g1', { houseId: H, userId: 'r' }));

    expect(mockSetClaims).toHaveBeenCalledTimes(1);
    expect(users.r).toEqual({
      admin: {},
      guest: { o: true },
      superAdmin: {},
      potentialSuperAdmin: true,
    });
  });

  it('a redelivery after the resident was re-added revokes nothing', async () => {
    users.r = { guest: { [H]: true } };
    await run(deleteEvent('g1', { houseId: H, userId: 'r' }));
    expect(users.r.guest).toEqual({});

    // Re-added: fresh claim and a new guest doc. Then the old event is redelivered.
    users.r = { guest: { [H]: true } };
    mem.seed('guests/g2', { houseId: H, userId: 'r' });
    mockSetClaims.mockClear();
    await run(deleteEvent('g1', { houseId: H, userId: 'r' }));

    expect(mockSetClaims).not.toHaveBeenCalled();
    expect(users.r.guest).toEqual({ [H]: true });
  });

  it('deleting a duplicate doc keeps the claims of the account that still has its main doc', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/main', { houseId: H, userId: 'r' });
    await run(deleteEvent('dupe', { houseId: H, userId: 'r' }));
    expect(users.r.guest).toEqual({ [H]: true });
  });

  it('keeps the admin claim of a house admin whose guest doc is deleted', async () => {
    users.a = { admin: { [H]: true }, guest: { [H]: true } };
    mem.seed('admins/a1', { userId: 'a', houseIds: [H], superAdmin: [] });
    await run(deleteEvent('g1', { houseId: H, userId: 'a' }));
    expect(users.a).toEqual({ admin: { [H]: true }, guest: {}, superAdmin: {} });
  });

  it('re-throws a cleanup failure so the event is retried', async () => {
    users.r = { guest: { [H]: true } };
    mockSetClaims.mockRejectedValueOnce(new Error('auth down'));
    await expect(run(deleteEvent('g1', { houseId: H, userId: 'r' }))).rejects.toThrow('auth down');
  });

  it('a discharged doc of the same account does not keep the claims', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/old', { houseId: H, userId: 'r', status: 'discharged', moveOutDate: '2026-01-01' });
    await run(deleteEvent('g2', { houseId: H, userId: 'r' }));
    expect(users.r.guest).toEqual({});
  });

  it('a moved-out doc of the same account does not keep the claims', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/old', { houseId: H, userId: 'r', moveOutDate: '2026-01-01' });
    await run(deleteEvent('g2', { houseId: H, userId: 'r' }));
    expect(users.r.guest).toEqual({});
  });

  it('an active doc of the same account keeps the claims, with a warning', async () => {
    users.r = { guest: { [H]: true } };
    mem.seed('guests/other', { houseId: H, userId: 'r', status: 'active' });
    await run(deleteEvent('g2', { houseId: H, userId: 'r' }));
    expect(users.r.guest).toEqual({ [H]: true });
    expect(logger.warn).toHaveBeenCalledWith(
      'onGuestWrite: account still has an active guest doc in the house; claims kept',
      { guestId: 'g2', houseId: H, keptByGuestId: 'other' },
    );
  });

  it('a deleted account counts as cleaned up (account deletion removes the user too)', async () => {
    await expect(run(deleteEvent('g1', { houseId: H, userId: 'deleted-user' }))).resolves.toBeUndefined();
    expect(mockSetClaims).not.toHaveBeenCalled();
  });

  it('a late delete whose cleanup fails logs an error and does not retry', async () => {
    users.r = { guest: { [H]: true } };
    mockSetClaims.mockRejectedValueOnce(new Error('auth down'));
    const late = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await expect(run(deleteEvent('g1', { houseId: H, userId: 'r' }, late))).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'onGuestWrite: late delete event; claims cleanup failed, not retried',
      expect.objectContaining({ guestId: 'g1', houseId: H, error: 'auth down' }),
    );
  });

  it('still revokes when the delete event arrives a day late', async () => {
    users.r = { guest: { [H]: true } };
    const late = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await run(deleteEvent('g1', { houseId: H, userId: 'r' }, late));
    expect(users.r.guest).toEqual({});
  });
});

describe('EES re-split: what it may touch', () => {
  const week = '2026-10-26';
  const time = '2026-10-28T12:00:00Z';
  const record = (id: string, guestId: string, extra: Record<string, unknown> = {}) =>
    mem.seed(`ees-records/${id}`, {
      houseId: H,
      weekStart: week,
      guestId,
      paid: false,
      totalExpenses: 300,
      amount: 100,
      ...extra,
    });

  beforeEach(() => {
    users.r1 = { guest: { [H]: true } };
    users.r2 = { guest: { [H]: true } };
    mem.seed('guests/g1', { houseId: H, userId: 'r1' });
    mem.seed('guests/g2', { houseId: H, userId: 'r2' });
  });

  it("leaves a moved-out resident's unpaid record as it is", async () => {
    mem.seed('guests/gone', { houseId: H, moveOutDate: '2026-10-27' });
    record('e1', 'g1');
    record('e2', 'g2');
    record('e3', 'gone');

    await run(writeEvent('gone', { houseId: H, moveOutDate: '2026-10-27' }, time));

    expect(mem.get('ees-records/e1')?.amount).toBe(150);
    expect(mem.get('ees-records/e2')?.amount).toBe(150);
    expect(mem.get('ees-records/e3')?.amount).toBe(100);
  });

  it('a record marked paid between the read and the commit is not overwritten; the event retries', async () => {
    record('e1', 'g1');
    record('e2', 'g2');
    mem.beforeCommit = () => {
      mem.beforeCommit = null;
      mem.seed('ees-records/e1', { ...mem.get('ees-records/e1'), paid: true, paidAt: 'now' });
    };

    await expect(run(writeEvent('g1', { houseId: H, userId: 'r1' }, time))).rejects.toThrow(
      'FAILED_PRECONDITION',
    );
    expect(mem.get('ees-records/e1')).toMatchObject({ paid: true, amount: 100 });
    expect(mem.get('ees-records/e2')?.amount).toBe(100);
  });

  it('re-splits the week of the event, not the week the retry runs in', async () => {
    record('sun', 'g1', { weekStart: '2026-10-26' });
    record('mon', 'g1', { weekStart: '2026-11-02' });

    // Sunday 23:30 UTC belongs to the week starting Monday 2026-10-26.
    await run(writeEvent('g1', { houseId: H, userId: 'r1' }, '2026-11-01T23:30:00Z'));

    expect(mem.get('ees-records/sun')?.amount).toBe(150);
    expect(mem.get('ees-records/mon')?.amount).toBe(100);
  });
});

describe('isoWeekStartUtc', () => {
  it('maps Sunday to the previous Monday and Monday to itself', () => {
    expect(isoWeekStartUtc('2026-11-01T23:59:59Z')).toBe('2026-10-26');
    expect(isoWeekStartUtc('2026-11-02T00:00:00Z')).toBe('2026-11-02');
    expect(isoWeekStartUtc('2026-10-28T12:00:00Z')).toBe('2026-10-26');
  });

  it('falls back to now when the event time is missing or invalid', () => {
    const now = Date.parse('2026-11-04T10:00:00Z');
    expect(isoWeekStartUtc(undefined, now)).toBe('2026-11-02');
    expect(isoWeekStartUtc('nope', now)).toBe('2026-11-02');
  });
});
