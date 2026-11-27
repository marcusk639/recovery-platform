/**
 * The membership records an invitation needs once its role is granted
 * (redeemInvitation, or the legacy authorization callables): one service for
 * SignUpForm and for "Accept as this account" (launch P5 Task 3, fix round 2).
 */
jest.mock('../users', () => ({ getAuthUser: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../../firebase-setup', () => require('../../../__mocks__/firebase-modular/setup'));
jest.mock('@react-native-firebase/firestore', () =>
  require('../../../__mocks__/firebase-modular/firestore'),
);

import { getAuthUser } from '../users';
import { failNext, resetOpLog, seedDoc } from '../../../__mocks__/firebase-modular/log';
import {
  buildInvitationMembership,
  guestRecordExists,
  refreshInvitationClaims,
  resetInvitationMembershipRetryState,
  writeInvitationMembership,
} from '../invitationMembership';

const user = {
  uid: 'uid-1',
  email: 'r@rats-e2e.com',
  firstName: 'Rae',
  lastName: 'Resident',
  phoneNumber: '',
};

beforeEach(() => resetInvitationMembershipRetryState());

describe('buildInvitationMembership', () => {
  it('builds a self-created resident record and the user flags for a guest invitation', () => {
    const m = buildInvitationMembership(user, {
      type: 'guest',
      houseId: 'h1',
      initialPhase: 'Phase 1',
    });
    expect(m?.kind).toBe('guest');
    if (m?.kind !== 'guest') return;
    expect(m.guest).toMatchObject({
      userId: 'uid-1',
      houseId: 'h1',
      email: 'r@rats-e2e.com',
      firstName: 'Rae',
      isAdmin: false,
      phase: 'Phase 1',
      createdBy: 'uid-1',
      updatedBy: 'uid-1',
    });
    expect(m.guest.id).toBeTruthy();
    expect(m.updates).toEqual({
      isGuest: true,
      houseId: 'h1',
      guestId: m.guest.id,
      email: 'r@rats-e2e.com',
    });
  });

  it('uses the invitation house, not a house already on the user', () => {
    const m = buildInvitationMembership(
      { ...user, houseId: 'old' },
      { type: 'guest', houseId: 'h1' },
    );
    expect(m?.kind === 'guest' && m.guest.houseId).toBe('h1');
  });

  it('marks a senior-peer resident record as an admin', () => {
    const m = buildInvitationMembership(user, { type: 'senior-peer', houseId: 'h1' });
    expect(m?.kind === 'guest' && m.guest.isAdmin).toBe(true);
    // ...and the user doc too (sign-up writes it before createUser).
    expect(m?.updates).toMatchObject({ isGuest: true, isAdmin: true });
  });

  it('builds an admins record for one house and the user flags for an admin invitation', () => {
    const m = buildInvitationMembership(user, { type: 'admin', houseId: 'h1' });
    expect(m?.kind).toBe('admin');
    if (m?.kind !== 'admin') return;
    expect(m.admin).toMatchObject({ userId: 'uid-1', email: 'r@rats-e2e.com', houseIds: ['h1'] });
    expect(m.admin.superAdmin).toEqual([]);
    expect(m.updates).toEqual({ isAdmin: true, adminId: m.admin.id });
  });

  it('builds nothing for another invitation type', () => {
    expect(buildInvitationMembership(user, { type: 'supporter', houseId: 'h1' })).toBeNull();
  });
});

describe('writeInvitationMembership', () => {
  const writers = () => ({
    createGuest: jest.fn((_record: unknown) => Promise.resolve()),
    createAdmin: jest.fn((_record: unknown) => Promise.resolve()),
    updateUser: jest.fn((_user: unknown, _updates: unknown) => Promise.resolve()),
  });

  it('creates the resident record and updates the user', async () => {
    const w = writers();
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(m, user, w);
    expect(w.createGuest).toHaveBeenCalledWith(m.kind === 'guest' && m.guest);
    expect(w.updateUser).toHaveBeenCalledWith(user, m.updates);
    expect(w.createAdmin).not.toHaveBeenCalled();
  });

  it('a plain guest invitation does not set the user isAdmin', () => {
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' });
    expect(m?.updates).not.toHaveProperty('isAdmin');
  });

  it('on retry after the user update failed, reuses the created record', async () => {
    const w = writers();
    w.updateUser.mockRejectedValueOnce(new Error('offline'));
    const first = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(first, user, w)).rejects.toThrow('offline');
    const retry = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(retry, user, w);
    expect(w.createGuest).toHaveBeenCalledTimes(1);
    expect(w.updateUser).toHaveBeenLastCalledWith(user, first.updates);
  });

  it('a failed create is retried with a create (nothing was written)', async () => {
    const w = writers();
    w.createGuest.mockRejectedValueOnce(new Error('denied'));
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(m, user, w)).rejects.toThrow('denied');
    await writeInvitationMembership(m, user, w);
    expect(w.createGuest).toHaveBeenCalledTimes(2);
  });

  it('a concurrent double call creates one record', async () => {
    const w = writers();
    const m1 = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    const m2 = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await Promise.all([
      writeInvitationMembership(m1, user, w),
      writeInvitationMembership(m2, user, w),
    ]);
    expect(w.createGuest).toHaveBeenCalledTimes(1);
    expect(w.updateUser.mock.calls.every((c) => (c as unknown[])[1] === m1.updates)).toBe(true);
  });

  it('a create that succeeded server-side but rejected on the client is retried with the same record id', async () => {
    const w = writers();
    w.createGuest.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    const first = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(first, user, w)).rejects.toThrow('offline');
    const retry = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(retry, user, w);
    const ids = w.createGuest.mock.calls.map((c) => (c as unknown[])[0] as { id: string });
    expect(ids).toHaveLength(2);
    expect(ids[1].id).toBe(ids[0].id);
    // Ids are mocked constant in this suite, so also check it is the same record object.
    expect(w.createGuest.mock.calls[1][0]).toBe(w.createGuest.mock.calls[0][0]);
    expect(w.updateUser).toHaveBeenLastCalledWith(user, first.updates);
  });

  it('a definite rules rejection forgets the record (the retry builds a new one)', async () => {
    const w = writers();
    w.createGuest.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }),
    );
    const first = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(first, user, w)).rejects.toThrow('denied');
    const retry = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(retry, user, w);
    const ids = w.createGuest.mock.calls.map((c) => (c as unknown[])[0] as { id: string });
    // The retry creates its own freshly built record, not the rejected one.
    expect(w.createGuest.mock.calls[1][0]).toBe(retry.kind === 'guest' ? retry.guest : null);
    expect(w.createGuest.mock.calls[1][0]).not.toBe(w.createGuest.mock.calls[0][0]);
    expect(ids).toHaveLength(2);
  });

  // createGuest also adds one to the house's currentCapacity, so re-sending a
  // create that already landed would count the resident twice.
  it('a retry after an ambiguous create failure skips the create when the record exists', async () => {
    const w = { ...writers(), guestExists: jest.fn((_id: string) => Promise.resolve(true)) };
    w.createGuest.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(m, user, w)).rejects.toThrow('offline');
    await writeInvitationMembership(m, user, w);
    expect(w.createGuest).toHaveBeenCalledTimes(1);
    expect(w.guestExists).toHaveBeenCalledWith(m.kind === 'guest' && m.guest.id);
    expect(w.updateUser).toHaveBeenCalledWith(user, m.updates);
  });

  it('a retry after an ambiguous create failure creates when the record does not exist', async () => {
    const w = { ...writers(), guestExists: jest.fn((_id: string) => Promise.resolve(false)) };
    w.createGuest.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await expect(writeInvitationMembership(m, user, w)).rejects.toThrow('offline');
    await writeInvitationMembership(m, user, w);
    expect(w.createGuest).toHaveBeenCalledTimes(2);
  });

  it('the first create does not check for an existing record', async () => {
    const w = { ...writers(), guestExists: jest.fn((_id: string) => Promise.resolve(true)) };
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(m, user, w);
    expect(w.guestExists).not.toHaveBeenCalled();
    expect(w.createGuest).toHaveBeenCalledTimes(1);
  });

  it('resolves to the user updates of the record it wrote', async () => {
    const w = writers();
    const m = buildInvitationMembership(user, { type: 'admin', houseId: 'h1' })!;
    expect(await writeInvitationMembership(m, user, w)).toBe(m.updates);
  });

  // A finished write is forgotten: a later invitation to the same house (say,
  // after the resident was removed) writes its own record.
  it('a later call after a finished write writes a new record', async () => {
    const w = writers();
    const first = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(first, user, w);
    const later = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(later, user, w);
    expect(w.createGuest).toHaveBeenCalledTimes(2);
    expect(w.createGuest.mock.calls[1][0]).toBe(later.kind === 'guest' ? later.guest : null);
  });

  it('creates the admins record and updates the user', async () => {
    const w = writers();
    const m = buildInvitationMembership(user, { type: 'admin', houseId: 'h1' })!;
    await writeInvitationMembership(m, user, w);
    expect(w.createAdmin).toHaveBeenCalledWith(m.kind === 'admin' && m.admin);
    expect(w.updateUser).toHaveBeenCalledWith(user, m.updates);
    expect(w.createGuest).not.toHaveBeenCalled();
  });

  it('rejects when a write fails', async () => {
    const w = writers();
    w.createAdmin.mockRejectedValueOnce(new Error('denied'));
    const m = buildInvitationMembership(user, { type: 'admin', houseId: 'h1' })!;
    await expect(writeInvitationMembership(m, user, w)).rejects.toThrow('denied');
  });
});

