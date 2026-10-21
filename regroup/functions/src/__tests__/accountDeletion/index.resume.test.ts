import { h, resetHarness } from './deletionHarness';

jest.mock('firebase-admin', () => require('./deletionHarness').adminModule);
jest.mock('firebase-functions/v2', () => require('./deletionHarness').functionsModule);
jest.mock('../../api/firestore', () => require('./deletionHarness').firestoreModule);
jest.mock('../../api/stripeDeletion', () => require('./deletionHarness').stripeModule);
jest.mock(
  '../../accountDeletion/operatorRecords',
  () => require('./deletionHarness').operatorModule,
);
jest.mock('../../accountDeletion/memberRecords', () => require('./deletionHarness').memberModule);
jest.mock('../../accountDeletion/houseRecords', () => require('./deletionHarness').houseRecordsModule);
jest.mock('../../accountDeletion/personalData', () => require('./deletionHarness').personalModule);

import { logger } from 'firebase-functions/v2';
import { runAccountDeletion } from '../../accountDeletion';

const NOW = '2026-10-20T00:00:00.000Z';
const LATER = '2026-10-21T00:00:00.000Z';
const ALL = ['operator', 'members', 'personal', 'userDoc', 'auth'];

/** Guest ids whose doc was actually removed (a discharge of a missing doc is a no-op). */
let discharged: string[];

beforeEach(() => {
  resetHarness();
  discharged = [];
  // Mirrors dischargeResident: archive with the link cleared, delete the guest doc.
  h.discharge.mockImplementation(async (id: string) => {
    const guest = h.guests[id];
    if (!guest) return;
    h.archive[id] = { ...guest, userId: null };
    delete h.guests[id];
    discharged.push(id);
  });
});

const failure = (p: Promise<unknown>) =>
  p.then(
    () => undefined,
    (e: unknown) => e as any,
  );

