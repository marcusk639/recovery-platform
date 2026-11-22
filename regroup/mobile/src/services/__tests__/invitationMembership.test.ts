/**
 * The membership records an invitation needs once its role is granted
 * (redeemInvitation, or the legacy authorization callables): one service for
 * SignUpForm and for "Accept as this account" (launch P5 Task 3, fix round 2).
 */
jest.mock('../users', () => ({ getAuthUser: jest.fn(() => Promise.resolve({})) }));

import { getAuthUser } from '../users';
import {
  buildInvitationMembership,
  refreshInvitationClaims,
  writeInvitationMembership,
} from '../invitationMembership';

const user = {
  uid: 'uid-1',
  email: 'r@rats-e2e.com',
  firstName: 'Rae',
  lastName: 'Resident',
  phoneNumber: '',
};

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
    createGuest: jest.fn(() => Promise.resolve()),
    createAdmin: jest.fn(() => Promise.resolve()),
    updateUser: jest.fn(() => Promise.resolve()),
  });

  it('creates the resident record and updates the user', async () => {
    const w = writers();
    const m = buildInvitationMembership(user, { type: 'guest', houseId: 'h1' })!;
    await writeInvitationMembership(m, user, w);
    expect(w.createGuest).toHaveBeenCalledWith(m.kind === 'guest' && m.guest);
    expect(w.updateUser).toHaveBeenCalledWith(user, m.updates);
    expect(w.createAdmin).not.toHaveBeenCalled();
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

describe('refreshInvitationClaims', () => {
  it('force-refreshes the ID token', async () => {
    await refreshInvitationClaims(0);
    expect(getAuthUser).toHaveBeenCalledWith(true);
  });
});
