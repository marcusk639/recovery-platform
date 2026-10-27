// src/__tests__/activities/disputeNotifications.test.ts
//
// Owner decision: when an activity is disputed, notify the house admins AND
// the resident whose activity it is. Server-side, from onActivityWritten,
// because the client may only create notifications for itself.

import { logger } from 'firebase-functions';
import { FakeFirestore, asFirestore } from './fakeFirestore';
import { disputeMessage, isNewDispute, notifyDispute } from '../../activities/disputeNotifications';

let db: FakeFirestore;

const active = {
  guestId: 'g1',
  houseId: 'h1',
  type: 'chore',
  status: 'active',
  loggedBy: 'resident-uid',
  data: { medicationName: 'SECRET-MED' },
};
const disputed = {
  ...active,
  status: 'disputed',
  disputeReason: 'Kitchen not cleaned',
  disputedBy: 'peer-uid',
  disputeResolvedBy: 'peer-uid',
};

const notifications = () => [...(db.collections.get('notifications') ?? new Map()).values()];

beforeEach(() => {
  db = new FakeFirestore();
  db.seed('guests', 'g1', { houseId: 'h1', userId: 'resident-uid' });
  db.seed('houses', 'h1', {
    adminIds: ['manager-uid', 'peer-leader-uid'],
    superAdminIds: ['owner-uid'],
    superAdminId: 'owner-uid',
  });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterEach(() => jest.restoreAllMocks());

describe('notifyDispute recipients', () => {
  it('notifies every house admin and the disputed resident, once each', async () => {
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed, 'peer-uid');

    expect(r.recipients.sort()).toEqual(['manager-uid', 'owner-uid', 'peer-leader-uid', 'resident-uid']);
    const byUser = Object.fromEntries(notifications().map((n) => [n.userId, n]));
    expect(byUser['resident-uid']).toMatchObject({
      type: 'dispute',
      level: 'alert',
      subject: 'Activity Disputed',
      houseId: 'h1',
      guestId: 'g1',
      activityId: 'a1',
      read: false,
      adminNotification: false,
      message: 'Your chore completion has been disputed. Reason: Kitchen not cleaned',
    });
    expect(byUser['manager-uid'].message).toBe('A chore completion has been disputed. Reason: Kitchen not cleaned');
    expect(byUser['manager-uid'].adminNotification).toBe(true);
  });

  it('does not notify the person who raised the dispute (from the write\'s auth)', async () => {
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed, 'manager-uid');
    expect(r.recipients).not.toContain('manager-uid');
    expect(r.recipients).toContain('resident-uid');
  });

  it('ignores a forged disputedBy: it cannot suppress another recipient', async () => {
    // A peer disputes but names the manager as the disputer.
    const forged = { ...disputed, disputedBy: 'manager-uid', disputeResolvedBy: 'manager-uid' };
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, forged, 'peer-uid');
    expect(r.recipients).toContain('manager-uid');
    expect(r.recipients).not.toContain('peer-uid');
  });

  it("an older build's dispute (disputeResolvedBy only) still notifies everyone but the caller", async () => {
    const { disputedBy: _omit, ...legacy } = disputed;
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, legacy, 'peer-uid');
    expect(r.recipients.sort()).toEqual(['manager-uid', 'owner-uid', 'peer-leader-uid', 'resident-uid']);
  });

  it('a write with no auth context (Admin SDK) notifies every recipient', async () => {
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed, undefined);
    expect(r.recipients).toHaveLength(4);
  });

  it('recovers on redelivery when a create fails midway: each recipient once', async () => {
    db.failCreates.set('notifications/dispute_evt1_resident-uid', Object.assign(new Error('unavailable'), { code: 14 }));
    await expect(notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed, 'peer-uid')).rejects.toThrow(
      'unavailable',
    );
    const sentFirst = notifications().length;
    expect(sentFirst).toBeGreaterThan(0);
    expect(sentFirst).toBeLessThan(4);

    const retry = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed, 'peer-uid');

    expect(retry.recipients).toContain('resident-uid');
    expect(notifications().map((n) => n.userId).sort()).toEqual([
      'manager-uid',
      'owner-uid',
      'peer-leader-uid',
      'resident-uid',
    ]);
  });

  it('is idempotent across a redelivered event', async () => {
    await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed);
    const again = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed);
    expect(again.recipients).toEqual([]);
    expect(notifications()).toHaveLength(4);
  });

  it('uses the guest doc\'s house, not the activity\'s', async () => {
    db.seed('houses', 'evil', { adminIds: ['attacker-uid'] });
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, { ...disputed, houseId: 'evil' });
    expect(r.recipients).not.toContain('attacker-uid');
    expect(r.recipients).toContain('manager-uid');
  });

  it('skips (logging ids) when the guest doc is missing', async () => {
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', active, { ...disputed, guestId: 'ghost' });
    expect(r.recipients).toEqual([]);
    expect(notifications()).toHaveLength(0);
  });

  it('never logs the reason or activity data', async () => {
    const info = jest.spyOn(logger, 'info');
    await notifyDispute(asFirestore(db), 'evt1', 'a1', active, disputed);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain('dispute_notify.sent');
    expect(logged).not.toContain('Kitchen');
    expect(logged).not.toContain('SECRET-MED');
  });
});

describe('only a transition into disputed notifies', () => {
  it.each([
    ['a new active activity', undefined, active],
    ['an already-disputed activity being edited', disputed, { ...disputed, loggedAt: 'x' }],
    ['an approval', disputed, { ...disputed, status: 'resolved', incomplete: true }],
    ['a delete', active, { ...active, status: 'deleted' }],
    ['a hard delete', disputed, undefined],
  ])('ignores %s', async (_label, before, after) => {
    expect(isNewDispute(before, after)).toBe(false);
    const r = await notifyDispute(asFirestore(db), 'evt1', 'a1', before, after);
    expect(r.recipients).toEqual([]);
  });

  it('labels unknown types generically', () => {
    expect(disputeMessage({ type: 'nap' }, true)).toBe('An activity has been disputed. Reason: No reason provided');
  });
});
