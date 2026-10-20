import { h, resetHarness } from './deletionHarness';

jest.mock('firebase-admin', () => require('./deletionHarness').adminModule);
jest.mock('firebase-functions/v2', () => require('./deletionHarness').functionsModule);
jest.mock('../../api/firestore', () => require('./deletionHarness').firestoreModule);
jest.mock('../../api/stripeDeletion', () => require('./deletionHarness').stripeModule);
jest.mock('../../accountDeletion/operatorRecords', () => require('./deletionHarness').operatorModule);
jest.mock('../../accountDeletion/memberRecords', () => require('./deletionHarness').memberModule);
jest.mock('../../accountDeletion/personalData', () => require('./deletionHarness').personalModule);

import { logger } from 'firebase-functions/v2';
import { runAccountDeletion } from '../../accountDeletion';

const NOW = '2026-10-20T00:00:00.000Z';
const ALL = ['operator', 'members', 'personal', 'userDoc', 'auth'];

beforeEach(resetHarness);

describe('runAccountDeletion', () => {
  it('runs every step in order for a resident', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };

    const result = await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
    expect(h.discharge).toHaveBeenCalledWith('g1', NOW);
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['g1'], { g1: 'h1' });
    expect(h.closeOperator).not.toHaveBeenCalled();
    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1.completed).toEqual(ALL);
  });

  it('runs the operator step only for house owners', async () => {
    h.houses = { h1: { ownerId: 'u1' } };
    h.users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };

    await runAccountDeletion('u1', NOW);

    expect(h.calls[0]).toBe('operator');
    expect(h.closeOperator).toHaveBeenCalledWith(
      { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } },
      NOW,
    );
    expect(h.calls).not.toContain('discharge:g1');
  });

  it('runs the operator step for a subscriber who owns no houses', async () => {
    h.users.u1 = { id: 'u1', subscriptionMetadata: { customerId: 'cus_1' } };

    await runAccountDeletion('u1', NOW);

    expect(h.closeOperator).toHaveBeenCalledTimes(1);
  });

  it('handles a user who is both resident and staff', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' }, g2: { userId: 'u1', houseId: 'h2' } };
    h.admins = { a1: { userId: 'u1' } };

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual([
      'discharge:g1',
      'discharge:g2',
      'removeStaff:a1',
      'personal',
      'userDoc',
      'auth',
    ]);
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['g1', 'g2'], { g1: 'h1', g2: 'h2' });
  });

  it('resumes from the recorded step after a failure', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.discharge.mockImplementation(async (id: string) => {
      delete h.guests[id];
    });
    h.deletePersonal.mockRejectedValueOnce(new Error('storage down for jane@example.com'));

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('storage down');
    expect(h.deletions.u1.completed).toEqual(['operator', 'members']);
    expect(h.deletions.u1.lastError).toBe('personal');
    expect(h.deletions.u1.failedAt).toBe(NOW);
    expect(JSON.stringify(h.deletions.u1)).not.toContain('jane@example.com');
    expect(h.deleteUser).not.toHaveBeenCalled();

    h.calls.length = 0;
    const later = '2026-10-21T00:00:00.000Z';
    const result = await runAccountDeletion('u1', later);

    expect(h.calls).toEqual(['personal', 'userDoc', 'auth']);
    expect(h.discharge).toHaveBeenCalledTimes(1);
    expect(h.deletePersonal).toHaveBeenLastCalledWith('u1', ['g1'], { g1: 'h1' });
    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1.lastError).toBeNull();
  });

  it('deletes the Auth user last', async () => {
    h.userDelete.mockRejectedValueOnce(new Error('boom'));

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('boom');
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.deletions.u1.lastError).toBe('userDoc');

    await runAccountDeletion('u1', NOW);
    expect(h.calls[h.calls.length - 1]).toBe('auth');
    expect(h.deleteUser).toHaveBeenCalledWith('u1');
  });

  it('treats an already-deleted Auth user as done', async () => {
    h.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' }),
    );

    const result = await runAccountDeletion('u1', NOW);

    expect(result.completed).toEqual(ALL);
    expect(h.deletions.u1.lastError).toBeNull();
  });

  it('records and rethrows other Auth failures', async () => {
    h.deleteUser.mockRejectedValueOnce(
      Object.assign(new Error('quota'), { code: 'auth/internal-error' }),
    );

    await expect(runAccountDeletion('u1', NOW)).rejects.toThrow('quota');
    expect(h.deletions.u1.lastError).toBe('auth');
    expect(h.deletions.u1.completed).toEqual(['operator', 'members', 'personal', 'userDoc']);
  });

  it('scrubs pre-existing guest-archive docs of a former resident', async () => {
    h.archive = { old1: { userId: 'u1', houseId: 'h9', sobrietyDate: 'x' } };

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual(['scrubArchive:old1', 'personal', 'userDoc', 'auth']);
    expect(h.scrubArchive).toHaveBeenCalledWith('old1', NOW);
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['old1'], { old1: 'h9' });
    expect(h.deletions.u1.targets).toMatchObject({ archivedGuestIds: ['old1'] });
  });

  it('does not scrub an archive doc separately when the guest is also current', async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.archive = { g1: { userId: 'u1', houseId: 'h1' } };

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
    expect(h.deletePersonal).toHaveBeenCalledWith('u1', ['g1'], { g1: 'h1' });
  });

  it("deletes the resident's autopay Stripe customers once each", async () => {
    h.guests = { g1: { userId: 'u1', houseId: 'h1', stripeCustomerId: 'cus_g' } };
    h.archive = { old1: { userId: 'u1', houseId: 'h9', stripeCustomerId: 'cus_g' } };

    await runAccountDeletion('u1', NOW);

    expect(h.deleteCustomer).toHaveBeenCalledTimes(1);
    expect(h.deleteCustomer).toHaveBeenCalledWith('cus_g');
    expect(h.calls.indexOf('deleteCustomer:cus_g')).toBeLessThan(h.calls.indexOf('discharge:g1'));
  });

  it('runs the operator step for a superAdminId-only house', async () => {
    h.houses = { h1: { superAdminId: 'u1' } };

    await runAccountDeletion('u1', NOW);

    expect(h.closeOperator).toHaveBeenCalledTimes(1);
  });

  it('falls back to users/{uid}.guestId and .adminId for docs without userId', async () => {
    h.users.u1 = { id: 'u1', guestId: 'gL', adminId: 'aL' };
    h.guests = { gL: { houseId: 'h1' }, g1: { userId: 'u1', houseId: 'h2' } };
    h.admins = { aL: {} };

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual([
      'discharge:g1',
      'discharge:gL',
      'removeStaff:aL',
      'personal',
      'userDoc',
      'auth',
    ]);
  });

  it('ignores a users/{uid} pointer to a doc linked to someone else, and dedupes', async () => {
    h.users.u1 = { id: 'u1', guestId: 'g1', adminId: 'aX' };
    h.guests = { g1: { userId: 'u1', houseId: 'h1' } };
    h.admins = { aX: { userId: 'other' } };

    await runAccountDeletion('u1', NOW);

    expect(h.calls).toEqual(['discharge:g1', 'personal', 'userDoc', 'auth']);
  });

  it('logs the failed step with the error code and message, and tags the error', async () => {
    const err = Object.assign(new Error('bucket gone'), { code: 'storage/404' });
    h.deletePersonal.mockRejectedValueOnce(err);

    await expect(runAccountDeletion('u1', NOW)).rejects.toBe(err);

    expect(logger.error).toHaveBeenCalledWith('accountDeletion: step failed', {
      uid: 'u1',
      step: 'personal',
      phase: 'run',
      code: 'storage/404',
      message: 'bucket gone',
    });
    expect((err as { step?: string }).step).toBe('personal');
  });

  it('rethrows the original error when the failure record cannot be written', async () => {
    const err = new Error('stripe down');
    h.closeOperator.mockRejectedValueOnce(err);
    h.users.u1 = { id: 'u1', subscriptionMetadata: { subscriptionId: 'sub_1' } };
    h.failDeletionWrites = true;

    await expect(runAccountDeletion('u1', NOW)).rejects.toBe(err);
    expect(logger.error).toHaveBeenCalledWith(
      'accountDeletion: step failed',
      expect.objectContaining({ step: 'operator' }),
    );
  });
});