describe('guestRecordExists', () => {
  beforeEach(() => resetOpLog());

  it('is true for a record the caller can read', async () => {
    seedDoc('guests/guest-1', { id: 'guest-1', houseId: 'h1' });
    await expect(guestRecordExists('guest-1')).resolves.toBe(true);
  });

  it('is false for a missing record', async () => {
    await expect(guestRecordExists('guest-1')).resolves.toBe(false);
  });

  it('is false when the rules refuse the read (how a missing record reads)', async () => {
    seedDoc('guests/guest-1', { id: 'guest-1', houseId: 'h1' });
    failNext(
      'get',
      Object.assign(new Error('denied'), { code: 'firestore/permission-denied' }),
    );
    await expect(guestRecordExists('guest-1')).resolves.toBe(false);
  });

  // Offline is exactly when the create's ack was lost; guessing "not there"
  // would re-send the create and count the resident twice.
  it('rethrows any other failure instead of guessing', async () => {
    seedDoc('guests/guest-1', { id: 'guest-1', houseId: 'h1' });
    failNext('get', Object.assign(new Error('offline'), { code: 'firestore/unavailable' }));
    await expect(guestRecordExists('guest-1')).rejects.toThrow('offline');
  });
});

describe('refreshInvitationClaims', () => {
  it('force-refreshes the ID token', async () => {
    await refreshInvitationClaims(0);
    expect(getAuthUser).toHaveBeenCalledWith(true);
  });
});