describe('runAccountDeletion resume', () => {
  it('resumes after a partial members failure without double-deleting', async () => {
    h.guests = {
      g1: { userId: 'u1', houseId: 'h1', stripeCustomerId: 'cus_g' },
      g2: { userId: 'u1', houseId: 'h2' },
    };
    h.discharge.mockImplementationOnce(async (id: string) => {
      h.archive[id] = { ...h.guests[id], userId: null };
      delete h.guests[id];
      discharged.push(id);
    });
    h.discharge.mockImplementationOnce(async () => {
      throw new Error('transaction aborted');
    });

    const err = await failure(runAccountDeletion('u1', NOW));
    // g1 was already discharged when g2 failed, so the user must be told.
    expect(err).toMatchObject({ step: 'members', partial: true });
    expect(h.deletions.u1.completed).toEqual(['operator']);
    expect(h.deleteUser).not.toHaveBeenCalled();

    const result = await runAccountDeletion('u1', LATER);

    expect(result.completed).toEqual(ALL);
    expect(discharged).toEqual(['g1', 'g2']);
    // The re-run checks and deletes again; the helper treats an already-deleted customer as done.
    expect(h.deleteGuestCustomer.mock.calls).toEqual([
      ['u1', 'cus_g'],
      ['u1', 'cus_g'],
    ]);
    expect(h.deletePersonal).toHaveBeenCalledTimes(1);
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['g1', 'g2'], { g1: 'h1', g2: 'h2' });
  });

  it('retries only the Auth delete when userDoc was done but auth failed', async () => {
    h.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('quota'), { code: 'auth/internal-error' }),
    );

    const err = await failure(runAccountDeletion('u1', NOW));
    expect(err).toMatchObject({ step: 'auth', partial: true });
    h.calls.length = 0;

    const result = await runAccountDeletion('u1', LATER);

    expect(h.calls).toEqual(['auth']);
    expect(h.deleteUser).toHaveBeenCalledTimes(2);
    expect(h.userDelete).toHaveBeenCalledTimes(1);
    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1).toMatchObject({ lastError: null, completedAt: LATER });
  });

  it.each([
    ['operator', () => h.closeOperator.mockRejectedValueOnce(new Error('stripe down'))],
    ['members', () => h.discharge.mockRejectedValueOnce(new Error('tx aborted'))],
  ])('never deletes the Auth user when the %s step fails', async (step, arrange) => {
    h.users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    arrange();

    await expect(runAccountDeletion('u1', NOW)).rejects.toMatchObject({ step });
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.userDelete).not.toHaveBeenCalled();
    expect(h.deletePersonal).not.toHaveBeenCalled();
  });

  it('flags partial when an operator step that acted is followed by a members failure', async () => {
    h.users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.discharge.mockRejectedValueOnce(new Error('tx aborted'));

    await expect(runAccountDeletion('u1', NOW)).rejects.toMatchObject({
      step: 'members',
      partial: true,
    });
  });

  it('includes data created since the first attempt, keeping the stored ids', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.discharge.mockRejectedValueOnce(new Error('tx aborted'));
    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('tx aborted');

    // Created between attempts; g1 also moved house (the stored house wins).
    h.guests.g1.houseId = 'h-moved';
    h.guests.g3 = { userId: 'u1', houseId: 'h3' };
    h.admins = { a2: { userId: 'u1' } };

    await runAccountDeletion('u1', LATER);

    expect(discharged).toEqual(['g1', 'g3']);
    expect(h.removeStaff).toHaveBeenCalledWith('a2');
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['g1', 'g3'], { g1: 'h1', g3: 'h3' });
    expect(h.deletions.u1.targets).toMatchObject({
      guestIds: ['g1', 'g3'],
      adminIds: ['a2'],
      houseIdsByGuest: { g1: 'h1', g3: 'h3' },
    });
    expect(h.deletions.u1.startedAt).toBe(NOW);
  });

  it('logs and tags a failed progress write with its step, then re-runs that step', async () => {
    h.failWriteWhen = (d) => Array.isArray(d.completed) && d.completed.includes('personal');

    const err = await failure(runAccountDeletion('u1', NOW));

    expect(err).toMatchObject({
      message: 'progress write failed',
      step: 'personal',
      partial: true,
    });
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion: step failed',
      expect.objectContaining({ step: 'personal', phase: 'record' }),
    );
    expect(h.deletions.u1.lastError).toBe('personal');
    expect(h.deleteUser).not.toHaveBeenCalled();

    h.failWriteWhen = null;
    await runAccountDeletion('u1', LATER);
    expect(h.deletePersonal).toHaveBeenCalledTimes(2);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('logs and tags a failed completion write, and finishes it on retry', async () => {
    h.failWriteWhen = (d) => 'completedAt' in d;

    const err = await failure(runAccountDeletion('u1', NOW));
    expect(err).toMatchObject({ step: 'auth', partial: true });
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion: step failed',
      expect.objectContaining({ step: 'auth', phase: 'record' }),
    );

    h.failWriteWhen = null;
    h.calls.length = 0;
    const result = await runAccountDeletion('u1', LATER);
    expect(h.calls).toEqual([]);
    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1).toMatchObject({ lastError: null, completedAt: LATER });
  });
});

describe('runAccountDeletion isolation', () => {
  it("never touches a second user's data in any store", async () => {
    h.users.u2 = {
      id: 'u2',
      guestId: 'g2',
      adminId: 'a2',
      subscriptionMetadata: { subscriptionId: 'sub_2', customerId: 'cus_2' },
    };
    h.guests = {
      g1: { userId: 'u1', houseId: 'h1' },
      g2: { userId: 'u2', houseId: 'h1', stripeCustomerId: 'cus_g2' },
    };
    h.admins = { a2: { userId: 'u2' } };
    h.houses = { h1: { ownerId: 'u2', superAdminId: 'u2' } };
    h.archive = { old2: { userId: 'u2', houseId: 'h1', stripeCustomerId: 'cus_old2' } };
    h.deletions.u2 = { completed: ['operator'], lastError: 'members' };
    const u2Data = () =>
      JSON.stringify([h.users.u2, h.guests.g2, h.admins, h.houses, h.archive.old2, h.deletions.u2]);
    const before = u2Data();

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
    expect(h.deletions.u1.targets).toEqual({
      guestIds: ['g1'],
      houseIdsByGuest: { g1: 'h1' },
      adminIds: [],
      ownsHouses: false,
      hasSubscription: false,
      archivedGuestIds: [],
      guestCustomerIds: [],
    });
    expect(h.closeOperator).not.toHaveBeenCalled();
    expect(h.deleteGuestCustomer).not.toHaveBeenCalled();
    expect(h.deleteUser.mock.calls).toEqual([['u1']]);
    expect(u2Data()).toBe(before);
  });
});
